import * as util from 'util';
import * as Q from 'q';

import { ServiceClientCredentials, UrlBasedRequestPrepareOptions } from 'ms-rest';

import { Organization, WizardInputs } from '../../model/models';
import { sleepForMilliSeconds } from "../../helper/commonHelper";
import { Messages } from '../../messages';
import { ReservedHostNames } from '../../constants';
import { RestClient } from '../restClient';

// TO-DO: add handling failure cases
// either throw here or analyze in the calling service layer for any errors;
// for the second declare a model
export class AzureDevOpsClient {
    private restClient: RestClient;
    private listOrgPromise: Promise<Organization[]>;
    private lastAccessedOrganization: Organization;

    constructor(credentials: ServiceClientCredentials) {
        this.restClient = new RestClient(credentials);
        this.listOrgPromise = this.listOrganizations();
    }

    public async sendRequest(urlBasedRequestPrepareOptions: UrlBasedRequestPrepareOptions): Promise<any> {
        return this.restClient.sendRequest(urlBasedRequestPrepareOptions);
    }

    public async createOrganization(organizationName: string): Promise<any> {
        return this.restClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: "https://app.vsaex.visualstudio.com/_apis/HostAcquisition/collections",
            headers: {
                "Content-Type": "application/json"
            },
            method: "POST",
            queryParameters: {
                "collectionName": organizationName,
                "api-version": "4.0-preview.1",
                "preferredRegion": "CUS"
            },
            body: {
                "VisualStudio.Services.HostResolution.UseCodexDomainForHostCreation": "true"
            },
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    public async createProject(organizationName: string, projectName: string): Promise<any> {
        let collectionUrl = `https://dev.azure.com/${organizationName}`;

        return this.restClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: `${collectionUrl}/_apis/projects`,
            headers: {
                "Content-Type": "application/json"
            },
            method: "POST",
            queryParameters: {
                "api-version": "5.0"
            },
            body: {
                "name": projectName,
                "visibility": 0,
                "capabilities": {
                    "versioncontrol": {"sourceControlType": "Git" },
                    "processTemplate": { "templateTypeId": "adcc42ab-9882-485e-a3ed-7678f01f66bc" }
                }
            },
            deserializationMapper: null,
            serializationMapper: null
        })
        .then((operation) => {
            if(operation.url) {
                return this.monitorOperationStatus(operation.url);
            }
            else {
                throw new Error(util.format(Messages.failedToCreateAzureDevOpsProject, operation.message));
            }
        });
    }

    public async listOrganizations(forceRefresh?: boolean): Promise<Organization[]> {
        if (!this.listOrgPromise || forceRefresh) {
            this.listOrgPromise = this.getUserData()
            .then((connectionData) => {
                return this.restClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
                    url: "https://app.vssps.visualstudio.com/_apis/accounts",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    method: "GET",
                    queryParameters: {
                        "memberId": connectionData.authenticatedUser.id,
                        "api-version": "5.0",
                        "properties": "Microsoft.VisualStudio.Services.Account.ServiceUrl.00025394-6065-48ca-87d9-7f5672854ef7"
                    },
                    deserializationMapper: null,
                    serializationMapper: null
                });
            })
            .then((organizations) => organizations.value);
        }

        return this.listOrgPromise;
    }

    public async listProjects(organizationName: string): Promise<any> {
        let url = await this.getBaseOrgUrl(organizationName, "tfs");
        url = url + `/_apis/projects`;
        let response = await this.restClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: url,
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

        return response.value;
    }

    public async getRepositoryId(organizationName: string, projectName: string, repositoryName: string): Promise<string> {
        let url = await this.getBaseOrgUrl(organizationName, 'tfs');
        url = `${url}/${projectName}/_apis/git/repositories/${repositoryName}`;

        let repositoryDetails = await this.restClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: url,
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

        return repositoryDetails.id;
    }

    public async createAndRunPipeline(inputs: WizardInputs): Promise<any> {
        let url = await this.getBaseOrgUrl(inputs.organizationName, "tfs");
        url = `${url}/_apis/Contribution/HierarchyQuery`;

        return await this.restClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: url,
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
                        "path": inputs.pipelineParameters.pipelineFilePath,
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

    public async getBaseOrgUrl(organizationName: string, service: string): Promise<string> {
        if (!this.lastAccessedOrganization || this.lastAccessedOrganization.accountName !== organizationName) {
            let organizations = await this.listOrgPromise;
            this.lastAccessedOrganization = organizations.find((element) => {
                return element.accountName === organizationName;
            });
        }

        switch (service) {
            case "tfs":
            default:
                return this.lastAccessedOrganization.properties["Microsoft.VisualStudio.Services.Account.ServiceUrl.00025394-6065-48ca-87d9-7f5672854ef7"]["$value"];
        }
    }

    public async validateOrganizationName(organizationName: string): Promise<string> {
        let deferred = Q.defer<string>();
        let accountNameRegex = new RegExp(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z]$/);

        if(!organizationName || /^\\s/.test(organizationName) || /\\s$/.test(organizationName) || organizationName.indexOf("-") === 0 || !accountNameRegex.test(organizationName)) {
            deferred.resolve(Messages.organizationNameStaticValidationMessage);
        }

        if(ReservedHostNames.indexOf(organizationName) >= 0) {
            deferred.resolve(util.format(Messages.organizationNameReservedMessage, organizationName));
        }
        
        let url = `https://app.vsaex.visualstudio.com/_apis/HostAcquisition/NameAvailability/${organizationName}`;

        this.restClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: url,
            headers: {
                "Content-Type": "application/json",
                "Accept": "api-version=5.0-preview.1"
            },
            method: "GET",
            deserializationMapper: null,
            serializationMapper: null
        })
        .then((response) => {
            if( response.name === organizationName && !response.isAvailable) {
                deferred.resolve(util.format(Messages.organizationNameReservedMessage, organizationName));
            }
            deferred.resolve("");
        })
        .catch(() => {
            deferred.resolve("");
        });

        return deferred.promise;
    }

    private getUserData(): Promise<any> {
        return this.getConnectionData()
        .catch(() => {
            return this.createUserProfile()
            .then(() => {
                return this.getConnectionData();
            });
        });
    }

    private getConnectionData(): Promise<any> {
        return this.restClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: "https://app.vssps.visualstudio.com/_apis/connectiondata",
            headers: {
                "Content-Type": "application/json"
            },
            method: "GET",
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    private createUserProfile(): Promise<any> {
        return this.restClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: "https://app.vssps.visualstudio.com/_apis/_AzureProfile/CreateProfile",
            headers: {
                "Content-Type": "application/json"
            },
            method: "POST",
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    private async monitorOperationStatus(operationUrl: string): Promise<void> {
        let retryCount = 0;
        let operationResult: any;

        while(retryCount < 20) {
            operationResult = await this.getOperationResult(operationUrl);
            let result = operationResult.status.toLowerCase();
            if(result === "succeeded") {
                return;
            }
            else if(result === "failed") {
                throw new Error(util.format(Messages.failedToCreateAzureDevOpsProject, operationResult.detailedMessage));
            }
            else {
                retryCount++;
                await sleepForMilliSeconds(2000);
            }
        }
        throw new Error(util.format(Messages.failedToCreateAzureDevOpsProject,
            (operationResult && operationResult.detailedMessage) || Messages.operationTimedOut));
    }

    private async getOperationResult(operationUrl: string): Promise<any> {
        return this.restClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: operationUrl,
            queryParameters: {
                "api-version": "5.0"
            },
            method: "GET",
            deserializationMapper: null,
            serializationMapper: null
        });
    }
}
