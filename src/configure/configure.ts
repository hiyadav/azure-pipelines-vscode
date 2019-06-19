import * as vscode from 'vscode';

import { ResourceListResult, GenericResource } from 'azure-arm-resource/lib/resource/models';
import { AzureTreeItem } from 'vscode-azureextensionui';
import { QuickPickItem } from 'vscode';

import { SourceOptions, SourceProviderType, extensionVariables, WizardInputs, PipelineTargets } from './model/models';
import { AzureDevOpsService } from "./services/azureDevOpsService";
import { SourceRepositoryService } from './services/source/sourceRepositoryService';
import { AzureService } from './services/target/azureService';
import { listAppropriatePipeline, analyzeRepo, getPipelineTargetType, getPipelineFilePath } from './utility/pipelineHelper';

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

async function getSourceRepositoryDetails() {
    let selectedSourceOption: string = await vscode.window.showQuickPick(
        [SourceOptions.BrowseLocalMachine, SourceOptions.CurrentWorkspace, SourceOptions.GithubRepository],
        { placeHolder: "Select the folder or repository to deploy" }
    );

    let workspacePath = "";
    switch (selectedSourceOption) {
        case SourceOptions.BrowseLocalMachine:
            workspacePath = vscode.workspace.rootPath;
            break;
        case SourceOptions.CurrentWorkspace:
        case SourceOptions.GithubRepository:
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
        let selectedOrganization = await vscode.window.showQuickPick(organizationList, { placeHolder: "Select Azure DevOps Organization" });
        extensionVariables.azureDevOpsService.setOrganizationName(selectedOrganization);
        extensionVariables.inputs.organizationName = selectedOrganization;
    }
    else {
        extensionVariables.inputs.organizationName = extensionVariables.azureDevOpsService.getOrganizationName();
    }

    if (!extensionVariables.azureDevOpsService.getProjectName()) {
        let projectList = await extensionVariables.azureDevOpsService.listProjects();
        let selectedProject = await vscode.window.showQuickPick(projectList, { placeHolder: "Select Azure DevOps project" });
        extensionVariables.azureDevOpsService.setProjectName(selectedProject);
        extensionVariables.inputs.projectName = selectedProject;
    }
    else {
        extensionVariables.inputs.projectName = extensionVariables.azureDevOpsService.getProjectName();
    }
}

async function getSelectedPipeline(): Promise<void> {
    let fileUris = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Analyzing your repo" }, () => {
        return analyzeRepo(extensionVariables.inputs.sourceRepositoryDetails.localPath);
    });
    // TO:DO- Get applicable pipelines for the repo type and azure target type if target already selected
    let appropriatePipelines: string[] = await listAppropriatePipeline(fileUris[0], fileUris[1]);
    extensionVariables.inputs.selectedPipeline = await vscode.window.showQuickPick(appropriatePipelines, {
        placeHolder: "Select Azure pipelines template .."
    });
}

async function getAzureResourceDetails() {

    let subscriptions: [any] = extensionVariables.azureAccountApi.exports.subscriptions;
    let subscriptionList = subscriptions.map((subscriptionObject) => {
        return <QuickPickItem>{
            label: <string>subscriptionObject.subscription.displayName,
            detail: <string>subscriptionObject.subscription.subscriptionId
        };
    });
    let selectedSubscription: QuickPickItem = await vscode.window.showQuickPick(subscriptionList);
    extensionVariables.inputs.subscriptionId = selectedSubscription.detail;

    extensionVariables.azureService = new AzureService(extensionVariables.inputs.authDetails.credentials, extensionVariables.inputs.subscriptionId);
    let resourceListResult: ResourceListResult = await extensionVariables.azureService.listResourcesOfType(extensionVariables.pipelineTargetType);
    let resourceDisplayList = resourceListResult.map((resource) => {
        return <vscode.QuickPickItem>{
            label: resource.name,
            description: resource.id
        };
    });

    let selectedResource: vscode.QuickPickItem = await vscode.window.showQuickPick(resourceDisplayList, { placeHolder: "Select Web App " });
    extensionVariables.inputs.targetResource = resourceListResult.find((value: GenericResource) => {
        return value.id === selectedResource.description;
    });
}

async function getGitubConnectionService(): Promise<void> {
    let githubPat = await vscode.window.showInputBox({ placeHolder: "Enter GitHub PAT token" });
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
            title: `Setting up Azure Pipelines connection with subscription: ${extensionVariables.inputs.subscriptionId}`
        },
        () => {
            return extensionVariables.azureDevOpsService.createAzureServiceConnection(extensionVariables.inputs);
        });
}

async function checkInPipelineFileToRepository() {
    let ymlFilePath: string = await extensionVariables.sourceRepositoryService.addYmlFileToRepo(getPipelineFilePath(extensionVariables.inputs.selectedPipeline), extensionVariables.inputs);
    await vscode.window.showTextDocument(vscode.Uri.file(ymlFilePath));
    await vscode.window.showInformationMessage("Modify and commit yaml pipeline file to deploy.", "Commit", "Discard Pipeline")
        .then((commitOrDiscard: string) => {
            if (commitOrDiscard.toLowerCase() === "commit") {
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