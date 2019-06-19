export class GitHubProvider {
    // private gitHubPatToken: string;
    private static GitHubUrl = "https://github.com/";

    // constructor(gitHubPat: string) {
    //     this.gitHubPatToken = gitHubPat;
    // }

    public static isGitHubUrl(remoteUrl: string): boolean {
        return remoteUrl.indexOf(GitHubProvider.GitHubUrl) >= 0;
    }

    public static getRepositoryIdFromUrl(remoteUrl: string): string {
        let endCount: number = remoteUrl.indexOf(".git");
        if (endCount <= 0) {
            endCount = remoteUrl.length;
        }
        
        return remoteUrl.substring(GitHubProvider.GitHubUrl.length, endCount);
    }

    public GetRepos(fetchAllRepos: boolean = false): Array<{organizationName: string, repositoryName: string, respositoryId: string}> {
        return [];
    }

    public GetBranches(organizationName: string, repositoryName: string): Array<string> {
        return [];
    }
}