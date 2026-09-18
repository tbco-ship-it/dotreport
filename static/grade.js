// Canonical screening policy used by both the browser and the Python build bridge.
// Policy 2.0.0: missing evidence is not a clean record or dispatch approval.
(function (root) {
  'use strict';
  const VERSION = '2.0.0', MIN_INSP = 5;
  const numeric = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  const round = (x, p = 1) => Math.round(x * 10 ** p) / 10 ** p;
  function metric(c, nat, kind) {
    const count = c[kind + '_insp'], oos = c[kind + '_oos'], benchmark = nat[kind + '_oos_rate'];
    const rate = numeric(count) && count > 0 && numeric(oos) && oos <= count ? round(100 * oos / count) : null;
    const sufficient = rate !== null && count >= MIN_INSP && numeric(benchmark) && benchmark > 0;
    return { rate, count: numeric(count) ? count : null, sufficient,
      label: rate === null ? 'Unknown' : !sufficient ? 'Limited sample' : rate > benchmark ? 'Above average' : rate === benchmark ? 'At average' : 'Below average',
      tone: !sufficient ? 'neutral' : rate > benchmark ? 'bad' : 'good' };
  }
  function dotAssess(c, nat) {
    const driver = metric(c, nat, 'driver'), vehicle = metric(c, nat, 'vehicle');
    const legacy = c.schema_version !== 2;
    const basics = (c.basics || []).map(b => ({ ...b,
      ac: legacy ? (b.alert === true ? true : null) : (typeof b.ac === 'boolean' ? b.ac : null),
      indicatorLabel: legacy ? (b.alert === true ? 'Indicated in extract' : 'Not indicated in legacy extract') : b.ac === true ? 'Indicated in extract' : b.ac === false ? 'Not indicated in extract' : 'Unknown'
    }));
    const indicated = basics.filter(b => b.ac === true).length;
    const knownIndicators = basics.filter(b => typeof b.ac === 'boolean').length;
    const raw = c.crashes || {}, total = numeric(raw.total) ? raw.total : null;
    const fatalities = legacy ? (numeric(raw.fatal) ? raw.fatal : null) : (numeric(raw.fatalities) ? raw.fatalities : null);
    const injuries = legacy ? (numeric(raw.injury) ? raw.injury : null) : (numeric(raw.injuries) ? raw.injuries : null);
    // A positive person count cannot reconstruct the number of fatal/injury events.
    const fatalCrashes = !legacy && numeric(raw.fatal_crashes) ? raw.fatal_crashes : total === 0 || fatalities === 0 ? 0 : null;
    const injuryCrashes = !legacy && numeric(raw.injury_crashes) ? raw.injury_crashes : total === 0 || injuries === 0 ? 0 : null;
    const crashes = { total, fatalities, injuries, fatal_crashes: fatalCrashes, injury_crashes: injuryCrashes,
      tow: numeric(raw.tow) ? raw.tow : null, first: raw.first || null, last: raw.last || null };
    const liab = (c.insurance || []).filter(i => i.type === 'Liability (BIPD)' && ['91', '91X', 'BMC-91', 'BMC-91X'].includes(String(i.form).toUpperCase()));
    const registration = c.status === 'A' ? 'Active in extract' : c.status === 'I' ? 'Inactive in extract' : 'Unknown';
    const authority = !c.mc ? 'No docket located' : c.mc_status === 'A' ? 'Active in extract' : c.mc_status === 'I' ? 'Inactive in extract' : 'Unknown';
    const factors = []; let points = 100;
    const add = (key, label, deduction, note) => { points += deduction; factors.push({ key, label, points: deduction, note }); };
    for (const [kind, m, multiple] of [['driver', driver, 2], ['vehicle', vehicle, 1.5]]) {
      const n = nat[kind + '_oos_rate'];
      add(kind + '_oos', (kind === 'driver' ? 'Driver' : 'Vehicle') + ' out-of-service rate',
        !m.sufficient ? 0 : m.rate >= multiple * n ? -25 : m.rate > n ? -10 : 0,
        !m.sufficient ? 'Not enough valid inspections or benchmark data to judge' : `${m.rate}% vs ${n}% benchmark; ${m.label.toLowerCase()}`);
    }
    add('basics', 'Public acute/critical indicators', -15 * indicated,
      `${indicated} indicated; ${knownIndicators}/${basics.length} explicit indicator values. Not a complete SMS alert assessment.`);
    const per100 = total !== null && numeric(c.pu) && c.pu > 0 ? round(100 * total / c.pu) : null;
    const fatal100 = fatalCrashes !== null && numeric(c.pu) && c.pu > 0 ? round(100 * fatalCrashes / c.pu, 2) : null;
    add('crashes', 'Crash records in source extract',
      fatalCrashes === null || per100 === null ? 0 : fatalCrashes > 0 && fatal100 >= 0.5 ? -20 : per100 > 8 ? -15 : per100 > 4 ? -5 : 0,
      fatalCrashes === null ? 'Fatal crash count unavailable; person counts are not substituted' : per100 === null ? 'Crash count or fleet denominator unavailable' : `${total} records; ${fatalCrashes} fatal crash records; ${per100} records per 100 power units. Fault not assigned.`);
    add('authority', 'Registration / docket record', c.status === 'I' ? -40 : c.mc && c.mc_status === 'I' ? -20 : 0,
      `USDOT: ${registration}. Docket: ${authority}. Verify current authority in L&I.`);
    add('insurance', 'Liability filing (informational)', 0,
      liab.length ? 'BMC-91/91X filing located; active coverage and limits are not verified' : 'No BMC-91/91X filing located in this extract; this is not proof of no insurance');
    const reasons = [];
    if (!driver.sufficient) reasons.push('Driver inspection sample or benchmark is insufficient.');
    if (!vehicle.sufficient) reasons.push('Vehicle inspection sample or benchmark is insufficient.');
    if (fatalCrashes === null || total === null || per100 === null) reasons.push('Crash event count or fleet denominator is unavailable.');
    if (!['A', 'I'].includes(c.status)) reasons.push('USDOT registration status is unknown.');
    if (c.mc && !['A', 'I'].includes(c.mc_status)) reasons.push('Docket status is unknown.');
    if (!legacy && (basics.length !== 5 || basics.some(b => b.ac === null))) reasons.push('One or more public acute/critical indicator values are unavailable.');
    const limited = reasons.length > 0, score = limited ? null : Math.max(0, Math.min(100, points));
    const letter = limited ? 'NR' : score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
    const grade = { version: VERSION, score, letter, limited, reasons, factors };
    const checks = [
      { label: 'USDOT registration', value: registration, note: 'Registration is not for-hire authority', tone: c.status === 'A' ? 'good' : c.status === 'I' ? 'bad' : 'neutral' },
      { label: 'Operating authority', value: authority, note: c.mc ? `${c.mc}: verify current status and scope in L&I` : 'May be private / exempt; applicability not determined', tone: c.mc_status === 'I' ? 'bad' : 'neutral' },
      { label: 'Liability filing', value: liab.length ? 'Filing located' : 'Unconfirmed', note: 'Active coverage not verified; check L&I and insurer', tone: 'neutral' },
      { label: 'Public A/C indicators', value: `${indicated} indicated`, note: `${knownIndicators}/${basics.length} explicit values; not all SMS alerts are public`, tone: indicated ? 'warn' : 'neutral' },
      { label: 'Vehicle OOS', value: vehicle.label, note: vehicle.rate === null ? 'No valid rate available' : `${vehicle.rate}% from ${vehicle.count} inspections`, tone: vehicle.tone }
    ];
    const issues = driver.label === 'Above average' || vehicle.label === 'Above average' || indicated || c.status === 'I' || c.mc_status === 'I';
    return { grade, driver, vehicle, basics, crashes, checks, liabilityFiled: liab.length > 0,
      heading: limited ? 'Not rated — Insufficient evidence' : issues ? 'Review the flagged public records' : 'Independent screening summary',
      message: (limited ? reasons.join(' ') + ' ' : `Driver OOS: ${driver.label.toLowerCase()}. Vehicle OOS: ${vehicle.label.toLowerCase()}. `) +
        'Current operating authority and insurance coverage must be verified separately. This report is not dispatch approval.',
      legacyNote: legacy ? 'Legacy extract: absent and negative A/C flags were previously combined. Exact positive fatal/injury event counts cannot be reconstructed from person totals.' : '' };
  }
  root.dotAssess = dotAssess;
  root.dotGrade = (c, nat) => dotAssess(c, nat).grade;
})(typeof module !== 'undefined' ? module.exports : window);
