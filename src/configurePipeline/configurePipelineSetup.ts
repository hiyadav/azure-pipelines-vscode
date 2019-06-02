// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { AzureTreeDataProvider, AzureUserInput, createApiProvider, createTelemetryReporter, registerUIExtensionVariables } from 'vscode-azureextensionui';
import { AzureExtensionApi, AzureExtensionApiProvider } from 'vscode-azureextensionui/api';
import { registerAppServiceExtensionVariables } from 'vscode-azureappservice';

import { AzureDevOpsService } from "./services/azureDevOpsService";
import { SourceRepoService } from './services/source/sourceRepoService';
import { SourceProviderType, extensionVariables, WizardInputs } from './model/Common';
import { AzureTargetService } from './services/target/azureTargetService';
import { getSelectedPipeline, analyzeRepo, getPipelineTargetType, getPipelineFilePath } from './utility/pipelineHelper';
// import { WebAppProvider } from "./tree/WebAppProvider";
import { WebAppTreeItem } from './tree/WebAppTreeItem';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activateConfigurePipeline(context: vscode.ExtensionContext): Promise<AzureExtensionApiProvider> {
	extensionVariables.context = context;
	extensionVariables.reporter = createTelemetryReporter(context);
	extensionVariables.outputChannel = vscode.window.createOutputChannel('Azure Functions');
	context.subscriptions.push(extensionVariables.outputChannel);
	extensionVariables.ui = new AzureUserInput(context.globalState);

	registerUIExtensionVariables(extensionVariables);
	registerAppServiceExtensionVariables(extensionVariables);
	let azureAccountExtension = vscode.extensions.getExtension("ms-vscode.azure-account");
	if (!azureAccountExtension.isActive) {
		extensionVariables.azureAccountApi = await azureAccountExtension.activate();
	}

	// extensionVariables.tree = new AzureTreeDataProvider(WebAppProvider, "appservice.loadMore");
	// context.subscriptions.push(extensionVariables.tree);
	// context.subscriptions.push(vscode.window.registerTreeDataProvider('azureFunctionsExplorer', extensionVariables.tree));

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	vscode.commands.registerCommand('configure-pipeline', async (node: any) => {
		// The code you place here will be executed every time your command is executed

		await configurePipelineApi(node);

	});

	return createApiProvider([<AzureExtensionApi>
		{
			configurePipelineApi: configurePipelineApi,
			apiVersion: "0.0.1"
		}]);
}

export async function configurePipelineApi(node: any) {
	try {
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
		vscode.window.showErrorMessage(error.message);
	}
}

async function getAllRequiredInputs(node: any) {
	try {
		// get azure account credentails from azure client.
		// const azureConfig = vscode.workspace.getConfiguration('azure');
		extensionVariables.inputs = new WizardInputs();
		extensionVariables.azureTargetService = new AzureTargetService(extensionVariables.tree);
		extensionVariables.pipelineTargetType = 1;
		if (node instanceof WebAppTreeItem) {
			extensionVariables.inputs.targetResource = extensionVariables.azureTargetService.extractTargetFromNode(node);
		}
		else {
			extensionVariables.inputs.targetResource = await extensionVariables.azureTargetService.getTargetResource();
		}

		extensionVariables.azureDevOpsService = new AzureDevOpsService(extensionVariables.inputs.targetResource.credentials);
		extensionVariables.sourceRepoService = new SourceRepoService();
		extensionVariables.inputs.sourceRepoDetails = await extensionVariables.sourceRepoService.getSourceRepo(extensionVariables.azureDevOpsService);

		extensionVariables.inputs.organizationName = await extensionVariables.azureDevOpsService.getOrganizationName();
		extensionVariables.inputs.projectName = await extensionVariables.azureDevOpsService.getProjectName();

		let fileUris = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Analyzing your repo" }, analyzeRepo);
		// Auto derieve this based on web app selected
		var selectedPipeline = await getSelectedPipeline(fileUris[0], fileUris[1]);
		extensionVariables.pipelineTargetType = getPipelineTargetType(selectedPipeline);

		if (extensionVariables.inputs.sourceRepoDetails.sourceProvider === SourceProviderType.Github) {
			let githubPat = await vscode.window.showInputBox({placeHolder: "Enter GitHub PAT token"})
			extensionVariables.inputs.sourceProviderConnectionId = await extensionVariables.azureDevOpsService.createGitHubServiceConnection(githubPat);
			extensionVariables.inputs.sourceProviderConnectionId = await extensionVariables.azureDevOpsService.getGitHubConnectionId();
		}

		extensionVariables.inputs.azureServiceConnectionId = await extensionVariables.azureDevOpsService.createAzureServiceConnection(extensionVariables.inputs)
		let ymlFilePath: string = await extensionVariables.sourceRepoService.addYmlFileToRepo(getPipelineFilePath(selectedPipeline), extensionVariables.inputs);
		await vscode.window.showTextDocument(vscode.Uri.file(ymlFilePath));
		await vscode.window.showInformationMessage("Modify and commit yaml pipeline file to deploy.", "Commit", "Discard Pipeline")
			.then((commitOrDiscard: string) => {
				if (commitOrDiscard.toLowerCase() === "commit") {
					return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Configuring Azure DevOps Pipeline and proceeding to deployment..." }, async (progress) => {
						// handle when the branch is not upto date with remote branch and push fails
						let commitDetails = await extensionVariables.sourceRepoService.commitAndPushPipelineFile(ymlFilePath);
						extensionVariables.inputs.sourceRepoDetails.branch = commitDetails.branch;
						extensionVariables.inputs.sourceRepoDetails.commitId = commitDetails.commitId;
					});
				}
				else {
					throw new Error("operation was discarded.");
				}
			});
	}
	catch (error) {
		vscode.window.showErrorMessage(error.message);
	}
}

// this method is called when your extension is deactivated
export function deactivate() { }