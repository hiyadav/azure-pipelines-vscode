import { AzureTreeDataProvider } from "vscode-azureextensionui";

import { AzureTargetResource, PipelineTargets } from "../../model/Common";
import { WebAppTreeItem } from "../../tree/WebAppTreeItem";

export class AzureTargetService {
    private targetResource: AzureTargetResource;
    private azureTreeDataProvider: AzureTreeDataProvider;

    constructor(azureTreeDataProvider: AzureTreeDataProvider) {
        this.azureTreeDataProvider = azureTreeDataProvider;
    }

    public async getTargetResource(): Promise<AzureTargetResource> {
        let azureNode = <WebAppTreeItem>await this.azureTreeDataProvider.showTreeItemPicker("appService");
        return this.extractTargetFromNode(azureNode);
    }

    public extractTargetFromNode(azureNode: WebAppTreeItem) {
        this.targetResource = <AzureTargetResource>{
            resourceId: azureNode.id,
            resourceName: azureNode.label,
            resourceType: PipelineTargets.WindowsWebApp,
            subscriptionId: azureNode.root.subscriptionId,
            tenantId: azureNode.root.tenantId,
            credentials: azureNode.root.credentials
        };

        return this.targetResource;
    }

    public async updateTargetResourcePipelineInfo() {

    }
}