"""Prove that the publication gate rejects reintroduced defects, not just good output."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from validate_site import check_page, validate, REQUIRED


def report(letter='A', score='100 / 100'):
    return ('<div id="report-card-view">'
            f'<div class="grade grade--{letter}">{letter}</div>'
            f'<div class="scorelabel"><b>{score}</b></div>'
            + ''.join(f'<p>{s}</p>' for s in REQUIRED)
            + '</div><script src="/static/app.js?v=test" defer></script>')


class SiteIntegrityTests(unittest.TestCase):
    def test_valid_rated_and_not_rated(self):
        self.assertEqual(check_page(report(), carrier=True), 'A')
        self.assertEqual(check_page(report('NR', 'Not rated'), carrier=True), 'NR')

    def test_dispatch_approval_is_blocked(self):
        with self.assertRaisesRegex(ValueError, 'Unsupported claim'):
            check_page(report() + '<h2>Eligible for dispatch</h2>', carrier=True)

    def test_unknown_cannot_keep_numeric_score(self):
        with self.assertRaises(ValueError):
            check_page(report('NR', 'Not rated 100 / 100'), carrier=True)

    def test_letter_must_match_score(self):
        with self.assertRaisesRegex(ValueError, 'Letter and score disagree'):
            check_page(report('A', '70 / 100'), carrier=True)

    def test_required_coverage_limitation(self):
        with self.assertRaisesRegex(ValueError, 'Missing evidence limitation'):
            check_page(report().replace(REQUIRED[1], 'Coverage verified'), carrier=True)

    def test_exact_index_coverage_and_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            dist = Path(tmp)
            (dist / 'static').mkdir()
            (dist / 'static/index.json').write_text(json.dumps({'1': 'test'}))
            (dist / 'index.html').write_text('<h1>Carrier lookup</h1>')
            with self.assertRaisesRegex(ValueError, 'index and published pages differ'):
                validate(dist)
            path = dist / 'carrier/1-test'
            path.mkdir(parents=True)
            (path / 'index.html').write_text(report())
            result = validate(dist)
            self.assertEqual(result['carrier_pages'], 1)
            self.assertEqual(result['grades'], {'A': 1})
            self.assertEqual(result['html_pages'], 2)

    def test_examples_checked_outside_report_pages(self):
        with self.assertRaises(ValueError):
            check_page('<button>Knight (53467)</button>')


if __name__ == '__main__':
    unittest.main()
