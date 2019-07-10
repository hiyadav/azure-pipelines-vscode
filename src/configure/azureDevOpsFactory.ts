import { ServiceClientCredentials } from 'ms-rest';
import { AzureDevOpsService } from './services/devOps/azureDevOpsService';
import { ServiceConnectionHelper } from './services/devOps/serviceConnection';
import { AzureDevOpsClient } from './clients/devOps/azureDevOpsClient';

export class AzureDevOpsFactory {
  private azureDevOpsClient: AzureDevOpsClient;
  private azureDevOpsService: AzureDevOpsService;
  private serviceConnectionHelper: ServiceConnectionHelper;

  public constructor(credentials: ServiceClientCredentials) {
      this.azureDevOpsClient = new AzureDevOpsClient(credentials);
      this.azureDevOpsService = new AzureDevOpsService(this.azureDevOpsClient);
  }

  public getAzureDevOpsService() {
      return this.azureDevOpsService;
  }

  public getServiceConnectionHelper(organizationName: string, projectName: string) {
      if (!this.serviceConnectionHelper) {
          this.serviceConnectionHelper = new ServiceConnectionHelper(organizationName, projectName, this.azureDevOpsClient);
      }

      return this.serviceConnectionHelper;
  }
}
