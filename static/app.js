// High-Trust Enterprise B2B Safety Report Card — Client-side search, grading & dynamic rendering.
// Keeps 100% parity with templates/_report.html
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const q = $('#q'), go = $('#go'), msg = $('#msg'), out = $('#result'), field = q && q.closest('.field');

  // Global toast & copy handler for both static & live pages
  window.notify = function (text) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
  };

  window.copyReportLink = async function (btn) {
    try {
      await navigator.clipboard.writeText(location.href);
      window.notify('Safety report link copied to clipboard');
    } catch (e) {
      window.notify('Please copy URL from browser address bar');
    }
  };

  if (!q) return;

  const NAT = window.NAT || { driver_oos_rate: 5.42, vehicle_oos_rate: 21.47, sms_updated: '2026-09-13' };
  const P = window.PARTNERS || {};
  const API = window.API || 'https://dotreport-api.tbfcompany1.workers.dev';
  const BASE = window.BASE || '/';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const n = x => Number(x || 0).toLocaleString('en-US');
  const money = x => '$' + Math.round(x).toLocaleString('en-US');
  const title = s => (s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const UPPER = new Set(['LLC', 'LP', 'LLP', 'USA', 'DBA', 'II', 'III', 'IV']);
  const cname = s => (s || '').split(/\s+/).map(w => UPPER.has(w) || (w.length <= 2 && /^[A-Z]+$/.test(w)) ? w : title(w)).join(' ');

  let menu, items = [], sel = -1, timer, staticIndex;

  function leaveLanding() {
    const html = document.documentElement;
    if (!html.classList.contains('landing')) return;
    const stage = $('#stage');
    const hero = stage ? stage.firstElementChild : null;
    const y0 = hero ? hero.getBoundingClientRect().top : 0;
    html.classList.remove('landing');
    const dy = hero ? y0 - hero.getBoundingClientRect().top : 0;
    if (dy > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches && stage) {
      stage.style.transition = 'none';
      stage.style.transform = `translateY(${dy}px)`;
      void stage.offsetHeight;
      stage.style.transition = 'transform 0.85s cubic-bezier(.16,1,.3,1)';
      stage.style.transform = 'translateY(0)';
      stage.addEventListener('transitionend', () => {
        stage.style.transition = '';
        stage.style.transform = '';
      }, { once: true });
    }
    if (window.__reveal) window.__reveal($('#more'), true, 400);
  }

  document.addEventListener('click', e => {
    const a = e.target.closest('a[href*="#"]');
    if (!a || a.origin !== location.origin || a.pathname !== location.pathname) return;
    const t = document.getElementById(a.hash.slice(1));
    if (t && t.closest('#more')) leaveLanding();
  });

  function say(t) {
    if (!msg) return;
    msg.textContent = t || '';
    msg.hidden = !t;
  }

  function closeMenu() {
    if (menu) { menu.remove(); menu = null; }
    items = [];
    sel = -1;
    q.removeAttribute('aria-activedescendant');
  }

  function openMenu(rows) {
    closeMenu();
    menu = document.createElement('ul');
    menu.className = 'menu';
    menu.id = 'menu';
    menu.setAttribute('role', 'listbox');
    if (!rows.length) {
      menu.innerHTML = '<li class="empty">No carrier found. Try the exact USDOT number from cab card or MCS-150.</li>';
      field.appendChild(menu);
      return;
    }
    items = rows;
    menu.innerHTML = rows.map((r, i) =>
      `<li role="option" id="opt${i}"><b>${esc(cname(r.name))}${r.dba ? ' <span>(' + esc(cname(r.dba)) + ')</span>' : ''}</b><span>USDOT ${r.dot} · ${esc(r.city)}, ${esc(r.state)}${r.status !== 'A' ? ' · inactive' : ''}</span></li>`
    ).join('');
    menu.addEventListener('mousedown', e => {
      const li = e.target.closest('li[role=option]');
      if (li) {
        e.preventDefault();
        pick(rows[+li.id.slice(3)]);
      }
    });
    field.appendChild(menu);
  }

  function highlight(i) {
    sel = i;
    if (!menu) return;
    menu.querySelectorAll('li[role=option]').forEach((li, k) => li.setAttribute('aria-selected', k === i));
    if (i >= 0) q.setAttribute('aria-activedescendant', 'opt' + i);
  }

  function pick(r) {
    q.value = String(r.dot);
    closeMenu();
    load(r.dot);
  }

  async function suggest() {
    const v = q.value.trim();
    if (v.length < 2 || /^\d+$/.test(v)) { closeMenu(); return; }
    try {
      const r = await fetch(`${API}/search?q=${encodeURIComponent(v)}`);
      if (q.value.trim() !== v) return;
      openMenu(r.ok ? await r.json() : []);
    } catch (e) {
      closeMenu();
    }
  }

  q.addEventListener('input', () => {
    clearTimeout(timer);
    say('');
    timer = setTimeout(suggest, 220);
  });

  q.addEventListener('keydown', e => {
    if (menu && items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight(Math.min(sel + 1, items.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); highlight(Math.max(sel - 1, 0)); return; }
      if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); pick(items[sel]); return; }
      if (e.key === 'Escape') { closeMenu(); return; }
    }
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });

  q.addEventListener('blur', () => setTimeout(closeMenu, 140));
  if (go) go.addEventListener('click', submit);

  document.querySelectorAll('[data-demo]').forEach(b => {
    b.addEventListener('click', () => {
      q.value = b.dataset.demo;
      load(b.dataset.demo);
    });
  });

  async function submit() {
    const v = q.value.trim();
    if (!v) {
      say('Enter a USDOT number, MC number, or carrier legal name.');
      q.focus();
      return;
    }
    const m = /^(?:(MC|FF|MX)[-\s]?)?(\d{1,8})$/i.exec(v);
    if (m && !m[1]) return load(m[2]);

    say('');
    if (go) go.disabled = true;
    try {
      const r = await fetch(`${API}/search?q=${encodeURIComponent(v)}`);
      const rows = r.ok ? await r.json() : [];
      if (rows.length === 1) return load(rows[0].dot);
      if (!rows.length) {
        say(m ? `No registered carrier found for ${v.toUpperCase()}.` : 'No carrier found. Try the exact legal name or USDOT number.');
        return;
      }
      openMenu(rows);
      highlight(0);
      say('Select the intended carrier from the list.');
    } catch (e) {
      say('Search service is temporarily unavailable. Please retry in a moment.');
    } finally {
      if (go) go.disabled = false;
    }
  }

  async function load(dot) {
    say('');
    if (go) go.disabled = true;
    closeMenu();

    out.innerHTML = `
      <div class="card cardbody" style="min-height:140px;display:flex;align-items:center;justify-content:center;">
        <p class="muted" style="font-size:15px;font-weight:600;">Querying official FMCSA safety records for USDOT ${esc(dot)}…</p>
      </div>`;

    try {
      const r = await fetch(`${API}/carrier?dot=${encodeURIComponent(dot)}`);
      if (r.status === 404) {
        out.innerHTML = '';
        say(`USDOT ${dot} was not located in FMCSA census records. Verify the number on the vehicle cab card or MCS-150.`);
        return;
      }
      if (!r.ok) throw new Error('API error: ' + r.status);
      const c = await r.json();
      c.grade = window.dotGrade(c, NAT);

      if (!staticIndex) {
        staticIndex = fetch(`${BASE}static/index.json`).then(x => x.ok ? x.json() : {}).catch(() => ({}));
      }
      const idx = await staticIndex;
      const permalink = idx[c.dot] ? `${BASE}carrier/${c.dot}-${idx[c.dot]}/` : null;

      out.innerHTML = render(c, permalink);
      leaveLanding();
      history.replaceState(null, '', `?dot=${c.dot}`);

      if (window.__reveal) window.__reveal(out, true, 0);
      out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    } catch (e) {
      out.innerHTML = '';
      say('FMCSA public data service timed out. Please try again shortly or inspect SAFER directly.');
    } finally {
      if (go) go.disabled = false;
    }
  }

  // Mirrors templates/_report.html
  function render(c, permalink) {
    const g = c.grade;
    const alerts = (c.basics || []).filter(b => b.alert);
    const nAlerts = alerts.length;
    const isActive = c.status === 'A' || !c.status;
    const dRate = c.driver_oos_rate;
    const vRate = c.vehicle_oos_rate;
    const dBad = dRate != null && dRate > NAT.driver_oos_rate;
    const vBad = vRate != null && vRate > NAT.vehicle_oos_rate;

    // Decision Heading and Text
    let decisionHeading = 'Review required before dispatch';
    let decisionText = '';
    if (g.letter === 'A') {
      decisionHeading = 'Eligible for dispatch — Clean safety record';
      decisionText = 'Operating authority active, insurance on file, zero BASIC alerts, and inspection out-of-service rates remain below national averages.';
    } else if (g.letter === 'B') {
      decisionHeading = 'Eligible for further review';
      decisionText = vBad && nAlerts > 0
        ? `Vehicle out-of-service rate exceeds national average and ${nAlerts} BASIC alert flag is present. Confirm maintenance records before dispatch.`
        : vBad ? 'Vehicle out-of-service rate is above national average. Review recent roadside maintenance inspection reports.'
        : dBad ? 'Driver out-of-service rate is above national average. Review hours-of-service compliance.'
        : nAlerts > 0 ? `FMCSA public data shows ${nAlerts} safety BASIC alert flag. Inquire regarding corrective action.`
        : 'Meets standard safety baseline. Confirm specific internal cargo and insurance limit requirements prior to dispatch.';
    } else if (g.letter === 'C') {
      decisionHeading = 'Review required before dispatch';
      decisionText = 'Multiple risk factors or elevated out-of-service rates recorded. Detailed screening recommended.';
    } else if (g.letter === 'D') {
      decisionHeading = 'Elevated risk — Detailed review required';
      decisionText = 'Substantial out-of-service rates or acute BASIC safety alert flags detected in public roadside data.';
    } else {
      decisionHeading = 'Critical issues detected — Review required';
      decisionText = !isActive
        ? 'Operating authority is currently inactive or revoked. Do not dispatch until reinstated with FMCSA.'
        : 'Severe safety performance deficiencies, inactive credentials, or critical crash frequency recorded.';
    }

    if (g.limited) {
      decisionText = 'Fewer than 5 roadside inspections recorded in the last 24 months. Grade rests primarily on authority, insurance filings, and crash history.';
    }

    // Gauge calculations
    const dVal = Math.max(0, Math.min(100, Math.round(((dRate || 0) / 15) * 10000) / 100));
    const dAvg = Math.round((NAT.driver_oos_rate / 15) * 10000) / 100;
    const dDiff = dRate != null ? (Math.round((dRate - NAT.driver_oos_rate) * 100) / 100).toFixed(2) : null;

    const vVal = Math.max(0, Math.min(100, Math.round(((vRate || 0) / 40) * 10000) / 100));
    const vAvg = Math.round((NAT.vehicle_oos_rate / 40) * 10000) / 100;
    const vDiff = vRate != null ? (Math.round((vRate - NAT.vehicle_oos_rate) * 100) / 100).toFixed(2) : null;

    // Factors HTML
    const factorsHtml = (g.factors || []).map(f =>
      `<li><span>${esc(f.label)}</span><b class="${f.points < 0 ? 'neg' : 'zero'}">${f.points < 0 ? f.points : '—'}</b></li>`
    ).join('');

    // BASIC rows HTML
    const basicRowsHtml = (c.basics || []).map(b =>
      `<div class="alertrow">
        <div>
          <div class="rowtitle">${esc(b.label)}</div>
          <div class="rowsub">${n(b.viol)} inspection${b.viol === 1 ? '' : 's'} with recorded violations in last 24 months</div>
        </div>
        ${b.alert ? '<span class="chip chip--warn">Alert flag</span>' : '<span class="chip chip--good">No alert</span>'}
      </div>`
    ).join('');

    // Insurance HTML
    const insuranceHtml = (c.insurance && c.insurance.length) ? `
      <table class="tbl">
        ${c.insurance.map(i => `
          <tr>
            <th>${esc(i.type)} (Form ${esc(i.form)})</th>
            <td>${money(i.amount)} · ${esc(i.company)}${i.effective ? ' · Effective ' + esc(i.effective) : ''}</td>
          </tr>`).join('')}
      </table>` : `
      <div class="cardbody">
        <p class="muted">No active liability insurance policy was located in the current open-data extract. Confirm active BMC-91 / BMC-91X filings directly on the official FMCSA Licensing & Insurance (L&I) database prior to contracting.</p>
      </div>`;

    // Partners HTML
    const livePartners = Object.values(P).filter(p => p.url && (!p.when || p.when.includes(g.letter)));
    const partnerHtml = livePartners.map(p => `
      <a class="partner-link" href="${esc(p.url)}" rel="sponsored noopener" target="_blank" data-slot="${esc(p.key)}">
        <b>${esc(p.headline)}</b>
        <span>${esc(p.blurb)}</span>
        <em>${esc(p.cta)} →</em>
      </a>`).join('');

    const ptsOff = 100 - g.score;

    return `
    <div class="report" id="report-card-view">
      <section class="identity">
        <div>
          <h1 class="carrier-title">${esc(cname(c.name))}${c.dba ? ' <span class="dba-label">(DBA ' + esc(cname(c.dba)) + ')</span>' : ''}</h1>
          <div class="meta">
            <span><b>USDOT</b> ${esc(c.dot)}</span>
            ${c.mc ? `<span><b>MC</b> ${esc(c.mc)}</span>` : ''}
            <span>${esc(c.city)}, ${esc(c.state)}</span>
            <span>${n(c.pu)} power unit${c.pu === 1 ? '' : 's'}</span>
            <span>${n(c.drivers)} driver${c.drivers === 1 ? '' : 's'}</span>
            ${c.classdef ? `<span>${esc(title(c.classdef))}</span>` : ''}
            ${c.hm ? '<span>Hazmat authorized</span>' : ''}
          </div>
        </div>
        <div class="snapshot">
          <span class="rec-dot">●</span> <b>Verified FMCSA Record</b>
          <span>SMS snapshot · ${esc(NAT.sms_updated)}</span>
        </div>
      </section>

      <section class="overview" aria-label="Overall safety assessment">
        <div class="gradecell">
          <div class="grade grade--${g.letter}" aria-label="Grade ${g.letter}">${g.letter}</div>
          <div class="scorelabel">
            Safety score
            <b>${g.score} / 100</b>
          </div>
        </div>
        <div class="decision">
          <p class="eyebrow">Preliminary screening result</p>
          <h2>${esc(decisionHeading)}</h2>
          <p>${esc(decisionText)}</p>
        </div>
        <div class="deductions">
          <div class="deductions__title">
            <span>Score deductions</span>
            <span>${ptsOff > 0 ? '−' + ptsOff + ' pts' : '0 pts'}</span>
          </div>
          <ul>${factorsHtml}</ul>
        </div>
      </section>

      <div class="layout">
        <div class="stack">
          <!-- OOS Rates Card -->
          <section class="card" id="oos-section">
            <header class="cardhead">
              <div>
                <p class="eyebrow">Inspection performance</p>
                <h2>Out-of-service rates vs. national average</h2>
              </div>
              <a class="smalllink" href="${BASE}methodology/">How this is scored</a>
            </header>

            <!-- Driver OOS -->
            <div class="metric">
              <div class="metric__top">
                <div>
                  <h3>Driver out-of-service rate</h3>
                  <span class="metricvalue">${dRate != null ? dRate + '%' : '—'}</span>
                  ${dDiff != null ? `<span class="delta ${dDiff > 0 ? 'delta--bad' : 'delta--good'}">${dDiff > 0 ? '+' : ''}${dDiff} pp vs U.S. avg (${NAT.driver_oos_rate}%)</span>` : ''}
                </div>
                ${dRate != null ? `<span class="chip ${dBad ? 'chip--bad' : 'chip--good'}">${dBad ? 'Above average' : 'Below average'}</span>` : '<span class="chip chip--neutral">No inspection data</span>'}
              </div>
              <div class="gauge" style="--value:${dVal}%;--avg:${dAvg}%;--tone:${dBad ? 'var(--red)' : 'var(--green)'}">
                <div class="scalelabels"><span>0%</span><span>15%</span></div>
                <div class="track">
                  <div class="fill"></div>
                  <div class="marker"><span>U.S. avg ${NAT.driver_oos_rate}%</span></div>
                </div>
              </div>
              <div class="metricfoot">
                <span>${n(c.driver_insp)} driver inspections</span>
                <span>24-month reporting window</span>
                <span>Lower is better</span>
              </div>
            </div>

            <!-- Vehicle OOS -->
            <div class="metric">
              <div class="metric__top">
                <div>
                  <h3>Vehicle out-of-service rate</h3>
                  <span class="metricvalue">${vRate != null ? vRate + '%' : '—'}</span>
                  ${vDiff != null ? `<span class="delta ${vDiff > 0 ? 'delta--bad' : 'delta--good'}">${vDiff > 0 ? '+' : ''}${vDiff} pp vs U.S. avg (${NAT.vehicle_oos_rate}%)</span>` : ''}
                </div>
                ${vRate != null ? `<span class="chip ${vBad ? 'chip--bad' : 'chip--good'}">${vBad ? 'Above average' : 'Below average'}</span>` : '<span class="chip chip--neutral">No inspection data</span>'}
              </div>
              <div class="gauge" style="--value:${vVal}%;--avg:${vAvg}%;--tone:${vBad ? 'var(--red)' : 'var(--green)'}">
                <div class="scalelabels"><span>0%</span><span>40%</span></div>
                <div class="track">
                  <div class="fill"></div>
                  <div class="marker"><span>U.S. avg ${NAT.vehicle_oos_rate}%</span></div>
                </div>
              </div>
              <div class="metricfoot">
                <span>${n(c.vehicle_insp)} vehicle inspections</span>
                <span>24-month reporting window</span>
                <span>Lower is better</span>
              </div>
            </div>
          </section>

          <!-- BASIC Status Card -->
          <section class="card" id="basics-section">
            <header class="cardhead">
              <div>
                <p class="eyebrow">FMCSA Safety Measurement System</p>
                <h2>Safety BASICs status</h2>
              </div>
              <span class="chip ${nAlerts > 0 ? 'chip--warn' : 'chip--good'}">${nAlerts} alert${nAlerts === 1 ? '' : 's'}</span>
            </header>
            ${basicRowsHtml}
            <div class="cardfoot-note">
              <p class="hint">FMCSA hides percentile ranks for property carriers from the general public under the FAST Act. The violation counts and alert flags above are the public indicators visible to brokers, shippers, and underwriters. <a href="${BASE}guides/check-my-csa-score/">Learn how to access carrier CSA percentiles</a>.</p>
            </div>
          </section>

          <!-- Crash History Card -->
          <section class="card" id="crashes-section">
            <header class="cardhead">
              <div>
                <p class="eyebrow">Last 24 months</p>
                <h2>Reportable crash history</h2>
              </div>
              <span class="smalllink">${c.crashes ? c.crashes.total : 0} total crash${c.crashes && c.crashes.total === 1 ? '' : 'es'}</span>
            </header>
            <div class="crashgrid">
              <div class="crashstat ${c.crashes && c.crashes.fatal > 0 ? 'crashstat--bad' : ''}">
                <strong>${c.crashes ? c.crashes.fatal : 0}</strong>
                <span>Fatal crashes</span>
              </div>
              <div class="crashstat ${c.crashes && c.crashes.injury > 0 ? 'crashstat--warn' : ''}">
                <strong>${c.crashes ? c.crashes.injury : 0}</strong>
                <span>Injury crashes</span>
              </div>
              <div class="crashstat">
                <strong>${c.crashes ? c.crashes.tow : 0}</strong>
                <span>Tow-away crashes</span>
              </div>
            </div>
          </section>

          <!-- Company Operations Profile -->
          <section class="card" id="profile-section">
            <header class="cardhead">
              <div>
                <p class="eyebrow">Registration & Fleet Profile</p>
                <h2>Company operations</h2>
              </div>
              <span class="smalllink">USDOT since ${c.since ? c.since.slice(0, 4) : '—'}</span>
            </header>
            <table class="tbl">
              <tr><th>Legal company name</th><td>${esc(c.name)}</td></tr>
              ${c.dba ? `<tr><th>Doing Business As (DBA)</th><td>${esc(c.dba)}</td></tr>` : ''}
              <tr><th>Physical address</th><td>${esc(title(c.street))}, ${esc(c.city)}, ${esc(c.state)} ${esc(c.zip)}</td></tr>
              <tr><th>Operation classification</th><td>${esc(title(c.classdef) || 'Interstate Carrier')}</td></tr>
              <tr><th>Power units / Drivers</th><td>${n(c.pu)} power units / ${n(c.drivers)} drivers</td></tr>
              <tr><th>MCS-150 reported mileage</th><td>${c.mileage ? n(c.mileage) : '—'}${c.mileage && c.mileage_year && c.mileage_year !== '0' ? ' (year ' + esc(c.mileage_year) + ')' : ''}</td></tr>
              <tr><th>MCS-150 last updated</th><td>${esc(c.mcs150_date || '—')}</td></tr>
              ${c.cargo && c.cargo.length ? `<tr><th>Cargo types handled</th><td>${esc(c.cargo.join(', '))}</td></tr>` : ''}
            </table>
          </section>

          <!-- Insurance Table -->
          <section class="card" id="insurance-section">
            <header class="cardhead">
              <div>
                <p class="eyebrow">FMCSA L&I filing records</p>
                <h2>Liability insurance on file</h2>
              </div>
              <a class="smalllink" href="https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_carrlist?n_dotno=${c.dot}" rel="noopener" target="_blank">Verify on FMCSA L&I</a>
            </header>
            ${insuranceHtml}
          </section>

          <!-- Sources & Confidence Note -->
          <section class="card sourcebox" id="sources">
            <strong>Data Confidence & Official Record Sources</strong>
            <p>This report card combines records from FMCSA's public Motor Carrier Census, SMS roadside inspection files, and Licensing & Insurance (L&I) extracts (SMS snapshot ${esc(NAT.sms_updated)}). The letter grade is calculated using transparent mathematical deductions based on out-of-service deviations from the national average, BASIC violation density, fleet-proportional crash history, and authority status.</p>
            <p>A safety report card is a preliminary screening tool and does not constitute a government safety rating, insurance warranty, or binding dispatch approval. For official government records, visit the <a href="https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${c.dot}" rel="noopener" target="_blank">SAFER Carrier Snapshot</a>${permalink ? ` or the <a href="${permalink}">Dedicated permalink page</a>` : ''}.</p>
          </section>
        </div>

        <!-- Right Column (Sticky Sidebar) -->
        <aside class="sticky">
          <!-- Verification Summary Card -->
          <section class="card verifycard">
            <header class="cardhead">
              <div>
                <p class="eyebrow">Critical checks</p>
                <h2>Verification summary</h2>
              </div>
              <span class="smalllink">4/4 evaluated</span>
            </header>
            <div class="verifyrow">
              <div class="verifylabel">
                <span class="dot ${isActive ? 'good' : 'bad'}"></span>
                Operating authority
              </div>
              <div class="verifyvalue">
                ${isActive ? 'Active' : 'Inactive'}
                <small>${isActive ? 'Authorized for hire' : 'Revoked or suspended'}</small>
              </div>
            </div>
            <div class="verifyrow">
              <div class="verifylabel">
                <span class="dot ${c.insurance && c.insurance.length ? 'good' : 'warn'}"></span>
                Liability insurance
              </div>
              <div class="verifyvalue">
                ${c.insurance && c.insurance.length ? 'On file' : 'Check L&I'}
                <small>${c.insurance && c.insurance.length ? 'Filing located' : 'Unconfirmed in extract'}</small>
              </div>
            </div>
            <div class="verifyrow">
              <div class="verifylabel">
                <span class="dot ${nAlerts === 0 ? 'good' : 'warn'}"></span>
                BASIC alert flags
              </div>
              <div class="verifyvalue">
                ${nAlerts} alert${nAlerts === 1 ? '' : 's'}
                <small>${nAlerts === 0 ? 'Zero alerts' : esc(alerts[0].label)}</small>
              </div>
            </div>
            <div class="verifyrow">
              <div class="verifylabel">
                <span class="dot ${vBad ? 'bad' : 'good'}"></span>
                Vehicle OOS rate
              </div>
              <div class="verifyvalue">
                ${vBad ? 'Above average' : 'Below average'}
                <small>${vRate != null ? vRate + '%' : 'No data'}</small>
              </div>
            </div>

            <div class="review">
              <b>${!isActive ? 'Critical issue: Inactive authority' : (['D', 'F'].includes(g.letter) || vBad || nAlerts > 0) ? 'Review required before dispatch' : 'Eligible for review'}</b>
              <p>${!isActive ? 'This carrier does not hold active operating authority according to FMCSA records. Do not dispatch until active status is confirmed.' : (vBad || nAlerts > 0) ? 'Confirm recent roadside repair records, active certificate of insurance, and specific broker compliance guidelines.' : 'Carrier record shows active credentials and acceptable performance metrics across all critical checkpoints.'}</p>
              <button class="button" type="button" onclick="window.print()">Download inspection report</button>
              <button class="button button--secondary" type="button" onclick="window.copyReportLink(this)">Copy report link</button>
            </div>
          </section>

          <!-- Partner Offers Card -->
          <section class="card partner">
            <span class="partnerlabel">Partner offer · Does not affect safety score</span>
            <h3>Commercial coverage & cash flow</h3>
            <p>Independent services for motor carriers and owner-operators. Commercial partnerships operate independently from DOT Report Card scoring.</p>
            <div class="partner-list">
              ${partnerHtml}
              ${['C', 'D', 'F'].includes(g.letter) ? `
              <a class="partner-link" href="${BASE}guides/dataqs-challenge/">
                <b>DataQs violation challenge guide</b>
                <span>Remove erroneous roadside citations from your permanent record.</span>
                <em>Read guide →</em>
              </a>` : ''}
            </div>
            ${livePartners.length ? '<p class="disclosure">Partner links may pay a referral commission upon sign-up. Commercial agreements have no bearing on carrier grades or calculations.</p>' : ''}
          </section>
        </aside>
      </div>

      <p class="disclaimer">DOT Report Card provides an informational screening summary and does not certify a carrier as safe, compliant, insured, or suitable for any shipment. Verify current government records and your organization’s requirements before contracting or dispatching.</p>
    </div>`;
  }

  // Handle URL query on initial load: e.g. ?dot=54283
  const initDot = new URLSearchParams(location.search).get('dot');
  if (initDot && /^\d{1,8}$/.test(initDot)) {
    q.value = initDot;
    load(initDot);
  }
})();
