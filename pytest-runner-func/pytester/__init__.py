import logging
import subprocess
import azure.functions as func
import zipfile
import tempfile
import shutil
import os
import logging
from pathlib import Path


def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("start")
    source_code_file_path = req.params.get("sourceCodeFilePath")
    source_code = req.params.get("sourceCode")

    if not source_code or not source_code_file_path:
        return func.HttpResponse(body='{ "error": "source_code and source_code_file_path must present." }', status_code=422)

    with tempfile.TemporaryDirectory() as tmpdirname:
        logging.info(tmpdirname)
        zipped_pyTest_code = os.path.join(os.path.dirname(
            os.path.realpath(__file__)), 'assignments.zip')
        file = zipfile.ZipFile(zipped_pyTest_code)
        file.extractall(path=tmpdirname)
        logging.info("extractall")

        assignment_path = os.path.join(tmpdirname, "assignments")
        virtual_env_path = os.path.join(tmpdirname, "assignments", ".venv")
        activate_virtual_env_path = os.path.join(tmpdirname, "assignments", ".venv","bin","activate")
        pip_virtual_env_path = os.path.join(tmpdirname, "assignments", ".venv","bin","pip")
        os.chdir(assignment_path)
        test_result = subprocess.getoutput(
            f'python -m venv {virtual_env_path}')
        logging.info(test_result)
        test_result = subprocess.getoutput(
            f'{pip_virtual_env_path} install -r requirements.txt')
        logging.info(test_result)          
             
        test_result_json = os.path.join(tmpdirname, 'result.json')        
        cmd = f""". {activate_virtual_env_path}
python -m pytest --json-report --json-report-file={test_result_json}
"""
        test_result = subprocess.getoutput(cmd)
        logging.info(test_result)
        test_result_json = Path(test_result_json).read_text()
        logging.info(test_result_json)
        shutil.rmtree(tmpdirname)



    return func.HttpResponse(body=test_result_json, status_code=200)
