const uuid = require('uuid/v4');
import { AppServiceClient } from './clients/azure/appServiceClient';
import { AzureDevOpsClient } from './clients/devOps/azureDevOpsClient';
import { AzureDevOpsHelper } from './helper/devOps/azureDevOpsHelper';
import { AzureTreeItem, UserCancelledError } from 'vscode-azureextensionui';
import { exit } from 'process';
import { generateDevOpsProjectName, generateDevOpsOrganizationName } from './helper/commonHelper';
import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import { GraphHelper } from './helper/graphHelper';
import { LocalGitRepoHelper } from './helper/LocalGitRepoHelper';
import { Messages } from './resources/messages';
import { QuickPickItem } from 'vscode';
import { ServiceConnectionHelper } from './helper/devOps/serviceConnectionHelper';
import { SourceOptions, RepositoryProvider, extensionVariables, WizardInputs, WebAppKind, PipelineTemplate, QuickPickItemWithData } from './model/models';
import { TracePoints } from './resources/tracePoints';
import { TelemetryKeys } from './resources/telemetryKeys';
import * as constants from './resources/constants';
import * as path from 'path';
import * as templateHelper from './helper/templateHelper';
import * as utils from 'util';
import * as vscode from 'vscode';
import {  Result, telemetryHelper } from './helper/telemetryHelper';
import { ControlProvider } from './helper/controlProvider';

const Layer: string = 'configure';

export async function configurePipeline(node: AzureTreeItem) {
    await telemetryHelper.executeFunctionWithTimeTelemetry(async () => {
        try {
            if (!(await extensionVariables.azureAccountExtensionApi.waitForLogin())) {
                // set telemetry
                telemetryHelper.setTelemetry(TelemetryKeys.AzureLoginRequired, 'true');

                let signIn = await vscode.window.showInformationMessage(Messages.azureLoginRequired, Messages.signInLabel);
                if (signIn.toLowerCase() === Messages.signInLabel.toLowerCase()) {
                    await vscode.commands.executeCommand("azure-account.login");
                }
                else {
                    let error = new Error(Messages.azureLoginRequired);
                    telemetryHelper.setResult(Result.Failed, error);
                    throw error;
                }
            }

            var configurer = new PipelineConfigurer();
            await configurer.configure(node);
        }
        catch (error) {
            if (!(error instanceof UserCancelledError)) {
                extensionVariables.outputChannel.appendLine(error.message);
                vscode.window.showErrorMessage(error.message);
                telemetryHelper.setResult(Result.Failed, error);
            }
            else {
                telemetryHelper.setResult(Result.Canceled, error);
            }
        }
    }, TelemetryKeys.CommandExecutionDuration);
}

class PipelineConfigurer {
    private inputs: WizardInputs;
    private localGitRepoHelper: LocalGitRepoHelper;
    private azureDevOpsClient: AzureDevOpsClient;
    private serviceConnectionHelper: ServiceConnectionHelper;
    private azureDevOpsHelper: AzureDevOpsHelper;
    private appServiceClient: AppServiceClient;
    private workspacePath: string;
    private uniqueResourceNameSuffix: string;
    private controlProvider: ControlProvider;

    public constructor() {
        this.inputs = new WizardInputs();
        this.inputs.azureSession = extensionVariables.azureAccountExtensionApi.sessions[0];
        this.azureDevOpsClient = new AzureDevOpsClient(this.inputs.azureSession.credentials);
        this.azureDevOpsHelper = new AzureDevOpsHelper(this.azureDevOpsClient);
        this.uniqueResourceNameSuffix = uuid().substr(0, 5);
        this.controlProvider = new ControlProvider();
    }

