import { AzureResourceClient } from './azureResourceClient';
import { Constants } from '../../../helpers/constants';
import { GraphHelper } from '../../helper/graphHelper';
import { HttpClient } from 'typed-rest-client/HttpClient';
import { Messages } from '../../resources/messages';
import { ResourceListResult, GenericResource } from 'azure-arm-resource/lib/resource/models';
import { WebAppKind, AzureSession } from '../../model/models';

export class AppServiceClient extends AzureResourceClient {

    private static apiVersion = '2019-05-01';
    private static resourceType = 'Microsoft.Web/sites';

    private httpClient: HttpClient;
    private azureSession: AzureSession;

    constructor(session: AzureSession, subscriptionId: string) {
        super(session.credentials, subscriptionId);
        this.azureSession = session;
        this.httpClient = new HttpClient(Constants.UserAgent);
    }

    public async getAppServiceResource(resourceId): Promise<GenericResource> {
        if (!resourceId) {
            throw new Error(Messages.resourceIdMissing);
        }

        return await this.getResource(resourceId, AppServiceClient.apiVersion);
    }

    public async GetAppServices(filterForResourceKind: WebAppKind[]): Promise<ResourceListResult> {
        let resourceList: ResourceListResult = await this.getResourceList(AppServiceClient.resourceType);

        if (!!filterForResourceKind) {
            let filteredResourceList: ResourceListResult = [];
            resourceList.forEach((resource) => {
                if (filterForResourceKind.some((webAppKind) => webAppKind.toLowerCase() === resource.kind.toLowerCase())) {
                    filteredResourceList.push(resource);
                }
            });

            resourceList = filteredResourceList;
        }

        return resourceList;
    }

    public async getWebAppPublishXml(resourceId: string): Promise<string> {
        let sessionToken = await GraphHelper.getAzureSessionToken(this.azureSession);
        let response = await this.httpClient.request(
            "POST",
            `https://management.azure.com/${resourceId}/publishxml?api-version=2016-03-01`,
            null,
            {
                'Authorization': `Bearer ${sessionToken.accessToken}`,
                'Accept': 'text/plain'
            });
        return response.readBody();
    }
}
