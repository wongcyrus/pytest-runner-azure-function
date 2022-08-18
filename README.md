# pytest-runner-azure-function

This project executes Pytest in Azure Function with Consumption plan. Azure API Management protects Azure Function API and create one subscription per student. Successful test result saves into Azure storage table.

## Enhancing GitHub Classroom with Azure serverless services
Read this post for more details.
https://techcommunity.microsoft.com/t5/educator-developer-blog/enhancing-github-classroom-with-azure-serverless-services/ba-p/3600682

## Prerequisites 
Setup CDK-TF
1. https://www.hashicorp.com/blog/building-azure-resources-with-typescript-using-the-cdk-for-terraform
2. https://techcommunity.microsoft.com/t5/educator-developer-blog/object-oriented-your-azure-infrastructure-with-cloud-development/ba-p/3474715 

## Deployment
Update the student list Infrastructure/student_list.csv
```
cd Infrastructure
npm i
cdktf deploy --auto-approve
cdktf output --outputs-file-include-sensitive-outputs --outputs-file secrets.json
npm run getstudentkey
```
Mail merge student_key.csv to your students.

