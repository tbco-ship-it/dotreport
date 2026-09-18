// dotreport-api: read-only proxy over FMCSA open data on data.transportation.gov (Socrata, no key needed).
// GET /carrier?dot=54283            -> one normalized carrier record (same shape as data/carriers.json, minus "grade")
// GET /search?q=swift+trans         -> up to 8 {dot,name,dba,city,state,pu,status} matches by name, DOT or MC number
// The record is normalized here (mirror of scripts/normalize.py); grading happens in the browser with static/grade.js.
const S = "https://data.transportation.gov/resource";
const ORIGINS = new Set(["https://dotreportcard.com", "https://www.dotreportcard.com", "https://tbco-ship-it.github.io", "http://localhost:8000"]);
const CENSUS_COLS = "dot_number,legal_name,dba_name,phy_street,phy_city,phy_state,phy_zip,power_units,total_drivers,status_code,carrier_operation,classdef,docket1prefix,docket1,docket1_status_code,mcs150_date,mcs150_mileage,mcs150_mileage_year,hm_ind,add_date,"
  + Object.keys(CARGO()).join(",");
const BASICS = [["unsafe_driv", "Unsafe Driving"], ["hos_driv", "Hours-of-Service Compliance"], ["driv_fit", "Driver Fitness"], ["contr_subst", "Controlled Substances / Alcohol"], ["veh_maint", "Vehicle Maintenance"]];
const MON = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };

function CARGO() {
  return { crgo_genfreight: "General freight", crgo_household: "Household goods", crgo_metalsheet: "Metal: sheets, coils, rolls", crgo_motoveh: "Motor vehicles", crgo_drivetow: "Drive away / tow away", crgo_logpole: "Logs, poles, beams, lumber", crgo_bldgmat: "Building materials", crgo_mobilehome: "Mobile homes", crgo_machlrg: "Machinery, large objects", crgo_produce: "Fresh produce", crgo_liqgas: "Liquids / gases", crgo_intermodal: "Intermodal containers", crgo_passengers: "Passengers", crgo_oilfield: "Oilfield equipment", crgo_livestock: "Livestock", crgo_grainfeed: "Grain, feed, hay", crgo_coalcoke: "Coal / coke", crgo_meat: "Meat", crgo_garbage: "Garbage, refuse", crgo_usmail: "US mail", crgo_chem: "Chemicals", crgo_coldfood: "Commodities requiring temperature control", crgo_beverages: "Beverages", crgo_paperprod: "Paper products", crgo_utility: "Utility", crgo_farmsupp: "Farm supplies", crgo_construct: "Construction", crgo_waterwell: "Water well", crgo_cargoothr: "Other" };
}
const cors = (req) => { const o = req.headers.get("Origin") || ""; return { "Access-Control-Allow-Origin": ORIGINS.has(o) ? o : "https://dotreportcard.com", "Vary": "Origin", "Access-Control-Allow-Methods": "GET", "Cache-Control": "public, max-age=600", "content-type": "application/json; charset=utf-8" }; };
const json = (obj, h, status = 200) => new Response(JSON.stringify(obj), { status, headers: h });
const count = x => x !== null && x !== undefined && x !== "" && Number.isInteger(Number(x)) && Number(x) >= 0 ? Number(x) : null;
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const ymd = (s) => (s && s.length === 8) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
const crashDate = (s) => { const m = /^(\d{2})-([A-Z]{3})-(\d{2})$/.exec(s || ""); return m && MON[m[2]] ? `20${m[3]}-${MON[m[2]]}-${m[1]}` : null; };
const title = (s) => (s || "").trim().toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function soda(ds, params) {
  const u = new URL(`${S}/${ds}.json`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { "User-Agent": "dotreportcard/1.0 (+https://dotreportcard.com)", "Accept": "application/json" }, signal: AbortSignal.timeout(15000), cf: { cacheTtl: 600, cacheEverything: true } });
  if (!r.ok) throw new Error(`upstream ${ds} ${r.status}`);
  return r.json();
}

