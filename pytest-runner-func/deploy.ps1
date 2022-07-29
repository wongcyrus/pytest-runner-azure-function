pip install -r requirements.txt --target=".python_packages/lib/site-packages"
del pytest-runner-func.zip
Compress-Archive . pytest-runner-func.zip
az functionapp deployment source config-zip -g PytestRunnerResourceGroup -n PytestRunner-devFunctionApp --src pytest-runner-func.zip