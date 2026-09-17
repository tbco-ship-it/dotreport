#!/usr/bin/env python3
"""Pull the static carrier set from FMCSA open data (data.transportation.gov, Socrata, no key needed).

Census (az4n-8mr2): active interstate carriers with >= MIN_PU power units -> data/raw/census.json
SMS BASICs (4y6x-dmck), insurance (c5y8-a4uz), crashes (4wxs-vbns) for those DOT numbers -> data/raw/*.json
National OOS averages computed from the whole SMS file -> data/raw/national.json
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw"
S = "https://data.transportation.gov/resource"
MIN_PU = int(sys.argv[1]) if len(sys.argv) > 1 else 50
CENSUS_COLS = ("dot_number,legal_name,dba_name,phy_street,phy_city,phy_state,phy_zip,phone,power_units,total_drivers,status_code,"
               "carrier_operation,classdef,docket1prefix,docket1,docket1_status_code,mcs150_date,mcs150_mileage,mcs150_mileage_year,hm_ind,add_date,"
               "crgo_genfreight,crgo_household,crgo_metalsheet,crgo_motoveh,crgo_drivetow,crgo_logpole,crgo_bldgmat,crgo_mobilehome,crgo_machlrg,"
               "crgo_produce,crgo_liqgas,crgo_intermodal,crgo_passengers,crgo_oilfield,crgo_livestock,crgo_grainfeed,crgo_coalcoke,crgo_meat,"
               "crgo_garbage,crgo_usmail,crgo_chem,crgo_coldfood,crgo_beverages,crgo_paperprod,crgo_utility,crgo_farmsupp,crgo_construct,crgo_waterwell,crgo_cargoothr")


def get(ds, params, tries=4):
    url = f"{S}/{ds}.json?" + urllib.parse.urlencode(params)
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "dotreport/1.0"}), timeout=120) as r:
                return json.load(r)
        except Exception as e:  # Socrata throttles anonymous callers; back off and retry
            if i == tries - 1:
                raise
            print("retry", ds, e, file=sys.stderr)
            time.sleep(3 * (i + 1))


def page(ds, where, select=None, order="dot_number", limit=5000):
    out, off = [], 0
    while True:
        p = {"$where": where, "$order": order, "$limit": limit, "$offset": off}
        if select:
            p["$select"] = select
        rows = get(ds, p)
        out += rows
        print(ds, len(out), file=sys.stderr)
        if len(rows) < limit:
            return out
        off += limit


def by_dots(ds, dots, col, select=None, chunk=400):
    out = []
    for i in range(0, len(dots), chunk):
        ids = ",".join(f"'{d}'" for d in dots[i:i + chunk])
        out += page(ds, f"{col} in({ids})", select=select, order=col, limit=5000)
    return out


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    if not (RAW / "census.json").exists():  # each stage is resumable: delete the raw file to refetch it
        (RAW / "census.json").write_text(json.dumps(page("az4n-8mr2", f"status_code='A' AND carrier_operation='A' AND power_units::number>={MIN_PU}", select=CENSUS_COLS)))
    census = json.loads((RAW / "census.json").read_text())
    dots = sorted({r["dot_number"] for r in census}, key=int)
    print("census", len(dots), file=sys.stderr)

    if not (RAW / "sms.json").exists():
        (RAW / "sms.json").write_text(json.dumps(by_dots("4y6x-dmck", dots, "dot_number")))
    if not (RAW / "insurance.json").exists():
        (RAW / "insurance.json").write_text(json.dumps(by_dots("c5y8-a4uz", dots, "usdot_number",
                                                              select="usdot_number,docket_number,ins_form_code,ins_type_code,max_cov_amount,effective_date,insurance_company_name,trans_date")))
    if not (RAW / "crashes.json").exists():
        (RAW / "crashes.json").write_text(json.dumps(by_dots("4wxs-vbns", dots, "dot_number",
                                                            select="dot_number,report_date,report_state,fatalities,injuries,tow_away,hazmat_released")))
    nat = get("4y6x-dmck", {"$select": "sum(driver_oos_insp_total::number) as doos,sum(driver_insp_total::number) as dins,"
                                       "sum(vehicle_oos_insp_total::number) as voos,sum(vehicle_insp_total::number) as vins,count(*) as n"})[0]
    meta = json.load(urllib.request.urlopen("https://data.transportation.gov/api/views/4y6x-dmck.json", timeout=60))
    nat["sms_updated"] = time.strftime("%Y-%m-%d", time.gmtime(meta["rowsUpdatedAt"]))
    nat["driver_oos_rate"] = round(100 * int(nat["doos"]) / int(nat["dins"]), 2)
    nat["vehicle_oos_rate"] = round(100 * int(nat["voos"]) / int(nat["vins"]), 2)
    (RAW / "national.json").write_text(json.dumps(nat, indent=1))
    print("done", nat, file=sys.stderr)


if __name__ == "__main__":
    main()
