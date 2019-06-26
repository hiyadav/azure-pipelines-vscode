import { ResourceListResult, GenericResource } from 'azure-arm-resource/lib/resource/models';
import * as ResourceManagementClient from 'azure-arm-resource/lib/resource/resourceManagementClient';
import { ServiceClientCredentials } from 'ms-rest';

export class AzureResourceClient {
    private static getResourceApiVersion = "2019-05-01";

    private azureRmClient: ResourceManagementClient;

    constructor(credentials: ServiceClientCredentials, subscriptionId: string) {
        this.azureRmClient = new ResourceManagementClient(credentials, subscriptionId);
    }

    public async getResourceList(resourceType: string, followNextLink: boolean = true): Promise<ResourceListResult> {
        let resourceListResult: ResourceListResult = await this.azureRmClient.resources.list({ filter: `resourceType eq '${resourceType}'` });

        if (followNextLink) {
            let nextLink: string = resourceListResult.nextLink;
            while (!!nextLink) {
                let nextResourceListResult = await this.azureRmClient.resources.listNext(nextLink);
                resourceListResult = resourceListResult.concat(nextResourceListResult);
                nextLink = nextResourceListResult.nextLink;
            }
        }

        return resourceListResult;
    }

    public async getResource(resoruceId: string): Promise<GenericResource> {
        let resource: GenericResource = await this.azureRmClient.resources.getById(resoruceId, AzureResourceClient.getResourceApiVersion);
        return resource;
    }
}