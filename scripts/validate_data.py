"""Fail the refresh before replacing a snapshot if structure is invalid."""
import json
from pathlib import Path
from collections import Counter
R = Path(__file__).resolve().parents[1]
rows = json.loads((R / 'data/carriers.json').read_text())
assert len(rows) >= 1000, 'Unexpectedly small nationwide carrier snapshot'
assert len({c['dot'] for c in rows}) == len(rows), 'Duplicate USDOT keys'
for c in rows:
    assert c['schema_version'] == 2
    for kind in ('driver', 'vehicle'):
        n, o = c[kind + '_insp'], c[kind + '_oos']
        assert n is None or n >= 0
        assert o is None or o >= 0
        assert n is None or o is None or o <= n
    cr = c['crashes']
    for key in ('fatal_crashes', 'injury_crashes', 'tow'):
        assert cr[key] is None or 0 <= cr[key] <= cr['total']
print(json.dumps({'records':len(rows), 'grades':dict(Counter(c['grade']['letter'] for c in rows)), 'schema':2}))
