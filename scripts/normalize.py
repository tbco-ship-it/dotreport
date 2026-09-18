#!/usr/bin/env python3
"""data/raw/*.json -> data/carriers.json (one compact record per carrier, graded) + data/national.json.

The record shape here is the same one worker/api.mjs returns for live lookups, so static pages and the
in-browser report use identical fields. Grading rules live in grading.py (Python) and static/grade.js (JS);
scripts/test_grade.mjs checks the two agree on every carrier in this file.
"""
import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from grading import assess_many, rnd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw"
CARGO = {"crgo_genfreight": "General freight", "crgo_household": "Household goods", "crgo_metalsheet": "Metal: sheets, coils, rolls", "crgo_motoveh": "Motor vehicles",
         "crgo_drivetow": "Drive away / tow away", "crgo_logpole": "Logs, poles, beams, lumber", "crgo_bldgmat": "Building materials", "crgo_mobilehome": "Mobile homes",
         "crgo_machlrg": "Machinery, large objects", "crgo_produce": "Fresh produce", "crgo_liqgas": "Liquids / gases", "crgo_intermodal": "Intermodal containers",
         "crgo_passengers": "Passengers", "crgo_oilfield": "Oilfield equipment", "crgo_livestock": "Livestock", "crgo_grainfeed": "Grain, feed, hay", "crgo_coalcoke": "Coal / coke",
         "crgo_meat": "Meat", "crgo_garbage": "Garbage, refuse", "crgo_usmail": "US mail", "crgo_chem": "Chemicals", "crgo_coldfood": "Commodities requiring temperature control",
         "crgo_beverages": "Beverages", "crgo_paperprod": "Paper products", "crgo_utility": "Utility", "crgo_farmsupp": "Farm supplies", "crgo_construct": "Construction",
         "crgo_waterwell": "Water well", "crgo_cargoothr": "Other"}
BASICS = [("unsafe_driv", "Unsafe Driving"), ("hos_driv", "Hours-of-Service Compliance"), ("driv_fit", "Driver Fitness"),
          ("contr_subst", "Controlled Substances / Alcohol"), ("veh_maint", "Vehicle Maintenance")]


def ymd(s):  # 20250805 -> 2025-08-05
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if s and len(s) == 8 else None


def crash_date(s):  # 05-AUG-25 -> 2025-08-05
    try:
        return datetime.strptime(s, "%d-%b-%y").strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return None


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def num(x, cast=int):
    try:
        return cast(x)
    except (TypeError, ValueError):
        return 0


def nullable_count(x):
    try:
        n = float(x)
        return int(n) if n >= 0 and n.is_integer() else None
    except (ValueError, TypeError, OverflowError):
        return None


def ac_flag(value):
    return True if value == "Y" else False if value == "N" else None


def summarize_crashes(rows):
    fatalities = [nullable_count(r.get("fatalities")) for r in rows]
    injuries = [nullable_count(r.get("injuries")) for r in rows]
    dates = sorted(d for d in (crash_date(r.get("report_date")) for r in rows) if d)
    return {"total": len(rows),
            "fatal_crashes": sum(n > 0 for n in fatalities) if None not in fatalities else None,
            "injury_crashes": sum(n > 0 for n in injuries) if None not in injuries else None,
            "fatalities": sum(fatalities) if None not in fatalities else None,
            "injuries": sum(injuries) if None not in injuries else None,
            "tow": sum(r.get("tow_away") in ("Y", "true") for r in rows),
            "first": dates[0] if dates else None, "last": dates[-1] if dates else None,
            "undated_records": len(rows) - len(dates)}


