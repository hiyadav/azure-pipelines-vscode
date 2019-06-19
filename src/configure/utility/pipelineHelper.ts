import * as fs from "fs";
import * as path from "path";

import * as vscode from 'vscode';
import { PipelineTargets } from "../model/models";

export async function listAppropriatePipeline(nodeUri: vscode.Uri[], dockerUri: vscode.Uri[]): Promise<string[]> {
    // TO-DO: To populate the possible pipelines on the basis of azure target resource.
	let appropriatePipelines: string[] = [];
	if (nodeUri.length === 0) {
		throw new Error("Failed to detect Node.js application");
	}
	else if (dockerUri.length > 0) {
		appropriatePipelines = [NodeOnContainers, NodeOnWindows];
	}
	else {
		appropriatePipelines = [NodeOnWindows, NodeOnContainers];
    }
    
    return appropriatePipelines;
}

export async function analyzeRepo(repoPath: string) {
	try {
		fs.accessSync(path.join(repoPath, "/.git"));
	}
	catch (error) {
		throw new Error(`Path: ${repoPath} is not a git repository. Configure this folder as a git repository.`);
    }
    
	let nodeFiles = vscode.workspace.findFiles("**/{package.json,*.ts,*.js}", "**/node_modules/**/package.json");
	let dockerFiles = vscode.workspace.findFiles("Dockerfile");

	return Promise.all([nodeFiles, dockerFiles]);
}

export function getPipelineTargetType(pipeline: string): PipelineTargets {
	switch (pipeline) {
		case NodeOnWindows:
			return PipelineTargets.WindowsWebApp;
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