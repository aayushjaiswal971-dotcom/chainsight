"""
Single MongoDB connection helper.
Usage: from common.mongo import get_db
"""
import os
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

_client = None


def get_client() -> MongoClient:
    global _client
    if _client is None:
        uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        _client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    return _client


def get_db():
    db_name = os.environ.get("MONGO_DB_NAME", "chainsight")
    return get_client()[db_name]
