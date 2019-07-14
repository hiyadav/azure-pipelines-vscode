import * as path from 'path';
import * as utils from 'util';
import * as guidGenerator from 'uuid/v1';
import * as vscode from 'vscode';

import { GenericResource, ResourceListResult } from 'azure-arm-resource/lib/resource/models';
import { AzureTreeItem } from 'vscode-azureextensionui';
import { QuickPickItem } from 'vscode';

import { Messages } from './messages';
import { SourceOptions, RepositoryProvider, extensionVariables, WizardInputs, WebAppKind, PipelineTemplate, QuickPickItemWithData, Organization } from './model/models';
import { AzureDevOpsHelper } from './helper/devOps/azureDevOpsHelper';
import { LocalGitRepoHelper } from './helper/LocalGitRepoHelper';
import { analyzeRepoAndListAppropriatePipeline, renderContent } from './helper/templateHelper';
import { exit } from 'process';
import { ServiceConnectionHelper } from './helper/devOps/serviceConnectionHelper';
import { AppServiceClient } from './clients/azure/appServiceClient';
import { AzureDevOpsClient } from './clients/devOps/azureDevOpsClient';

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
        extensionVariables.outputChannel.appendLine(error.message);
        vscode.window.showErrorMessage(error.message);
    }
}

class PipelineConfigurer {
    private inputs: WizardInputs;
    private localGitRepoHelper: LocalGitRepoHelper;
    private azureDevOpsClient: AzureDevOpsClient;
    private serivceConnectionHelper: ServiceConnectionHelper;
    private appServiceClient: AppServiceClient;
    private workspacePath: string;

    public constructor() {
        this.inputs = new WizardInputs();
        this.inputs.azureSession = extensionVariables.azureAccountExtensionApi.sessions[0];
        this.azureDevOpsClient = new AzureDevOpsClient(this.inputs.azureSession.credentials);
    }

    public async configure(node: any) {
        await this.getAllRequiredInputs(node);
        let createAndRunPipelineResponse = await this.azureDevOpsClient.createAndRunPipeline(this.inputs);
        let queuedPipelineUrl = createAndRunPipelineResponse.dataProviders['ms.vss-build-web.create-and-run-pipeline-data-provider'].pipelineBuildWebUrl;

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
        this.localGitRepoHelper = LocalGitRepoHelper.GetSourceRepositoryService(workspacePath);
        this.inputs.sourceRepository = await this.localGitRepoHelper.getGitRepoDetails(workspacePath);

        if (this.inputs.sourceRepository.repositoryProvider === RepositoryProvider.AzureRepos) {
            let orgAndProjectName = AzureDevOpsHelper.getOrganizationAndProjectNameFromRepositoryUrl(this.inputs.sourceRepository.remoteUrl);
            this.inputs.organizationName = orgAndProjectName.orgnizationName;
            this.inputs.projectName = orgAndProjectName.projectName;
            this.azureDevOpsClient.getRepositoryId(this.inputs.organizationName, this.inputs.projectName, this.inputs.sourceRepository.repositoryName)
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
            case 'Microsoft.Web/sites'.toLowerCase():
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
            let organizations: Organization[] = await this.azureDevOpsClient.listOrganizations();
            let organizationList: QuickPickItemWithData[] = [];
            for (let organization of organizations) {
                organizationList.push({ label: organization.accountName, data: organization });
            }
            let selectedOrganization = await extensionVariables.ui.showQuickPick(organizationList, { placeHolder: Messages.selectOrganization });
            this.inputs.organizationName = selectedOrganization.label;
        }

        if (!this.inputs.projectName) {
            let projects = await this.azureDevOpsClient.listProjects(this.inputs.organizationName);
            let projectList: QuickPickItemWithData[] = [];
            for (let project of projects) {
                projectList.push({ label: project.name, data: project });
            }
            let selectedProject = await extensionVariables.ui.showQuickPick(projectList, { placeHolder: Messages.selectProject });
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
        let resourceList: ResourceListResult = await this.appServiceClient.GetAppServices(WebAppKind.WindowsApp);
        let quickPickList = resourceList.map((resource) => {
            return <QuickPickItemWithData>{
                label: resource.name,
                data: resource
            };
        });
        let selectedResource: QuickPickItemWithData = await extensionVariables.ui.showQuickPick(quickPickList, { placeHolder: Messages.selectWebApp });
        this.inputs.targetResource.resource = selectedResource.data;
    }

    private async getGitubConnectionService(): Promise<void> {
        if (!this.serivceConnectionHelper) {
            this.serivceConnectionHelper = new ServiceConnectionHelper(this.inputs.organizationName, this.inputs.projectName, this.azureDevOpsClient);
        }

        let githubPat = await extensionVariables.ui.showInputBox({ placeHolder: Messages.enterGitHubPat });
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: Messages.creatingGitHubServiceConnection
            },
            () => {
                return this.serivceConnectionHelper.createGitHubServiceConnection(this.inputs.sourceRepository.repositoryName.concat(guidGenerator().substr(0, 5)), githubPat)
                    .then((serviceConnectionId) => {
                        this.inputs.sourceRepository.serviceConnectionId = serviceConnectionId;
                    });
            });
    }

    private async createAzureRMServiceConnection(): Promise<void> {
        if (!this.serivceConnectionHelper) {
            this.serivceConnectionHelper = new ServiceConnectionHelper(this.inputs.organizationName, this.inputs.projectName, this.azureDevOpsClient);
        }
        // TODO: show notification while setup is being done.
        // ?? should SPN created be scoped to resource group of target azure resource.
        this.inputs.targetResource.serviceConnectionId = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: utils.format(Messages.creatingAzureServiceConnection, this.inputs.targetResource.subscriptionId)
            },
            () => {
                return this.serivceConnectionHelper.createAzureServiceConnection(this.inputs.targetResource.resource.name.concat(guidGenerator().substr(0, 5)), this.inputs.azureSession.tenantId, this.inputs.targetResource.subscriptionId);
            });
    }

    private async checkInPipelineFileToRepository() {
        let renderedTemplatePromise = renderContent(this.inputs.pipelineParameters.pipelineFilePath, this.inputs);
        let pipelineFileNamePromise = await LocalGitRepoHelper.GetAvailableFileName('azure-pipelines.yml', this.inputs.sourceRepository.localPath);
        this.inputs.pipelineParameters.pipelineFilePath = await this.localGitRepoHelper.addContentToFile(await renderedTemplatePromise, await pipelineFileNamePromise, this.inputs.sourceRepository.localPath);

        await vscode.window.showTextDocument(vscode.Uri.file(path.join(this.inputs.sourceRepository.localPath, this.inputs.pipelineParameters.pipelineFilePath)));
        await vscode.window.showInformationMessage(Messages.modifyAndCommitFile, Messages.commitAndPush, Messages.discardPipeline)
            .then((commitOrDiscard: string) => {
                if (commitOrDiscard.toLowerCase() === Messages.commitAndPush.toLowerCase()) {
                    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: Messages.configuringPipelineAndDeployment }, async (progress) => {
                        // handle when the branch is not upto date with remote branch and push fails
                        let commitDetails = await this.localGitRepoHelper.commitAndPushPipelineFile(this.inputs.pipelineParameters.pipelineFilePath);
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
