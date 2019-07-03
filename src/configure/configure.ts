import * as vscode from 'vscode';

import { ResourceListResult, GenericResource } from 'azure-arm-resource/lib/resource/models';
import { AzureTreeItem } from 'vscode-azureextensionui';
import { QuickPickItem } from 'vscode';

import { SourceOptions, RepositoryProvider, extensionVariables, WizardInputs, WebAppKind, PipelineTemplate } from './model/models';
import { AzureDevOpsService } from "./services/azureDevOpsService";
import { SourceRepositoryService } from './services/source/sourceRepositoryService';
import { AzureService } from './clients/azure/appServiceClient';
import { analyzeRepoAndListAppropriatePipeline } from './utility/pipelineHelper';
import { exit } from 'process';

export async function configurePipeline(node: any) {
    try {
        if (!(await extensionVariables.azureAccountExtensionApi.waitForLogin())) {
            throw new Error("Kindly log-in to Azure Account extension before going forward.");
        }

        var configurer = new PipelineConfigurer();
        await configurer.configure(node);
    }
    catch (error) {
        // log error in telemetery.
        vscode.window.showErrorMessage(error.message);
    }
}

class PipelineConfigurer {
    private inputs: WizardInputs;
    private sourceRepositoryService: SourceRepositoryService;
    private azureDevOpsService: AzureDevOpsService;
    private azureService: AzureService;
    private workspacePath: string;

    public constructor() {
        this.inputs = new WizardInputs();
        this.azureDevOpsService = new AzureDevOpsService(extensionVariables.azureAccountExtensionApi.sessions[0].credentials);
    }

    public async configure(node: any) {
        await this.getAllRequiredInputs(node);
        let queuedPipelineUrl = await this.azureDevOpsService.createAndRunPipeline(this.inputs);
        vscode.window.showInformationMessage("Azure DevOps pipelines set up successfully !", "Browse Pipeline")
            .then((action: string) => {
                if (action && action.toLowerCase() === "browse pipeline") {
                    vscode.env.openExternal(vscode.Uri.parse(queuedPipelineUrl));
                }
            });
    }

    private async getAllRequiredInputs(node: any) {
        await this.analyzeNode(node);
        await this.getSourceRepositoryDetails();
        await this.getAzureDevOpsDetails();
        await this.getSelectedPipeline();
    
        if (this.inputs.sourceRepository.repositoryProvider === RepositoryProvider.Github) {
            await this.getGitubConnectionService();
        }
    
        if (!this.inputs.targetResource.targetResource) {
            await this.getAzureResourceDetails();
        }
    
        await this.createAzureRMServiceConnection();
        await this.checkInPipelineFileToRepository();
    }

    
    private async analyzeNode(node: any): Promise<void> {
        if (node instanceof AzureTreeItem) {
            await this.extractAzureResourceFromNode(node);
        }
        else if (node && node.fsPath) {
            this.workspacePath = node.fsPath;
        }
    }

