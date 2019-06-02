import * as ResourceManagementClient from 'azure-arm-resource/lib/resource/resourceManagementClient';
import { ServiceClientCredentials } from 'ms-rest';
import { ResourceListResult, GenericResource } from 'azure-arm-resource/lib/resource/models';

export class AzureResourceClient {
    private azureRmClient: ResourceManagementClient;

    constructor(credentials: ServiceClientCredentials, subscriptionId: string) {
        this.azureRmClient = new ResourceManagementClient(credentials, subscriptionId);
    }

    public async getResourceList(resourceProvider: string) {
        let resourceListResult: ResourceListResult = await this.azureRmClient.resources.list({ filter: "$resource.Type eq " + resourceProvider });

        let resourceList: Array<AzureResource>;
        resourceListResult.forEach((resource) => {
            resourceList.push();
        });

    }
}

export class AzureResource {
    public resourceId: string;
    public resourceName: string;
    public resourceGroupName: string;
    public subscriptionId: string;
    public isFunctional: boolean;

    constructor(resource: GenericResource) {
        this.resourceId = resource.id;
        this.resourceName = resource.name;
        this.resourceGroupName = "";
        this.subscriptionId = "";
        this.isFunctional = true;
    }


}