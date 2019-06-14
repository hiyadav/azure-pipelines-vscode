import * as vscode from 'vscode';

import { createApiProvider, AzureTreeItem, registerUIExtensionVariables, AzureUserInput, UIExtensionVariables, createTelemetryReporter } from 'vscode-azureextensionui';
import { AzureExtensionApi, AzureExtensionApiProvider } from 'vscode-azureextensionui/api';

import { AzureDevOpsService } from "./services/azureDevOpsService";
import { SourceRepositoryService } from './services/source/sourceRepositoryService';
import { SourceOptions, SourceProviderType, extensionVariables, WizardInputs } from './model/common';
import { AzureService } from './services/target/azureService';
import { listAppropriatePipeline, analyzeRepo, getPipelineTargetType, getPipelineFilePath } from './utility/pipelineHelper';
import { ResourceListResult, GenericResource } from 'azure-arm-resource/lib/resource/models';
import TelemetryReporter from 'vscode-extension-telemetry';

export async function activateConfigurePipeline(context: vscode.ExtensionContext, reporter: TelemetryReporter): Promise<AzureExtensionApiProvider> {
    extensionVariables.context = context;
    extensionVariables.reporter = reporter;
    extensionVariables.outputChannel = vscode.window.createOutputChannel('Azure Pipeline');
    extensionVariables.context.subscriptions.push(extensionVariables.outputChannel);

    let azureAccountExtension = vscode.extensions.getExtension("ms-vscode.azure-account");
    if (!azureAccountExtension) {
        throw new Error("Azure-Account extension could not be fetched. Kindly check it is installed and activated.")
    }

    if (!azureAccountExtension.isActive) {
        await azureAccountExtension.activate();
    }

    extensionVariables.azureAccountApi = azureAccountExtension;

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    vscode.commands.registerCommand('configure-pipeline', async (node: any) => {
        // The code you place here will be executed every time your command is executed

        await configurePipeline(node);

    });

    // register ui extension variables is required to be done for createApiProvider to be called.
    let uIExtensionVariables: UIExtensionVariables = {
        context: context,
        outputChannel: extensionVariables.outputChannel,
        ui: new AzureUserInput(context.globalState),
        reporter: createTelemetryReporter(context)
    };
    registerUIExtensionVariables(uIExtensionVariables);
    return createApiProvider([<AzureExtensionApi>
        {
            configurePipelineApi: configurePipeline,
            apiVersion: "0.0.1"
        }]);
}

export async function configurePipeline(node: any) {
    try {
        if (!(await extensionVariables.azureAccountApi.exports.waitForLogin())) {
            throw new Error("Kindly log-in to Azure Account extension before going forward.")
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

    if (!extensionVariables.pipelineTargetType) {
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
                        throw new Error("App of kind: " + azureResource.kind + " is not yet supported.");
                }
                break;
            default:
                throw new Error("Resource of type: " + azureResource.type + "is not yet supported for configuring pipelines.");
        }
    }

    // also check if the node type is of  file explorer type and extra the git repo details in that case.
}

async function getSourceRepositoryDetails() {
    let selectedSourceOption: string = await vscode.window.showQuickPick(
        [SourceOptions.BrowseLocalMachine, SourceOptions.CurrentWorkspace, SourceOptions.GithubRepository],
        { placeHolder: "Select the folderor repository to deploy" }
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

    if (extensionVariables.inputs.sourceRepositoryDetails.sourceProvider === SourceProviderType.AzureRepos) {
        extensionVariables.inputs.sourceRepositoryDetails.repositoryId = await extensionVariables.azureDevOpsService.getRepositoryId(extensionVariables.inputs.sourceRepositoryDetails.repositoryName, extensionVariables.inputs.sourceRepositoryDetails.remoteUrl);
    }
}

async function getAzureDevOpsDetails(): Promise<void> {
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
    let fileUris = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Analyzing your repo" }, analyzeRepo);
    // TO:DO- Get applicable pipelines for the repo type and azure target type if target already selected
    let appropriatePipelines: string[] = await listAppropriatePipeline(fileUris[0], fileUris[1]);
    extensionVariables.inputs.selectedPipeline = await vscode.window.showQuickPick(appropriatePipelines, {
        placeHolder: "Select Azure pipelines template .."
    });
}

async function getAzureResourceDetails() {

    let subscriptions: [any] = extensionVariables.azureAccountApi.exports.subscriptions;
    let subscriptionList = subscriptions.map((subscriptionObject) => {
        return {
            label: <string>subscriptionObject.subscription.displayName,
            details: <string>subscriptionObject.subscription.subscriptionId
        };
    });
    extensionVariables.inputs.subscriptionId = (await vscode.window.showQuickPick(subscriptionList)).details;

    extensionVariables.azureService = new AzureService(extensionVariables.inputs.authDetails.credentials, extensionVariables.inputs.subscriptionId);
    let resourceListResult: ResourceListResult = await extensionVariables.azureService.listResourcesOfType(extensionVariables.pipelineTargetType);
    let resourceDisplayList = resourceListResult.map((resource) => {
        return <vscode.QuickPickItem>{
            label: resource.name,
            description: resource.id
        };
    });

    let selectedResource: vscode.QuickPickItem = await vscode.window.showQuickPick(resourceDisplayList);
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
    extensionVariables.inputs.azureServiceConnectionId = await extensionVariables.azureDevOpsService.createAzureServiceConnection(extensionVariables.inputs);
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