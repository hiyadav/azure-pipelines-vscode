import * as guidGenerator from 'uuid/v1';

import { ServiceClientCredentials } from 'ms-rest';

import { WizardInputs } from '../model/models';
import { AzureDevOpsClient } from '../clients/azureDevOpsClient';
import { setTimeout } from 'timers';

export class AzureDevOpsService {
    private azureDevOpsClient: AzureDevOpsClient;
    private organizationName: string;
    private projectName: string;
    private static AzureReposUrl = '"dev.azure.com/"';
    private static VSOUrl = "visualstudio.com/";

    private listOrganizationsPromise: Promise<string[]>;
    private organizationNames: string[];

    public constructor(credentials: ServiceClientCredentials) {
        this.azureDevOpsClient = new AzureDevOpsClient(credentials);
        this.listOrganizationsPromise = this.listOrganizations();
    }

    public static isAzureReposUrl(remoteUrl: string): boolean {
        return (remoteUrl.indexOf(AzureDevOpsService.AzureReposUrl) >= 0 || remoteUrl.indexOf(AzureDevOpsService.VSOUrl) >= 0);
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

    public async getRepositoryId(repositoryName: string, remoteUrl: string): Promise<string> {
        this.setOrganizationAndProjectNameFromRepositoryUrl(remoteUrl);
        let repositoryDetails = await this.azureDevOpsClient.getRepositoryDetails(repositoryName, this.organizationName, this.projectName);
        return repositoryDetails.id;
    }

    public async listOrganizations(refreshList: boolean = false): Promise<string[]> {
        if (!refreshList && (this.organizationNames || this.listOrganizationsPromise)) {
            return this.organizationNames ?  this.organizationNames : await this.listOrganizationsPromise;
        }

        let organizations = await this.azureDevOpsClient.listOrganizations();
        let organizationNames: string[] = [];
        for (let organization of organizations.value) {
            organizationNames.push(organization.accountName);
        }

        this.organizationNames = organizationNames;
        return organizationNames;
    }

    public getOrganizationName(): string {
        return this.organizationName;
    }

    /***
     * This function will only set organization name if it is not already set.
     * Once the value is set, it cannot be altered.
     */
    public setOrganizationName(organizationName: string): void {
        if (!this.organizationName) {
            this.organizationName = organizationName;
        }
    }

    public async listProjects(): Promise<string[]> {
        let projects = await this.azureDevOpsClient.listProjects(this.organizationName);
        let items: string[] = [];
        for (let project of projects.value) {
            items.push(project.name);
        }

        return items;
    }

    public getProjectName(): string {
        return this.projectName;
    }

    /***
     * This function will only set organization name if it is not already set.
     * Once the value is set, it cannot be altered.
     */
    public setProjectName(projectId: string): void {
        if (!this.projectName) {
            this.projectName = projectId;
        }
    }

    public async createGitHubServiceConnection(gitHubPat: string, prefix: string): Promise<string> {
        let endpointName: string = prefix.concat(guidGenerator().substr(0, 5));
        let response = await this.azureDevOpsClient.createGitHubServiceConnection(endpointName, gitHubPat, this.organizationName, this.projectName);
        let endpointId: string = response.id;
        await this.waitForGitHubEndpointToBeReady(endpointId);
        await this.azureDevOpsClient.authorizeEndpointForAllPipelines(endpointId, this.organizationName, this.projectName)
            .then((response) => {
                if (response.allPipelines.authorized !== true) {
                    throw new Error("Could not authorize endpoint for use in Pipelines.");
                }
            });

        return endpointId;
    }

    public async createAzureServiceConnection(prefix: string, inputs: WizardInputs, scope?: string, ): Promise<string> {
        let endpointName: string = prefix.concat(guidGenerator().substr(0, 5));
        let response = await this.azureDevOpsClient.createAzureServiceConnection(endpointName, inputs);
        let endpointId = response.id;
        await this.waitForEndpointToBeReady(endpointId);
        await this.azureDevOpsClient.authorizeEndpointForAllPipelines(endpointId, this.organizationName, this.projectName)
            .then((response) => {
                if (response.allPipelines.authorized !== true) {
                    throw new Error("Could not authorize endpoint for use in Pipelines.");
                }
            });

        return endpointId;
    }

    public async createAndRunPipeline(pipelineConfiguration: WizardInputs): Promise<string> {
        var createAndRunPipelineResponse = await this.azureDevOpsClient.createAndRunPipeline(pipelineConfiguration);
        return createAndRunPipelineResponse.dataProviders["ms.vss-build-web.create-and-run-pipeline-data-provider"].pipelineBuildWebUrl;
    }

    public async getPipelineCompletionStatus(pipelineUrl: string, monitoringOptions: {}) {

    }

    private setOrganizationAndProjectNameFromRepositoryUrl(remoteUrl: string): void {
        if (remoteUrl.indexOf(AzureDevOpsService.AzureReposUrl) >= 0) {
            let part = remoteUrl.substr(remoteUrl.indexOf(AzureDevOpsService.AzureReposUrl) + AzureDevOpsService.AzureReposUrl.length);
            let parts = part.split("/");
            this.organizationName = parts[0].trim();
            this.projectName = parts[1].trim();
        }
        else if (remoteUrl.indexOf(AzureDevOpsService.VSOUrl) >= 0) {
            let part = remoteUrl.substr(remoteUrl.indexOf(AzureDevOpsService.VSOUrl) + AzureDevOpsService.VSOUrl.length);
            let parts = part.split("/");
            this.organizationName = remoteUrl.substring(remoteUrl.indexOf("https://") + "https://".length, remoteUrl.indexOf(".visualstudio.com"));
            this.projectName = parts[0].trim();
        }
        else {
            throw new Error("Repo Url is not of Azure Repos type.");
        }
    }

    private async waitForEndpointToBeReady(endpointId: string): Promise<void> {
        let retryCount = 1;
        while (1) {
            let response = await this.azureDevOpsClient.getEndpointStatus(endpointId, this.organizationName, this.projectName);
            let operationStatus = response.operationStatus;

            if (operationStatus.state.toLowerCase() === "ready") {
                break;
            }

            if (!(retryCount < 20) || operationStatus.state.toLowerCase() === "failed") {
                throw Error(`Unable to create azure service connection.\nOperation Status: ${operationStatus.state} \nMessage: ${operationStatus.statusMessage} \nService connection is not in ready state.`);
            }

            await this.sleepForMilliSeconds(2000);
            retryCount++;
        }
    }

    private async waitForGitHubEndpointToBeReady(endpointId: string): Promise<void> {
        let retryCount = 1;
        while (1) {
            let response = await this.azureDevOpsClient.getEndpointStatus(endpointId, this.organizationName, this.projectName);
            let isReady: boolean = response.isReady;

            if (isReady === true) {
                break;
            }

            if (!(retryCount < 20)) {
                throw Error(`Unable to create azure service connection.\nOperation Status: ${isReady}\nService connection is not in ready state.`);
            }

            await this.sleepForMilliSeconds(2000);
            retryCount++;
        }
    }

    private async sleepForMilliSeconds(timeInMs: number) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, timeInMs);
        });
    }
}
