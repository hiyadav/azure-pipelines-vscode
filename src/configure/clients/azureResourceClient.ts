import { ResourceListResult, GenericResource } from 'azure-arm-resource/lib/resource/models';
import * as ResourceManagementClient from 'azure-arm-resource/lib/resource/resourceManagementClient';
import { ServiceClientCredentials, ServiceClient, UrlBasedRequestPrepareOptions } from 'ms-rest';
import { TokenResponse, MemoryCache, AuthenticationContext } from 'adal-node';

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

    public async createSpnWithGraph(credentials) {
        let serviceClient = new ServiceClient(credentials);
        let aadAppResponse = await serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            baseUrl: "https://graph.windows.net",
            url: `https://graph.windows.net/myorganization/applications`,
            queryParameters: {
                "api-version": "2.0"
            },
            headers: {
                "Content-Type": "application/json",
            },
            method: "POST",
            body: {
                "name": "newspn",
                "orgRestrictions": [],
                "replyUrlsWithType": [],
                "signInAudience": "AzureADMyOrg",
                "requiredResourceAccess": [
                    {
                        "resourceAppId": "00000003-0000-0000-c000-000000000000",
                        "resourceAccess": [
                            {
                                "id": "e1fe6dd8-ba31-4d61-89e7-88639da4683d",
                                "type": "Scope"
                            }
                        ]
                    }
                ]
            },
            deserializationMapper: null,
            serializationMapper: null
        });

        let spnCreationResponse = await serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            baseUrl: "https://graph.windows.net",
            url: `https://graph.windows.net/myorganization/servicePrincipals`,
            queryParameters: {
                "api-version": "2.0"
            },
            headers: {
                "Content-Type": "application/json",
            },
            method: "POST",
            body: {
                "appId": `${aadAppResponse.appId}`,
                "tags":
                    [
                        "WindowsAzureActiveDirectoryIntegratedApp"
                    ]
            },
            deserializationMapper: null,
            serializationMapper: null
        });
    }

    public async getGraphToken(session) {
        let refreshTokenResponse = await this.acquireToken(session);
        let graphTokenResponse = await this.tokenFromRefreshToken(session.environment, refreshTokenResponse.refreshToken, session.credentials.tenantId, session.credentials.clientId, session.environment.activeDirectoryGraphResourceId);
    }

    public async tokenFromRefreshToken(environment, refreshToken: string, tenantId: string, clientId: string, resource?: string) {
        return new Promise<TokenResponse>((resolve, reject) => {
            const tokenCache = new MemoryCache();
            const context = new AuthenticationContext(`${environment.activeDirectoryEndpointUrl}${tenantId}`, true, tokenCache);
            context.acquireTokenWithRefreshToken(refreshToken, clientId, <any>resource, (err, tokenResponse) => {
                if (err) {
                    reject(new Error("Acquiring token with refresh token failed" + err));
                } else if (tokenResponse.error) {
                    reject(new Error("Acquiring token with refresh token failed" + tokenResponse));
                } else {
                    resolve(<TokenResponse>tokenResponse);
                }
            });
        });
    }


    public async acquireToken(session) {
        return new Promise<any>((resolve, reject) => {
            const credentials: any = session.credentials;
            const environment: any = session.environment;
            credentials.context.acquireToken(environment.activeDirectoryResourceId, credentials.username, credentials.clientId, function (err: any, result: any) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        session,
                        accessToken: result.accessToken,
                        refreshToken: result.refreshToken
                    });
                }
            });
        });
    }
}