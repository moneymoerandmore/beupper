import json
import pathlib
import sys

sys.path[:0] = [str(pathlib.Path('.tools/ccl_deps').resolve()), str(pathlib.Path('.tools/ccl_chromium_reader').resolve())]
from ccl_chromium_reader import ccl_chromium_localstorage

db = ccl_chromium_localstorage.LocalStoreDb(pathlib.Path('.tools/localstorage-snapshot'))
latest = {}
for record in db.iter_all_records():
    if record.storage_key == 'http://localhost:4317' and str(record.script_key).startswith('financial-titan'):
        if record.script_key not in latest or record.leveldb_seq_number > latest[record.script_key].leveldb_seq_number:
            latest[record.script_key] = record
db.close()

needle = sys.argv[1] if len(sys.argv) > 1 else ''
output = {}
for key, record in latest.items():
    value = record.value
    try:
        parsed = json.loads(value)
    except Exception:
        continue
    if isinstance(parsed, list):
        hits = [item for item in parsed if not needle or needle in json.dumps(item, ensure_ascii=False)]
        if hits:
            output[key] = hits
    elif not needle or needle in json.dumps(parsed, ensure_ascii=False):
        output[key] = parsed
print(json.dumps(output, ensure_ascii=False, indent=2))
