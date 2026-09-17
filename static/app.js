// Home page: search (DOT / MC / name) against the worker, grade in the browser, render the same report card the static pages use.
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const q = $('#q'), go = $('#go'), msg = $('#msg'), out = $('#result'), field = q && q.closest('.field');
  if (!q) return;
  const NAT = window.NAT, P = window.PARTNERS || {}, API = window.API, BASE = window.BASE || '/';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const n = x => Number(x || 0).toLocaleString('en-US');
  const money = x => '$' + Math.round(x).toLocaleString('en-US');
  const title = s => (s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const UPPER = new Set(['LLC', 'LP', 'LLP', 'USA', 'DBA', 'II', 'III', 'IV']);
  const cname = s => (s || '').split(/\s+/).map(w => UPPER.has(w) || (w.length <= 2 && /^[A-Z]+$/.test(w)) ? w : title(w)).join(' ');
  const plural = (k, w) => k + ' ' + w + (k === 1 ? '' : 's');
  let menu, items = [], sel = -1, timer, staticIndex;

  function say(t) { msg.textContent = t || ''; msg.hidden = !t; }
  function closeMenu() { if (menu) { menu.remove(); menu = null; } items = []; sel = -1; q.removeAttribute('aria-activedescendant'); }
  function openMenu(rows) {
    closeMenu();
    menu = document.createElement('ul'); menu.className = 'menu'; menu.id = 'menu'; menu.setAttribute('role', 'listbox');
    if (!rows.length) { menu.innerHTML = '<li class="empty">No carrier found. Try the USDOT number from your cab card.</li>'; field.appendChild(menu); return; }
    items = rows;
    menu.innerHTML = rows.map((r, i) => `<li role="option" id="opt${i}"><b>${esc(cname(r.name))}${r.dba ? ' <span>(' + esc(cname(r.dba)) + ')</span>' : ''}</b><span>USDOT ${r.dot} · ${esc(r.city)}, ${esc(r.state)}${r.status !== 'A' ? ' · inactive' : ''}</span></li>`).join('');
    menu.addEventListener('mousedown', e => { const li = e.target.closest('li[role=option]'); if (li) { e.preventDefault(); pick(rows[+li.id.slice(3)]); } });
    field.appendChild(menu);
  }
  function highlight(i) { sel = i; menu.querySelectorAll('li[role=option]').forEach((li, k) => li.setAttribute('aria-selected', k === i)); if (i >= 0) q.setAttribute('aria-activedescendant', 'opt' + i); }
  function pick(r) { q.value = String(r.dot); closeMenu(); load(r.dot); }

  async function suggest() {
    const v = q.value.trim();
    if (v.length < 2 || /^\d+$/.test(v)) { closeMenu(); return; }
    try {
      const r = await fetch(`${API}/search?q=${encodeURIComponent(v)}`);
      if (q.value.trim() !== v) return;
      openMenu(r.ok ? await r.json() : []);
    } catch (e) { closeMenu(); }
  }
  q.addEventListener('input', () => { clearTimeout(timer); say(''); timer = setTimeout(suggest, 220); });
  q.addEventListener('keydown', e => {
    if (menu && items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight(Math.min(sel + 1, items.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); highlight(Math.max(sel - 1, 0)); return; }
      if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); pick(items[sel]); return; }
      if (e.key === 'Escape') { closeMenu(); return; }
    }
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });
  q.addEventListener('blur', () => setTimeout(closeMenu, 120));
  go.addEventListener('click', submit);
  document.querySelectorAll('[data-demo]').forEach(b => b.addEventListener('click', () => { q.value = b.dataset.demo; load(b.dataset.demo); }));

  async function submit() {
    const v = q.value.trim();
    if (!v) { say('Type a USDOT number, MC number or company name.'); q.focus(); return; }
    const m = /^(?:(MC|FF|MX)[-\s]?)?(\d{1,8})$/i.exec(v);
    if (m && !m[1]) return load(m[2]);
    say(''); go.disabled = true;
    try {
      const r = await fetch(`${API}/search?q=${encodeURIComponent(v)}`);
      const rows = r.ok ? await r.json() : [];
      if (rows.length === 1) return load(rows[0].dot);
      if (!rows.length) { say(m ? `No carrier with ${v.toUpperCase()} found.` : 'No carrier found — try the exact legal name or the USDOT number.'); return; }
      openMenu(rows); highlight(0); say('Pick the carrier you mean.');
    } catch (e) { say('Search is unavailable right now. Try again in a minute.'); }
    finally { go.disabled = false; }
  }

  async function load(dot) {
    say(''); go.disabled = true; closeMenu();
    out.innerHTML = '<div class="sheet" style="min-height:120px"><p class="sheet-sub">Pulling the FMCSA record for USDOT ' + esc(dot) + '…</p></div>';
    try {
      const r = await fetch(`${API}/carrier?dot=${encodeURIComponent(dot)}`);
      if (r.status === 404) { out.innerHTML = ''; say(`USDOT ${dot} is not in FMCSA's census file. Check the number on your cab card or MCS-150.`); return; }
      if (!r.ok) throw new Error('api ' + r.status);
      const c = await r.json();
      c.grade = window.dotGrade(c, NAT);
      if (!staticIndex) staticIndex = fetch(`${BASE}static/index.json`).then(x => x.ok ? x.json() : {}).catch(() => ({}));
      const idx = await staticIndex;
      out.innerHTML = render(c, idx[c.dot] ? `${BASE}carrier/${c.dot}-${idx[c.dot]}/` : null);
      history.replaceState(null, '', `?dot=${c.dot}`);
      if (window.__reveal) window.__reveal(out, true, 0);
      out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    } catch (e) { out.innerHTML = ''; say('FMCSA’s data service didn’t answer. Try again in a minute, or use SAFER directly.'); }
    finally { go.disabled = false; }
  }

  // Mirrors templates/_report.html — keep the two in step.
  function render(c, permalink) {
    const g = c.grade, alerts = c.basics.filter(b => b.alert).length, active = c.status === 'A' || !c.status;
    const tile = (v, label, cls) => `<div class="tile ${cls || ''}"><b>${v}</b><span>${label}</span></div>`;
    const cmp = (rate, natv) => rate == null ? '' : rate > natv ? 'bad' : 'ok';
    const steps = Object.values(P).filter(p => p.url && (!p.when || p.when.includes(g.letter)))
      .map(p => `<a class="step" href="${esc(p.url)}" rel="sponsored noopener" target="_blank" data-slot="${esc(p.key)}"><b>${esc(p.headline)}</b><span>${esc(p.blurb)}</span><em>${esc(p.cta)} →</em></a>`);
    if ('CDF'.includes(g.letter)) steps.push(`<a class="step" href="${BASE}guides/dataqs-challenge/"><b>Think a violation is wrong? Challenge it through DataQs</b><span>Successful DataQs requests remove the violation from your record and re-run the numbers on this page.</span><em>Read the guide →</em></a>`);
    steps.push(`<a class="step" href="${BASE}guides/roadside-inspection-checklist/"><b>Stay off the out-of-service list</b><span>The violations that most often park a truck at the scale, and the 10-minute pre-trip that catches them.</span><em>Checklist →</em></a>`,
      `<a class="step" href="${BASE}guides/insurance-requirements/"><b>Know what insurance FMCSA actually requires</b><span>$750k vs $1M vs $5M liability, cargo, and what a lapsed BMC-91X filing does to your authority.</span><em>Requirements →</em></a>`);
    const live = Object.values(P).some(p => p.url);
    return `<div class="report">
<section class="sheet g-${g.letter}">
  <div class="sheet-top"><div class="letter" aria-label="Grade ${g.letter}">${g.letter}</div><div>
    <h2 class="sheet-name" style="margin:0">${esc(cname(c.name))}${c.dba ? ' <span class="muted">(DBA ' + esc(cname(c.dba)) + ')</span>' : ''}</h2>
    <p class="sheet-sub">USDOT ${c.dot}${c.mc ? ' · ' + esc(c.mc) : ''} · ${esc(c.city)}, ${esc(c.state)} · <span class="score">${g.score}/100</span></p></div></div>
  <div class="chips"><span class="chip ${active ? 'ok' : 'bad'}">${active ? 'Active' : 'Inactive'} USDOT</span>${c.mc ? `<span class="chip ${c.mc_status === 'A' ? 'ok' : 'bad'}">${esc(c.mc)} ${c.mc_status === 'A' ? 'active' : 'not active'}</span>` : ''}<span class="chip">${plural(c.pu, 'power unit')}</span><span class="chip">${plural(c.drivers, 'driver')}</span>${c.hm ? '<span class="chip">Hazmat</span>' : ''}</div>
  <ul class="factors">${g.factors.map(f => `<li><b>${esc(f.label)}</b><span class="pts ${f.points < 0 ? 'neg' : 'zero'}">${f.points < 0 ? f.points : '—'}</span><small>${esc(f.note)}</small></li>`).join('')}</ul>
  ${g.limited ? '<p class="limited">Fewer than 5 roadside inspections in the last 24 months, so this grade rests mostly on authority and crash records. A clean but thin record is not the same as a proven one.</p>' : ''}
</section>
<div class="tiles">${tile(n(c.insp), 'Inspections, 24 months')}${tile(c.driver_oos_rate == null ? '—' : c.driver_oos_rate.toFixed(1) + '%', 'Driver OOS · national ' + NAT.driver_oos_rate + '%', cmp(c.driver_oos_rate, NAT.driver_oos_rate))}${tile(c.vehicle_oos_rate == null ? '—' : c.vehicle_oos_rate.toFixed(1) + '%', 'Vehicle OOS · national ' + NAT.vehicle_oos_rate + '%', cmp(c.vehicle_oos_rate, NAT.vehicle_oos_rate))}${tile(c.crashes.total, 'Crashes' + (c.crashes.fatal ? ' · ' + c.crashes.fatal + ' fatal' : '') + (c.crashes.injury ? ' · ' + c.crashes.injury + ' injury' : ''), c.crashes.fatal ? 'bad' : '')}${tile(alerts, 'BASIC alerts')}${tile(c.since ? c.since.slice(0, 4) : '—', 'USDOT since')}</div>
<table class="tbl"><caption>Safety BASICs (public SMS file)</caption>${c.basics.map(b => `<tr><th>${esc(b.label)}</th><td>${plural(b.viol, 'inspection')} with violations · <span class="${b.alert ? 'alert-y' : 'alert-n'}">${b.alert ? 'ALERT' : 'no alert'}</span></td></tr>`).join('')}</table>
<p class="hint">FMCSA hides percentile scores for property carriers from the public. The counts above and the alert flag are what anyone — including brokers and insurers — can see. <a href="${BASE}guides/check-my-csa-score/">How to see your full CSA percentiles</a>.</p>
<table class="tbl"><caption>Company profile</caption>
<tr><th>Legal name</th><td>${esc(c.name)}</td></tr>${c.dba ? `<tr><th>DBA</th><td>${esc(c.dba)}</td></tr>` : ''}
<tr><th>Physical address</th><td>${esc(title(c.street))}, ${esc(c.city)}, ${esc(c.state)} ${esc(c.zip)}</td></tr>
<tr><th>Operation</th><td>${esc(title(c.classdef)) || '—'}</td></tr>
<tr><th>Power units / drivers</th><td>${n(c.pu)} / ${n(c.drivers)}</td></tr>
<tr><th>MCS-150 mileage</th><td>${c.mileage ? n(c.mileage) + (c.mileage_year && c.mileage_year !== '0' ? ' (' + esc(c.mileage_year) + ')' : '') : '—'}</td></tr>
<tr><th>MCS-150 last updated</th><td>${esc(c.mcs150_date || '—')}</td></tr>${c.cargo.length ? `<tr><th>Cargo carried</th><td>${esc(c.cargo.join(', '))}</td></tr>` : ''}
</table>
<table class="tbl"><caption>Insurance on file with FMCSA</caption>${c.insurance.length ? c.insurance.map(i => `<tr><th>${esc(i.type)} (${esc(i.form)})</th><td>${money(i.amount)} · ${esc(i.company)}${i.effective ? ' · since ' + esc(i.effective) : ''}</td></tr>`).join('') : `<tr><th>Filings</th><td>Not in FMCSA's open-data extract — <a href="https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_carrlist?n_dotno=${c.dot}" rel="noopener">check L&amp;I</a></td></tr>`}</table>
<div class="sec"><div class="sec-h"><h2>What to do next</h2></div><div class="steps">${steps.join('')}</div>${live ? '<p class="disclosure">Links marked with a partner name may pay us a referral fee if you sign up. It never changes the grade or the order of anything on this page.</p>' : ''}</div>
<p class="hint">Source: FMCSA Motor Carrier Census, SMS BASICs, L&amp;I insurance and crash files via data.transportation.gov, SMS snapshot ${esc(NAT.sms_updated)}. Official record: <a href="https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${c.dot}" rel="noopener">SAFER company snapshot</a>${permalink ? ` · <a href="${permalink}">Permanent page for this carrier</a>` : ''}.</p>
</div>`;
  }

  const dot = new URLSearchParams(location.search).get('dot');
  if (dot && /^\d{1,8}$/.test(dot)) { q.value = dot; load(dot); }
})();
