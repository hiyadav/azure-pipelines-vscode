import * as Mustache from 'mustache';
import * as uuidv1 from 'uuid/v1';
import * as vscode from 'vscode';

import { ServiceClientCredentials, ServiceClient, UrlBasedRequestPrepareOptions } from 'ms-rest';

import { GitRepoDetails, WizardInputs } from '../model/Common';
import { Constants } from '../constants';

export class AzureDevOpsService {
	private serviceClient: ServiceClient;
	private organizationName: string;
	private projectName: string;

	public constructor(credentials: ServiceClientCredentials) {
		this.serviceClient = new ServiceClient(credentials);
	}

	public async getRepositoryDetails(repositoryName: string, organizationName?: string, projectName?: string): Promise<any> {
		organizationName = organizationName ? organizationName : this.organizationName;
		projectName = projectName ? projectName : this.projectName;
		return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
			url: "https://dev.azure.com/" + organizationName + "/" + projectName + "/_apis/git/repositories/" + repositoryName,
			headers: {
				"Content-Type": "application/json",
			},
			method: "GET",
			queryParameters: {
				"api-version": "5.0"
			},
			deserializationMapper: null,
			serializationMapper: null
		});
	}

	public async getOrganizationName(): Promise<string> {
		if (!!this.organizationName) {
			return this.organizationName;
		}

		let organizations = await this.fetchOrganizations();
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

		let projects = await this.fetchProjects(this.organizationName);
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

	public async getGitHubConnectionId(): Promise<string> {
		let serviceConnections = await this.fetchServiceConnections("github");
		if (!serviceConnections || serviceConnections.length === 0) {
			throw new Error("You do not have any GitHub service connection for account" + this.organizationName + " project" + this.projectName + ". Add new GitHub service connection and try again");
		}

		return serviceConnections[0].id;
	}

	public async createGitHubServiceConnection(gitHubPat: string) {
		let endpointId: string = uuidv1();
		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Creating Azure service connection" }, () => {
			return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
				url: "https://" + this.organizationName + ".visualstudio.com/" + this.projectName + "/_apis/serviceendpoint/endpoints",
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json;api-version=5.1-preview.2;excludeUrls=true"
				},
				method: "POST",
				body: {
					"administratorsGroup": null,
					"authorization": {
						"parameters": {
							"accessToken": gitHubPat
						},
						"scheme": "ServicePrincipal"
					},
					"description": "",
					"groupScopeId": null,
					"id": endpointId,
					"name": endpointId,
					"operationStatus": null,
					"readersGroup": null,
					"type": "github",
					"url": "http://github.com"
				},
				deserializationMapper: null,
				serializationMapper: null
			}).then((response) => {
				return response = response.id;
			});
		});

		await this.waitForEndpointToBeReady(endpointId);
		await this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
			url: "https://" + this.organizationName + ".visualstudio.com/" + this.projectName + "/_apis/serviceendpoint/endpoints",
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json;api-version=5.1-preview.2;excludeUrls=true"
				},
				method: "PATCH",
				body: {
					"authorized": true,
					"id": endpointId,
					"name": endpointId,
					"type": "endpoint"
				},
				deserializationMapper: null,
				serializationMapper: null
		})
		.then((response) => {
			for (let endpointObject in response.value) {
				if (endpointObject.id === endpointId) {
					return;
				}
			}
		});

		return endpointId;
	}

	public async analyzeRepoAndSuggestPipelines(repoDetails: GitRepoDetails) {

	}

	public async getAzureConnectionId(): Promise<string> {
		let serviceConnections = await this.fetchServiceConnections("azurerm");
		if (!serviceConnections || serviceConnections.length === 0) {
			throw new Error("You do not have any Azure service connection for account" + this.organizationName + " project" + this.projectName + ". Add new Azure service connection and try again");
		}

		return serviceConnections[0].id;
	}

	public async createAzureServiceConnection(inputs: WizardInputs, scope?: string, ): Promise<string> {
		let endpointId = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Creating Azure service connection" }, () => {
			return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
				url: "https://" + this.organizationName + ".visualstudio.com/" + this.projectName + "/_apis/serviceendpoint/endpoints",
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json;api-version=5.1-preview.2;excludeUrls=true"
				},
				method: "POST",
				body: {
					"administratorsGroup": null,
					"authorization": {
						"parameters": {
							"authenticationType": "spnKey",
							"scope": scope,
							"serviceprincipalid": "",
							"serviceprincipalkey": "",
							"tenantid": inputs.targetResource.tenantId
						},
						"scheme": "ServicePrincipal"
					},
					"data": {
						"appObjectId": "",
						"azureSpnPermissions": "",
						"azureSpnRoleAssignmentId": "",
						"creationMode": "Automatic",
						"environment": "AzureCloud",
						"scopeLevel": "Subscription",
						"spnObjectId": "",
						"subscriptionId": inputs.targetResource.subscriptionId,
						"subscriptionName": inputs.targetResource.subscriptionId
					},
					"description": "",
					"groupScopeId": null,
					"id": uuidv1(),
					"name": uuidv1(),
					"operationStatus": null,
					"readersGroup": null,
					"type": "azurerm",
					"url": "https://management.azure.com/"
				},
				deserializationMapper: null,
				serializationMapper: null
			}).then((response) => {
				return response = response.id;
			});
		});

		await this.waitForEndpointToBeReady(endpointId);
		return endpointId;
	}

	public async createAndRunPipeline(pipelineConfiguration: WizardInputs): Promise<string> {
		var createAndRunPipelineResponse = await this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
			url: Mustache.render(Constants.createPipelineApi, pipelineConfiguration),
			headers: {
				"Accept": "application/json;api-version=5.0-preview.1;excludeUrls=true;enumsAsNumbers=true;msDateFormat=true;noArrayWrap=true",
				"Content-Type": "application/json"
			},
			method: "POST",
			body: {
				"contributionIds": [
					"ms.vss-build-web.create-and-run-pipeline-data-provider"
				],
				"dataProviderContext": {
					"properties": {
						"connectionId": pipelineConfiguration.sourceProviderConnectionId, //GitHub endpoint id
						"sourceProvider": pipelineConfiguration.sourceRepoDetails.sourceProvider,
						"repositoryId": pipelineConfiguration.sourceRepoDetails.repositoryId,
						"repositoryName": pipelineConfiguration.sourceRepoDetails.repositoryName,
						"branch": pipelineConfiguration.sourceRepoDetails.branch,
						"sourceBranch": pipelineConfiguration.sourceRepoDetails.branch,
						"path": "./azure-pipelines.yml",
						"queue": "Hosted Ubuntu 1604",
						"commitId": pipelineConfiguration.sourceRepoDetails.commitId,
						"commitDescriptorName": "Set up CI/CD with Azure Pipelines",
						"sourcePage": {
							"routeValues": {
								"project": pipelineConfiguration.projectName
							}
						}
					}
				}
			},
			deserializationMapper: null,
			serializationMapper: null
		});

		return createAndRunPipelineResponse.dataProviders["ms.vss-build-web.create-and-run-pipeline-data-provider"].pipelineBuildWebUrl;
	}

	public async getPipelineCompletionStatus(pipelineUrl: string, monitoringOptions: {}) {

	}

	private async fetchOrganizations(): Promise<any> {
		return this.getUserContext()
			.then((userContext) => {
				return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
					url: "https://app.vssps.visualstudio.com/_apis/accounts",
					headers: {
						"Content-Type": "application/json"
					},
					method: "GET",
					queryParameters: {
						"memberId": userContext.id,
						"api-version": "5.0-preview.1"
					},
					deserializationMapper: null,
					serializationMapper: null
				});
			});
	}

	private async fetchProjects(organizationName: string): Promise<any> {
		return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
			url: "https://" + organizationName + ".visualstudio.com/_apis/projects",
			headers: {
				"Content-Type": "application/json"
			},
			method: "GET",
			queryParameters: {
				"includeCapabilities": "true"
			},
			deserializationMapper: null,
			serializationMapper: null
		});
	}

	private async fetchServiceConnections(type: string): Promise<Array<{ id: string, name: string }>> {
		return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
			url: "https://" + this.organizationName + ".visualstudio.com/" + this.projectName + "/_apis/serviceendpoint/endpoints",
			headers: {
				"Content-Type": "application/json"
			},
			method: "GET",
			queryParameters: {
				"includeFailed": "false"
			},
			deserializationMapper: null,
			serializationMapper: null
		}).then((response) => {
			response = response.value;
			let endpoints: Array<{ id: string, name: string }> = [];
			if (response) {
				for (let endpoint of response) {
					if (type && type.toLowerCase() === endpoint.type.toLowerCase()) {
						endpoints.push({ id: endpoint.id, name: endpoint.name });
					}
				}
			}
			return endpoints;
		});
	}

	private async waitForEndpointToBeReady(endpointId: string): Promise<void> {
		let retryCount = 1;
		while (1) {
			let operationStatus = await this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
				url: "https://" + this.organizationName + ".visualstudio.com/" + this.projectName + "/_apis/serviceendpoint/endpoints/" + endpointId,
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json;api-version=5.1-preview.2;excludeUrls=true"
				},
				method: "Get",
				deserializationMapper: null,
				serializationMapper: null
			}).then((response) => {
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

	private getUserContext(): Promise<any> {
		return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
			url: "https://peprodscussu2.portalext.visualstudio.com/_apis/AzureTfs/UserContext",
			headers: {
				"Content-Type": "application/json"
			},
			method: "GET",
			deserializationMapper: null,
			serializationMapper: null
		});
	}
}
