import { AzureSession, Token, AadApplication } from '../model/models';
import { AzureEnvironment } from 'ms-rest-azure';
import { TokenResponse, MemoryCache, AuthenticationContext } from 'adal-node';
import * as util from 'util';
import { Messages } from '../messages';
import { TokenCredentials, ServiceClient, UrlBasedRequestPrepareOptions, ServiceClientCredentials } from 'ms-rest';
import { generateRandomPassword } from './commonHelper';
import * as Q from 'q';
const uuid = require('uuid/v1');

export class GraphHelper {

    private static contributorRoleId = "b24988ac-6180-42a0-ab88-20f7382dd24c";
    private static retryCount = 20;
    private static retryTimeout = 2 * 1000;

    public static async createSpnAndAssignRole(session: AzureSession, aadAppName: string, scope: string): Promise<AadApplication> {
        let graphCredentials = await this.getGraphToken(session);
        let tokenCredentials = new TokenCredentials(graphCredentials.accessToken);
        let tenantId = session.tenantId;

        let aadApp = await this.createAadApp(tokenCredentials, aadAppName, tenantId);
        let spn = await this.createSpn(tokenCredentials, aadApp.appId, tenantId);
        aadApp.objectId = spn.objectId;
        await this.createRoleAssignment(session.credentials, scope, aadApp.objectId);
        return aadApp;
    }

    private static async createAadApp(credentials: TokenCredentials, name: string, tenantId: string): Promise<AadApplication> {
        let serviceClient = new ServiceClient(credentials);
        let secret = generateRandomPassword(20);
        let startDate = new Date(Date.now());

        return serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: `https://graph.windows.net/${tenantId}/applications`,
            queryParameters: {
                "api-version": "1.6"
            },
            headers: {
                "Content-Type": "application/json",
            },
            method: "POST",
            body: {
                "availableToOtherTenants": false,
                "displayName": name,
                "homepage": "https://" + name,
                "identifierUris": [
                    "https://" + name
                ],
                "passwordCredentials": [
                    {
                        "startDate": startDate,
                        "endDate": new Date(startDate.getFullYear() + 1, startDate.getMonth()),
                        "value": secret
                    }
                ]
            },
            deserializationMapper: null,
            serializationMapper: null
        })
        .then((data) => {
            return <AadApplication>{
                appId: data.appId,
                secret: secret
            };
        });
    }

    private static createSpn(credentials: TokenCredentials, appId: string, tenantId: string, retries: number = 0): Promise<any> {
        let serviceClient = new ServiceClient(credentials);

        return serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: `https://graph.windows.net/${tenantId}/servicePrincipals`,
            queryParameters: {
                "api-version": "1.6"
            },
            headers: {
                "Content-Type": "application/json",
            },
            method: "POST",
            body: {
                "appId": appId,
                "accountEnabled": "true"
            },
            deserializationMapper: null,
            serializationMapper: null
        })
        .catch((error) => {
            if(retries++ < this.retryCount) {
                return Q.delay(this.retryTimeout)
                .then(() => this.createSpn(credentials, appId, tenantId, retries));
            }
            throw error;
        });
    }

    private static async createRoleAssignment(credentials: ServiceClientCredentials, scope: string, objectId: string, retries: number = 0) {
        let serviceClient = new ServiceClient(credentials);
        let roleDefinitionId = `${scope}/providers/Microsoft.Authorization/roleDefinitions/${this.contributorRoleId}`;
        let guid = uuid();

        return serviceClient.sendRequest<any>(<UrlBasedRequestPrepareOptions>{
            url: `https://management.azure.com/${scope}/providers/Microsoft.Authorization/roleAssignments/${guid}`,
            queryParameters: {
                "api-version": "2015-07-01"
            },
            headers: {
                "Content-Type": "application/json",
            },
            method: "PUT",
            body: {
                "properties": {
                    "roleDefinitionId": roleDefinitionId,
                    "principalId": objectId
                }
            },
            deserializationMapper: null,
            serializationMapper: null
        })
        .catch((error) => {
            if(retries++ < this.retryCount) {
                return Q.delay(this.retryTimeout)
                .then(() => this.createRoleAssignment(credentials, scope, objectId, retries));
            }
            throw error;
        });
    }

    public static async getRefreshToken(session: AzureSession): Promise<Token> {
        return new Promise<Token>((resolve, reject) => {
            const credentials: any = session.credentials;
            const environment = session.environment;
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

    public static async getResourceTokenFromRefreshToken(environment: AzureEnvironment, refreshToken: string, tenantId: string, clientId: string, resource: string): Promise<TokenResponse> {
        return new Promise<TokenResponse>((resolve, reject) => {
            const tokenCache = new MemoryCache();
            const context = new AuthenticationContext(`${environment.activeDirectoryEndpointUrl}${tenantId}`, true, tokenCache);
            context.acquireTokenWithRefreshToken(refreshToken, clientId, resource, (err, tokenResponse) => {
                if (err) {
                    reject(new Error(util.format(Messages.acquireTokenFromRefreshTokenFailed, err.message)));
                } else if (tokenResponse.error) {
                    reject(new Error(util.format(Messages.acquireTokenFromRefreshTokenFailed, tokenResponse.error)));
                } else {
                    resolve(<TokenResponse>tokenResponse);
                }
            });
        });
    }

    public static async getGraphToken(session: AzureSession): Promise<TokenResponse> {
        let refreshTokenResponse = await this.getRefreshToken(session);
        return this.getResourceTokenFromRefreshToken(session.environment, refreshTokenResponse.refreshToken, session.tenantId, (<any>session.credentials).clientId, session.environment.activeDirectoryGraphResourceId);
    }

    public static generateAadApplicationName(accountName: string, projectName: string): string {
        var spnLengthAllowed = 92;
        var guid = uuid();
        var projectName = projectName.replace(/[^a-zA-Z0-9_-]/g, "");
        var accountName = accountName.replace(/[^a-zA-Z0-9_-]/g, "");
        var spnName = accountName + "-" + projectName + "-" + guid;
        if (spnName.length <= spnLengthAllowed) {
            return spnName;
        }

        // 2 is subtracted for delimiter '-'
        spnLengthAllowed = spnLengthAllowed - guid.length - 2;
        if (accountName.length > spnLengthAllowed / 2 && projectName.length > spnLengthAllowed / 2) {
            accountName = accountName.substr(0, spnLengthAllowed / 2);
            projectName = projectName.substr(0, spnLengthAllowed - accountName.length);
        }
        else if (accountName.length > spnLengthAllowed / 2 && accountName.length + projectName.length > spnLengthAllowed) {
            accountName = accountName.substr(0, spnLengthAllowed - projectName.length);
        }
        else if (projectName.length > spnLengthAllowed / 2 && accountName.length + projectName.length > spnLengthAllowed) {
            projectName = projectName.substr(0, spnLengthAllowed - accountName.length);
        }

        return accountName + "-" + projectName + "-" + guid;
    }
}