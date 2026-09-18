"""Build bridge to the SAME policy executed in the browser (static/grade.js).

Batch records with assess_many during builds; grade is for focused checks only.
No stale precomputed grade in data/carriers.json is used for a deployment.
"""
import json
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIN_INSP = 5


def rnd(x, nd):
    return math.floor(x * 10 ** nd + 0.5) / 10 ** nd


def assess_many(carriers, national):
    script = "const fs=require('node:fs');const {dotAssess}=require('./static/grade.js');const x=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(x.carriers.map(c=>dotAssess(c,x.national))));"
    result = subprocess.run(['node', '-e', script], cwd=ROOT, input=json.dumps({'carriers': carriers, 'national': national}), text=True, capture_output=True, timeout=120, check=True)
    return json.loads(result.stdout)


def grade(c, nat):
    return assess_many([c], nat)[0]['grade']