    private async getSourceRepositoryDetails(): Promise<void> {
        if (!this.workspacePath) { // This is to handle when we have already identified the repository details.
            let sourceOptions: Array<QuickPickItem> = [];
            if (vscode.workspace && vscode.workspace.rootPath) {
                sourceOptions.push({ label: SourceOptions.CurrentWorkspace });
            }

            sourceOptions.push({ label: SourceOptions.BrowseLocalMachine });

            let selectedSourceOption = await extensionVariables.ui.showQuickPick(
                sourceOptions,
                { placeHolder: "Select the folder or repository to deploy" }
            );

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
                        this.workspacePath = selectedFolder[0].fsPath;
                    }
                    break;
                case SourceOptions.CurrentWorkspace:
                    this.workspacePath = vscode.workspace.rootPath;
                    break;
                default:
                    exit(0);
            }
        }

        await this.getGitDetailsFromRepository(this.workspacePath);
    }

    private async getGitDetailsFromRepository(workspacePath: string): Promise<void> {
        this.sourceRepositoryService = SourceRepositoryService.GetSourceRepositoryService(workspacePath);
        this.inputs.sourceRepository = await this.sourceRepositoryService.getGitRepoDetails(workspacePath);

        if (this.inputs.sourceRepository.repositoryProvider === RepositoryProvider.AzureRepos) {
            this.azureDevOpsService.getRepositoryId(this.inputs.sourceRepository.repositoryName, this.inputs.sourceRepository.remoteUrl)
                .then((repositoryId) => {
                    this.inputs.sourceRepository.repositoryId = repositoryId;
                });
        }
    }

    private async extractAzureResourceFromNode(node: any): Promise<void> {
        this.inputs.targetResource.subscriptionId = node.root.subscriptionId;
        this.azureService = new AzureService(this.inputs.azureSession.credentials, this.inputs.targetResource.subscriptionId);

        let azureResource: GenericResource = await this.azureService.getResource((<AzureTreeItem>node).fullId);

        switch (azureResource.type) {
            case "Microsoft.Web/sites":
                switch (azureResource.kind) {
                    case WebAppKind.WindowsApp:
                        this.inputs.targetResource.targetResource = azureResource;
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

    private async getAzureDevOpsDetails(): Promise<void> {
        if (!this.azureDevOpsService.getOrganizationName()) {
            let organizationList: string[] = await this.azureDevOpsService.listOrganizations();
            let selectedOrganization = await extensionVariables.ui.showQuickPick(organizationList.map((org) => { return { label: org }; }), { placeHolder: "Select Azure DevOps Organization" });
            this.azureDevOpsService.setOrganizationName(selectedOrganization.label);
            this.inputs.organizationName = selectedOrganization.label;
        }
        else {
            this.inputs.organizationName = this.azureDevOpsService.getOrganizationName();
        }

        if (!this.azureDevOpsService.getProjectName()) {
            let projectList = await this.azureDevOpsService.listProjects();
            let selectedProject = await extensionVariables.ui.showQuickPick(projectList.map((project) => { return { label: project }; }), { placeHolder: "Select Azure DevOps project" });
            this.azureDevOpsService.setProjectName(selectedProject.label);
            this.inputs.projectName = selectedProject.label;
        }
        else {
            this.inputs.projectName = this.azureDevOpsService.getProjectName();
        }
    }

    private async getSelectedPipeline(): Promise<void> {
        let appropriatePipelines: PipelineTemplate[] = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Analyzing your repo" }, () => {
            return analyzeRepoAndListAppropriatePipeline(this.inputs.sourceRepository.localPath);
        });

        // TO:DO- Get applicable pipelines for the repo type and azure target type if target already selected
        let selectedOption = await extensionVariables.ui.showQuickPick(appropriatePipelines.map((pipeline) => { return { label: pipeline.label }; }), {
            placeHolder: "Select Azure pipelines template..."
        });

        this.inputs.pipelineParameters = {
            pipelineTemplate: appropriatePipelines.find((pipeline) => {
                return pipeline.label === selectedOption.label;
            }),
            workingDirectory: ""
        };
    }

    private async getAzureResourceDetails(): Promise<void> {
        let subscriptions = extensionVariables.azureAccountExtensionApi.subscriptions;
        let subscriptionList = subscriptions.map((subscriptionObject) => {
            return <QuickPickItem>{
                label: <string>subscriptionObject.subscription.displayName
            };
        });
        let selectedSubscription: QuickPickItem = await extensionVariables.ui.showQuickPick(subscriptionList, { placeHolder: "Select Azure Subscription" });
        this.inputs.targetResource.subscriptionId = subscriptions.find((subscriptionObject) => {
            return subscriptionObject.subscription.displayName === selectedSubscription.label;
        }).subscription.subscriptionId;

        this.azureService = new AzureService(extensionVariables.azureAccountExtensionApi.sessions[0].credentials, this.inputs.targetResource.subscriptionId);
        let resourceListResult: ResourceListResult = await this.azureService.listResourcesOfType(this.inputs.pipelineParameters.pipelineTemplate.targetType);
        let resourceDisplayList = resourceListResult.map((resource) => {
            return <vscode.QuickPickItem>{
                label: resource.name
            };
        });

        let selectedResource: vscode.QuickPickItem = await extensionVariables.ui.showQuickPick(resourceDisplayList, { placeHolder: "Select Web App " });
        this.inputs.targetResource.targetResource = resourceListResult.find((value: GenericResource) => {
            return value.name === selectedResource.label;
        });
    }

    private async getGitubConnectionService(): Promise<void> {
        let githubPat = await extensionVariables.ui.showInputBox({ placeHolder: "Enter GitHub PAT token" });
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Creating GitHub service connection"
            },
            () => {
                return this.azureDevOpsService.createGitHubServiceConnection(githubPat, this.inputs.sourceRepository.repositoryName)
                    .then((serviceConnectionId) => {
                        this.inputs.sourceRepository.serviceConnectionId = serviceConnectionId;
                    });
            });
    }

    private async createAzureRMServiceConnection(): Promise<void> {
        // TODO: show notification while setup is being done.
        // ?? should SPN created be scoped to resource group of target azure resource.
        this.inputs.targetResource.serviceConnectionId = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Connecting azure pipelines with your subscription: ${this.inputs.targetResource.subscriptionId}`
            },
            () => {
                return this.azureDevOpsService.createAzureServiceConnection(this.inputs.targetResource.targetResource.name, this.inputs);
            });
    }

    private async checkInPipelineFileToRepository() {
        let ymlFilePath: string = await this.sourceRepositoryService.addYmlFileToRepo(
            this.inputs.pipelineParameters.pipelineTemplate.path,
            this.inputs.sourceRepository.localPath, this.inputs);

        await vscode.window.showTextDocument(vscode.Uri.file(ymlFilePath));
        await vscode.window.showInformationMessage("Modify and commit yaml pipeline file to deploy.", "Commit & Push", "Discard Pipeline")
            .then((commitOrDiscard: string) => {
                if (commitOrDiscard.toLowerCase() === "commit & push") {
                    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Configuring Azure DevOps Pipeline and proceeding to deployment..." }, async (progress) => {
                        // handle when the branch is not upto date with remote branch and push fails
                        let commitDetails = await this.sourceRepositoryService.commitAndPushPipelineFile(ymlFilePath);
                        this.inputs.sourceRepository.branch = commitDetails.branch;
                        this.inputs.sourceRepository.commitId = commitDetails.commitId;
                    });
                }
                else {
                    throw new Error("Operation was discarded.");
                }
            });
    }

}

// this method is called when your extension is deactivated
export function deactivate() { }