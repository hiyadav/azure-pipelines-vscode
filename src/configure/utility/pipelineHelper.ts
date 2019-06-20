import * as fs from "fs";
import * as path from "path";

import * as vscode from 'vscode';
import { PipelineTargets } from "../model/models";

export async function analyzeRepoAndListAppropriatePipeline(repoPath: string): Promise<string[]> {
    let fileUris = await analyzeRepo(repoPath);

    // TO-DO: To populate the possible pipelines on the basis of azure target resource.
    let appropriatePipelines: string[] = [];
    if (fileUris.nodeUris.length > 0) {
        appropriatePipelines.push(NodeOnWindows);
    }
    else if (fileUris.dockerUris.length > 0) {
        appropriatePipelines.push(NodeOnContainers);
    }
    else {
        appropriatePipelines.push(NodeOnWindows, NodeOnContainers);
    }

    return appropriatePipelines;
}

async function analyzeRepo(repoPath: string): Promise<{ nodeUris: Array<vscode.Uri>, dockerUris: Array<vscode.Uri> }> {
    try {
        fs.accessSync(path.join(repoPath, "/.git"));
    }
    catch (error) {
        throw new Error(`Path: ${repoPath} is not a git repository. Configure this folder as a git repository.`);
    }

    let nodeFiles = await vscode.workspace.findFiles("**/{package.json,*.ts,*.js}", "**/node_modules/**/package.json");
    let dockerFiles = await vscode.workspace.findFiles("Dockerfile");

    return {
        nodeUris: nodeFiles,
        dockerUris: dockerFiles
    };
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
fileMap[NodeOnWindows] = path.join(path.dirname(path.dirname(__dirname)), "configure\\pipelines\\nodejs.yml");
fileMap[NodeOnContainers] = path.join(path.dirname(path.dirname(__dirname)), "configure\\pipelines\\nodejs.yml");