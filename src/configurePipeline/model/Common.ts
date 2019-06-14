import { OutputChannel, ExtensionContext } from 'vscode';

import { GenericResource } from 'azure-arm-resource/lib/resource/models';
import { ServiceClientCredentials } from 'ms-rest';

import { AzureDevOpsService } from '../services/azureDevOpsService';
import { SourceRepositoryService } from '../services/source/sourceRepositoryService';
import { AzureService } from '../services/target/azureService';
import TelemetryReporter from 'vscode-extension-telemetry';

export namespace extensionVariables {
    export let azureAccountApi: any;
    export let outputChannel: OutputChannel;
    export let reporter: TelemetryReporter;
    export let context: ExtensionContext;
    export let azureDevOpsService: AzureDevOpsService;
    export let azureService: AzureService;
    export let sourceRepositoryService: SourceRepositoryService;
    export let pipelineTargetType: PipelineTargets;
    export let inputs: WizardInputs;
}

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
    repositoryId: string;
    repositoryName: string;
    remoteUrl: string;
    branch: string;
    commitId: string;
}

export enum PipelineTargets {
    None = 'none',
    WindowsWebApp = 'Microsoft.WebApps'
}

export interface AzureTargetResource {
    resourceType: PipelineTargets;
    resourceName: string;
    resourceId: string;
    subscriptionId: string;
}

export enum ConnectionServiceType {
    GitHub = "github",
    AzureRM = "azurerm"
}