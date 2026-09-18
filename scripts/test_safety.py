"""Regression fixtures for the 2026-09-18 integrity release. No network access."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from grading import grade
from jinja2 import Environment, FileSystemLoader

ROOT = Path(__file__).resolve().parent.parent
NAT = dict(driver_oos_rate=5.42, vehicle_oos_rate=21.47, sms_updated="2026-09-13", sources={})
BASE = dict(dot=99999999, name="TEST ONLY LLC", dba=None, street="Test", city="Test", state="CA", zip="00000",
            slug="test-only", pu=100, drivers=100, insp=20, driver_insp=10, vehicle_insp=10,
            driver_oos=0, vehicle_oos=0, driver_oos_rate=0.0, vehicle_oos_rate=0.0, status="A", mc=None,
            mc_status=None, classdef="Private Property", hm=False, mcs150_date=None, mileage=0, mileage_year=None,
            since=None, cargo=[], basics=[dict(label="Driver Fitness", viol=0, alert=False)], insurance=[],
            crashes=dict(total=0, fatal=0, injury=0, tow=0, first=None, last=None))


def record(**changes):
    c = copy.deepcopy(BASE)
    c.update(changes)
    return c


def render(c):
    from build import cname
    env = Environment(loader=FileSystemLoader(ROOT / 'templates'), autoescape=True)
    env.filters['cname'] = cname
    c = copy.deepcopy(c)
    c['grade'] = grade(c, NAT)
    return env.get_template('_report.html').module.report(c, NAT, {}, '/')


class SafetyTests(unittest.TestCase):
    def test_no_inspections_never_A(self):
        g = grade(record(insp=0, driver_insp=0, vehicle_insp=0), NAT)
        self.assertEqual((g['letter'], g['score']), ('NR', None))

    def test_per_category_minimum(self):
        for key in ('driver_insp', 'vehicle_insp'):
            for count in (0, 1, 4):
                self.assertTrue(grade(record(**{key:count}), NAT)['limited'])
            self.assertFalse(grade(record(**{key:5}), NAT)['limited'])

    def test_unknown_is_not_zero(self):
        for value in (None, -1, 101, float('nan'), True, '0'):
            self.assertTrue(grade(record(vehicle_oos_rate=value), NAT)['limited'])
        self.assertTrue(grade(record(pu=0), NAT)['limited'])
        self.assertTrue(grade(record(status=None), NAT)['limited'])
        self.assertTrue(grade(record(crashes={}), NAT)['limited'])

    def test_thresholds_and_equality(self):
        for rate, deduction in ((5.42,0),(5.43,-10),(10.84,-25)):
            g=grade(record(driver_oos_rate=rate),NAT)
            self.assertEqual(g['factors'][0]['points'],deduction)
        for rate, deduction in ((21.47,0),(21.48,-10),(32.205,-25)):
            self.assertEqual(grade(record(vehicle_oos_rate=rate),NAT)['factors'][1]['points'],deduction)

    def test_registration_not_authority(self):
        for status in (None, 'A', 'I'):
            text=render(record(status=status,mc='MC-123',mc_status=None))
            self.assertNotIn('Authorized for hire',text)
            self.assertIn('Not verified',text)
        self.assertEqual(grade(record(status='I'),NAT)['score'],60)
        self.assertEqual(grade(record(mc='MC-123',mc_status=None),NAT)['score'],100)

    def test_cargo_is_not_liability(self):
        cargo=dict(type='Cargo',form='34',company='TEST',amount=10000,effective='2020-01-01')
        text=render(record(insurance=[cargo]))
        self.assertIn('Not in extract',text)
        self.assertNotIn('Historical filing found',text)
        cargo['type']='Liability (BIPD)'
        self.assertIn('Historical filing found',render(record(insurance=[cargo])))
        self.assertIn('Current coverage not verified',render(record(insurance=[cargo])))

    def test_no_blanket_claims(self):
        text=render(record(driver_oos_rate=10.0))
        for bad in ('Eligible for dispatch','Clean safety record','Verified FMCSA Record','4/4 evaluated','Zero alerts','No alert</span>'):
            self.assertNotIn(bad,text)
        self.assertIn('Above average',text)
        self.assertIn('Current operating authority and insurance coverage have not been verified',text)

    def test_missing_vehicle_not_below_average(self):
        text=render(record(vehicle_oos_rate=None,vehicle_insp=0))
        start=text.index('Vehicle OOS rate</div>')
        self.assertIn('Not available',text[start:start+250])
        self.assertNotIn('At or below average',text[start:start+250])

    def test_people_not_events(self):
        cr=dict(total=1,fatal=3,injury=4,tow=1,fatal_crashes=1,injury_crashes=1)
        text=render(record(crashes=cr))
        self.assertIn('Fatalities (people)',text)
        self.assertIn('People injured',text)
        self.assertIn('Fatal crash records: 1',text)
        self.assertIn('3 fatalities (people)',grade(record(crashes=cr),NAT)['factors'][3]['note'])

    def test_legacy_counts_not_invented(self):
        self.assertIn('Fatal crash records: not available in this extract',render(record()))

    def test_public_flags_do_not_change_score(self):
        self.assertEqual(grade(record(basics=[dict(alert=True,label='X')]),NAT)['score'],100)

    def test_no_freshness_invention(self):
        text=render(record())
        self.assertIn('not recorded for this saved dataset',text)
        self.assertIn('not independently verified',text)

    def test_untrusted_names_escaped(self):
        text=render(record(name='<img src=x onerror=alert(1)>'))
        self.assertNotIn('<img src=x',text)

    def test_normalize_person_and_event_counts(self):
        import normalize
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            rows={
                'census':[dict(dot_number='99999999',legal_name='TEST ONLY',power_units='100',total_drivers='100',status_code='A')],
                'sms':[dict(dot_number='99999999',insp_total='10',driver_insp_total='5',vehicle_insp_total='5',driver_oos_insp_total='0',vehicle_oos_insp_total='0')],
                'insurance':[],
                'crashes':[dict(dot_number='99999999',report_date='01-SEP-26',fatalities='3',injuries='4',tow_away='Y')],
                'national':dict(**{k:v for k,v in NAT.items() if k!='sources'},n=1)}
            for name,value in rows.items():(p/(name+'.json')).write_text(json.dumps(value))
            with patch.object(normalize,'RAW',p),patch.object(normalize,'DATA',p):normalize.main()
            cr=json.loads((p/'carriers.json').read_text())[0]['crashes']
            self.assertEqual((cr['total'],cr['fatalities'],cr['injuries'],cr['fatal_crashes'],cr['injury_crashes']),(1,3,4,1,1))

class RefreshTests(unittest.TestCase):
    def _run_refresh(self, changed):
        import refresh
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);data=root/'data';data.mkdir()
            original=json.dumps([record()])
            (data/'carriers.json').write_text(original)
            (data/'national.json').write_text(json.dumps(NAT))
            def fake_process(argv, **kwargs):
                env=kwargs['env'];raw=Path(env['DOT_RAW_DIR']);out=Path(env['DOT_DATA_DIR'])
                raw.mkdir(exist_ok=True)
                for key in refresh.SOURCES:(raw/(key+'.json')).write_text('[]')
                (out/'carriers.json').write_text(original)
                (out/'national.json').write_text(json.dumps(NAT))
            stamps=[100]*4+([101]*4 if changed else [100]*4)
            with patch.object(refresh,'ROOT',root),patch.object(refresh,'DATA',data),patch.object(refresh,'metadata',side_effect=stamps),patch.object(refresh.subprocess,'run',side_effect=fake_process):
                if changed:
                    with self.assertRaises(RuntimeError):refresh.main()
                    self.assertEqual((data/'carriers.json').read_text(),original)
                    self.assertFalse((data/'source_metadata.json').exists())
                else:
                    refresh.main()
                    meta=json.loads((data/'source_metadata.json').read_text())
                    self.assertIsNone(meta['snapshot_date'])
                    self.assertEqual(len(meta['datasets']),4)
                    self.assertTrue(meta['collected_at'])
    def test_changed_sources_preserve_saved_data(self):self._run_refresh(True)
    def test_fresh_staging_records_provenance(self):self._run_refresh(False)

if __name__ == '__main__': unittest.main(verbosity=2)
