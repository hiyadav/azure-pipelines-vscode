import * as fs from 'fs';
import * as Mustache from 'mustache';
import * as path from 'path';
import * as git from 'simple-git/promise';
import * as util from 'util';
import * as vscode from 'vscode';

import { AzureDevOpsService } from '../devOps/azureDevOpsService';
import { Messages } from '../../messages';
import { GitRepositoryParameters, RepositoryProvider, WizardInputs } from '../../model/models';
import { GitHubProvider } from '../gitHubService';
import { BranchSummary } from 'simple-git/typings/response';
import Q = require('q');

export class SourceRepositoryService {
    private gitReference: git.SimpleGit;

    private constructor() {
    }

    public static GetSourceRepositoryService(repositoryPath: string): SourceRepositoryService {
        var repoService = new SourceRepositoryService();
        repoService.initialize(repositoryPath);
        return repoService;
    }

    public async getGitRepoDetails(repositoryPath: string): Promise<GitRepositoryParameters> {
        let status = await this.gitReference.status();
        let branch = status.current;
        let commitId = await this.getLatestCommitId(branch);
        let remote = "";
        let remoteUrl = "" || null;
        if (!status.tracking) {
            let remotes = await this.gitReference.getRemotes(false);
            if (remotes.length !== 1) {
                throw new Error(util.format(Messages.branchRemoteMissing, branch));
            }
            remote = remotes[0].name;
        }
        else {
            remote = status.tracking.substr(0, status.tracking.indexOf(branch) - 1);
        }
        remoteUrl = await this.gitReference.remote(["get-url", remote]);

        if (remoteUrl) {
            if (AzureDevOpsService.isAzureReposUrl(remoteUrl)) {
                return <GitRepositoryParameters>{
                    repositoryProvider: RepositoryProvider.AzureRepos,
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
                return <GitRepositoryParameters>{
                    repositoryProvider: RepositoryProvider.Github,
                    repositoryId: repoId,
                    repositoryName: repoId,
                    remoteUrl: remoteUrl,
                    branch: branch,
                    commitId: commitId,
                    localPath: repositoryPath
                };
            }
            else {
                throw new Error(Messages.canNotIdentifyRespositoryDetails);
            }
        }
        else {
            throw new Error(Messages.remoteRepositoryNotConfigured);
        }
    }

    /**
     *
     * @param pipelineYamlPath : local path of yaml pipeline in the extension
     * @param context: inputs required to be filled in the yaml pipelines
     * @returns: thenable object which resolves once all files are added to the repository
     */
    public addYmlFileToRepo(pipelineTemplateFilePath: string, repoPath: string, context: WizardInputs): Q.Promise<string> {
        let deferred: Q.Deferred<string> = Q.defer();
        fs.readFile(pipelineTemplateFilePath, { encoding: "utf8" }, async (error, data) => {
            if (error) {
                throw new Error(error.message);
            }
            else {
                let fileContent = Mustache.render(data, context);
                let ymlPipelineFileName: string = await SourceRepositoryService.getPipelineFileName(repoPath);
                let ymlFileUri = vscode.Uri.file(path.join(repoPath, "/" + ymlPipelineFileName));
                fs.writeFileSync(ymlFileUri.fsPath, fileContent);
                await vscode.workspace.saveAll(true);
                deferred.resolve(ymlPipelineFileName);
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
        let commit = await this.gitReference.commit(Messages.addYmlFile, pipelineYamlPath);
        let status = await this.gitReference.status();
        let branch = status.current;
        let remote = status.tracking;
        if (!remote) {
            let remotes = await this.gitReference.getRemotes(false);
            if (remotes.length !== 1) {
                throw new Error(util.format(Messages.branchRemoteMissing, branch));
            }
            remote = remotes[0].name;
        }
        else {
            remote = remote.substr(0, remote.indexOf(branch) - 1);
        }

        if (remote && branch) {
            await this.gitReference.push(remote, branch, {
                "--set-upstream": null
            });
        }
        else {
            throw new Error(Messages.cannotAddFileRemoteMissing);
        }

        return {
            branch: branch,
            commitId: commit.commit
        };
    }

    private static async getPipelineFileName(repoPath: string): Promise<string> {
        let deferred: Q.Deferred<string> = Q.defer();
        fs.readdir(repoPath, (err, files: string[]) => {
            let fileName = "azure-pipelines.yml";
            if (files.indexOf(fileName) < 0) {
                deferred.resolve(fileName);
            }
            else {
                for (let i = 1; i < 100; i++) {
                    let increamentalFileName = SourceRepositoryService.getIncreamentalFileName(fileName, i);
                    if (files.indexOf(increamentalFileName) < 0) {
                        deferred.resolve(increamentalFileName);
                    }
                }
            }
        });

        return deferred.promise;
    }

    private static getIncreamentalFileName(fileName: string, count: number): string {
        return fileName.substr(0, fileName.indexOf('.')).concat(` (${count})`, fileName.substr(fileName.indexOf('.')));
    }

    private async getLatestCommitId(branchName: string): Promise<string> {
        let branchSummary: BranchSummary = await this.gitReference.branchLocal();
        if (!!branchSummary.branches[branchName]) {
            return branchSummary.branches[branchName].commit;
        }

        return "";
    }

    private  initialize(repositoryPath: string): void {
        this.gitReference = git(repositoryPath);
    }
}
