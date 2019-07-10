import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import { ServiceClientCredentials } from 'ms-rest';
import { AzureEnvironment } from 'ms-rest-azure';
import { OutputChannel, ExtensionContext } from 'vscode';
import { UIExtensionVariables, IAzureUserInput } from 'vscode-azureextensionui';
import TelemetryReporter from 'vscode-extension-telemetry';
import { SubscriptionModels } from 'azure-arm-resource';

class ExtensionVariables implements UIExtensionVariables {
    public azureAccountExtensionApi: AzureAccountExtensionExports;

    public context: ExtensionContext;
    public outputChannel: OutputChannel;
    public reporter: TelemetryReporter;
    public ui: IAzureUserInput;
}

let extensionVariables = new ExtensionVariables();
export { extensionVariables };

export interface  AzureAccountExtensionExports {
    sessions: AzureSession[];
    subscriptions: { session: AzureSession, subscription: SubscriptionModels.Subscription }[];
    waitForLogin: () => Promise<boolean>;
}

export class WizardInputs {
    organizationName: string;
    projectName: string;
    sourceRepository: GitRepositoryParameters;
    targetResource: AzureParameters = new AzureParameters();
    pipelineParameters: PipelineParameters = new PipelineParameters();
    azureSession: AzureSession = new AzureSession();
}

export class Organization {
    accountId: string;
    accountName: string;
    accountUri: string;
    properties: {};
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
    serviceConnectionId: string;
}

export class PipelineParameters {
    checkedInPipelineFileRelativePath: string;
    pipelineTemplate: PipelineTemplate;
    workingDirectory: string;
}

export interface GitRepositoryParameters {
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
