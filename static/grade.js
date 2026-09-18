// Independent screening index v2.0.0. Exact mirror: scripts/grading.py.
(function (root) {
  const MIN_INSP = 5;
  const number = x => typeof x === 'number' && Number.isFinite(x);
  const validRate = (r, count) => number(count) && count >= MIN_INSP && number(r) && r >= 0 && r <= 100;
  function grade(c, nat) {
    let score = 100;
    const factors = [], missing = [];
    const add = (key, label, points, note) => { score += points; factors.push({key, label, points, note}); };
    for (const [key, label, multiple] of [['driver','Driver',2], ['vehicle','Vehicle',1.5]]) {
      const r = c[key + '_oos_rate'], n = nat[key + '_oos_rate'], count = c[key + '_insp'];
      const valid = validRate(r, count) && number(n) && n > 0 && n <= 100;
      let points = 0, note = 'Unavailable or fewer than 5 category inspections; not a passing result';
      if (valid) {
        points = r >= multiple*n ? -25 : r > n ? -10 : 0;
        note = `${r.toFixed(1)}% vs ${n.toFixed(2)}% benchmark; ${count} inspections`;
      } else missing.push(key + '_inspections_or_benchmark');
      add(key + '_oos', label + ' out-of-service rate', points, note);
    }
    add('basics','Public SMS indicators',0,'Informational only; public investigation flags are not complete BASIC alerts');
    const cr = c.crashes || {}, deaths = Object.hasOwn(cr, 'fatalities') ? cr.fatalities : cr.fatal;
    const total = cr.total, pu = c.pu;
    if (!(number(total) && total >= 0 && number(deaths) && deaths >= 0 && number(pu) && pu > 0)) {
      missing.push('crash_counts_or_fleet');
      add('crashes','Crash involvement and fatalities',0,'Insufficient crash or fleet data; not a zero-crash result');
    } else {
      const per100 = Math.round(1000*total/pu)/10, deaths100 = Math.round(10000*deaths/pu)/100;
      const points = deaths > 0 && deaths100 >= 0.5 ? -20 : per100 > 8 ? -15 : per100 > 4 ? -5 : 0;
      add('crashes','Crash involvement and fatalities',points,
        `${total} crash records; ${deaths} fatalities (people); ${per100.toFixed(1)} records and ${deaths100.toFixed(2)} fatalities per 100 power units; fault not determined`);
    }
    const status = c.status;
    if (!['A','I'].includes(status)) missing.push('registration_status');
    add('registration','USDOT registration',status === 'I' ? -40 : 0,
      status === 'I' ? 'Inactive in census extract; verify official record' : status === 'A' ? 'Active in census extract; not proof of for-hire authority' : 'Registration status unconfirmed');
    add('authority','Operating authority',0,'Not verified; a USDOT status or MC docket is not a current authority check');
    add('insurance','Liability insurance',0,'Not verified; historical filings or missing extract rows do not establish current coverage');
    const limited = missing.length > 0;
    score = Math.max(0, Math.min(100, score));
    const letter = limited ? 'NR' : score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
    return {score: limited ? null : score, letter, limited, missing, version:'2.0.0', factors};
  }
  root.dotGrade = grade;
})(typeof module !== 'undefined' ? module.exports : window);
