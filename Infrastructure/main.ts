import { ApiUser, AzureApiManagementConstruct } from "azure-common-construct/patterns/AzureApiManagementConstruct";
import { App, TerraformOutput, TerraformStack } from "cdktf";
import { DataArchiveFile } from "cdktf-azure-providers/.gen/providers/archive";
import { ApplicationInsights, AzurermProvider, LinuxFunctionApp, ResourceGroup, ServicePlan, StorageAccount, StorageTable } from "cdktf-azure-providers/.gen/providers/azurerm";
import { Resource } from "cdktf-azure-providers/.gen/providers/null";
import { Construct } from "constructs";


import { parse } from 'csv-parse/sync';
import * as dotenv from 'dotenv';
import * as fs from "fs";
import * as path from "path";


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

    const prefix = process.env.PREFIX!
    const environment = "assign"

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


    const csvFilePath = path.resolve(__dirname, 'student_list.csv');
    const headers = ['id', 'firstName', 'lastName', 'email'];
    const fileContent = fs.readFileSync(csvFilePath, { encoding: 'utf-8' });

    const apiUsers: ApiUser[] = parse(fileContent, {
      delimiter: ',',
      columns: headers,
      from_line: 2
    });

    const azureApiManagementConstruct = new AzureApiManagementConstruct(this, "AzureApiManagementConstruct", {
      apiName: process.env.API_NAME!,
      environment,
      prefix,
      functionApp: linuxFunctionApp,
      publisherEmail: process.env.PUBLISHER_EMAIL!,
      publisherName: process.env.PUBLISHER_NAME!,
      resourceGroup,
      skuName: "Basic_1",
      wpiUsers: apiUsers,
      functionNames: ["pytester", "test-results"],
      ipRateLimit: 10,
      keyRateLimit: 10,
      corsDomain: "*"
    })

    new TerraformOutput(this, "ApiManagementUrl", {
      value: `${azureApiManagementConstruct.apiManagement.gatewayUrl}`
    })

    let i = 0;
    for (let apiKey of azureApiManagementConstruct.apiUsers) {
      new TerraformOutput(this, "SubscriptionKey_" + i, {
        sensitive: true,
        value: apiKey.apiKey
      });
      i++;
    }
  }

}

const app = new App({ skipValidation: true });
new PyTestRunnerStack(app, "PyTestRunnerStack");
app.synth();
