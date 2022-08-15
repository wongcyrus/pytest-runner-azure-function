import { Construct } from "constructs";
import { App, TerraformStack, TerraformOutput } from "cdktf";
import {
  AzurermProvider, ResourceGroup, LinuxFunctionApp, ServicePlan, StorageAccount, StorageTable, ApplicationInsights, DataAzurermFunctionAppHostKeys,
  ApiManagement, ApiManagementApi, ApiManagementBackend, ApiManagementNamedValue, ApiManagementApiPolicy, ApiManagementApiOperation,
  ApiManagementUser, ApiManagementSubscription
} from "cdktf-azure-providers/.gen/providers/azurerm";
import { Resource } from "cdktf-azure-providers/.gen/providers/null"
import { DataArchiveFile } from "cdktf-azure-providers/.gen/providers/archive"

import * as dotenv from 'dotenv';
import * as fs from "fs";
import * as path from "path";
import { parse } from 'csv-parse/sync';


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

    new StorageTable(this, "TestResultsStorageTable", {
      name: "TestResults",
      storageAccountName: storageAccount.name
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
        APPINSIGHTS_INSTRUMENTATIONKEY: applicationInsights.instrumentationKey,
        CONNECTION_STRING: storageAccount.primaryConnectionString
      },
      siteConfig: {
        applicationStack: {
          pythonVersion: "3.9"
        }
      }
    })

    const pythonProjectPath = path.join(__dirname, "..", "pytest-runner-func");
    const buildFunctionAppResource = new Resource(this, "BuildFunctionAppResource",
      {
        triggers: { build_hash: "${timestamp()}" },
        dependsOn: [linuxFunctionApp]
      })

    buildFunctionAppResource.addOverride("provisioner", [
      {
        "local-exec": {
          working_dir: pythonProjectPath,
          command: `pip install -r requirements.txt --target=.python_packages/lib/site-packages `
        },
      },
    ]);
    const outputZip = path.join(pythonProjectPath, "../deployment.zip")
    const dataArchiveFile = new DataArchiveFile(this, "DataArchiveFile", {
      type: "zip",
      sourceDir: pythonProjectPath,
      outputPath: outputZip,
      excludes: [".venv"],
      dependsOn: [buildFunctionAppResource]
    })

    const publishFunctionAppResource = new Resource(this, "PublishFunctionAppResource",
      {
        triggers: { build_hash: "${timestamp()}" },
        dependsOn: [dataArchiveFile]
      })

    publishFunctionAppResource.addOverride("provisioner", [
      {
        "local-exec": {
          command: `az functionapp deployment source config-zip --resource-group ${resourceGroup.name} --name ${linuxFunctionApp.name} --src ${dataArchiveFile.outputPath} --build-remote true`
        },
      },
    ]);

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

    const functions = ["pytester", "test-results"]
    for (let f of functions) {
      new ApiManagementApiOperation(this, "ApiManagementApiOperation" + f + "Get", {
        operationId: f + "-get",
        apiManagementName: apiManagementApi.apiManagementName,
        apiName: apiManagementApi.name,
        resourceGroupName: resourceGroup.name,
        displayName: f + "-get",
        method: "GET",
        urlTemplate: "/" + f,
        description: "This can only be done by the logged in user.",
        response: [{
          statusCode: 200
        }]
      })

      new ApiManagementApiOperation(this, "ApiManagementApiOperation" + f + "Post", {
        operationId: f + "-post",
        apiManagementName: apiManagementApi.apiManagementName,
        apiName: apiManagementApi.name,
        resourceGroupName: resourceGroup.name,
        displayName: f + "-post",
        method: "POST",
        urlTemplate: "/" + f,
        description: "This can only be done by the logged in user.",
        response: [{
          statusCode: 200
        }]
      })
    }


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
    <set-header name="request-email" exists-action="override">
      <value>@(context.User.Email)</value>
    </set-header>
    <set-header name="request-id" exists-action="override">
      <value>@(context.User.Id)</value>
    </set-header>
    <rate-limit-by-key calls="10" renewal-period="60" counter-key="@(context.Request.IpAddress)" />
    <rate-limit calls="10" renewal-period="60" />
    <base />
    <set-backend-service backend-id="${apiManagementBackend.name}" />
  </inbound>
</policies>
`
    })



    type Student = {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };


    const csvFilePath = path.resolve(__dirname, 'student_list.csv');
    const headers = ['id', 'firstName', 'lastName', 'email'];
    const fileContent = fs.readFileSync(csvFilePath, { encoding: 'utf-8' });

    const students: Student[] = parse(fileContent, {
      delimiter: ',',
      columns: headers,
      from_line: 2
    });
    let i = 0;
    for (let student of students) {
      const apiManagementUser = new ApiManagementUser(this, "ApiManagementUser" + i, {
        userId: student.id,
        apiManagementName: apiManagement.name,
        resourceGroupName: resourceGroup.name,
        email: student.email,
        firstName: student.firstName,
        lastName: student.lastName,
        state: "active"
      })

      const apiManagementSubscription = new ApiManagementSubscription(this, "ApiManagementSubscription" + i, {
        apiManagementName: apiManagement.name,
        resourceGroupName: resourceGroup.name,
        userId: apiManagementUser.id,
        displayName: student.id + ":" + student.firstName + " " + student.lastName,
        apiId: apiManagementApi.id,
        state: "active"
      })

      new TerraformOutput(this, "SubscriptionKey_" + i, {
        sensitive: true,
        value: apiManagementSubscription.primaryKey
      });
      i++;
    }


  }
}

const app = new App({ skipValidation: true });
new PyTestRunnerStack(app, "PyTestRunnerStack");
app.synth();
