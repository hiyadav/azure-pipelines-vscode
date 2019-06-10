import * as vscode from 'vscode';

import * as git from "simple-git/promise";
import * as fs from 'fs';
import * as path from 'path';
import * as Mustache from "mustache";

import { GitRepositoryDetails, SourceProviderType } from '../../model/common';
import { AzureDevOpsService } from "../azureDevOpsService";
import Q = require('q');

export class SourceRepositoryService {
    private gitReference: git.SimpleGit;
    
    public async getGitRepoDetails(workspacePath: string, azureDevOps: AzureDevOpsService): Promise<GitRepositoryDetails> {
        let gitPath: string = path.join(workspacePath, '.git');
        if (!fs.existsSync(gitPath)) {
            throw new Error("Git folder could not be found inside the folder at path: " + workspacePath);
        }

        this.gitReference = git(workspacePath);
        let status = await this.gitReference.status();
        let branch = status.current;
        let tracking = status.tracking.substr(0, status.tracking.indexOf(branch) - 1);
        let remoteUrl = await this.gitReference.remote(["get-url", tracking]);

        if (remoteUrl) {
            if (remoteUrl.indexOf(GithubUrl) >= 0) {
                //https://github.com/dikhakha/DemoNodeApp.git

                let repoId = remoteUrl.substring(GithubUrl.length, remoteUrl.indexOf(".git"));
                return <GitRepositoryDetails>{
                    sourceProvider: SourceProviderType.Github,
                    repositoryId: repoId,
                    repositoryName: repoId,
                    branch: "",
                    commitId: ""
                };
            }
            else if (remoteUrl.indexOf(AzureReposUrl) >= 0) {
                //https://dikhakha@dev.azure.com/dikhakha/vscode-extension/_git/vscode-extension

                let part = remoteUrl.substr(remoteUrl.indexOf(AzureReposUrl) + AzureReposUrl.length);
                let parts = part.split("/");
                azureDevOps.setOrganizationName(parts[0].trim());
                azureDevOps.setProjectName(parts[1].trim());
                let gitDetails: GitRepositoryDetails = {
                    sourceProvider: SourceProviderType.AzureRepos,
                    repositoryId: "",
                    repositoryName: parts[3].trim(),
                    branch: "",
                    commitId: ""
                };
                let repoDetails = await azureDevOps.getRepositoryDetails(gitDetails.repositoryName);
                gitDetails.repositoryId = repoDetails.id;
                return gitDetails;
            }
            else if (remoteUrl.indexOf(VSOUrl) >= 0) {
                //https://dikhakha.visualstudio.com/vscode-extension/_git/vscode-extension

                let part = remoteUrl.substr(remoteUrl.indexOf(VSOUrl) + VSOUrl.length);
                let parts = part.split("/");
                azureDevOps.setOrganizationName(remoteUrl.substring(remoteUrl.indexOf("https://") + "https://".length, remoteUrl.indexOf(".visualstudio.com")));
                azureDevOps.setProjectName(parts[0].trim());
                let gitDetails: GitRepositoryDetails = {
                    sourceProvider: SourceProviderType.AzureRepos,
                    repositoryId: "",
                    repositoryName: parts[2].trim(),
                    branch: "",
                    commitId: ""
                };
                let repoDetails = await azureDevOps.getRepositoryDetails(gitDetails.repositoryName);
                gitDetails.repositoryId = repoDetails.id;
                return gitDetails;
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
    public addYmlFileToRepo(ymlFilePath: string, context: any) {
        let deferred: Q.Deferred<string> = Q.defer();
        fs.readFile(ymlFilePath, { encoding: "utf8" }, async (error, data) => {

            if (error) {
                vscode.window.showErrorMessage(error.message);
            }
            else {
                let fileContent = Mustache.render(data, context);
                let ymlFileUri = vscode.Uri.file(vscode.workspace.workspaceFolders[0].uri.path + "/azure-pipelines.yml");
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
}

const GithubUrl = "https://github.com/";
const VSOUrl = "visualstudio.com/";
const AzureReposUrl = "dev.azure.com/"