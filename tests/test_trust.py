"""Regression evidence for the 2026-09-18 production trust audit."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from grading import assess_many
from normalize import summarize_crashes, nullable_count, ac_flag

NAT = {'driver_oos_rate': 5.42, 'vehicle_oos_rate': 21.47}
BASE = dict(schema_version=2, dot=1, name='TEST CARRIER', status='A', mc='MC-1', mc_status='A', pu=100,
    insp=100, driver_insp=100, driver_oos=0, vehicle_insp=100, vehicle_oos=0,
    basics=[dict(key=str(i), label=str(i), ac=False, viol=0) for i in range(5)], insurance=[],
    crashes=dict(total=0, fatal_crashes=0, injury_crashes=0, fatalities=0, injuries=0, tow=0))

class TrustTests(unittest.TestCase):
    def view(self, **updates):
        c = copy.deepcopy(BASE); c.update(updates)
        return assess_many([c], NAT)[0]

    def test_empty_inspections_not_a(self):
        v = self.view(insp=0, driver_insp=0, vehicle_insp=0)
        self.assertEqual(v['grade']['letter'], 'NR')
        self.assertIsNone(v['grade']['score'])

    def test_category_sample_gate(self):
        self.assertEqual(self.view(vehicle_insp=4)['grade']['letter'], 'NR')
        self.assertEqual(self.view(vehicle_insp=5)['grade']['letter'], 'A')

    def test_unknown_oos_not_zero(self):
        v = self.view(vehicle_oos=None)
        self.assertIsNone(v['vehicle']['rate'])
        self.assertEqual(v['checks'][-1]['value'], 'Unknown')
        self.assertEqual(v['checks'][-1]['tone'], 'neutral')

    def test_above_average_a_has_no_clean_claim(self):
        v = self.view(driver_oos=10)
        self.assertEqual(v['grade']['score'], 90)
        self.assertIn('above average', v['message'])
        self.assertNotIn('Clean safety record', v['heading'])
        self.assertNotIn('insurance on file', v['message'])

    def test_private_registration_not_for_hire(self):
        v = self.view(mc=None, mc_status=None, classdef='Private Property')
        self.assertEqual(v['checks'][1]['value'], 'No docket located')
        self.assertNotIn('Authorized for hire', json.dumps(v))
        self.assertIn('not determined', v['checks'][1]['note'])

    def test_unknown_docket_not_inactive(self):
        v = self.view(mc_status=None)
        self.assertEqual(v['checks'][1]['value'], 'Unknown')
        self.assertEqual(v['grade']['factors'][4]['points'], 0)
        self.assertEqual(v['grade']['letter'], 'NR')

    def test_explicit_inactive_is_penalized(self):
        self.assertEqual(self.view(status='I')['grade']['factors'][4]['points'], -40)
        self.assertEqual(self.view(mc_status='I')['grade']['factors'][4]['points'], -20)

    def test_unknown_registration_not_active(self):
        v = self.view(status=None)
        self.assertEqual(v['checks'][0]['value'], 'Unknown')
        self.assertEqual(v['grade']['letter'], 'NR')

    def test_bond_and_cargo_not_liability(self):
        for kind, form in [('Bond / trust fund', 'BMC-84'), ('Cargo', 'BMC-34')]:
            v = self.view(insurance=[dict(type=kind, form=form)])
            self.assertFalse(v['liabilityFiled'])
            self.assertEqual(v['checks'][2]['value'], 'Unconfirmed')

    def test_liability_filing_not_coverage(self):
        v = self.view(insurance=[dict(type='Liability (BIPD)', form='BMC-91X')])
        self.assertTrue(v['liabilityFiled'])
        self.assertIn('not verified', v['checks'][2]['note'])
        self.assertEqual(v['grade']['factors'][-1]['points'], 0)

    def test_multiple_victims_one_event(self):
        cr = summarize_crashes([dict(report_date='01-AUG-26', fatalities='2', injuries='3', tow_away='Y')])
        self.assertEqual((cr['fatal_crashes'], cr['injury_crashes']), (1, 1))
        self.assertEqual((cr['fatalities'], cr['injuries']), (2, 3))

    def test_missing_victim_count_remains_unknown(self):
        cr = summarize_crashes([dict(report_date='01-AUG-26', fatalities=None, injuries='')])
        self.assertIsNone(cr['fatal_crashes']); self.assertIsNone(cr['injuries'])

    def test_legacy_counts_not_guessed(self):
        v = self.view(schema_version=1, crashes=dict(total=1, fatal=2, injury=3, tow=1))
        self.assertEqual(v['crashes']['fatalities'], 2)
        self.assertIsNone(v['crashes']['fatal_crashes'])
        self.assertEqual(v['grade']['letter'], 'NR')

    def test_legacy_negative_indicator_not_full_clearance(self):
        v = self.view(schema_version=1, basics=[dict(label='Test', alert=False)], crashes=dict(total=0, fatal=0, injury=0))
        self.assertIsNone(v['basics'][0]['ac'])
        self.assertIn('legacy extract', v['basics'][0]['indicatorLabel'])
        self.assertNotIn('Zero alerts', json.dumps(v))

    def test_unknown_new_indicator_not_negative(self):
        v = self.view(basics=[dict(label='Test', ac=None)])
        self.assertIsNone(v['basics'][0]['ac'])
        self.assertEqual(v['grade']['letter'], 'NR')

    def test_missing_basic_rows_withhold_grade(self):
        for rows in [[], BASE['basics'][:4]]:
            self.assertEqual(self.view(basics=rows)['grade']['letter'], 'NR')

    def test_numeric_and_flag_parsing(self):
        for value in [None, '', 'bad', '-1', 'NaN', '1.5']:
            self.assertIsNone(nullable_count(value))
        self.assertEqual(nullable_count('0'), 0)
        self.assertEqual([ac_flag(x) for x in ['Y', 'N', None, '']], [True, False, None, None])

    def test_invalid_denominator_not_good(self):
        for update in [dict(vehicle_oos=101), dict(vehicle_insp=-1), dict(pu=0)]:
            self.assertEqual(self.view(**update)['grade']['letter'], 'NR')

    def test_solsbury_snapshot_regression(self):
        path = Path(__file__).resolve().parent / 'fixtures/solsbury-legacy.json'
        c = json.loads(path.read_text())
        v = assess_many([c], NAT)[0]
        self.assertNotIn('Eligible for dispatch', v['heading'])
        self.assertNotIn('Authorized for hire', json.dumps(v))
        self.assertNotIn('insurance on file', v['message'])

if __name__ == '__main__':
    unittest.main()
