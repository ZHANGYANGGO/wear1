"""Resume an anonymous HTTPS mirror of BodyM. Requires requests and Pillow."""
import hashlib
import io
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import local
from time import sleep
from xml.etree import ElementTree

import requests
from PIL import Image
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


BASE = "https://amazon-bodym.s3.us-west-2.amazonaws.com/"
PRIVATE = Path(__file__).resolve().parents[1] / ".private"
DATA = PRIVATE / "datasets" / "bodym"
SPLITS = ("train", "testA", "testB")
sessions = local()


def session():
    if not hasattr(sessions, "http"):
        http = requests.Session()
        http.mount("https://", HTTPAdapter(max_retries=Retry(
            total=4, backoff_factor=0.5, status_forcelist=(429, 500, 502, 503, 504))))
        sessions.http = http
    return sessions.http


def list_objects():
    items = []
    for split in SPLITS:
        params = {"list-type": "2", "prefix": split + "/"}
        while True:
            response = session().get(BASE, params=params, timeout=(15, 60))
            response.raise_for_status()
            page = ElementTree.fromstring(response.content)
            for obj in page.findall("{*}Contents"):
                key = obj.findtext("{*}Key")
                if key.endswith("/"):
                    continue
                parts = key.split("/")
                if parts[0] != split or any(not p or p in (".", "..") or any(c in p for c in "\\:") for p in parts):
                    raise ValueError(f"Unexpected S3 key: {key!r}")
                items.append({"key": key, "size": int(obj.findtext("{*}Size")),
                              "etag": obj.findtext("{*}ETag").strip('"')})
            if page.findtext("{*}IsTruncated") != "true":
                break
            params["continuation-token"] = page.findtext("{*}NextContinuationToken")
    if not items:
        raise ValueError("Empty S3 inventory")
    return items


def valid(data, item):
    if len(data) != item["size"]:
        return False
    etag = item["etag"]
    if len(etag) == 32 and hashlib.md5(data).hexdigest() != etag:
        return False
    if item["key"].lower().endswith(".png"):
        with Image.open(io.BytesIO(data)) as image:
            if image.format != "PNG":
                return False
            image.load()
    return True


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=path.parent, delete=False) as temp:
        tmp = Path(temp.name)
    try:
        tmp.write_bytes(data)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def sync_one(item):
    path = DATA / item["key"]
    if path.is_file() and path.stat().st_size == item["size"]:
        try:
            if valid(path.read_bytes(), item):
                return
        except (OSError, ValueError):
            pass
    for attempt in range(3):
        try:
            response = session().get(BASE + requests.utils.quote(item["key"], safe="/"), timeout=(15, 60))
            response.raise_for_status()
            if not valid(response.content, item):
                raise ValueError("Content did not match S3 inventory")
            atomic_write(path, response.content)
            return
        except (requests.RequestException, OSError, ValueError):
            if attempt == 2:
                raise
            sleep(1 + attempt)


if __name__ == "__main__":
    items = list_objects()
    atomic_write(PRIVATE / "bodym-analysis" / "inventory.json", json.dumps(items).encode())
    print(f"Inventory: {len(items)} objects, {sum(i['size'] for i in items)} bytes", flush=True)
    failures = []
    with ThreadPoolExecutor(max_workers=32) as pool:
        jobs = {pool.submit(sync_one, i): i["key"] for i in items}
        for count, future in enumerate(as_completed(jobs), 1):
            try:
                future.result()
            except Exception as error:
                failures.append((jobs[future], str(error)))
            if count % 1000 == 0:
                print(f"Checked {count}/{len(items)}, errors {len(failures)}", flush=True)
    if failures:
        raise SystemExit(f"{len(failures)} errors, rerun to repair: {failures[:5]}")
    print(f"Verified {len(items)} objects in {DATA}", flush=True)
