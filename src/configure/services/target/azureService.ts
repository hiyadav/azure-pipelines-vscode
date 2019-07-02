import { PipelineTargets, WebAppKind } from "../../model/models";
import { ServiceClientCredentials } from "ms-rest";
import { AzureResourceClient } from "../../clients/azureResourceClient";
import { ResourceListResult, GenericResource } from "azure-arm-resource/lib/resource/models";

export class AzureService {
    private azureResourceClient: AzureResourceClient;

    constructor(credentials: ServiceClientCredentials, subscriptionId: string) {
        this.azureResourceClient = new AzureResourceClient(credentials, subscriptionId);
    }

    public async listResourcesOfType(resourceType: PipelineTargets): Promise<ResourceListResult> {
        let filterForResourceType: string = null;
        let filterForResourceKind: string = null;
        switch (resourceType) {
            case PipelineTargets.WindowsWebApp:
                filterForResourceType = "Microsoft.Web/sites";
                filterForResourceKind = WebAppKind.WindowsApp;
                break;
            case PipelineTargets.None:
            default:
                throw new Error("Invalid azure resource type.");
        }

        let resourceList: ResourceListResult = await this.azureResourceClient.getResourceList(filterForResourceType);

        if (!!filterForResourceKind) {
            let filteredResourceList: ResourceListResult = [];
            resourceList.forEach((resource) => {
                if (resource.kind === filterForResourceKind) {
                    filteredResourceList.push(resource);
                }
            });

            resourceList = filteredResourceList;
        }

        // filter apps with type equal to app,linux or app,function etc.
        return resourceList;
    }

    public async getResource(resourceId): Promise<GenericResource> {
        if (!resourceId) {
            throw new Error("Required argument: resourceId, is missing. Kindly pass the argument for getting resource.");
        }

        return await this.azureResourceClient.getResource(resourceId);
    }

    public async updateTargetResourcePipelineInfo() {

    }
}