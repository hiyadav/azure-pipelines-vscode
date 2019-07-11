import * as path from 'path';
import * as utils from 'util';
import * as vscode from 'vscode';

import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import { AzureTreeItem } from 'vscode-azureextensionui';
import { QuickPickItem } from 'vscode';

import { Messages } from './messages';
import { SourceOptions, RepositoryProvider, extensionVariables, WizardInputs, WebAppKind, PipelineTemplate, QuickPickItemWithData } from './model/models';
import { AzureDevOpsService } from './services/devOps/azureDevOpsService';
import { SourceRepositoryService } from './services/source/sourceRepositoryService';
import { analyzeRepoAndListAppropriatePipeline } from './utility/pipelineHelper';
import { exit } from 'process';
import { ServiceConnectionHelper } from './services/devOps/serviceConnection';
import { AzureDevOpsFactory } from './azureDevOpsFactory';
import { AppServiceClient } from './clients/azure/appServiceClient';

export async function configurePipeline(node: any) {
    try {
        if (!(await extensionVariables.azureAccountExtensionApi.waitForLogin())) {
            throw new Error(Messages.azureLoginRequired);
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
    private connectionService: ServiceConnectionHelper;
    private azureDevOpsFactory: AzureDevOpsFactory;
    private appServiceClient: AppServiceClient;
    private workspacePath: string;

    public constructor() {
        this.inputs = new WizardInputs();
        this.inputs.azureSession = extensionVariables.azureAccountExtensionApi.sessions[0];
        this.azureDevOpsFactory = new AzureDevOpsFactory(this.inputs.azureSession.credentials);
        this.azureDevOpsService = this.azureDevOpsFactory.getAzureDevOpsService();
    }

    public async configure(node: any) {
        await this.getAllRequiredInputs(node);
        let queuedPipelineUrl = await this.azureDevOpsService.createAndRunPipeline(this.inputs);
        vscode.window.showInformationMessage(Messages.pipelineSetupSuccessfully, Messages.browsePipeline)
            .then((action: string) => {
                if (action && action.toLowerCase() === Messages.browsePipeline.toLowerCase()) {
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

        if (!this.inputs.targetResource.resource) {
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
                { placeHolder: Messages.selectFolderOrRepository }
            );

            switch (selectedSourceOption.label) {
                case SourceOptions.BrowseLocalMachine:
                    let selectedFolder: vscode.Uri[] = await vscode.window.showOpenDialog(
                        {
                            openLabel: Messages.selectPathToAppSourceCode,
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
            let orgAndProjectName = AzureDevOpsService.getOrganizationAndProjectNameFromRepositoryUrl(this.inputs.sourceRepository.remoteUrl);
            this.inputs.organizationName = orgAndProjectName.orgnizationName;
            this.inputs.projectName = orgAndProjectName.projectName;
            this.azureDevOpsService.getRepositoryId(this.inputs.organizationName, this.inputs.projectName, this.inputs.sourceRepository.repositoryName)
                .then((repositoryId) => {
                    this.inputs.sourceRepository.repositoryId = repositoryId;
                });
        }
    }

    private async extractAzureResourceFromNode(node: any): Promise<void> {
        this.inputs.targetResource.subscriptionId = node.root.subscriptionId;
        this.appServiceClient = new AppServiceClient(this.inputs.azureSession.credentials, this.inputs.targetResource.subscriptionId);

        let azureResource: GenericResource = await this.appServiceClient.getAppServiceResource((<AzureTreeItem>node).fullId);

        switch (azureResource.type.toLowerCase()) {
            case Messages.webAppResourceType.toLowerCase():
                switch (azureResource.kind) {
                    case WebAppKind.WindowsApp:
                        this.inputs.targetResource.resource = azureResource;
                        break;
                    case WebAppKind.FunctionApp:
                    case WebAppKind.LinuxApp:
                    case WebAppKind.LinuxContainerApp:
                    default:
                        throw new Error(utils.format(Messages.appKindIsNotSupported, azureResource.kind));
                }
                break;
            default:
                throw new Error(utils.format(Messages.resourceTypeIsNotSupported, azureResource.type));
        }
    }

    private async getAzureDevOpsDetails(): Promise<void> {
        if (!this.inputs.organizationName) {
            let selectedOrganization = await extensionVariables.ui.showQuickPick(this.azureDevOpsService.listOrganizations(), { placeHolder: Messages.selectOrganization });
            this.inputs.organizationName = selectedOrganization.label;
        }

        if (!this.inputs.projectName) {
            let selectedProject = await extensionVariables.ui.showQuickPick(this.azureDevOpsService.listProjects(this.inputs.organizationName), { placeHolder: Messages.selectProject });
            this.inputs.projectName = selectedProject.label;
        }
    }

    private async getSelectedPipeline(): Promise<void> {
        let appropriatePipelines: PipelineTemplate[] = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: Messages.analyzingRepo }, () => {
            return analyzeRepoAndListAppropriatePipeline(this.inputs.sourceRepository.localPath);
        });

        // TO:DO- Get applicable pipelines for the repo type and azure target type if target already selected
        let selectedOption = await extensionVariables.ui.showQuickPick(appropriatePipelines.map((pipeline) => { return { label: pipeline.label }; }), {
            placeHolder: Messages.selectPipelineTemplate
        });

        this.inputs.pipelineParameters.pipelineTemplate = appropriatePipelines.find((pipeline) => {
            return pipeline.label === selectedOption.label;
        });
    }

    private async getAzureResourceDetails(): Promise<void> {
        // show available subscriptions and get the chosen one
        let subscriptionList = extensionVariables.azureAccountExtensionApi.subscriptions.map((subscriptionObject) => {
            return <QuickPickItemWithData>{
                label: <string>subscriptionObject.subscription.displayName,
                data: subscriptionObject
            };
        });
        let selectedSubscription: QuickPickItemWithData = await extensionVariables.ui.showQuickPick(subscriptionList, { placeHolder: Messages.selectSubscription });
        this.inputs.targetResource.subscriptionId = selectedSubscription.data.subscription.subscriptionId;

        // show available resources and get the chosen one
        this.appServiceClient = new AppServiceClient(extensionVariables.azureAccountExtensionApi.sessions[0].credentials, this.inputs.targetResource.subscriptionId);
        let selectedResource: QuickPickItemWithData = await extensionVariables.ui.showQuickPick(this.appServiceClient.GetAppServices(WebAppKind.WindowsApp), { placeHolder: Messages.selectWebApp });
        this.inputs.targetResource.resource = selectedResource.data;
    }

    private async getGitubConnectionService(): Promise<void> {
        if (!this.connectionService) {
            this.connectionService = this.azureDevOpsFactory.getServiceConnectionHelper(this.inputs.organizationName, this.inputs.projectName);
        }

        let githubPat = await extensionVariables.ui.showInputBox({ placeHolder: Messages.enterGitHubPat });
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: Messages.creatingGitHubServiceConnection
            },
            () => {
                return this.connectionService.createGitHubServiceConnection(githubPat, this.inputs.sourceRepository.repositoryName)
                    .then((serviceConnectionId) => {
                        this.inputs.sourceRepository.serviceConnectionId = serviceConnectionId;
                    });
            });
    }

    private async createAzureRMServiceConnection(): Promise<void> {
        if (!this.connectionService) {
            this.connectionService = this.azureDevOpsFactory.getServiceConnectionHelper(this.inputs.organizationName, this.inputs.projectName);
        }
        // TODO: show notification while setup is being done.
        // ?? should SPN created be scoped to resource group of target azure resource.
        this.inputs.targetResource.serviceConnectionId = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: utils.format(Messages.creatingAzureServiceConnection, this.inputs.targetResource.subscriptionId)
            },
            () => {
                return this.connectionService.createAzureServiceConnection(this.inputs.targetResource.resource.name, this.inputs.azureSession.tenantId, this.inputs.targetResource.subscriptionId);
            });
    }

    private async checkInPipelineFileToRepository() {
        this.inputs.pipelineParameters.checkedInPipelineFileRelativePath = await this.sourceRepositoryService.addYmlFileToRepo(
            this.inputs.pipelineParameters.pipelineTemplate.path,
            this.inputs.sourceRepository.localPath, this.inputs);

        await vscode.window.showTextDocument(vscode.Uri.file(path.join(this.inputs.sourceRepository.localPath, this.inputs.pipelineParameters.checkedInPipelineFileRelativePath)));
        await vscode.window.showInformationMessage(Messages.modifyAndCommitFile, Messages.commitAndPush, Messages.discardPipeline)
            .then((commitOrDiscard: string) => {
                if (commitOrDiscard.toLowerCase() === Messages.commitAndPush.toLowerCase()) {
                    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: Messages.configuringPipelineAndDeployment }, async (progress) => {
                        // handle when the branch is not upto date with remote branch and push fails
                        let commitDetails = await this.sourceRepositoryService.commitAndPushPipelineFile(this.inputs.pipelineParameters.checkedInPipelineFileRelativePath);
                        this.inputs.sourceRepository.branch = commitDetails.branch;
                        this.inputs.sourceRepository.commitId = commitDetails.commitId;
                    });
                }
                else {
                    throw new Error(Messages.operationCancelled);
                }
            });
    }

}

// this method is called when your extension is deactivated
export function deactivate() { }
