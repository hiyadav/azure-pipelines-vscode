import * as vscode from 'vscode';

import { ResourceListResult, GenericResource } from 'azure-arm-resource/lib/resource/models';
import { SubscriptionModels } from 'azure-arm-resource';
import { AzureTreeItem } from 'vscode-azureextensionui';
import { QuickPickItem } from 'vscode';

import { SourceOptions, SourceProviderType, extensionVariables, WizardInputs, PipelineTargets, WebAppKind } from './model/models';
import { AzureDevOpsService } from "./services/azureDevOpsService";
import { SourceRepositoryService } from './services/source/sourceRepositoryService';
import { AzureService } from './services/target/azureService';
import { analyzeRepoAndListAppropriatePipeline, getPipelineTargetType, getPipelineFilePath } from './utility/pipelineHelper';
import { exit } from 'process';

export async function configurePipeline(node: any) {
    try {
        if (!(await extensionVariables.azureAccountExtensionApi.exports.waitForLogin())) {
            throw new Error("Kindly log-in to Azure Account extension before going forward.");
        }

        initializeSetup();
        await getAllRequiredInputs(node);
        let queuedPipelineUrl = await extensionVariables.azureDevOpsService.createAndRunPipeline(extensionVariables.inputs);
        vscode.window.showInformationMessage("Azure DevOps pipelines set up successfully !", "Browse Pipeline")
            .then((action: string) => {
                if (action && action.toLowerCase() === "browse pipeline") {
                    vscode.env.openExternal(vscode.Uri.parse(queuedPipelineUrl));
                }
            });

        // extensionVariables.azureDevOps.getPipelineCompletionStatus(queuedPipelineUrl, null)
    }
    catch (error) {
        // log error in telemetery.
        vscode.window.showErrorMessage(error.message);
    }
}

function initializeSetup() {
    extensionVariables.inputs = new WizardInputs();
    extensionVariables.inputs.azureSession.credentials = extensionVariables.azureAccountExtensionApi.exports.sessions[0].credentials;
    extensionVariables.inputs.azureSession.tenantId = extensionVariables.azureAccountExtensionApi.exports.sessions[0].tenantId;

    extensionVariables.azureDevOpsService = new AzureDevOpsService(extensionVariables.inputs.azureSession.credentials);
    extensionVariables.sourceRepositoryService = new SourceRepositoryService();
}

async function getAllRequiredInputs(node: any) {
    // TODO: handle cases where user exists setup mid way or presses escape button
    await analyzeNode(node);
    await getSourceRepositoryDetails();
    await getAzureDevOpsDetails();
    await getSelectedPipeline();

    if (!extensionVariables.inputs.pipelineParameters.pipelineTargetType || extensionVariables.inputs.pipelineParameters.pipelineTargetType === PipelineTargets.None) {
        extensionVariables.inputs.pipelineParameters.pipelineTargetType = getPipelineTargetType(extensionVariables.inputs.pipelineParameters.pipelineTemplate);
    }

    if (extensionVariables.inputs.sourceRepositoryDetails.sourceProvider === SourceProviderType.Github) {
        await getGitubConnectionService();
    }

    if (!extensionVariables.inputs.azureParameters.targetResource) {
        await getAzureResourceDetails();
    }

    await getAzureRMServiceConnection();
    await checkInPipelineFileToRepository();
}

async function analyzeNode(node: any) {
    if (node instanceof AzureTreeItem) {
        extensionVariables.inputs.azureParameters.subscriptionId = node.root.subscriptionId;
        extensionVariables.azureService = new AzureService(extensionVariables.inputs.azureSession.credentials, extensionVariables.inputs.azureParameters.subscriptionId);

        let azureResource: GenericResource = await extensionVariables.azureService.getResource((<AzureTreeItem>node).fullId);

        switch (azureResource.type) {
            case "Microsoft.Web/sites":
                switch (azureResource.kind) {
                    case WebAppKind.WindowsApp:
                        extensionVariables.inputs.azureParameters.targetResource = azureResource;
                        break;
                    case WebAppKind.FunctionApp:
                    case WebAppKind.LinuxApp:
                    case WebAppKind.LinuxContainerApp:
                    default:
                        throw new Error(`App of kind: ${azureResource.kind} is not yet supported.`);
                }
                break;
            default:
                throw new Error(`Resource of type: ${azureResource.type} is not yet supported for configuring pipelines.`);
        }
    }
    else if (node && node.fsPath) {
        await getGitDetailsFromRepository(vscode.workspace.rootPath);
    }
    // also check if the node type is of  file explorer type and extra the git repo details in that case.
}

