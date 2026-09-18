"""Block publication if generated reports reintroduce known trust defects.

This checks built files, not upstream accuracy, API availability or legal suitability.
Run after build.py; works for retained legacy and freshly normalized input snapshots.
"""
import argparse
from collections import Counter
import hashlib
import html
import json
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN = (
    'Eligible for dispatch', 'Clean safety record', 'Authorized for hire',
    'Verified FMCSA Record', '4/4 evaluated', 'insurance on file, zero BASIC alerts',
    'Zero alerts', '>No alert</span>', 'BASIC violation density',
    'Knight (53467)', 'Werner (123456)',
)
REQUIRED = (
    'Registration is not for-hire authority',
    'Active coverage not verified; check L&I and insurer',
    'Fatal crash records', 'Injury crash records', 'People reported:',
    'This report is not dispatch approval.',
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check_page(text, *, carrier=False):
    for phrase in FORBIDDEN:
        require(phrase not in text, f'Unsupported claim or wrong example: {phrase}')
    if not carrier:
        return None
    require(text.count('id="report-card-view"') == 1, 'Missing or duplicate main report')
    require(len(re.findall(r'<script\b[^>]*\bsrc=["\'][^"\']*static/app\.js\?', text)) == 1,
            'Missing or duplicate report interaction script')
    visible = ' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', text)).split())
    for phrase in REQUIRED:
        require(phrase in visible, f'Missing evidence limitation: {phrase}')
    grade = re.search(r'class="grade grade--(NR|A|B|C|D|F)"', text)
    score = re.search(r'<div class="scorelabel">(.*?)</div>', text, re.S)
    require(grade is not None and score is not None, 'Missing main grade or score label')
    label = html.unescape(re.sub(r'<[^>]+>', ' ', score.group(1)))
    letter = grade.group(1)
    if letter == 'NR':
        require('Not rated' in label, 'NR has no explicit Not rated explanation')
        require('/ 100' not in label and '/100' not in label, 'NR still displays a numeric score')
    else:
        number = re.search(r'\b(\d+)\s*/\s*100\b', label)
        require(number is not None, 'Rated report has no numeric score')
        bounds = {'A': (90, 100), 'B': (75, 89), 'C': (60, 74), 'D': (40, 59), 'F': (0, 39)}
        low, high = bounds[letter]
        require(low <= int(number.group(1)) <= high, 'Letter and score disagree')
    return letter


def validate(dist):
    index_path = dist / 'static/index.json'
    index_bytes = index_path.read_bytes()
    index = json.loads(index_bytes)
    require(isinstance(index, dict) and index, 'Missing or empty carrier index')
    expected = {f'{dot}-{slug}' for dot, slug in index.items()}
    carrier_pages = list((dist / 'carrier').glob('*/index.html'))
    require({p.parent.name for p in carrier_pages} == expected, 'Carrier index and published pages differ')
    counts = Counter()
    pages = list(dist.rglob('*.html'))
    require((dist / 'index.html').is_file(), 'Homepage was not generated')
    for path in pages:
        is_carrier = path.parent.parent == dist / 'carrier' and path.name == 'index.html'
        try:
            letter = check_page(path.read_text(encoding='utf-8'), carrier=is_carrier)
        except ValueError as exc:
            raise ValueError(f'{path.relative_to(dist)}: {exc}') from exc
        if letter:
            counts[letter] += 1
    return {'status': 'passed', 'html_pages': len(pages), 'carrier_pages': len(carrier_pages),
            'grades': dict(sorted(counts.items())), 'carrier_index_sha256': hashlib.sha256(index_bytes).hexdigest(),
            'source_commit': os.environ.get('GITHUB_SHA'),
            'scope': 'Generated HTML invariants only; not live API or current carrier verification'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    report = validate(args.dist)
    (args.dist / 'integrity-check.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
