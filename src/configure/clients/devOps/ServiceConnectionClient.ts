import { ServiceClientCredentials } from 'ms-rest';
import { AzureDevOpsClient2 } from './azureDevOpsClient';
export class ServiceConnectionClient extends AzureDevOpsClient2 {
    constructor(orgName: string, projectName: string, credentials: ServiceClientCredentials) {
        super(credentials);
        this.orgName = orgName;
    }
    public createGitHubConnection(): {};
}
