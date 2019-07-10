
import { WizardInputs, Organization } from '../../model/models';
import { AzureDevOpsClient } from '../../clients/devOps/azureDevOpsClient';

export class AzureDevOpsService {
    private azureDevOpsClient: AzureDevOpsClient;
    private static AzureReposUrl = '"dev.azure.com/"';
    private static VSOUrl = "visualstudio.com/";

    public constructor(azureDevOpsClient: AzureDevOpsClient) {
        this.azureDevOpsClient = azureDevOpsClient;
    }

    public static isAzureReposUrl(remoteUrl: string): boolean {
        return (remoteUrl.indexOf(AzureDevOpsService.AzureReposUrl) >= 0 || remoteUrl.indexOf(AzureDevOpsService.VSOUrl) >= 0);
    }

    public static getOrganizationAndProjectNameFromRepositoryUrl(remoteUrl: string): {orgnizationName: string, projectName: string} {
        if (remoteUrl.indexOf(AzureDevOpsService.AzureReposUrl) >= 0) {
            let part = remoteUrl.substr(remoteUrl.indexOf(AzureDevOpsService.AzureReposUrl) + AzureDevOpsService.AzureReposUrl.length);
            let parts = part.split("/");
            let organizationName = parts[0].trim();
            let projectName = parts[1].trim();
            return {orgnizationName: organizationName, projectName: projectName};
        }
        else if (remoteUrl.indexOf(AzureDevOpsService.VSOUrl) >= 0) {
            let part = remoteUrl.substr(remoteUrl.indexOf(AzureDevOpsService.VSOUrl) + AzureDevOpsService.VSOUrl.length);
            let parts = part.split("/");
            let organizationName = remoteUrl.substring(remoteUrl.indexOf("https://") + "https://".length, remoteUrl.indexOf(".visualstudio.com"));
            let projectName = parts[0].trim();
            return {orgnizationName: organizationName, projectName: projectName};
        }
        else {
            throw new Error("Repo Url is not of Azure Repos type.");
        }
    }

    public static getRepositoryNameFromRemoteUrl(remoteUrl: string): string {
        if (remoteUrl.indexOf(AzureDevOpsService.AzureReposUrl) >= 0) {
            let part = remoteUrl.substr(remoteUrl.indexOf(AzureDevOpsService.AzureReposUrl) + AzureDevOpsService.AzureReposUrl.length);
            let parts = part.split("/");
            return parts[3].trim();
        }
        else if (remoteUrl.indexOf(AzureDevOpsService.VSOUrl) >= 0) {
            let part = remoteUrl.substr(remoteUrl.indexOf(AzureDevOpsService.VSOUrl) + AzureDevOpsService.VSOUrl.length);
            let parts = part.split("/");
            return parts[2].trim();
        }
        else {
            throw new Error("Repo Url is not of Azure Repos type.");
        }
    }

    public async getRepositoryId(organizationName: string, projectName: string, repositoryName: string): Promise<string> {
        let repositoryDetails = await this.azureDevOpsClient.getRepositoryDetails(organizationName, projectName, repositoryName);
        return repositoryDetails.id;
    }

    public async listOrganizations(refreshList: boolean = false): Promise<string[]> {
        let organizations: Organization[]= await this.azureDevOpsClient.listOrganizations();
        let organizationNames: string[] = [];
        for (let organization of organizations) {
            organizationNames.push(organization.accountName);
        }

        return organizationNames;
    }

    public async listProjects(organizationName: string): Promise<string[]> {
        let projects = await this.azureDevOpsClient.listProjects(organizationName);
        let items: string[] = [];
        for (let project of projects.value) {
            items.push(project.name);
        }

        return items;
    }

    public async createAndRunPipeline(inputs: WizardInputs): Promise<string> {
        var createAndRunPipelineResponse = await this.azureDevOpsClient.createAndRunPipeline(inputs);
        return createAndRunPipelineResponse.dataProviders["ms.vss-build-web.create-and-run-pipeline-data-provider"].pipelineBuildWebUrl;
    }

    public async getPipelineCompletionStatus(pipelineUrl: string, monitoringOptions: {}) {

    }
}
