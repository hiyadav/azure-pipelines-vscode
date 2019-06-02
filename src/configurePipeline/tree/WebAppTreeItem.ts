/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISiteTreeRoot, SiteClient } from 'vscode-azureappservice';
import { AzureTreeItem, AzureParentTreeItem } from 'vscode-azureextensionui';

export class WebAppTreeItem extends AzureTreeItem<ISiteTreeRoot> {
    public static contextValue: string = "appService";
    public readonly contextValue: string = WebAppTreeItem.contextValue;
    private readonly _root: ISiteTreeRoot;
    private _state?: string;

    constructor(parent: AzureParentTreeItem, client: SiteClient) {
        super(parent);
        this._root = Object.assign({}, parent.root, { client });
        this._state = client.initialState;
    }

    public get label(): string {
        return this.root.client.siteName;
    }

    public get root(): ISiteTreeRoot {
        return this._root;
    }

    public get description(): string | undefined {
        return this._state && this._state.toLowerCase() !== 'running' ? this._state : undefined;
    }

    public get logStreamLabel(): string {
        return this.root.client.fullName;
    }

    public async refreshImpl(): Promise<void> {
        try {
            this._state = await this.root.client.getState();
        } catch {
            this._state = 'Unknown';
        }
    }

    public get id(): string {
        return this.root.client.id;
    }
}
