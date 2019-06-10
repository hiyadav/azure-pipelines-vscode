import * as ResourceManagementClient from 'azure-arm-resource/lib/resource/resourceManagementClient';
import { ServiceClientCredentials } from 'ms-rest';
import { ResourceListResult, GenericResource } from 'azure-arm-resource/lib/resource/models';

export class AzureResourceClient {
    private static getApiVersion = "2019-05-01";

    private azureRmClient: ResourceManagementClient;

    constructor(credentials: ServiceClientCredentials, subscriptionId: string) {
        this.azureRmClient = new ResourceManagementClient(credentials, subscriptionId);
    }

    public async getResourceList(resourceType: string, followNextLink: boolean = true): Promise<ResourceListResult> {
        let resourceListResult: ResourceListResult = await this.azureRmClient.resources.list({ filter: "resourceType eq '" + resourceType + "'" });

        if (followNextLink) {
            let nextLink: string = resourceListResult.nextLink;
            while (!!nextLink) {
                let nextResourceListResult = await this.azureRmClient.resources.listNext(resourceListResult.nextLink);
                resourceListResult = resourceListResult.concat(nextResourceListResult);
                nextLink = nextResourceListResult.nextLink;
            }
        }

        return resourceListResult;
    }

    public async getResource(resoruceId: string): Promise<GenericResource> {
        let resource: GenericResource = await this.azureRmClient.resources.getById(resoruceId, AzureResourceClient.getApiVersion);
        return resource;
    }
}