    public async configure(node: any) {
        telemetryHelper.setCurrentStep('GetAllRequiredInputs');
        await this.getAllRequiredInputs(node);

        telemetryHelper.setCurrentStep('CreatePreRequisites');
        await this.createPreRequisites();

        telemetryHelper.setCurrentStep('CheckInPipeline');
        await this.checkInPipelineFileToRepository();

        telemetryHelper.setCurrentStep('CreateAndRunPipeline');
        let queuedPipelineUrl = await vscode.window.withProgress<string>({ location: vscode.ProgressLocation.Notification, title: Messages.configuringPipelineAndDeployment }, async () => {
            try {
                let pipelineName = `${this.inputs.targetResource.resource.name}-${this.uniqueResourceNameSuffix}`;
                return await this.azureDevOpsHelper.createAndRunPipeline(pipelineName, this.inputs);
            }
            catch (error) {
                telemetryHelper.logError(Layer, TracePoints.CreateAndQueuePipelineFailed, error);
                throw error;
            }

        });

        telemetryHelper.setCurrentStep('DisplayCreatedPipeline');
        vscode.window.showInformationMessage(Messages.pipelineSetupSuccessfully, Messages.browsePipeline)
            .then((action: string) => {
                if (action && action.toLowerCase() === Messages.browsePipeline.toLowerCase()) {
                    telemetryHelper.setTelemetry(TelemetryKeys.BrowsePipelineClicked, 'true');
                    vscode.env.openExternal(vscode.Uri.parse(queuedPipelineUrl));
                }
            });
    }

    private async getAllRequiredInputs(node: any) {
        await this.analyzeNode(node);
        await this.getSourceRepositoryDetails();
        await this.getAzureDevOpsDetails();
        await this.getSelectedPipeline();

        if (!this.inputs.targetResource.resource) {
            await this.getAzureResourceDetails();
        }
    }

