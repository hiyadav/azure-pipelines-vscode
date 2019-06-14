import Mustache = require('mustache');

import { ServiceClientCredentials, ServiceClient, UrlBasedRequestPrepareOptions } from 'ms-rest';

import { Constants } from '../constants';
import { WizardInputs } from '../model/Common';

// TO-DO: add handling failure cases
// either throw here or analyze in the calling service layer for any errors;
// for the second declare a model
export class AzureDevOpsClient {
    private serviceClient: ServiceClient;

    constructor(credentials: ServiceClientCredentials) {
        this.serviceClient = new ServiceClient(credentials);
    }

    public async getRepositoryDetails(repositoryName: string, organizationName?: string, projectName?: string): Promise<any> {
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

    public async listOrganizations(): Promise<any> {
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

    public async listProjects(organizationName: string): Promise<any> {
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

    public async listServiceConnections(type: string, organizationName: string, projectName: string): Promise<any> {
        return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: "https://" + organizationName + ".visualstudio.com/" + projectName + "/_apis/serviceendpoint/endpoints",
            headers: {
                "Content-Type": "application/json"
            },
            method: "GET",
            queryParameters: {
                "includeFailed": "false"
            },
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    public async createGitHubServiceConnection(endpointName: string, gitHubPat: string, organizationName: string, projectName: string) {
        return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: "https://" + organizationName + ".visualstudio.com/" + projectName + "/_apis/serviceendpoint/endpoints",
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
                "name": endpointName,
                "operationStatus": null,
                "readersGroup": null,
                "type": "github",
                "url": "http://github.com"
            },
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    public async createAzureServiceConnection(endpointName: string, inputs: WizardInputs, scope?: string, ): Promise<any> {
        return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: "https://" + inputs.organizationName + ".visualstudio.com/" + inputs.projectName + "/_apis/serviceendpoint/endpoints",
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
                        "tenantid": inputs.authDetails.tenantId
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
                    "subscriptionId": inputs.subscriptionId,
                    "subscriptionName": inputs.subscriptionId
                },
                "description": "",
                "groupScopeId": null,
                "name": endpointName,
                "operationStatus": null,
                "readersGroup": null,
                "type": "azurerm",
                "url": "https://management.azure.com/"
            },
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    public async getEndpointStatus(endpointId: string, organizationName: string, projectName: string, ): Promise<any> {
        return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: "https://" + organizationName + ".visualstudio.com/" + projectName + "/_apis/serviceendpoint/endpoints/" + endpointId,
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json;api-version=5.1-preview.2;excludeUrls=true"
            },
            method: "Get",
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    public async authorizeEndpointForAllPipelines(endpointId: string, endpointName: string, organizationName: string, projectName: string): Promise<any> {
        return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: "https://" + organizationName + ".visualstudio.com/" + projectName + "/_apis/pipelines/pipelinePermissions/endpoint/" + endpointId,
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json;api-version=5.1-preview.1;excludeUrls=true;enumsAsNumbers=true;msDateFormat=true;noArrayWrap=true"
            },
            method: "PATCH",
            body: {
                "allPipelines": {
                    "authorized": true,
                    "authorizedBy": null,
                    "authorizedOn": null
                },
                "pipelines": null,
                "resource": {
                    "id": endpointId,
                    "type": "endpoint"
                }
            },
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    public async createAndRunPipeline(pipelineConfiguration: WizardInputs): Promise<any> {
        return await this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
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
                        "sourceProvider": pipelineConfiguration.sourceRepositoryDetails.sourceProvider,
                        "repositoryId": pipelineConfiguration.sourceRepositoryDetails.repositoryId,
                        "repositoryName": pipelineConfiguration.sourceRepositoryDetails.repositoryName,
                        "branch": pipelineConfiguration.sourceRepositoryDetails.branch,
                        "sourceBranch": pipelineConfiguration.sourceRepositoryDetails.branch,
                        "path": "./azure-pipelines.yml",
                        "queue": "Hosted Ubuntu 1604",
                        "commitId": pipelineConfiguration.sourceRepositoryDetails.commitId,
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