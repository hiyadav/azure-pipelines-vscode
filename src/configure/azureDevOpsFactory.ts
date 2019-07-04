import { ServiceClientCredentials } from "ms-rest";
import { AzureDevOpsService } from "./services/devOps/azureDevOpsService";
import { ServiceConnectionHelper } from "./services/devOps/serviceConnection";

export class AzureDevOpsFactory {
  private credentials: ServiceClientCredentials;
  private azureDevOpsService: AzureDevOpsService;
  private serviceConnectionHelper: ServiceConnectionHelper;

  public constructor(credentials: ServiceClientCredentials) {
      this.credentials = credentials;
      this.azureDevOpsService = new AzureDevOpsService(this.credentials);
  }

  public getAzureDevOpsService() {
      return this.azureDevOpsService;
  }

  public getServiceConnectionHelper(organizationName: string, projectName: string) {
      if (!this.serviceConnectionHelper) {
          this.serviceConnectionHelper = new ServiceConnectionHelper(organizationName, projectName, this.credentials);
      }

      return this.serviceConnectionHelper;
  }
}
