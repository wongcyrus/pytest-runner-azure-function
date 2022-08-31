import logging
import azure.functions as func
import os
import logging
import json
from pathlib import Path
from azure.data.tables import TableClient
from azure.core.exceptions import HttpResponseError, ResourceExistsError


def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("start:" + req.method)
    logging.info("email:" + req.headers["request-email"])
    email = req.headers["request-email"]

    table_client = TableClient.from_connection_string(
        conn_str=os.environ["CONNECTION_STRING"], table_name="TestResults")

    try:
        parameters = {
            "pk": email
        }
        query_filter = "PartitionKey eq @pk"
        result = list(table_client.query_entities(
            query_filter, parameters=parameters, select="RowKey"))
        logging.info(result)
    except HttpResponseError as ex:
        return func.HttpResponse(body=ex, status_code=500)

    return func.HttpResponse(body=json.dumps(result), status_code=200)