def main():
    census = json.loads((RAW / "census.json").read_text())
    sms = {r["dot_number"]: r for r in json.loads((RAW / "sms.json").read_text())}
    ins, crashes = defaultdict(list), defaultdict(list)
    for r in json.loads((RAW / "insurance.json").read_text()):
        ins[r["usdot_number"]].append(r)
    for r in json.loads((RAW / "crashes.json").read_text()):
        crashes[r["dot_number"]].append(r)
    national = json.loads((RAW / "national.json").read_text())

    out = []
    for c in census:
        d = c["dot_number"]
        s = sms.get(d, {})
        rec = {
            "schema_version": 2, "dot": int(d), "name": c["legal_name"].strip(), "dba": (c.get("dba_name") or "").strip() or None,
            "slug": slugify(c["legal_name"]), "street": c.get("phy_street"), "city": (c.get("phy_city") or "").title(), "state": c.get("phy_state"), "zip": (c.get("phy_zip") or "")[:5],
            "pu": num(c.get("power_units")), "drivers": num(c.get("total_drivers")), "hm": c.get("hm_ind") == "Y", "status": c.get("status_code"), "operation": c.get("carrier_operation"),
            "classdef": c.get("classdef"), "mc": f"{c['docket1prefix']}-{c['docket1']}" if c.get("docket1prefix") and c.get("docket1") else None,
            "mc_status": c.get("docket1_status_code"), "mcs150_date": ymd(c.get("mcs150_date")), "mileage": num(c.get("mcs150_mileage")),
            "mileage_year": c.get("mcs150_mileage_year"), "since": ymd(c.get("add_date")),
            "cargo": [CARGO[k] for k in CARGO if c.get(k) == "X"],
            "insp": nullable_count(s.get("insp_total")), "driver_insp": nullable_count(s.get("driver_insp_total")), "driver_oos": nullable_count(s.get("driver_oos_insp_total")),
            "vehicle_insp": nullable_count(s.get("vehicle_insp_total")), "vehicle_oos": nullable_count(s.get("vehicle_oos_insp_total")),
            "basics": [{"key": k, "label": lbl, "viol": num(s.get(f"{k}_insp_w_viol")), "measure": num(s.get(f"{k}_measure"), float), "ac": ac_flag(s.get(f"{k}_ac"))} for k, lbl in BASICS],
        }
        rec["driver_oos_rate"] = rnd(100 * rec["driver_oos"] / rec["driver_insp"], 1) if rec["driver_insp"] and rec["driver_oos"] is not None else None
        rec["vehicle_oos_rate"] = rnd(100 * rec["vehicle_oos"] / rec["vehicle_insp"], 1) if rec["vehicle_insp"] and rec["vehicle_oos"] is not None else None
        # latest filing per insurance type: 1 = BIPD liability (BMC-91/91X), 2 = cargo (BMC-34), 3 = bond/trust (BMC-84/85)
        latest = {}
        for r in sorted(ins.get(d, []), key=lambda r: (r.get("effective_date") or "", r.get("trans_date") or "")):
            latest[r.get("ins_type_code")] = r
        rec["insurance"] = [{"type": {"1": "Liability (BIPD)", "2": "Cargo", "3": "Bond / trust fund"}.get(t, t), "form": r.get("ins_form_code"),
                             "amount": num(r.get("max_cov_amount"), float), "company": (r.get("insurance_company_name") or "").strip().title(), "effective": ymd(r.get("effective_date"))}
                            for t, r in sorted(latest.items())]
        rec["crashes"] = summarize_crashes(crashes.get(d, []))
        out.append(rec)
    for rec, view in zip(out, assess_many(out, national)):
        rec["grade"] = view["grade"]
    out.sort(key=lambda r: (-r["pu"], r["name"]))
    (ROOT / "data/carriers.json").write_text(json.dumps(out, separators=(",", ":")))
    (ROOT / "data/national.json").write_text(json.dumps({"driver_oos_rate": national["driver_oos_rate"], "vehicle_oos_rate": national["vehicle_oos_rate"],
                                                         "sms_updated": national["sms_updated"], "carriers_in_sms": int(national["n"]), "sources": national.get("sources", {})}, indent=1))
    from collections import Counter
    print(len(out), "carriers", Counter(r["grade"]["letter"] for r in out), "national", national["driver_oos_rate"], national["vehicle_oos_rate"])


if __name__ == "__main__":
    main()
