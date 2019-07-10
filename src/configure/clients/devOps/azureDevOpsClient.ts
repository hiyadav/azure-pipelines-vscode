import Mustache = require('mustache');
import * as utils from 'util';

import { ServiceClientCredentials, ServiceClient, UrlBasedRequestPrepareOptions } from 'ms-rest';

import { Organization, WizardInputs } from '../../model/models';

// TO-DO: add handling failure cases
// either throw here or analyze in the calling service layer for any errors;
// for the second declare a model
export class AzureDevOpsClient {
    private serviceClient: ServiceClient;
    private organizationMap: [Organization];
    private listOrgPromise: Promise<Organization[]>;

    constructor(credentials: ServiceClientCredentials) {
        this.serviceClient = new ServiceClient(credentials);
        this.listOrgPromise = this.listOrganizations();
    }

    public async sendRequest(urlBasedRequestPrepareOptions: UrlBasedRequestPrepareOptions): Promise<any> {
        return this.serviceClient.sendRequest(urlBasedRequestPrepareOptions);
    }

    public async listOrganizations(): Promise<Organization[]> {
        if (this.organizationMap || this.listOrgPromise) {
            return this.organizationMap ? this.organizationMap : this.listOrgPromise;
        }

        let listOrganizaitonResponse = await this.getConnectionData()
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

        this.organizationMap = listOrganizaitonResponse.value;
        return this.organizationMap;
    }

    public async listProjects(organizationName: string): Promise<any> {
        return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: this.getBaseOrgUrl(organizationName, "projects") + `/_apis/projects`,
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

    public async getRepositoryDetails(organizationName: string, projectName: string, repositoryName: string): Promise<any> {
        return this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: this.getBaseOrgUrl(organizationName, 'repository') + `/${projectName}/_apis/git/repositories/${repositoryName}`,
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

    public async createAndRunPipeline(inputs: WizardInputs): Promise<any> {
        return await this.serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: Mustache.render(this.getBaseOrgUrl(inputs.organizationName, 'pipelines') + "/_apis/Contribution/HierarchyQuery", inputs),
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
                        "connectionId": inputs.sourceRepository.serviceConnectionId, //GitHub endpoint id
                        "sourceProvider": inputs.sourceRepository.repositoryProvider,
                        "repositoryId": inputs.sourceRepository.repositoryId,
                        "repositoryName": inputs.sourceRepository.repositoryName,
                        "branch": inputs.sourceRepository.branch,
                        "sourceBranch": inputs.sourceRepository.branch,
                        "path": inputs.pipelineParameters.checkedInPipelineFileRelativePath,
                        "queue": "Hosted Ubuntu 1604",
                        "commitId": inputs.sourceRepository.commitId,
                        "commitDescriptorName": "Set up CI/CD with Azure Pipelines",
                        "sourcePage": {
                            "routeValues": {
                                "project": inputs.projectName
                            }
                        }
                    }
                }
            },
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    public getBaseOrgUrl(organizationName: string, service: string): string {
        if (!this.lastAccessedOrganization || this.lastAccessedOrganization.accountName !== organizationName) {
            this.lastAccessedOrganization = this.organizationMap.find((element) => {
                return element.accountName === organizationName;
            });
        }

        if (this.lastAccessedOrganization && this.lastAccessedOrganization.accountUri.startsWith("https://vssps.dev.azure.com:443")) {
            return utils.format(AzureDevOpsClient.newOrganizationUrl, organizationName);
        }

        return utils.format(AzureDevOpsClient.oldOrganizationUrl, organizationName);
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

    private static newOrganizationUrl = "https://dev.azure.com/%s/";
    private static oldOrganizationUrl = "https://%s.visualstudio.com/";

    private lastAccessedOrganization: Organization;
}
