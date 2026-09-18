"""Validate source grain and essential normalized fields before publishing."""
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent

def validate(carriers):
    assert isinstance(carriers,list) and carriers,'Empty carrier dataset'
    seen=set()
    for c in carriers:
        dot=c['dot']
        assert isinstance(dot,int) and 0<dot<100000000 and dot not in seen,f'Duplicate/invalid DOT {dot}'
        seen.add(dot)
        assert isinstance(c.get('name'),str) and c['name'].strip(),f'{dot}: missing name'
        for prefix in ('driver','vehicle'):
            count,oos,rate=(c.get(prefix+k) for k in ('_insp','_oos','_oos_rate'))
            assert isinstance(count,int) and count>=0,f'{dot}: invalid inspection count'
            assert isinstance(oos,int) and 0<=oos<=count,f'{dot}: impossible OOS count'
            if not count:assert rate is None,f'{dot}: rate must be unknown without inspections'
            else:
                assert isinstance(rate,(int,float)) and math.isfinite(rate) and 0<=rate<=100,f'{dot}: invalid rate'
                assert abs(rate-100*oos/count)<=0.051,f'{dot}: OOS rate/count mismatch'
        cr=c.get('crashes') or {}
        assert isinstance(cr.get('total'),int) and cr['total']>=0,f'{dot}: invalid crash total'
        for event,people,legacy in [('fatal_crashes','fatalities','fatal'),('injury_crashes','injuries','injury')]:
            value=cr.get(people,cr.get(legacy))
            assert value is None or isinstance(value,int) and value>=0,f'{dot}: invalid casualty count'
            if cr.get(event) is not None:
                assert 0<=cr[event]<=cr['total'],f'{dot}: event count exceeds total'
                assert value is None or cr[event]<=value,f'{dot}: persons/events mismatch'
    return len(carriers)

if __name__=='__main__':
    print('PASS: normalized dataset',validate(json.loads((ROOT/'data/carriers.json').read_text())),'unique records')
