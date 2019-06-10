import { GitRepositoryDetails } from "../model/common";

export class GithubProvider {
    private repoDetails: GitRepositoryDetails;
    private gitHubPatToken: string;

    constructor(repoDetails: GitRepositoryDetails, gitHubPat: string) {
        this.repoDetails = repoDetails;
        this.gitHubPatToken = gitHubPat;
    }

    public GetRepos(fetchAllRepos: boolean = false): Array<GitRepositoryDetails> {
        return [];
    }

    public GetBranches(GitRepoDetails): Array<string> {
        return [];
    }
}