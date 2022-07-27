import { Construct } from "constructs";
import { App, TerraformStack } from "cdktf";
import {
  AzurermProvider, ResourceGroup, LinuxFunctionApp, ServicePlan, StorageAccount, ApplicationInsights, DataAzurermFunctionAppHostKeys,
  ApiManagement, ApiManagementApi, ApiManagementBackend, ApiManagementNamedValue, ApiManagementApiPolicy, ApiManagementApiOperation
} from "cdktf-azure-providers/.gen/providers/azurerm";

import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/.env' });

class PyTestRunnerStack extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);
    new AzurermProvider(this, "AzureRm", {
      features: {
        resourceGroup: {
          preventDeletionIfContainsResources: false
        }
      }
    })

    const prefix = "PytestRunner"
    const environment = "dev"

    const resourceGroup = new ResourceGroup(this, "ResourceGroup", {
      location: "EastAsia",
      name: prefix + "ResourceGroup"
    })

    const storageAccount = new StorageAccount(this, "StorageAccount", {
      name: (prefix + environment).toLocaleLowerCase(),
      location: resourceGroup.location,
      resourceGroupName: resourceGroup.name,
      accountTier: "Standard",
      accountReplicationType: "LRS"
    })
    const applicationInsights = new ApplicationInsights(this, "ApplicationInsights", {
      name: prefix + "-" + environment + "applicationInsights",
      location: resourceGroup.location,
      resourceGroupName: resourceGroup.name,
      applicationType: "web"
    })

    const servicePlan = new ServicePlan(this, "AppServicePlan", {
      name: prefix + "-" + environment + "-AppServicePlan",
      location: resourceGroup.location,
      resourceGroupName: resourceGroup.name,
      osType: "Linux",
      skuName: "Y1"
    })

    const linuxFunctionApp = new LinuxFunctionApp(this, "FunctionApp", {
      name: prefix + "-" + environment + "FunctionApp",
      resourceGroupName: resourceGroup.name,
      location: resourceGroup.location,
      servicePlanId: servicePlan.id,
      storageAccountName: storageAccount.name,
      storageAccountAccessKey: storageAccount.primaryAccessKey,
      functionsExtensionVersion: "~4",
      appSettings: {
        FUNCTIONS_WORKER_RUNTIME: "python",
        APPINSIGHTS_INSTRUMENTATIONKEY: applicationInsights.instrumentationKey
      },
      siteConfig: {
        applicationStack: {
          pythonVersion: "3.9"
        }
      }
    })

    const dataAzurermFunctionAppHostKeys = new DataAzurermFunctionAppHostKeys(this, "DataAzurermFunctionAppHostKeys", {
      name: linuxFunctionApp.name,
      resourceGroupName: resourceGroup.name,
    })

    const apiManagement = new ApiManagement(this, "ApiManagement", {
      name: `api-${process.env.API_NAME!}`,
      location: resourceGroup.location,
      publisherName: process.env.PUBLISHER_NAME!,
      publisherEmail: process.env.PUBLISHER_EMAIL!,
      resourceGroupName: resourceGroup.name,
      skuName: "Basic_1"
    })

    const apiManagementNamedValue = new ApiManagementNamedValue(this, "ApiManagementNamedValue", {
      name: "func-functionkey",
      resourceGroupName: resourceGroup.name,
      apiManagementName: apiManagement.name,
      displayName: "func-functionkey",
      value: dataAzurermFunctionAppHostKeys.primaryKey,
      secret: true
    })

    const apiManagementApi = new ApiManagementApi(this, "ApiManagementApi", {
      name: "pytest-runner",
      resourceGroupName: resourceGroup.name,
      apiManagementName: apiManagement.name,
      revision: "2",
      displayName: "Pytest Runner",
      protocols: ["https"]
    })

    new ApiManagementApiOperation(this, "ApiManagementApiOperation", {
      operationId: "getter",
      apiManagementName: apiManagementApi.apiManagementName,
      apiName: apiManagementApi.name,
      resourceGroupName: resourceGroup.name,
      displayName: "getter",
      method: "GET",
      urlTemplate: "/getter",
      description: "This can only be done by the logged in user.",
      response: [{
        statusCode: 200
      }]
    })

    const apiManagementBackend = new ApiManagementBackend(this, "ApiManagementBackend", {
      name: "pytestBackend",
      resourceGroupName: resourceGroup.name,
      apiManagementName: apiManagement.name,
      protocol: "http",
      url: `https://${linuxFunctionApp.defaultHostname}/api/`,
      dependsOn: [apiManagementNamedValue],
      credentials: {
        header: {
          "x-functions-key": "{{func-functionkey}}"
        }
      }
    })

    new ApiManagementApiPolicy(this, "ApiManagementApiPolicy", {
      apiName: apiManagementApi.name,
      apiManagementName: apiManagement.name,
      resourceGroupName: resourceGroup.name,
      xmlContent: `
<policies>
  <inbound>
    <rate-limit-by-key calls="10" renewal-period="60" counter-key="@(context.Request.IpAddress)" />
    <base />
    <set-backend-service backend-id="${apiManagementBackend.name}" />
  </inbound>
</policies>
`
    })
  }
}

const app = new App({ skipValidation: true });
new PyTestRunnerStack(app, "PyTestRunnerStack");
app.synth();