    private async createPreRequisites(): Promise<void> {
        if (this.inputs.isNewOrganization) {
            this.inputs.project = {
                id: "",
                name: generateDevOpsProjectName(this.inputs.sourceRepository.repositoryName)
            };
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: Messages.creatingAzureDevOpsOrganization
                },
                () => {
                    return this.azureDevOpsClient.createOrganization(this.inputs.organizationName)
                        .then(() => {
                            this.azureDevOpsClient.listOrganizations(true);
                            return this.azureDevOpsClient.createProject(this.inputs.organizationName, this.inputs.project.name);
                        })
                        .then(() => {
                            return this.azureDevOpsClient.getProjectIdFromName(this.inputs.organizationName, this.inputs.project.name);
                        })
                        .then((projectId) => {
                            this.inputs.project.id = projectId;
                        })
                        .catch((error) => {
                            telemetryHelper.logError(Layer, TracePoints.CreateNewOrganizationAndProjectFailure, error);
                            throw error;
                        });
                });
        }

        if (this.inputs.sourceRepository.repositoryProvider === RepositoryProvider.Github) {
            await this.getGitubConnectionService();
        }

        await this.createAzureRMServiceConnection();
    }

    private async analyzeNode(node: any): Promise<void> {
        if (node instanceof AzureTreeItem) {
            await this.extractAzureResourceFromNode(node);
        }
        else if (node && node.fsPath) {
            this.workspacePath = node.fsPath;
            telemetryHelper.setTelemetry(TelemetryKeys.SourceRepoLocation, SourceOptions.CurrentWorkspace);
        }
    }

    private async getSourceRepositoryDetails(): Promise<void> {
        try {
            if (!this.workspacePath) { // This is to handle when we have already identified the repository details.
                let sourceOptions: Array<QuickPickItem> = [];
                if (vscode.workspace && vscode.workspace.rootPath) {
                    sourceOptions.push({ label: SourceOptions.CurrentWorkspace });
                }

                sourceOptions.push({ label: SourceOptions.BrowseLocalMachine });

                let selectedSourceOption = await this.controlProvider.showQuickPick(
                    constants.SelectFolderOrRepository,
                    sourceOptions,
                    { placeHolder: Messages.selectFolderOrRepository }
                );

                telemetryHelper.setTelemetry(TelemetryKeys.SourceRepoLocation, selectedSourceOption.label);
                switch (selectedSourceOption.label) {
                    case SourceOptions.BrowseLocalMachine:
                        let selectedFolder: vscode.Uri[] = await vscode.window.showOpenDialog(
                            {
                                openLabel: Messages.selectLabel,
                                canSelectFiles: false,
                                canSelectFolders: true,
                                canSelectMany: false
                            }
                        );
                        if (selectedFolder && selectedFolder.length > 0) {
                            this.workspacePath = selectedFolder[0].fsPath;
                        }
                        else {
                            throw new Error(Messages.noWorkSpaceSelectedError);
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
        catch (error) {
            telemetryHelper.logError(Layer, TracePoints.GetSourceRepositoryDetailsFailed, error);
            throw error;
        }
    }

    private async getGitDetailsFromRepository(workspacePath: string): Promise<void> {
        this.localGitRepoHelper = await LocalGitRepoHelper.GetHelperInstance(workspacePath);
        this.inputs.sourceRepository = await this.localGitRepoHelper.getGitRepoDetails(workspacePath);

        // set telemetry
        telemetryHelper.setTelemetry(TelemetryKeys.RepoProvider, this.inputs.sourceRepository.repositoryProvider);

        if (this.inputs.sourceRepository.repositoryProvider === RepositoryProvider.AzureRepos) {
            let orgAndProjectName = AzureDevOpsHelper.getOrganizationAndProjectNameFromRepositoryUrl(this.inputs.sourceRepository.remoteUrl);
            this.inputs.organizationName = orgAndProjectName.orgnizationName;
            this.azureDevOpsClient.getRepository(this.inputs.organizationName, orgAndProjectName.projectName, this.inputs.sourceRepository.repositoryName)
                .then((repository) => {
                    this.inputs.sourceRepository.repositoryId = repository.id;
                    this.inputs.project = {
                        id: repository.project.id,
                        name: repository.project.name
                    };
                });
        }
    }

    private async extractAzureResourceFromNode(node: any): Promise<void> {
        this.inputs.targetResource.subscriptionId = node.root.subscriptionId;
        this.appServiceClient = new AppServiceClient(this.inputs.azureSession.credentials, this.inputs.targetResource.subscriptionId);

        try {
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
        catch (error) {
            telemetryHelper.logError(Layer, TracePoints.ExtractAzureResourceFromNodeFailed, error);
            throw error;
        }
    }

    private async getAzureDevOpsDetails(): Promise<void> {
        try {
            if (this.inputs.sourceRepository.repositoryProvider !== RepositoryProvider.AzureRepos) {
                this.inputs.isNewOrganization = false;
                let devOpsOrganizations = await this.azureDevOpsClient.listOrganizations();

                if (devOpsOrganizations && devOpsOrganizations.length > 0) {
                    let selectedOrganization = await this.controlProvider.showQuickPick(
                        constants.SelectOrganization,
                        devOpsOrganizations.map(x => { return { label: x.accountName }; }),
                        { placeHolder: Messages.selectOrganization },
                        TelemetryKeys.OrganizationListCount);
                    this.inputs.organizationName = selectedOrganization.label;

                    let selectedProject = await this.controlProvider.showQuickPick(
                        constants.SelectProject,
                        this.azureDevOpsClient.listProjects(this.inputs.organizationName)
                        .then((projects) => projects.map(x => { return { label: x.name, data: x }; })),
                        { placeHolder: Messages.selectProject },
                        TelemetryKeys.ProjectListCount);
                    this.inputs.project = selectedProject.data;
                }
                else {
                    telemetryHelper.setTelemetry(TelemetryKeys.NewOrganization, 'true');

                    this.inputs.isNewOrganization = true;
                    let userName = this.inputs.azureSession.userId.substring(0, this.inputs.azureSession.userId.indexOf("@"));
                    let organizationName = generateDevOpsOrganizationName(userName, this.inputs.sourceRepository.repositoryName);

                    let validationErrorMessage = await this.azureDevOpsClient.validateOrganizationName(organizationName);
                    if(validationErrorMessage) {
                        this.inputs.organizationName = await this.controlProvider.showInputBox(
                        constants.EnterOrganizationName,
                        {
                            placeHolder: Messages.enterAzureDevOpsOrganizationName,
                            validateInput: (organizationName) => this.azureDevOpsClient.validateOrganizationName(organizationName)
                        });
                    }
                    else {
                        this.inputs.organizationName = organizationName;
                    }
                }
            }
        }
        catch (error) {
            telemetryHelper.logError(Layer, TracePoints.GetAzureDevOpsDetailsFailed, error);
            throw error;
        }
    }

    private async getSelectedPipeline(): Promise<void> {
        let appropriatePipelines: PipelineTemplate[] = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: Messages.analyzingRepo },
            () => templateHelper.analyzeRepoAndListAppropriatePipeline(this.inputs.sourceRepository.localPath)
        );

        // TO:DO- Get applicable pipelines for the repo type and azure target type if target already selected
        let selectedOption = await this.controlProvider.showQuickPick(
            constants.SelectPipelineTemplate,
            appropriatePipelines.map((pipeline) => { return { label: pipeline.label }; }),
            { placeHolder: Messages.selectPipelineTemplate },
            TelemetryKeys.PipelineTempateListCount);
        this.inputs.pipelineParameters.pipelineTemplate = appropriatePipelines.find((pipeline) => {
            return pipeline.label === selectedOption.label;
        });
        telemetryHelper.setTelemetry(TelemetryKeys.ChosenTemplate, this.inputs.pipelineParameters.pipelineTemplate.label);
    }

    private async getAzureResourceDetails(): Promise<void> {
        // show available subscriptions and get the chosen one
        let subscriptionList = extensionVariables.azureAccountExtensionApi.filters.map((subscriptionObject) => {
            return <QuickPickItemWithData>{
                label: <string>subscriptionObject.subscription.displayName,
                data: subscriptionObject
            };
        });
        let selectedSubscription: QuickPickItemWithData = await this.controlProvider.showQuickPick(constants.SelectSubscription, subscriptionList, { placeHolder: Messages.selectSubscription });
        this.inputs.targetResource.subscriptionId = selectedSubscription.data.subscription.subscriptionId;
        // show available resources and get the chosen one
        this.appServiceClient = new AppServiceClient(extensionVariables.azureAccountExtensionApi.sessions[0].credentials, this.inputs.targetResource.subscriptionId);
        let selectedResource: QuickPickItemWithData = await this.controlProvider.showQuickPick(
            constants.SelectWebApp,
            this.appServiceClient.GetAppServices(WebAppKind.WindowsApp)
            .then((webApps) => webApps.map(x => { return { label: x.name, data: x }; })),
            { placeHolder: Messages.selectWebApp },
            TelemetryKeys.WebAppListCount);
        this.inputs.targetResource.resource = selectedResource.data;
    }

    private async getGitubConnectionService(): Promise<void> {
        if (!this.serviceConnectionHelper) {
            this.serviceConnectionHelper = new ServiceConnectionHelper(this.inputs.organizationName, this.inputs.project.name, this.azureDevOpsClient);
        }

        // Get GitHub PAT as an input from the user.
        let githubPat = null;
        telemetryHelper.executeFunctionWithTimeTelemetry(
            async () => {
                // TO-DO  Create a new helper function to time and log time for all user inputs.
                // Log the time taken by the user to enter GitHub PAT
                githubPat = await this.controlProvider.showInputBox(constants.GitHubPat, { placeHolder: Messages.enterGitHubPat, prompt: Messages.githubPatTokenHelpMessage });
            },
            TelemetryKeys.GitHubPatDuration);

        // Create GitHub service connection in Azure DevOps
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: Messages.creatingGitHubServiceConnection
            },
            async () => {
                try {
                    let serviceConnectionName = `${this.inputs.sourceRepository.repositoryName}-${this.uniqueResourceNameSuffix}`;
                    this.inputs.sourceRepository.serviceConnectionId = await this.serviceConnectionHelper.createGitHubServiceConnection(serviceConnectionName, githubPat);
                }
                catch (error) {
                    telemetryHelper.logError(Layer, TracePoints.GitHubServiceConnectionError, error);
                    throw error;
                }
            });
    }

    private async createAzureRMServiceConnection(): Promise<void> {
        if (!this.serviceConnectionHelper) {
            this.serviceConnectionHelper = new ServiceConnectionHelper(this.inputs.organizationName, this.inputs.project.name, this.azureDevOpsClient);
        }
        // TODO: show notification while setup is being done.
        // ?? should SPN created be scoped to resource group of target azure resource.
        this.inputs.targetResource.serviceConnectionId = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: utils.format(Messages.creatingAzureServiceConnection, this.inputs.targetResource.subscriptionId)
            },
            async () => {
                try {
                    let scope = this.inputs.targetResource.resource.id;
                    let aadAppName = GraphHelper.generateAadApplicationName(this.inputs.organizationName, this.inputs.project.name);
                    let aadApp = await GraphHelper.createSpnAndAssignRole(this.inputs.azureSession, aadAppName, scope);
                    let serviceConnectionName = `${this.inputs.targetResource.resource.name}-${this.uniqueResourceNameSuffix}`;
                    return await this.serviceConnectionHelper.createAzureServiceConnection(serviceConnectionName, this.inputs.azureSession.tenantId, this.inputs.targetResource.subscriptionId, scope, aadApp);
                }
                catch (error) {
                    telemetryHelper.logError(Layer, TracePoints.AzureServiceConnectionCreateFailure, error);
                    throw error;
                }
            });
    }

    private async checkInPipelineFileToRepository() {
        try {
            this.inputs.pipelineParameters.pipelineFilePath = await this.localGitRepoHelper.addContentToFile(
                await templateHelper.renderContent(this.inputs.pipelineParameters.pipelineTemplate.path, this.inputs),
                await LocalGitRepoHelper.GetAvailableFileName("azure-pipelines.yml", this.inputs.sourceRepository.localPath),
                this.inputs.sourceRepository.localPath);
            await vscode.window.showTextDocument(vscode.Uri.file(path.join(this.inputs.sourceRepository.localPath, this.inputs.pipelineParameters.pipelineFilePath)));
        }
        catch (error) {
            telemetryHelper.logError(Layer, TracePoints.AddingContentToPipelineFileFailed, error);
            throw error;
        }

        try {
            let commitOrDiscard = await vscode.window.showInformationMessage(utils.format(Messages.modifyAndCommitFile, Messages.commitAndPush, this.inputs.sourceRepository.branch, this.inputs.sourceRepository.remoteName), Messages.commitAndPush, Messages.discardPipeline);
            if (commitOrDiscard && commitOrDiscard.toLowerCase() === Messages.commitAndPush.toLowerCase()) {
                await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: Messages.configuringPipelineAndDeployment }, async (progress) => {
                    try {
                        // handle when the branch is not upto date with remote branch and push fails
                        this.inputs.sourceRepository.commitId = await this.localGitRepoHelper.commitAndPushPipelineFile(this.inputs.pipelineParameters.pipelineFilePath, this.inputs.sourceRepository);
                    }
                    catch (error) {
                        telemetryHelper.logError(Layer, TracePoints.CheckInPipelineFailure, error);
                        throw (error);
                    }
                });
            }
            else {
                telemetryHelper.setTelemetry(TelemetryKeys.PipelineDiscarded, 'true');
                throw new UserCancelledError(Messages.operationCancelled);
            }
        }
        catch (error) {
            telemetryHelper.logError(Layer, TracePoints.PipelineFileCheckInFailed, error);
            throw error;
        }
    }
}

// this method is called when your extension is deactivated
export function deactivate() { }