async function getSourceRepositoryDetails(): Promise<void> {
    if (!extensionVariables.inputs.sourceRepositoryDetails) {
        let sourceOptions: Array<QuickPickItem> = [];
        if (vscode.workspace && vscode.workspace.rootPath) {
            sourceOptions.push({ label: SourceOptions.CurrentWorkspace });
        }

        sourceOptions.push({ label: SourceOptions.BrowseLocalMachine });
        let selectedSourceOption = await extensionVariables.ui.showQuickPick(
            sourceOptions,
            { placeHolder: "Select the folder or repository to deploy" }
        );

        let workspacePath = "";
        switch (selectedSourceOption.label) {
            case SourceOptions.BrowseLocalMachine:
                let selectedFolder: vscode.Uri[] = await vscode.window.showOpenDialog(
                    {
                        openLabel: "Select the path to your application source code.",
                        canSelectFiles: false,
                        canSelectFolders: true,
                        canSelectMany: false
                    }
                );
                if (selectedFolder && selectedFolder.length > 0) {
                    workspacePath = selectedFolder[0].fsPath;
                }
                break;
            case SourceOptions.CurrentWorkspace:
                    workspacePath = vscode.workspace.rootPath;
                    break;
            default:
                exit(0);
        }

        await getGitDetailsFromRepository(workspacePath);
    }
}

async function getGitDetailsFromRepository(workspacePath: string): Promise<void> {
    extensionVariables.inputs.sourceRepositoryDetails = await extensionVariables.sourceRepositoryService.getGitRepoDetails(workspacePath);

    if (extensionVariables.inputs.sourceRepositoryDetails.sourceProvider === SourceProviderType.AzureRepos) {
        extensionVariables.inputs.sourceRepositoryDetails.repositoryId = await extensionVariables.azureDevOpsService.getRepositoryId(extensionVariables.inputs.sourceRepositoryDetails.repositoryName, extensionVariables.inputs.sourceRepositoryDetails.remoteUrl);
    }
}

async function getAzureDevOpsDetails(): Promise<void> {
    // TODO: handle space in project name and repo name.
    if (!extensionVariables.azureDevOpsService.getOrganizationName()) {
        let organizationList: string[] = await extensionVariables.azureDevOpsService.listOrganizations();
        let selectedOrganization = await extensionVariables.ui.showQuickPick(organizationList.map((org) => { return { label: org }; }), { placeHolder: "Select Azure DevOps Organization" });
        extensionVariables.azureDevOpsService.setOrganizationName(selectedOrganization.label);
        extensionVariables.inputs.organizationName = selectedOrganization.label;
    }
    else {
        extensionVariables.inputs.organizationName = extensionVariables.azureDevOpsService.getOrganizationName();
    }

    if (!extensionVariables.azureDevOpsService.getProjectName()) {
        let projectList = await extensionVariables.azureDevOpsService.listProjects();
        let selectedProject = await extensionVariables.ui.showQuickPick(projectList.map((project) => { return { label: project }; }), { placeHolder: "Select Azure DevOps project" });
        extensionVariables.azureDevOpsService.setProjectName(selectedProject.label);
        extensionVariables.inputs.projectName = selectedProject.label;
    }
    else {
        extensionVariables.inputs.projectName = extensionVariables.azureDevOpsService.getProjectName();
    }
}

async function getSelectedPipeline(): Promise<void> {
    let appropriatePipelines: string[] = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Analyzing your repo" }, () => {
        return analyzeRepoAndListAppropriatePipeline(extensionVariables.inputs.sourceRepositoryDetails.localPath);
    });

    // TO:DO- Get applicable pipelines for the repo type and azure target type if target already selected
    let selectedOption = await extensionVariables.ui.showQuickPick(appropriatePipelines.map((pipeline) => { return { label: pipeline }; }), {
        placeHolder: "Select Azure pipelines template..."
    });
    extensionVariables.inputs.pipelineParameters.pipelineTemplate = selectedOption.label;
}