export function normalize(c, s, ins, cr) {
  const cargo = CARGO();
  const rec = {
    schema_version: 2, retrieved_at: new Date().toISOString(),
    dot: Number(c.dot_number), name: c.legal_name.trim(), dba: (c.dba_name || "").trim() || null, slug: slug(c.legal_name),
    street: c.phy_street, city: title(c.phy_city), state: c.phy_state, zip: (c.phy_zip || "").slice(0, 5),
    pu: num(c.power_units), drivers: num(c.total_drivers), hm: c.hm_ind === "Y", classdef: c.classdef,
    mc: c.docket1prefix && c.docket1 ? `${c.docket1prefix}-${c.docket1}` : null, mc_status: c.docket1_status_code,
    mcs150_date: ymd(c.mcs150_date), mileage: num(c.mcs150_mileage), mileage_year: c.mcs150_mileage_year, since: ymd(c.add_date),
    status: c.status_code, operation: c.carrier_operation,
    cargo: Object.keys(cargo).filter(k => c[k] === "X").map(k => cargo[k]),
    insp: count(s.insp_total), driver_insp: count(s.driver_insp_total), driver_oos: count(s.driver_oos_insp_total),
    vehicle_insp: count(s.vehicle_insp_total), vehicle_oos: count(s.vehicle_oos_insp_total),
    basics: BASICS.map(([k, label]) => ({ key: k, label, viol: num(s[`${k}_insp_w_viol`]), measure: num(s[`${k}_measure`]), ac: s[`${k}_ac`] === "Y" ? true : s[`${k}_ac`] === "N" ? false : null })),
  };
  rec.driver_oos_rate = rec.driver_insp && rec.driver_oos !== null ? Math.round(1000 * rec.driver_oos / rec.driver_insp) / 10 : null;
  rec.vehicle_oos_rate = rec.vehicle_insp && rec.vehicle_oos !== null ? Math.round(1000 * rec.vehicle_oos / rec.vehicle_insp) / 10 : null;
  const latest = {};
  for (const r of ins.sort((a, b) => ((a.effective_date || "") + (a.trans_date || "")).localeCompare((b.effective_date || "") + (b.trans_date || "")))) latest[r.ins_type_code] = r;
  const TYPE = { "1": "Liability (BIPD)", "2": "Cargo", "3": "Bond / trust fund" };
  rec.insurance = Object.keys(latest).sort().map(t => ({ type: TYPE[t] || t, form: latest[t].ins_form_code, amount: num(latest[t].max_cov_amount), company: title(latest[t].insurance_company_name), effective: ymd(latest[t].effective_date) }));
  const dates = cr.map(r => crashDate(r.report_date)).filter(Boolean).sort();
  const deaths = cr.map(r => count(r.fatalities)), injured = cr.map(r => count(r.injuries));
  rec.crashes = { total: cr.length,
    fatal_crashes: deaths.includes(null) ? null : deaths.filter(n => n > 0).length,
    injury_crashes: injured.includes(null) ? null : injured.filter(n => n > 0).length,
    fatalities: deaths.includes(null) ? null : deaths.reduce((a, n) => a + n, 0),
    injuries: injured.includes(null) ? null : injured.reduce((a, n) => a + n, 0),
    tow: cr.filter(r => r.tow_away === "Y" || r.tow_away === "true").length,
    first: dates[0] || null, last: dates[dates.length - 1] || null, undated_records: cr.length - dates.length };

  return rec;
}

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const h = cors(req);
    if (req.method === "OPTIONS") return new Response(null, { headers: h });
    try {
      if (url.pathname === "/carrier") {
        const dot = url.searchParams.get("dot") || "";
        if (!/^\d{1,8}$/.test(dot)) return json({ error: "bad dot" }, h, 400);
        const [census, sms, ins, cr] = await Promise.all([
          soda("az4n-8mr2", { dot_number: dot, "$select": CENSUS_COLS, "$limit": 1 }),
          soda("4y6x-dmck", { dot_number: dot, "$limit": 1 }),
          soda("c5y8-a4uz", { usdot_number: dot, "$select": "ins_type_code,ins_form_code,max_cov_amount,effective_date,insurance_company_name,trans_date", "$limit": 500 }),
          soda("4wxs-vbns", { dot_number: dot, "$select": "report_date,fatalities,injuries,tow_away", "$limit": 5000 }),
        ]);
        if (ins.length >= 500 || cr.length >= 5000) throw new Error("extract limit reached; incomplete results are not scored");
        if (!census.length) return json({ error: "not found" }, h, 404);
        return json(normalize(census[0], sms[0] || {}, ins, cr), h);
      }
      if (url.pathname === "/search") {
        const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
        if (q.length < 2) return json([], h);
        const m = /^(?:(MC|FF|MX)[-\s]?)?(\d{2,8})$/i.exec(q);
        const sel = "dot_number,legal_name,dba_name,phy_city,phy_state,power_units,status_code";
        let rows;
        if (m && m[1]) rows = await soda("az4n-8mr2", { "$where": `docket1prefix='${m[1].toUpperCase()}' AND docket1='${m[2]}'`, "$select": sel, "$limit": 8 });
        else if (m) rows = await soda("az4n-8mr2", { "$where": `dot_number='${m[2]}'`, "$select": sel, "$order": "dot_number", "$limit": 8 });
        else {
          const up = q.toUpperCase().replace(/'/g, "''");
          rows = await soda("az4n-8mr2", { "$where": `starts_with(upper(legal_name),'${up}') OR starts_with(upper(dba_name),'${up}')`, "$select": sel, "$order": "status_code,power_units::number DESC", "$limit": 8 });
        }
        return json(rows.map(r => ({ dot: Number(r.dot_number), name: r.legal_name.trim(), dba: (r.dba_name || "").trim() || null, city: title(r.phy_city), state: r.phy_state, pu: num(r.power_units), status: r.status_code })), h);
      }
      return json({ error: "not found" }, h, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, { ...h, "Cache-Control": "no-store" }, 502);
    }
  },
};
