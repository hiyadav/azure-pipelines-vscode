import * as fs from "fs";
import * as path from "path";

import * as vscode from 'vscode';
import { PipelineTargets } from "../model/Common";

export async function getSelectedPipeline(nodeUri: vscode.Uri[], dockerUri: vscode.Uri[]): Promise<string> {
	let items: string[] = [];
	if (nodeUri.length === 0) {
		throw new Error("Failed to detect Node.js application");
	}
	else if (dockerUri.length > 0) {
		items = [NodeOnContainers, NodeOnWindows];
	}
	else {
		items = [NodeOnWindows, NodeOnContainers];
	}
	return vscode.window.showQuickPick(items, {
		placeHolder: "Select Azure pipelines template .."
	});
}

export async function analyzeRepo() {
	try {
		fs.accessSync(path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, "/.git"));
	}
	catch (error) {
		throw new Error("Workspace is not a git repository. Configure this workspace as git repository");
	}
	let nodeFiles = vscode.workspace.findFiles("**/{package.json,*.ts,*.js}", "**/node_modules/**/package.json");
	let dockerFiles = vscode.workspace.findFiles("Dockerfile");

	return Promise.all([nodeFiles, dockerFiles]);
}

function getTargetAzureService() {
	// returns back subscription and target azure service details.
}

export function getPipelineTargetType(pipeline: string): number {
	switch (pipeline) {
		case NodeOnWindows:
			return PipelineTargets.WindowsWebApp;
		case NodeOnContainers:
			return PipelineTargets.WebAppForContainers;
		default:
			return PipelineTargets.None;
	}
}

export function getPipelineFilePath(pipelineType: string) {
    return fileMap[pipelineType];
}

const NodeOnWindows = "Node.js with npm";
const NodeOnContainers = "Node.js with containers";

var fileMap: { [key: string]: string } = {};
fileMap[NodeOnWindows] = path.join(path.dirname(path.dirname(__dirname)), "configurePipeline\\pipelines\\nodejs.yml");
fileMap[NodeOnContainers] = path.join(path.dirname(path.dirname(__dirname)), "configurePipeline\\pipelines\\nodejs.yml");