async function getAzureResourceDetails(): Promise<void> {
    let subscriptions: [{ session: any, subscription: SubscriptionModels.Subscription }] = extensionVariables.azureAccountExtensionApi.exports.subscriptions;
    let subscriptionList = subscriptions.map((subscriptionObject) => {
        return <QuickPickItem>{
            label: <string>subscriptionObject.subscription.displayName
        };
    });
    let selectedSubscription: QuickPickItem = await extensionVariables.ui.showQuickPick(subscriptionList, { placeHolder: "Select Azure Subscription" });
    extensionVariables.inputs.azureParameters.subscriptionId = subscriptions.find((subscriptionObject) => {
        return subscriptionObject.subscription.displayName === selectedSubscription.label;
    }).subscription.subscriptionId;

    extensionVariables.azureService = new AzureService(extensionVariables.inputs.azureSession.credentials, extensionVariables.inputs.azureParameters.subscriptionId);
    await extensionVariables.azureService.createSpnWithGraph(extensionVariables.inputs.azureSession.credentials);
    let resourceListResult: ResourceListResult = await extensionVariables.azureService.listResourcesOfType(extensionVariables.inputs.pipelineParameters.pipelineTargetType);
    let resourceDisplayList = resourceListResult.map((resource) => {
        return <vscode.QuickPickItem>{
            label: resource.name
        };
    });

    let selectedResource: vscode.QuickPickItem = await extensionVariables.ui.showQuickPick(resourceDisplayList, { placeHolder: "Select Web App " });
    extensionVariables.inputs.azureParameters.targetResource = resourceListResult.find((value: GenericResource) => {
        return value.name === selectedResource.label;
    });
}

async function getGitubConnectionService(): Promise<void> {
    let githubPat = await extensionVariables.ui.showInputBox({ placeHolder: "Enter GitHub PAT token" });
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "Creating GitHub service connection"
        },
        () => {
            return extensionVariables.azureDevOpsService.createGitHubServiceConnection(githubPat, extensionVariables.inputs.sourceRepositoryDetails.repositoryName)
                .then((endpointId) => {
                    extensionVariables.inputs.sourceRepositoryDetails.sourceProviderConnectionId = endpointId;
                });
        });
}

async function getAzureRMServiceConnection(): Promise<void> {
    // TODO: show notification while setup is being done.
    // ?? should SPN created be scoped to resource group of target azure resource.
    extensionVariables.inputs.azureParameters.azureServiceConnectionId = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Connecting azure pipelines with your subscription: ${extensionVariables.inputs.azureParameters.subscriptionId}`
        },
        () => {
            return extensionVariables.azureDevOpsService.createAzureServiceConnection(extensionVariables.inputs.azureParameters.targetResource.name ,extensionVariables.inputs);
        });
}

async function checkInPipelineFileToRepository() {
    let ymlFilePath: string = await extensionVariables.sourceRepositoryService.addYmlFileToRepo(getPipelineFilePath(extensionVariables.inputs.pipelineParameters.pipelineTemplate), extensionVariables.inputs.sourceRepositoryDetails.localPath, extensionVariables.inputs);
    await vscode.window.showTextDocument(vscode.Uri.file(ymlFilePath));
    await vscode.window.showInformationMessage("Modify and commit yaml pipeline file to deploy.", "Commit & Push", "Discard Pipeline")
        .then((commitOrDiscard: string) => {
            if (commitOrDiscard.toLowerCase() === "commit & push") {
                return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Configuring Azure DevOps Pipeline and proceeding to deployment..." }, async (progress) => {
                    // handle when the branch is not upto date with remote branch and push fails
                    let commitDetails = await extensionVariables.sourceRepositoryService.commitAndPushPipelineFile(ymlFilePath);
                    extensionVariables.inputs.sourceRepositoryDetails.branch = commitDetails.branch;
                    extensionVariables.inputs.sourceRepositoryDetails.commitId = commitDetails.commitId;
                });
            }
            else {
                throw new Error("Operation was discarded.");
            }
        });
}

// this method is called when your extension is deactivated
export function deactivate() { }