import * as fs from 'fs';
import * as path from 'path';
import Q = require('q');

import { TargetResourceType, PipelineTemplate } from '../model/models';

export async function analyzeRepoAndListAppropriatePipeline(repoPath: string): Promise<PipelineTemplate[]> {
    // TO-DO: To populate the possible pipelines on the basis of azure target resource.
    let analysisResult = await analyzeRepo(repoPath);

    if (analysisResult.isNodeApplication) {
        // add all node application templates
        return nodeTemplates;
    }

    // add all possible pipelines as we could not detect the appropriate onesı
    return nodeTemplates;
}

async function analyzeRepo(repoPath: string): Promise<{ isNodeApplication: boolean }> {
    let deferred: Q.Deferred<{ isNodeApplication: boolean }> = Q.defer();
    fs.readdir(repoPath, (err, files: string[]) => {
        let result = {
            isNodeApplication: isNodeRepo(files)
            // isContainerApplication: isDockerRepo(files)
        };
        deferred.resolve(result);
    });

    return deferred.promise;
}

function isNodeRepo(files: string[]): boolean {
    let nodeFilesRegex = '[node_modules,package/.json,.*/.ts,.*/.js]';
    return files.some((file) => {
        let result = new RegExp(nodeFilesRegex).test(file.toLowerCase());
        return result;
    });
}

function isDockerApplication(files: string[]): boolean {
    let nodeFilesRegex = '**/*Dockerfile*';
    return files.some((file) => {
        if (new RegExp(nodeFilesRegex).test(file.toLowerCase())) {
            return true;
        }
        return false;
    });
}

const nodeTemplates: Array<PipelineTemplate> = [
    {
        label: 'Node.js with npm',
        path: path.join(path.dirname(path.dirname(__dirname)), 'configure/pipelines/nodejs.yml'),
        language: 'node',
        targetType: TargetResourceType.WindowsWebApp
    },
    {
        label: 'Node.js with Gulp',
        path: path.join(path.dirname(path.dirname(__dirname)), 'configure/pipelines/nodejsWithGulp.yml'),
        language: 'node',
        targetType: TargetResourceType.WindowsWebApp
    },
    {
        label: 'Node.js with Grunt',
        path: path.join(path.dirname(path.dirname(__dirname)), 'configure/pipelines/nodejsWithGrunt.yml'),
        language: 'node',
        targetType: TargetResourceType.WindowsWebApp
    },
    {
        label: 'Node.js with Angular',
        path: path.join(path.dirname(path.dirname(__dirname)), 'configure/pipelines/nodejsWithAngular.yml'),
        language: 'node',
        targetType: TargetResourceType.WindowsWebApp
    },
    {
        label: 'Node.js with Webpack',
        path: path.join(path.dirname(path.dirname(__dirname)), 'configure/pipelines/nodejsWithWebpack.yml'),
        language: 'node',
        targetType: TargetResourceType.WindowsWebApp
    }
];

// const NodeOnContainers = {
//     label: 'Node.js with containers',
//     path: path.join(path.dirname(path.dirname(__dirname)), 'configure/pipelines/dockerWebApp.yml'),
//     language: 'node',
//     target: PipelineTargets.WindowsWebApp
// };
