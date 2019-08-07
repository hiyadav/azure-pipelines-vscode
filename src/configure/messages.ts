export class Messages {
    public static acquireTokenFromRefreshTokenFailed: string = 'Acquiring token with refresh token failed. Error: %s.';
    public static addYmlFile: string = 'Add Azure Pipeline Yml definition.';
    public static analyzingRepo: string = 'Analyzing your repo';
    public static appKindIsNotSupported: string = 'App of kind: %s is not yet supported.';
    public static azureAccountExntesionUnavailable: string = 'Azure-Account extension could not be fetched. Kindly check it is installed and activated.';
    public static azureLoginRequired: string = 'Kindly Sign In to your Azure Account before going forward.';
    public static branchRemoteMissing: string = `The branch: %s does not have any tracking branch. Also the repositoy has either more than one remotes or no remotes. Hence, we are unable to create a remote tracking branch. Kindly, create a remote tracking branch to procceed.`;
    public static browsePipeline: string = 'Browse Pipeline';
    public static cannotAddFileRemoteMissing: string = 'Cannot add yml file to your git repository, remote is not set';
    public static cannotIdentifyRespositoryDetails: string = 'Could not identify repository details. Ensure your git repo is managed with Azure Repos or Github';
    public static commitAndPush: string = 'Commit & Push';
    public static configuringPipelineAndDeployment: string = 'Configuring Azure DevOps Pipeline and proceeding to deployment...';
    public static couldNotAuthorizeEndpoint: string = 'Could not authorize endpoint for use in Pipelines.';
    public static creatingAzureDevOpsOrganization: string = 'Creating Azure DevOps organization.';
    public static creatingAzureServiceConnection: string = 'Connecting azure pipelines with your subscription: %s';
    public static creatingGitHubServiceConnection: string = 'Creating GitHub service connection';
    public static discardPipeline: string = 'Discard Pipeline';
    public static enterAzureDevOpsOrganizationName: string = 'Azure DevOps organization name where your pipeline will be hosted';
    public static enterGitHubPat: string = 'Enter GitHub PAT token';
    public static failedToCreateAzureDevOpsProject: string = 'Failed to create project for Azure DevOps organization. Error: %s.';
    public static failedToCreateAzurePipeline: string = 'Failed to configure Azure pipeline. Error: %s';
    public static githubPatTokenHelpMessage: string = 'GitHub PAT token with following permissions: full access of repository webhooks and services, read access to user profile data and email address, read and write access to all repositories data.';
    public static modifyAndCommitFile: string = 'Modify and commit yaml pipeline file to deploy.';
    public static notAGitRepository: string = 'Selected workspace is not a git repository. Please select a git repository.';
    public static notAzureRepoUrl: string = 'Repo Url is not of Azure Repos type.';
    public static noWorkSpaceSelectedError: string = 'You need to select a workspace folder to configure pipeline.';
    public static operationCancelled: string = 'Operation cancelled.';
    public static operationTimedOut: string = 'Operation timed out.';
    public static organizationNameStaticValidationMessage: string = 'Organization names must start and end with a letter or number and can contain only letters, numbers, and hyphens';
    public static organizationNameReservedMessage: string = 'The organization name %s is not available. Please try another organization name';
    public static pipelineSetupSuccessfully: string = 'Azure DevOps pipelines set up successfully !';
    public static remoteRepositoryNotConfigured: string = 'Remote repository is not configured. Manage your git repository with Azure Repos or Github';
    public static resourceIdMissing: string = 'Required argument: resourceId, is missing. Kindly pass the argument for getting resource.';
    public static resourceTypeIsNotSupported: string = 'Resource of type: %s is not yet supported for configuring pipelines.';
    public static selectFolderOrRepository: string = 'Select the folder or repository to deploy';
    public static selectLabel: string = 'Select';
    public static selectOrganization: string = 'Select Azure DevOps Organization';
    public static selectPathToAppSourceCode: string = 'Select the path to your application source code.';
    public static selectPipelineTemplate: string = 'Select Azure pipelines template...';
    public static selectProject: string = 'Select Azure DevOps project';
    public static selectSubscription: string = 'Select Azure Subscription';
    public static selectWebApp: string = 'Select Web App';
    public static signInLabel: string = 'Sign In';
    public static unableToCreateAzureServiceConnection: string = `Unable to create azure service connection.\nOperation Status: %s\nMessage: %s\nService connection is not in ready state.`;
    public static unableToCreateGitHubServiceConnection: string =`Unable to create azure service connection.\nOperation Status: %s\nService connection is not in ready state.`;
}
