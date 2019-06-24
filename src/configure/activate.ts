import * as vscode from 'vscode';

import { createApiProvider, registerUIExtensionVariables, AzureUserInput } from 'vscode-azureextensionui';
import { AzureExtensionApi, AzureExtensionApiProvider } from 'vscode-azureextensionui/api';
import TelemetryReporter from 'vscode-extension-telemetry';

import { configurePipeline } from './configure';
import { extensionVariables } from './model/models';


export async function activateConfigurePipeline(context: vscode.ExtensionContext, reporter: TelemetryReporter): Promise<AzureExtensionApiProvider> {
    extensionVariables.reporter = reporter;
    extensionVariables.outputChannel = vscode.window.createOutputChannel('Azure Pipelines');
    context.subscriptions.push(extensionVariables.outputChannel);

    let azureAccountExtension = vscode.extensions.getExtension("ms-vscode.azure-account");
    if (!azureAccountExtension) {
        throw new Error("Azure-Account extension could not be fetched. Kindly check it is installed and activated.");
    }

    if (!azureAccountExtension.isActive) {
        await azureAccountExtension.activate();
    }

    extensionVariables.azureAccountApi = azureAccountExtension;

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    vscode.commands.registerCommand('configure-pipeline', async (node: any) => {
        // The code you place here will be executed every time your command is executed
        await configurePipeline(node);
    });

    // register ui extension variables is required to be done for createApiProvider to be called.
    extensionVariables.uiExtensionVariables = {
        context: context,
        outputChannel: extensionVariables.outputChannel,
        ui: new AzureUserInput(context.globalState),
        reporter: extensionVariables.reporter
    };
    registerUIExtensionVariables(extensionVariables.uiExtensionVariables);
    return createApiProvider([<AzureExtensionApi>
        {
            configurePipelineApi: configurePipeline,
            apiVersion: "0.0.1"
        }]);
}