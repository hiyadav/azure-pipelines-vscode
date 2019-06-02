/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSiteManagementClient } from 'azure-arm-website';
import { Site, WebAppCollection } from 'azure-arm-website/lib/models';
import { SiteClient } from 'vscode-azureappservice';
import { AzureTreeItem, createAzureClient, createTreeItemsWithErrorHandling, parseError, SubscriptionTreeItem } from 'vscode-azureextensionui';
import { WebAppTreeItem } from './WebAppTreeItem';
import { extensionVariables, PipelineTargets } from '../model/Common';

export class WebAppProvider extends SubscriptionTreeItem {
    public readonly childTypeLabel: string = 'Web App';

    private _nextLink: string | undefined;

    public hasMoreChildrenImpl(): boolean {
        return this._nextLink !== undefined;
    }

    public async loadMoreChildrenImpl(clearCache: boolean): Promise<AzureTreeItem[]> {
        if (clearCache) {
            this._nextLink = undefined;
        }

        const client: WebSiteManagementClient = createAzureClient(this.root, WebSiteManagementClient);

        let webAppCollection: WebAppCollection;
        try {
            webAppCollection = this._nextLink === undefined ?
                await client.webApps.list() :
                await client.webApps.listNext(this._nextLink);
        } catch (error) {
            if (parseError(error).errorType.toLowerCase() === 'notfound') {
                // This error type means the 'Microsoft.Web' provider has not been registered in this subscription
                // In that case, we know there are no web apps, so we can return an empty array
                // (The provider will be registered automatically if the user creates a new web app)
                return [];
            } else {
                throw error;
            }
        }

        this._nextLink = webAppCollection.nextLink;

        return await createTreeItemsWithErrorHandling(
            this,
            webAppCollection,
            'invalidAppService',
            (s: Site) => {
                return this._getWebAppTreeItem(s);
            },
            (s: Site) => {
                return s.name;
            }
        );
    }

    public async getCachedChildren(): Promise<AzureTreeItem[]> {
        return this.loadMoreChildrenImpl(true);
    }

    private _getWebAppTreeItem(s: Site): WebAppTreeItem {
        const siteClient: SiteClient = new SiteClient(s, this.root);
        switch (extensionVariables.pipelineTargetType) {
            case PipelineTargets.WindowsWebApp:
                return (!siteClient.isLinux && !siteClient.isFunctionApp) ? new WebAppTreeItem(this, siteClient) : undefined;
            case PipelineTargets.WebAppForContainers:
                return siteClient.isLinux ? new WebAppTreeItem(this, siteClient) : undefined;
            default:
                return undefined;
        }
    }
}
