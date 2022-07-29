import imp
import logging
import subprocess
import azure.functions as func
import zipfile
import tempfile
import shutil
import os
import logging
import json
from pathlib import Path
from urllib.parse import parse_qs


def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("start:" + req.method)

    # Example
    # sourceCodeFilePath = lab/lab01/ch01_t01_hello_world.py
    # sourceCode = `print("Hello, world!")`

    if req.method == "GET":
        source_code_file_path = req.params.get("sourceCodeFilePath")
        source_code = req.params.get("sourceCode")
    else:
        req_body_bytes = req.get_body()
        logging.info(f"Request Bytes: {req_body_bytes}")
        req_body = req_body_bytes.decode("utf-8")
        logging.info(f"Request: {req_body}")
        data = json.loads(req_body)
        source_code_file_path = data["sourceCodeFilePath"]
        source_code = data["sourceCode"]

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

        code_file_path = os.path.join(
            tmpdirname, "assignments", source_code_file_path)
        with open(code_file_path, 'w') as filetowrite:
            filetowrite.write(source_code)

        text = Path(code_file_path).read_text()
        logging.info(text)

        # Source lab\lab01\ch01_t01_hello_world.py to Test tests\lab01\test_ch01_t01_hello_world.py
        source_code_file_path_segments = source_code_file_path.split("/")
        test_code_file_path = os.path.join(
            tmpdirname, "assignments", "tests", source_code_file_path_segments[1], "test_"+source_code_file_path_segments[2])

        virtual_env_path = os.path.join(tmpdirname, "assignments", ".venv")
        activate_virtual_env_path = os.path.join(
            tmpdirname, "assignments", ".venv", "bin", "activate")
        pip_virtual_env_path = os.path.join(
            tmpdirname, "assignments", ".venv", "bin", "pip")
        os.chdir(assignment_path)
        test_result = subprocess.getoutput(
            f'python -m venv {virtual_env_path}')
        logging.info(test_result)
        test_result = subprocess.getoutput(
            f'{pip_virtual_env_path} install -r requirements.txt')
        logging.info(test_result)

        test_result_json = os.path.join(tmpdirname, 'result.json')
        cmd = f""". {activate_virtual_env_path}
python -m pytest -v {test_code_file_path} --json-report --json-report-file={test_result_json}
"""
        test_result = subprocess.getoutput(cmd)
        logging.info(test_result)
        test_result_json = Path(test_result_json).read_text()
        logging.info(test_result_json)
        shutil.rmtree(tmpdirname)

    return func.HttpResponse(body=test_result_json, status_code=200)
