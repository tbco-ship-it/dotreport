"""Fail the deployment when known misleading report claims recur."""
import json
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parent.parent
DIST=ROOT/'dist'
FORBIDDEN=('Eligible for dispatch','Clean safety record','Authorized for hire','Verified FMCSA Record','4/4 evaluated',
           'insurance on file, zero BASIC alerts','Zero alerts','>No alert</span>','BASIC violation density',
           'None / 100','null / 100','−20 points for missing mandatory','Knight (53467)','Werner (123456)')

def main():
    counts=Counter()
    paths=list((DIST/'carrier').glob('*/index.html'))
    assert paths,'No carrier pages generated'
    for p in paths:
        s=p.read_text()
        for bad in FORBIDDEN:
            assert bad not in s,f'{p}: forbidden claim {bad}'
        assert 'Current coverage not verified' in s,p
        assert 'Not a for-hire authority check' in s,p
        assert 'Fatalities (people)' in s and 'People injured' in s,p
        assert 'static/app.js?' in s,p
        if 'grade--NR' in s:
            assert 'Not rated' in s and 'None/100' not in s,p
            counts['not_rated']+=1
        counts['carrier_pages']+=1
    home=(DIST/'index.html').read_text()
    for bad in FORBIDDEN:assert bad not in home,bad
    assert home.count('static/app.js?')==1,'Duplicate/missing app script'
    info=json.loads((DIST/'build-info.json').read_text())
    assert info['index_version']=='2.0.0'
    (DIST/'integrity-check.json').write_text(json.dumps({'status':'passed','checks':dict(counts),'index_version':'2.0.0'},indent=2))
    print('PASS: generated site integrity',dict(counts))

if __name__=='__main__':main()
