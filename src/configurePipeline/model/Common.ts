import { ServiceClientCredentials } from 'ms-rest';
import { AzureTreeDataProvider, IAzureUserInput, ITelemetryReporter, AzureTreeItem } from 'vscode-azureextensionui';
import { OutputChannel, ExtensionContext, TreeView } from 'vscode';
import { AzureDevOpsService } from '../services/azureDevOpsService';
import { AzureTargetService } from '../services/target/azureTargetService';
import { SourceRepoService } from '../services/source/sourceRepoService';

export namespace extensionVariables {
    export let azureAccountApi: any;
    export let tree: AzureTreeDataProvider;
    export let outputChannel: OutputChannel;
    export let ui: IAzureUserInput;
    export let reporter: ITelemetryReporter;
    export let context: ExtensionContext;
    export let treeView: TreeView<AzureTreeItem>;
    export let azureDevOpsService: AzureDevOpsService;
    export let azureTargetService: AzureTargetService;
    export let sourceRepoService: SourceRepoService;
    export let pipelineTargetType: PipelineTargets;
    export let inputs: WizardInputs;
}

export class WizardInputs {
	sourceRepoDetails: GitRepoDetails;
	organizationName: string;
	projectName: string;
	sourceProviderConnectionId?: string;
	targetResource: AzureTargetResource;
	azureServiceConnectionId: string;
	workingDirectory: string;
}

export enum PipelineTargets {
    None = 0,
    WindowsWebApp = 1,
    WebAppForContainers = 2
}

export interface GitRepoDetails {
    sourceProvider: SourceProviderType;
    repositoryId: string;
    repositoryName: string;
    branch: string;
    commitId: string;
}

export interface AzureTargetResource {
    resourceType: PipelineTargets;
    resourceName: string;
    resourceId: string;
    subscriptionId: string;
    tenantId: string;
    credentials: ServiceClientCredentials;
}

export enum SourceProviderType {
    Github = 'github',
    AzureRepos = 'tfsgit'
}

export const extensionPrefix: string = 'appService';
