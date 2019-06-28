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
        case NodeJsWithGulp:
        case NodeJsWithGrunt:
        case NodeJsWithAngular:
        case NodeJsWithWebpack:
            return PipelineTargets.WindowsWebApp;
        case NodeOnContainers:
            default:
            return PipelineTargets.None;
    }
}

export function getPipelineFilePath(pipelineType: string) {
    return fileMap[pipelineType];
}

const NodeOnWindows = "Node.js with npm";
const NodeJsWithGulp = "Node.js with Gulp";
const NodeJsWithGrunt = "Node.js with Grunt";
const NodeJsWithAngular = "Node.js with Angular";
const NodeJsWithWebpack = "Node.js with Webpack";
const NodeOnContainers = "Node.js with containers";

var fileMap: { [key: string]: string } = {};
fileMap[NodeOnWindows] = path.join(path.dirname(path.dirname(__dirname)), "configure\\pipelines\\nodejs.yml");
fileMap[NodeJsWithGulp] = path.join(path.dirname(path.dirname(__dirname)), "configure\\pipelines\\nodejsWithGulp.yml");
fileMap[NodeJsWithGrunt] = path.join(path.dirname(path.dirname(__dirname)), "configure\\pipelines\\nodejsWithGrunt.yml");
fileMap[NodeJsWithAngular] = path.join(path.dirname(path.dirname(__dirname)), "configure\\pipelines\\nodejsWithAngular.yml");
fileMap[NodeJsWithWebpack] = path.join(path.dirname(path.dirname(__dirname)), "configure\\pipelines\\nodejsWithWebpack.yml");
fileMap[NodeOnContainers] = path.join(path.dirname(path.dirname(__dirname)), "configure\\pipelines\\dockerWebApp.yml");