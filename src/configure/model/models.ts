import { OutputChannel } from 'vscode';

import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import { ServiceClientCredentials } from 'ms-rest';

import { AzureDevOpsService } from '../services/azureDevOpsService';
import { SourceRepositoryService } from '../services/source/sourceRepositoryService';
import { AzureService } from '../services/target/azureService';
import TelemetryReporter from 'vscode-extension-telemetry';
import { UIExtensionVariables } from 'vscode-azureextensionui';

class ExtensionVariables {
    public azureAccountApi: any;
    public uiExtensionVariables: UIExtensionVariables;
    public outputChannel: OutputChannel;
    public reporter: TelemetryReporter;
    public azureDevOpsService: AzureDevOpsService;
    public azureService: AzureService;
    public sourceRepositoryService: SourceRepositoryService;
    public pipelineTargetType: PipelineTargets;
    public inputs: WizardInputs;
}

let extensionVariables = new ExtensionVariables();
export { extensionVariables };

export class WizardInputs {
    authDetails: AzureAuthentication = new AzureAuthentication();
    sourceRepositoryDetails: GitRepositoryDetails;
    organizationName: string;
    projectName: string;
    selectedPipeline: string;
    sourceProviderConnectionId?: string;
    subscriptionId: string;
    targetResource: GenericResource;
    azureServiceConnectionId: string;
    workingDirectory: string;
}

export class AzureAuthentication {
    credentials: ServiceClientCredentials;
    tenantId: string;
}

export enum SourceOptions {
    CurrentWorkspace = "CurrentWorkspace",
    BrowseLocalMachine = "Browse local machine",
    GithubRepository = "Github repository"
}

export enum SourceProviderType {
    Github = 'github',
    AzureRepos = 'tfsgit'
}

export interface GitRepositoryDetails {
    sourceProvider: SourceProviderType;
    localPath?: string;
    repositoryId: string;
    repositoryName: string;
    remoteUrl: string;
    branch: string;
    commitId: string;
}

export enum PipelineTargets {
    None = 'none',
    WindowsWebApp = 'windowsWebApp'
}

export enum ConnectionServiceType {
    GitHub = "github",
    AzureRM = "azurerm"
}