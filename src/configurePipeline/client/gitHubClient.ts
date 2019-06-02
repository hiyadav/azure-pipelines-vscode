import { GitRepoDetails } from "../model/Common";

export class GithubProvider {
    private repoDetails: GitRepoDetails;
    private gitHubPatToken: string;

    constructor(repoDetails: GitRepoDetails, gitHubPat: string) {
        this.repoDetails = repoDetails;
        this.gitHubPatToken = gitHubPat;
    }

    public GetRepos(fetchAllRepos: boolean = false): Array<GitRepoDetails> {
        return [];
    }

    public GetBranches(GitRepoDetails): Array<string> {
        return [];
    }
}