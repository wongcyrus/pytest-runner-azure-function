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
from azure.data.tables import TableClient
from azure.core.exceptions import HttpResponseError, ResourceExistsError


def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("start:" + req.method)

    # Example
    # sourceCodeFilePath = lab/lab01/ch01_t01_hello_world.py
    # sourceCode = `print("Hello, world!")`

    logging.info("email:" + req.headers["request-email"])
    email = req.headers["request-email"]

    if req.method == "GET":
        source_code_file_path = req.params.get("sourceCodeFilePath")
        source_code = req.params.get("sourceCode")
    else:
        req_body_bytes = req.get_body()
        req_body = req_body_bytes.decode("utf-8")
        logging.info(f"Request: {req_body}")
        data = json.loads(req_body)
        source_code_file_path = data["sourceCodeFilePath"]
        source_code = data["sourceCode"]

    if not source_code or not source_code_file_path:
        return func.HttpResponse(body='{ "error": "source_code and source_code_file_path must present." }', status_code=422)

    table_client = TableClient.from_connection_string(
        conn_str=os.environ["CONNECTION_STRING"], table_name="TestResults")

    row_key = source_code_file_path.replace("/", "->")

    repeated_test = True
    try:
        r = table_client.get_entity(email, row_key)
        logging.info(r)
    except HttpResponseError:
        repeated_test = False

    if repeated_test:
        return func.HttpResponse(body="Repeated Successful Test.", status_code=200)

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

        test_result_text = os.path.join(tmpdirname, 'result.json')
        cmd = f""". {activate_virtual_env_path}
python -m pytest -v {test_code_file_path} --json-report --json-report-file={test_result_text}
"""
        test_result = subprocess.getoutput(cmd)
        logging.info(test_result)
        test_result_text = Path(test_result_text).read_text()
        logging.info(test_result_text)
        shutil.rmtree(tmpdirname)

        try:
            test_result_json = json.loads(test_result_text)

            logging.info(
                test_result_json["summary"]["passed"] / test_result_json["summary"]["total"])
            is_all_tests_passed = test_result_json["summary"]["passed"] / \
                test_result_json["summary"]["total"] == 1

            if is_all_tests_passed:
                entity = {
                    'PartitionKey': email,
                    'RowKey': source_code_file_path.replace("/", "->"),
                    'Code': source_code
                }
                logging.info(entity)
                response = table_client.create_entity(entity)
                logging.info(response)
                return func.HttpResponse(body="Test Success and saved the result.", status_code=200)
        except ResourceExistsError:
            logging.info("Entity already exists")
        except BaseException as ex:
            logging.info(f"Unexpected {ex=}, {type(ex)=}")

    return func.HttpResponse(body="Test unsucessful!.", status_code=200)
