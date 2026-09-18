#!/usr/bin/env python3
"""Fresh, staged source refresh. A failed/changed upstream never replaces saved data.

Run manually or via the weekly Pages workflow. Collection timestamps are not
observation cutoffs. No existing data/raw checkpoint is reused by this command.
"""
import datetime as dt
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path
from validate_data import validate

ROOT=Path(__file__).resolve().parent.parent
DATA=ROOT/'data'
SOURCES={
    'census':('az4n-8mr2','Motor Carrier Census'),
    'sms':('4y6x-dmck','SMS public measures'),
    'insurance':('c5y8-a4uz','Insurance filing history'),
    'crashes':('4wxs-vbns','SMS crash file'),
}

def utc():return dt.datetime.now(dt.timezone.utc).isoformat()

def metadata(dataset):
    url=f'https://data.transportation.gov/api/views/{dataset}.json'
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url,timeout=45) as response:
                data=json.load(response)
            stamp=data.get('rowsUpdatedAt')
            if not isinstance(stamp,(int,float)):raise ValueError(f'Missing source update time: {dataset}')
            return stamp
        except Exception:
            if attempt==2:raise
            time.sleep(2**attempt)

def main():
    started=utc()
    before={key:metadata(ds) for key,(ds,_) in SOURCES.items()}
    with tempfile.TemporaryDirectory(prefix='dot-refresh-') as tmp:
        raw=Path(tmp)/'raw';out=Path(tmp)/'out';out.mkdir()
        env={**os.environ,'DOT_RAW_DIR':str(raw),'DOT_DATA_DIR':str(out)}
        subprocess.run([sys.executable,str(ROOT/'scripts/collect.py'),'50'],env=env,check=True,cwd=ROOT)
        subprocess.run([sys.executable,str(ROOT/'scripts/normalize.py')],env=env,check=True,cwd=ROOT)
        after={key:metadata(ds) for key,(ds,_) in SOURCES.items()}
        if before!=after:raise RuntimeError('Source files changed during collection; refusing mixed-generation publish. Retry a fresh collection.')
        records=json.loads((out/'carriers.json').read_text())
        count=validate(records)
        previous=json.loads((DATA/'carriers.json').read_text())
        if count < 0.75*len(previous):raise RuntimeError('Carrier count fell more than 25%; manual source review required before publishing')
        completed=utc()
        sources={key:{'dataset_id':ds,'label':label,'url':f'https://data.transportation.gov/d/{ds}',
                      'source_updated_at':dt.datetime.fromtimestamp(after[key],dt.timezone.utc).isoformat(),
                      'collection_started_at':started,'collected_at':completed,
                      'rows_collected':len(json.loads((raw/(key+'.json')).read_text()))}
                 for key,(ds,label) in SOURCES.items()}
        (out/'source_metadata.json').write_text(json.dumps({'collection_started_at':started,'collected_at':completed,
             'snapshot_date':None,'snapshot_date_status':'not independently verified',
             'collection_time_meaning':'completion of the collection window, not each individual HTTP request',
             'normalized_records':count,'datasets':sources},indent=2))
        names=['carriers.json','national.json','source_metadata.json']
        # This changes only the CI working tree until validation and deployment succeed.
        backups={name:(DATA/name).read_bytes() if (DATA/name).exists() else None for name in names}
        try:
            for name in names:
                temp=DATA/(name+'.new');temp.write_bytes((out/name).read_bytes());os.replace(temp,DATA/name)
        except Exception:
            for name,content in backups.items():
                if content is None:(DATA/name).unlink(missing_ok=True)
                else:(DATA/name).write_bytes(content)
            raise
        print(f'Fresh collection validated: {count} carriers, completed {completed}')

if __name__=='__main__':main()
