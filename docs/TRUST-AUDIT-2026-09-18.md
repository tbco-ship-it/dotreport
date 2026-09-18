# Trust remediation: 18 September 2026

## Scope and provenance

Requested by the repository owner after a review of production commit `2d305c1f65dae18105eff372f2b00c629ad9aa50`. Preserve the existing visual design; fix unsupported screening claims and underlying counting logic. This is an engineering correction, not legal advice or validation of a carrier's actual safety, insurance, or authority.

## Findings, changes, evidence

| Finding | Change | Regression evidence |
| --- | --- | --- |
| A grades asserted clean records, insurance and dispatch eligibility without checking each fact | Replace stock approval text with factual OOS observations, unknowns and separate verification instructions | `test_above_average_a_has_no_clean_claim`, `test_solsbury_snapshot_regression` |
| Fewer than five inspections could yield A/100 | Require >=5 valid inspections in EACH category; `NR` and null score otherwise | `test_empty_inspections_not_a`, `test_category_sample_gate`, `test_unknown_oos_not_zero` |
| USDOT status was used as for-hire authority; missing status was treated as active | Separate registration, docket status and applicability; unknown is neutral | `test_private_registration_not_for_hire`, `test_unknown_registration_not_active`, `test_unknown_docket_not_inactive` |
| Any insurance row, including cargo/bond, indicated liability coverage | Filter BIPD BMC-91/91X; say filing located, never current coverage verified | `test_bond_and_cargo_not_liability`, `test_liability_filing_not_coverage` |
| Fatalities/injuries were summed but labeled as crash events | Schema v2 separates event counts and person totals; unknown counts remain null | `test_multiple_victims_one_event`, `test_missing_victim_count_remains_unknown`, `tests/test_worker.mjs` |
| Old aggregate data cannot reconstruct positive fatal/injury event counts | Compatibility adapter shows person totals and unknown event counts; no fabricated backfill | `test_legacy_counts_not_guessed` |
| `_ac` was called a full BASIC alert and missing values were collapsed into false | Use public acute/critical investigation indicators with explicit true/false/null; legacy ambiguity disclosed | `test_unknown_new_indicator_not_negative`, `test_legacy_negative_indicator_not_full_clearance` |
| Build reused stored grades even after policy changes | One canonical JavaScript policy, called by a batched Python build bridge | `scripts/test_grade.mjs` exercises every record; static/browser summaries share the same returned view |
| Home insurance deductions contradicted calculation; example IDs mapped to wrong names | Insurance remains informational; correct Werner to USDOT 53467; remove unverified 123456 example; correct reversed OOS fraction | Source-content review; no live search assertions for the removed examples |
| Page refresh was confused with data refresh | Source retrieval/update/reporting-period fields; weekly/manual refresh with validation and rollback on failure | Workflow and source code review; an actual upstream refresh must be verified separately |

## Primary references checked on 2026-09-18

1. FMCSA, **What is a private motor carrier?**: https://www.fmcsa.dot.gov/faq/what-private-motor-carrier — a private carrier transports its own goods and may require USDOT without MC operating authority.
2. FMCSA, **SMS Help Center**: https://ai.fmcsa.dot.gov/SMS/HelpCenter/ — investigation results identify acute/critical violations within the prior 12 months; these are not interchangeable with all BASIC percentiles or prioritization alerts; some information is not public.
3. FMCSA, **Crash Statistics query tool**: https://ai.fmcsa.dot.gov/CrashStatistics/CrashQueryTool — crash counts, fatal crash counts, fatalities and injuries are different measures. A crash may involve several people.
4. FMCSA official verification systems: https://safer.fmcsa.dot.gov/ and https://li-public.fmcsa.dot.gov/ — link users to current government records rather than certifying eligibility from an extract.
5. The repository's own original `scripts/normalize.py`, `worker/api.mjs`, `scripts/grading.py`, `static/app.js`, and `templates/_report.html` established the implementation defects. No carrier is accused of being uninsured or unauthorized because an extract is missing a row.

## Policy changes and intentional limitations

- Policy **2.0.0** retains the previous deduction thresholds where their inputs are meaningful. These thresholds are independent, unvalidated product choices, not government safety cutoffs or a probability of a crash.
- Legacy positive fatality totals are never passed off as fatal crash counts. Grades may legitimately change to NR until a new source normalization can supply event counts.
- Legacy missing/negative A/C information cannot be disambiguated. It is labeled incomplete; only positively observed indicators contribute a deduction. New schema v2 missing A/C values withhold the grade. No version claims to reveal non-public SMS alerts.
- The crash extract's actual first/last available dates and source timestamps are distinct from a claimed universal rolling 24-month window. Counts do not establish fault, preventability or exposure-adjusted risk.
- The Worker rejects results at its fixed row cap instead of silently scoring truncated data. Full pagination is deferred. A limit error is preferable to a false clean result.
- Insurance is only a located filing, not verified active insurance. Actual expiry, cancellation, layering, shipment limits and insurer confirmation remain outside this report.
- `data/carriers.json` is a retained source snapshot, not the truth for current grades. Every build recomputes the canonical policy.

## Deployment boundary

GitHub Pages is deployed by `.github/workflows/pages.yml`. The API Worker is a separate deployment surface; changing `worker/api.mjs` alone does **not** prove Cloudflare production changed. The new frontend safely accepts legacy API payloads without substituting person counts or claiming full verification. A separate Worker deployment and real upstream smoke test are required to assert schema v2 in the live API. No tokens, keys, or Cloudflare account settings were read or changed.

## Reproduce

Requires Python 3.12+, Node 22+, and Jinja2.

```sh
pip install jinja2
python -m unittest discover -s tests -v
node tests/test_worker.mjs
node scripts/test_grade.mjs
python scripts/build.py --base / --origin https://dotreportcard.com --cname dotreportcard.com --api https://api.dotreportcard.com
```

Fresh-snapshot validation (uses the public upstream datasets):

```sh
python scripts/collect.py
python scripts/normalize.py
python scripts/validate_data.py
```

`collect.py` can resume existing raw files. Use a clean runner for a new snapshot. Scheduled jobs run in a clean GitHub runner. They preserve the last committed source data if refresh validation fails and surface the failure in the Actions summary.

## Review limits

Local browser tests use Chromium and the exact built HTML/CSS/JS. External font/advertising responses may be excluded. Synthetic API fixtures prove UI behavior, not real upstream uptime or official record accuracy. Passing a build does not establish legal compliance, insurance coverage, accessibility compliance, or external API deployment.

## Executed local validation

- 19 Python regression tests passed (including an immutable Solsbury legacy fixture, so a later source refresh cannot silently change the test case).
- 10 Worker normalization assertions passed using source fixtures. This does not verify the deployed Worker.
- 13,796 retained input records passed canonical policy invariants. This is the full retained input, not the 13,006 filtered carrier-page subset.
- Full static build generated 13,069 pages.
- Seven offline Chromium checks passed; results and explicit limitations are recorded in `docs/qa/browser-results.json`. Desktop 1440px and mobile 390px were checked.
- Browser networking, including loopback navigation, was blocked by environment policy. Built HTML was rendered with inline repository assets and local response fixtures. No real external network interaction is claimed.
- Screenshots were inspected locally; no live browser screenshot is claimed.

CI and Pages deployment status must be read from the Actions run for the final commit, not inferred from this local result. The source snapshot was not refreshed during local validation.
