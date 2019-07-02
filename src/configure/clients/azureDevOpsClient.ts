import Mustache = require('mustache');

import { ServiceClientCredentials, ServiceClient, UrlBasedRequestPrepareOptions } from 'ms-rest';

import { WizardInputs } from '../model/models';

// TO-DO: add handling failure cases
// either throw here or analyze in the calling service layer for any errors;
// for the second declare a model
export class AzureDevOpsClient {
    private serviceClient: ServiceClient;

    constructor(credentials: ServiceClientCredentials) {
        this.serviceClient = new ServiceClient(credentials);
    }

    public async getRepositoryDetails(repositoryName: string, organizationName: string, projectName: string): Promise<any> {
        return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: `https://dev.azure.com/${organizationName}/${projectName}/_apis/git/repositories/${repositoryName}`,
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

    public async listOrganizations(): Promise<{count: number, value: [{accountId: string, accountName: string, accountUri: string, properties: {}}]}> {
        return this.getConnectionData()
            .then((connectionData) => {
                return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
                    url: "https://app.vssps.visualstudio.com/_apis/accounts",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    method: "GET",
                    queryParameters: {
                        "memberId": connectionData.authenticatedUser.id,
                        "api-version": "5.0"
                    },
                    deserializationMapper: null,
                    serializationMapper: null
                });
            });
    }

    public async listProjects(organizationName: string): Promise<any> {
        return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: `https://${organizationName}.visualstudio.com/_apis/projects`,
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

    public async createGitHubServiceConnection(endpointName: string, gitHubPat: string, organizationName: string, projectName: string) {
        return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: `https://${organizationName}.visualstudio.com/${projectName}/_apis/serviceendpoint/endpoints`,
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
                    "scheme": "PersonalAccessToken"
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
            url: `https://${inputs.organizationName}.visualstudio.com/${inputs.projectName}/_apis/serviceendpoint/endpoints`,
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
                        "tenantid": inputs.azureSession.tenantId
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
                    "subscriptionId": inputs.azureParameters.subscriptionId,
                    "subscriptionName": inputs.azureParameters.subscriptionId
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
            url: `https://${organizationName}.visualstudio.com/${projectName}/_apis/serviceendpoint/endpoints/${endpointId}`,
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json;api-version=5.1-preview.2;excludeUrls=true"
            },
            method: "Get",
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    public async authorizeEndpointForAllPipelines(endpointId: string, organizationName: string, projectName: string): Promise<any> {
        return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: `https://${organizationName}.visualstudio.com/${projectName}/_apis/pipelines/pipelinePermissions/endpoint/${endpointId}`,
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
            url: Mustache.render("https://{{organizationName}}.visualstudio.com/_apis/Contribution/HierarchyQuery", pipelineConfiguration),
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
                        "connectionId": pipelineConfiguration.sourceRepositoryDetails.sourceProviderConnectionId, //GitHub endpoint id
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

    private getConnectionData(): Promise<any> {
        return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: "https://app.vssps.visualstudio.com/_apis/connectiondata",
            headers: {
                "Content-Type": "application/json"
            },
            method: "GET",
            deserializationMapper: null,
            serializationMapper: null
        });
    }
}
