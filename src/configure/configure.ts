import * as vscode from 'vscode';

import { ResourceListResult, GenericResource } from 'azure-arm-resource/lib/resource/models';
import { SubscriptionModels } from 'azure-arm-resource';
import { AzureTreeItem } from 'vscode-azureextensionui';
import { QuickPickItem } from 'vscode';

import { SourceOptions, SourceProviderType, extensionVariables, WizardInputs, PipelineTargets } from './model/models';
import { AzureDevOpsService } from "./services/azureDevOpsService";
import { SourceRepositoryService } from './services/source/sourceRepositoryService';
import { AzureService } from './services/target/azureService';
import { analyzeRepoAndListAppropriatePipeline, getPipelineTargetType, getPipelineFilePath } from './utility/pipelineHelper';

export async function configurePipeline(node: any) {
    try {
        if (!(await extensionVariables.azureAccountApi.exports.waitForLogin())) {
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
    extensionVariables.inputs.authDetails.credentials = extensionVariables.azureAccountApi.exports.sessions[0].credentials;
    extensionVariables.inputs.authDetails.tenantId = extensionVariables.azureAccountApi.exports.sessions[0].tenantId;

    extensionVariables.azureDevOpsService = new AzureDevOpsService(extensionVariables.inputs.authDetails.credentials);
    extensionVariables.sourceRepositoryService = new SourceRepositoryService();
}

async function getAllRequiredInputs(node: any) {
    // TODO: handle cases where user exists setup mid way or presses escape button
    await analyzeNode(node);
    await getSourceRepositoryDetails();
    await getAzureDevOpsDetails();
    await getSelectedPipeline();

    if (!extensionVariables.pipelineTargetType || extensionVariables.pipelineTargetType === PipelineTargets.None) {
        extensionVariables.pipelineTargetType = getPipelineTargetType(extensionVariables.inputs.selectedPipeline);
    }

    if (extensionVariables.inputs.sourceRepositoryDetails.sourceProvider === SourceProviderType.Github) {
        await getGitubConnectionService();
    }

    if (!extensionVariables.inputs.targetResource) {
        await getAzureResourceDetails();
    }

    await getAzureRMServiceConnection();
    await checkInPipelineFileToRepository();
}

async function analyzeNode(node: any) {
    if (node instanceof AzureTreeItem) {
        extensionVariables.inputs.subscriptionId = node.root.subscriptionId;
        extensionVariables.azureService = new AzureService(extensionVariables.inputs.authDetails.credentials, extensionVariables.inputs.subscriptionId);

        let azureResource: GenericResource = await extensionVariables.azureService.getResource((<AzureTreeItem>node).fullId);

        switch (azureResource.type) {
            case "Microsoft.Web/sites":
                switch (azureResource.kind) {
                    case "app":
                        extensionVariables.inputs.targetResource = azureResource;
                        break;
                    case "app,linux":
                    case "functionapp":
                    case "app,linux,container":
                    default:
                        throw new Error(`App of kind: ${azureResource.kind} is not yet supported.`);
                }
                break;
            default:
                throw new Error(`Resource of type: ${azureResource.type} is not yet supported for configuring pipelines.`);
        }
    }

    // also check if the node type is of  file explorer type and extra the git repo details in that case.
}

async function getSourceRepositoryDetails(): Promise<void> {
    let sourceOptions: Array<QuickPickItem> = [{ label: SourceOptions.BrowseLocalMachine }];
    if (vscode.workspace && vscode.workspace.rootPath) {
        sourceOptions.push({ label: SourceOptions.CurrentWorkspace });
    }

    let selectedSourceOption = await extensionVariables.uiExtensionVariables.ui.showQuickPick(
        sourceOptions,
        { placeHolder: "Select the folder or repository to deploy" }
    );

    let workspacePath = "";
    switch (selectedSourceOption.label) {
        case SourceOptions.BrowseLocalMachine:
            let selectedFolder: vscode.Uri[] = await vscode.window.showOpenDialog(
                {
                    openLabel: "Select the git repository folder to deploy",
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
        default:
            workspacePath = vscode.workspace.rootPath;
    }

    extensionVariables.inputs.sourceRepositoryDetails = await extensionVariables.sourceRepositoryService.getGitRepoDetails(workspacePath);
    extensionVariables.inputs.sourceRepositoryDetails.localPath = workspacePath;

    if (extensionVariables.inputs.sourceRepositoryDetails.sourceProvider === SourceProviderType.AzureRepos) {
        extensionVariables.inputs.sourceRepositoryDetails.repositoryId = await extensionVariables.azureDevOpsService.getRepositoryId(extensionVariables.inputs.sourceRepositoryDetails.repositoryName, extensionVariables.inputs.sourceRepositoryDetails.remoteUrl);
    }
}

async function getAzureDevOpsDetails(): Promise<void> {
    // TODO: handle space in project name and repo name.
    if (!extensionVariables.azureDevOpsService.getOrganizationName()) {
        let organizationList: string[] = await extensionVariables.azureDevOpsService.listOrganizations();
        let selectedOrganization = await extensionVariables.uiExtensionVariables.ui.showQuickPick(organizationList.map((org) => { return { label: org }; }), { placeHolder: "Select Azure DevOps Organization" });
        extensionVariables.azureDevOpsService.setOrganizationName(selectedOrganization.label);
        extensionVariables.inputs.organizationName = selectedOrganization.label;
    }
    else {
        extensionVariables.inputs.organizationName = extensionVariables.azureDevOpsService.getOrganizationName();
    }

    if (!extensionVariables.azureDevOpsService.getProjectName()) {
        let projectList = await extensionVariables.azureDevOpsService.listProjects();
        let selectedProject = await extensionVariables.uiExtensionVariables.ui.showQuickPick(projectList.map((project) => { return { label: project }; }), { placeHolder: "Select Azure DevOps project" });
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
    let selectedOption = await extensionVariables.uiExtensionVariables.ui.showQuickPick(appropriatePipelines.map((pipeline) => { return { label: pipeline }; }), {
        placeHolder: "Select Azure pipelines template..."
    });
    extensionVariables.inputs.selectedPipeline = selectedOption.label;
}

async function getAzureResourceDetails() {
    let subscriptions: [{session: any, subscription: SubscriptionModels.Subscription}] = extensionVariables.azureAccountApi.exports.subscriptions;
    let subscriptionList = subscriptions.map((subscriptionObject) => {
        return <QuickPickItem>{
            label: <string>subscriptionObject.subscription.displayName
        };
    });
    let selectedSubscription: QuickPickItem = await extensionVariables.uiExtensionVariables.ui.showQuickPick(subscriptionList, { placeHolder: "Select Azure Subscription" });
    extensionVariables.inputs.subscriptionId = subscriptions.find((subscriptionObject) => {
        return subscriptionObject.subscription.displayName === selectedSubscription.label;
    }).subscription.subscriptionId;

    extensionVariables.azureService = new AzureService(extensionVariables.inputs.authDetails.credentials, extensionVariables.inputs.subscriptionId);
    let resourceListResult: ResourceListResult = await extensionVariables.azureService.listResourcesOfType(extensionVariables.pipelineTargetType);
    let resourceDisplayList = resourceListResult.map((resource) => {
        return <vscode.QuickPickItem>{
            label: resource.name
        };
    });

    let selectedResource: vscode.QuickPickItem = await extensionVariables.uiExtensionVariables.ui.showQuickPick(resourceDisplayList, { placeHolder: "Select Web App " });
    extensionVariables.inputs.targetResource = resourceListResult.find((value: GenericResource) => {
        return value.name === selectedResource.label;
    });
}

async function getGitubConnectionService(): Promise<void> {
    let githubPat = await extensionVariables.uiExtensionVariables.ui.showInputBox({ placeHolder: "Enter GitHub PAT token" });
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "Creating GitHub service connection"
        },
        () => {
            return extensionVariables.azureDevOpsService.createGitHubServiceConnection(githubPat, extensionVariables.inputs.sourceRepositoryDetails.repositoryName)
                .then((endpointId) => {
                    extensionVariables.inputs.sourceProviderConnectionId = endpointId;
                });
        });
}

async function getAzureRMServiceConnection(): Promise<void> {
    // TODO: show notification while setup is being done.
    // ?? should SPN created be scoped to resource group of target azure resource.
    extensionVariables.inputs.azureServiceConnectionId = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Connecting azure pipelines with your subscription: ${extensionVariables.inputs.subscriptionId}`
        },
        () => {
            return extensionVariables.azureDevOpsService.createAzureServiceConnection(extensionVariables.inputs);
        });
}

async function checkInPipelineFileToRepository() {
    let ymlFilePath: string = await extensionVariables.sourceRepositoryService.addYmlFileToRepo(getPipelineFilePath(extensionVariables.inputs.selectedPipeline), extensionVariables.inputs.sourceRepositoryDetails.localPath, extensionVariables.inputs);
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