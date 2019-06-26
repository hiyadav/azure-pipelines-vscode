import * as vscode from 'vscode';

import * as git from "simple-git/promise";
import * as fs from 'fs';
import * as path from 'path';
import * as Mustache from "mustache";

import { GitRepositoryDetails, SourceProviderType } from '../../model/models';
import { AzureDevOpsService } from "../azureDevOpsService";
import Q = require('q');
import { GitHubProvider } from '../gitHubService';
import { BranchSummary } from 'simple-git/typings/response';

export class SourceRepositoryService {
    private gitReference: git.SimpleGit;

    public async getGitRepoDetails(repositoryPath: string): Promise<GitRepositoryDetails> {
        let gitPath: string = path.join(repositoryPath, '.git');
        if (!fs.existsSync(gitPath)) {
            throw new Error(`Git folder could not be found inside the folder at path: ${repositoryPath}`);
        }

        this.gitReference = git(repositoryPath);
        let status = await this.gitReference.status();
        let branch = status.current;
        let commitId = await this.getLatestCommitId(branch);
        let tracking = status.tracking.substr(0, status.tracking.indexOf(branch) - 1);
        let remoteUrl = await this.gitReference.remote(["get-url", tracking]);

        if (remoteUrl) {
            if (AzureDevOpsService.isAzureReposUrl(remoteUrl)) {
                return <GitRepositoryDetails> {
                    sourceProvider: SourceProviderType.AzureRepos,
                    repositoryId: "",
                    repositoryName: AzureDevOpsService.getRepositoryNameFromRemoteUrl(remoteUrl),
                    remoteUrl: remoteUrl,
                    branch: branch,
                    commitId: commitId,
                    localPath: repositoryPath
                };
            }
            else if (GitHubProvider.isGitHubUrl(remoteUrl)) {
                let repoId = GitHubProvider.getRepositoryIdFromUrl(remoteUrl);
                return <GitRepositoryDetails>{
                    sourceProvider: SourceProviderType.Github,
                    repositoryId: repoId,
                    repositoryName: repoId,
                    remoteUrl: remoteUrl,
                    branch: branch,
                    commitId: commitId,
                    localPath: repositoryPath
                };
            }
            else {
                throw new Error("Could not identify repository details. Ensure your git repo is managed with Azure Repos or Github");
            }
        }
        else {
            throw new Error("Remote repository is not configured. Manage your git repository with Azure Repos or Github");
        }
    }

    /**
     *
     * @param pipelineYamlPath : local path of yaml pipeline in the extension
     * @param context: inputs required to be filled in the yaml pipelines
     * @returns: thenable object which resolves once all files are added to the repository
     */
    public addYmlFileToRepo(ymlFilePath: string, repoPath: string, context: any): Q.Promise<string> {
        let deferred: Q.Deferred<string> = Q.defer();
        fs.readFile(ymlFilePath, { encoding: "utf8" }, async (error, data) => {
            if (error) {
                throw new Error(error.message);
            }
            else {
                let fileContent = Mustache.render(data, context);
                let ymlFileUri = vscode.Uri.file(repoPath + "/azure-pipelines.yml");
                fs.writeFileSync(ymlFileUri.fsPath, fileContent);
                await vscode.workspace.saveAll(true);
                deferred.resolve(ymlFileUri.fsPath);
            }
        });

        return deferred.promise;
    }

    /**
     * commits yaml pipeline file into the local repo and pushes the commit to remote branch.
     * @param pipelineYamlPath : local path of yaml pipeline in the repository
     * @returns: thenable object which resolves once commit is pushed to remote branch, and failure message if unsuccessful
     */
    public async commitAndPushPipelineFile(pipelineYamlPath: string): Promise<{ commitId: string, branch: string }> {
        // TODO
        // unstages the changes already staged
        // stages the file at the mentioned path
        // commit the staged file
        // stage the previously staged changes


        await this.gitReference.add(pipelineYamlPath);
        let commit = await this.gitReference.commit("Add yml file to workspace", pipelineYamlPath);
        let status = await this.gitReference.status();
        let remote = status.tracking;
        let branch = status.current;
        if (remote && branch) {
            remote = remote.substr(0, remote.indexOf(branch) - 1);
            await this.gitReference.push(remote, branch);
        }
        else {
            throw new Error("Cannot add yml file to your git repository, remote is not set");
        }
        return {
            branch: branch,
            commitId: commit.commit
        };
    }

    private async getLatestCommitId(branchName: string): Promise<string> {
        let branchSummary: BranchSummary = await this.gitReference.branchLocal();
        if (!!branchSummary.branches[branchName]) {
            return branchSummary.branches[branchName].commit;
        }

        return "";
    }
}