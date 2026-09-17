// DOT Report Card grade from public FMCSA data. Mirror of scripts/grading.py — change both, then run scripts/test_grade.mjs.
(function (root) {
  const MIN_INSP = 5;
  const money = n => "$" + Math.round(n).toLocaleString("en-US");
  const f1 = x => x.toFixed(1), f2 = x => { const s = String(Math.round(x * 100) / 100); return s.includes(".") ? s : s + ".0"; };  // match Python repr of round(x, 1/2)
  function grade(c, nat) {
    let score = 100; const factors = [];
    const add = (key, label, points, note) => { score += points; factors.push({ key, label, points, note }); };

    if (c.driver_insp >= MIN_INSP && c.driver_oos_rate != null) {
      const r = f1(c.driver_oos_rate), n = nat.driver_oos_rate;
      if (r >= 2 * n) add("driver_oos", "Driver out-of-service rate", -25, `${r}% vs ${n}% national — more than double`);
      else if (r > n) add("driver_oos", "Driver out-of-service rate", -10, `${r}% vs ${n}% national — above average`);
      else add("driver_oos", "Driver out-of-service rate", 0, `${r}% vs ${n}% national — at or below average`);
    } else add("driver_oos", "Driver out-of-service rate", 0, "not enough inspections to judge");

    if (c.vehicle_insp >= MIN_INSP && c.vehicle_oos_rate != null) {
      const r = f1(c.vehicle_oos_rate), n = nat.vehicle_oos_rate;
      if (r >= 1.5 * n) add("vehicle_oos", "Vehicle out-of-service rate", -25, `${r}% vs ${n}% national — 1.5× or worse`);
      else if (r > n) add("vehicle_oos", "Vehicle out-of-service rate", -10, `${r}% vs ${n}% national — above average`);
      else add("vehicle_oos", "Vehicle out-of-service rate", 0, `${r}% vs ${n}% national — at or below average`);
    } else add("vehicle_oos", "Vehicle out-of-service rate", 0, "not enough inspections to judge");

    const alerts = c.basics.filter(b => b.alert).map(b => b.label);
    add("basics", "BASIC alerts", -15 * alerts.length, alerts.length ? alerts.join(", ") : "no BASIC alert flags in the public SMS file");

    const cr = c.crashes;
    const per100 = c.pu ? Math.round(1000 * cr.total / c.pu) / 10 : null, p1 = per100 != null ? f1(per100) : null;
    const fatal100 = c.pu ? Math.round(10000 * cr.fatal / c.pu) / 100 : null;
    if (cr.fatal && (fatal100 == null || fatal100 >= 0.5)) add("crashes", "Crashes (24 months)", -20, `${cr.total} reported, ${cr.fatal} fatal` + (fatal100 != null ? ` = ${f2(fatal100)} fatal per 100 power units` : ""));
    else {
      const note = `${cr.total} reported` + (cr.fatal ? `, ${cr.fatal} fatal` : "") + (per100 != null && cr.total ? ` = ${p1} per 100 power units` : "");
      add("crashes", "Crashes (24 months)", per100 != null && per100 > 8 ? -15 : per100 != null && per100 > 4 ? -5 : 0, note);
    }

    if (c.status && c.status !== "A") add("authority", "Registration status", -40, "USDOT number is inactive — the carrier may not operate");
    else if (c.mc && c.mc_status !== "A") add("authority", "Operating authority", -20, `${c.mc} is not active`);
    else add("authority", "Operating authority", 0, c.mc ? `${c.mc} active` : "no MC docket on file (private / exempt carrier)");

    // informational only: FMCSA's open-data insurance extract covers a fraction of carriers, so absence is not evidence of a lapse
    const liab = c.insurance.filter(i => i.type === "Liability (BIPD)");
    add("insurance", "Liability insurance filing", 0, liab.length ? `${money(liab[0].amount)} with ${liab[0].company}` : "not in the open-data extract — verify on FMCSA L&I");

    score = Math.max(0, Math.min(100, score));
    const letter = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
    return { score, letter, limited: c.insp < MIN_INSP, factors };
  }
  root.dotGrade = grade;
})(typeof module !== "undefined" ? module.exports : window);
