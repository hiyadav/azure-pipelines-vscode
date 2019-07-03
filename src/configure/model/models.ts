import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import { ServiceClientCredentials } from 'ms-rest';
import { AzureEnvironment } from 'ms-rest-azure';
import { OutputChannel, ExtensionContext } from 'vscode';
import { UIExtensionVariables, IAzureUserInput } from 'vscode-azureextensionui';
import TelemetryReporter from 'vscode-extension-telemetry';

import { SubscriptionModels } from 'azure-arm-resource';
import { AzureDevOpsService } from '../services/azureDevOpsService';
import { SourceRepositoryService } from '../services/source/sourceRepositoryService';
import { AzureService } from '../services/target/azureService';

class ExtensionVariables implements UIExtensionVariables {
    public azureAccountExtensionApi: AzureAccountExtensionExports;

    public context: ExtensionContext;
    public outputChannel: OutputChannel;
    public reporter: TelemetryReporter;
    public ui: IAzureUserInput;

    public azureDevOpsService: AzureDevOpsService;
    public azureService: AzureService;
    public inputs: WizardInputs;
    public sourceRepositoryService: SourceRepositoryService;
}

let extensionVariables = new ExtensionVariables();
export { extensionVariables };

export interface  AzureAccountExtensionExports {
    sessions: AzureSession[];
    subscriptions: { session: AzureSession, subscription: SubscriptionModels.Subscription }[];
    waitForLogin: () => Promise<boolean>;
}

export class WizardInputs {
    azureSession: AzureSession = new AzureSession();
    azureParameters: AzureParameters = new AzureParameters();
    organizationName: string;
    projectName: string;
    pipelineParameters: PipelineParameters = new PipelineParameters();
    sourceRepositoryDetails: GitRepositoryDetails;
}

export class AzureSession {
    environment: AzureEnvironment;
    userId: string;
    tenantId: string;
    credentials: ServiceClientCredentials;
}

export class AzureParameters {
    subscriptionId: string;
    targetResource: GenericResource;
    azureServiceConnectionId: string;
}

export class PipelineParameters {
    pipelineTemplate: PipelineTemplate;
    workingDirectory: string;
}

export interface GitRepositoryDetails {
    repositoryProvider: RepositoryProvider;
    repositoryName: string;
    repositoryId: string;
    remoteUrl: string;
    branch: string;
    commitId: string;
    localPath?: string;
    serviceConnectionId?: string; // Id of the service connection in Azure DevOps
}

export interface PipelineTemplate {
    path: string;
    label: string;
    language: string;
    targetType: TargetResourceType;
}

export enum SourceOptions {
    CurrentWorkspace = "Current workspace",
    BrowseLocalMachine = "Browse local machine",
    GithubRepository = "Github repository"
}

export enum RepositoryProvider {
    Github = 'github',
    AzureRepos = 'tfsgit'
}

export enum TargetResourceType {
    None = 'none',
    WindowsWebApp = 'windowsWebApp'
}

export enum ServiceConnectionType {
    GitHub = "github",
    AzureRM = "azurerm"
}

export enum WebAppKind {
    WindowsApp = "app",
    FunctionApp = "functionapp",
    LinuxApp ="app,linux",
    LinuxContainerApp = "app,linux,container"
}