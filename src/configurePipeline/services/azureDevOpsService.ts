import * as guidGenerator from 'uuid/v1';
import * as vscode from 'vscode';

import { ServiceClientCredentials } from 'ms-rest';

import { GitRepositoryDetails, WizardInputs, ConnectionServiceType } from '../model/common';
import { AzureDevOpsClient } from '../clients/azureDevOpsClient';

export class AzureDevOpsService {
    private azureDevOpsClient: AzureDevOpsClient;
    private organizationName: string;
    private projectName: string;

    public constructor(credentials: ServiceClientCredentials) {
        this.azureDevOpsClient = new AzureDevOpsClient(credentials);
    }

    public async getRepositoryDetails(repositoryName: string): Promise<any> {
        return this.azureDevOpsClient.getRepositoryDetails(repositoryName, this.organizationName, this.projectName);
    }

    public async getOrganizationName(): Promise<string> {
        if (!!this.organizationName) {
            return this.organizationName;
        }

        let organizations = await this.azureDevOpsClient.listOrganizations();
        let items: string[] = [];
        for (let organization of organizations.value) {
            items.push(organization.accountName);
        }

        //items.push("Create New Organization");
        return vscode.window.showQuickPick(items, { placeHolder: "Select Azure DevOps Organization" }).then((selectedOrganization) => {
            this.organizationName = selectedOrganization;
            return selectedOrganization;
        });
    }

    public setOrganizationName(organizationName: string): void {
        this.organizationName = organizationName;
    }

    public async getProjectName(): Promise<string> {
        if (!!this.projectName) {
            return this.projectName;
        }

        let projects = await this.azureDevOpsClient.listProjects(this.organizationName);
        let items: string[] = [];
        for (let project of projects.value) {
            items.push(project.name);
        }

        //items.push("Create New Project");
        return vscode.window.showQuickPick(items, { placeHolder: "Select Azure DevOps project" }).then((selectedProject) => {
            for (let project of projects.value) {
                if (project.name === selectedProject) {
                    this.projectName = project.id;
                    return project.id;
                }
            }
        });
    }

    public setProjectName(projectId: string): void {
        this.projectName = projectId;
    }

    public async createGitHubServiceConnection(gitHubPat: string, prefix: string) {
        let endpointId: string = guidGenerator();
        let endpointName: string = prefix.concat(endpointId.substr(0, 5));
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Creating GitHub service connection" }, () => {
            return this.azureDevOpsClient.createGitHubServiceConnection(endpointId, endpointName, gitHubPat, this.organizationName, this.projectName);
        });

        await this.waitForEndpointToBeReady(endpointId);
        await this.azureDevOpsClient.authorizeEndpoint(endpointId, endpointName, this.organizationName, this.projectName)
            .then((response) => {
                for (let endpointObject in response.value) {
                    if (endpointObject.id === endpointId) {
                        return;
                    }
                }

                throw new Error("Could not authorize endpoint for use in Pipelines.")
            });

        return endpointId;
    }

    public async analyzeRepoAndSuggestPipelines(repoDetails: GitRepositoryDetails) {

    }

    public async createAzureServiceConnection(inputs: WizardInputs, scope?: string, ): Promise<string> {
        let endpointId: string = guidGenerator();
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Creating Azure service connection" }, () => {
            return this.azureDevOpsClient.createAzureServiceConnection(endpointId, inputs)
                .then((response) => {
                    return response = response.id;
                });
        });

        await this.waitForEndpointToBeReady(endpointId);
        return endpointId;
    }

    public async createAndRunPipeline(pipelineConfiguration: WizardInputs): Promise<string> {
        var createAndRunPipelineResponse = await this.azureDevOpsClient.createAndRunPipeline(pipelineConfiguration);
        return createAndRunPipelineResponse.dataProviders["ms.vss-build-web.create-and-run-pipeline-data-provider"].pipelineBuildWebUrl;
    }

    public async getPipelineCompletionStatus(pipelineUrl: string, monitoringOptions: {}) {

    }

    public async listServiceConnections(type: ConnectionServiceType): Promise<Array<{ endpointId: string, endpointName: string }>> {
        return this.azureDevOpsClient.listServiceConnections(type, this.organizationName, this.projectName)
            .then((response) => {
                response = response.value;
                let endpoints: Array<{ endpointId: string, endpointName: string }> = [];
                if (response) {
                    for (let endpoint of response) {
                        if (type && type.toLowerCase() === endpoint.type.toLowerCase()) {
                            endpoints.push({ endpointId: endpoint.id, endpointName: endpoint.name });
                        }
                    }
                }
                return endpoints;
            });
    }

    private async waitForEndpointToBeReady(endpointId: string): Promise<void> {
        let retryCount = 1;
        while (1) {
            let operationStatus = await this.azureDevOpsClient.getEndpointStatus(endpointId, this.organizationName, this.projectName)
                .then((response) => {
                    return response.operationStatus;
                });

            if (operationStatus.state.toLowerCase() === "ready") {
                break;
            }

            if (!(retryCount < 20) || operationStatus.state.toLowerCase() === "failed") {
                vscode.window.showErrorMessage("Unable to create azure service connection.\nOperation Status: " + operationStatus.state + " \Message: " + operationStatus.statusMessage);
                throw Error("service connection not ready");
            }

            retryCount++;
        }
    }
}
