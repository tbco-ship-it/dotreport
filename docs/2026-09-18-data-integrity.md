# Data integrity remediation — 2026-09-18

## Scope and approval

The site owner requested that the issues identified in the preceding review be corrected in the connected GitHub repository, reflected on the site, and supported by retained evidence. Baseline production commit: `2d305c1f65dae18105eff372f2b00c629ad9aa50`. Changes preserve the existing report layout and do not assert that any named carrier is uninsured, unauthorized, or unsafe.

## Evidence-to-change ledger

| Finding in baseline code | Implemented change | Regression evidence |
| --- | --- | --- |
| An A grade selected text claiming clean records, insurance and dispatch eligibility without checking those facts. | Remove blanket approval text in both server-rendered and dynamic reports. State exactly what the independent index does not verify. | `test_no_blanket_claims`; generated-page forbidden-claim scan; browser fixture/static text comparison. |
| Missing/fewer-than-five inspections had no deduction but retained A/100. Only total inspections controlled the warning. | Require at least five **driver** and five **vehicle** inspections, valid benchmarks and other required data. Return `NR`, `score=null`, and machine-readable missing reasons. | `test_no_inspections_never_A`, `test_per_category_minimum`, `test_unknown_is_not_zero`. |
| USDOT registration was used as proof of active for-hire operating authority. Unknown status was treated as active. | Registration and authority are separate rows. Code A is labeled active **in the extract**. Authority is not verified; no exemption or current authority is inferred. | `test_registration_not_authority`; [FMCSA private-carrier explanation](https://www.fmcsa.dot.gov/faq/what-private-motor-carrier). |
| Any insurance row, including cargo/bond records, triggered a liability-insured display. | Check the liability type specifically, describe found records as historical, and never infer active coverage from filing presence or absence. | `test_cargo_is_not_liability`; source is the insurance-history extract, not a coverage warranty. |
| Missing/unflagged public `_ac` indicators became “No alert” and “Zero alerts.” | Preserve available public indicators without equating them to complete SMS alerts. Remove the ambiguous alert-based penalty. | `test_public_flags_do_not_change_score`; [FMCSA public-display limits](https://www.fmcsa.dot.gov/fastact/csa). |
| `fatal` and `injury` were sums of people but labeled fatal/injury crash counts. | Label legacy aggregates as fatalities and people injured. v2 normalization adds separate `fatal_crashes` and `injury_crashes` counts. Never reconstruct event counts from old aggregate person counts. | `test_people_not_events`, `test_legacy_counts_not_invented`, Python/Worker row-level 1-crash/3-deaths/4-injuries fixture; [FMCSA crash statistics](https://ai.fmcsa.dot.gov/CrashStatistics/CrashQueryTool). |
| Rebuilds used saved data but copy claimed fresh snapshots. Socrata file modification time was called a snapshot cutoff. | Recompute grades on every build, but distinguish file metadata, collection completion and unknown observation cutoffs. Add staged weekly/manual collection, validation and fail-closed publication. Persist validated refreshes so later code deployments cannot revert to older saved data. | `RefreshTests`; per-source metadata manifest; `build-info.json` separates build and data dates. |
| Home-page rule text contradicted code; demo company names did not match identifiers. | Rewrite methodology and home rules together. Demo labels are generated directly from source records instead of hand-entered names. | Generated-page scan and browser demo checks. |
| Static report buttons referred to a copy handler that was not loaded on static pages. Search upstream failures could become “No carrier found.” | Load the common app handler once on all pages. Distinguish API errors from empty successful searches. Add combobox state and keyboard regression checks. | Browser handler/error/keyboard fixtures. |
| Fixed graph endpoints could misrepresent extreme OOS rates; critical checks appeared after detailed content on phones. | Expand scales to include observed rates. Show verification before detailed OOS sections at single-column widths; retain descriptive labels. | Browser 360px/390px layout checks; explicit missing-data UI tests. |

## Scoring change: v2.0.0

This is a product-defined independent screening index, not a validated statistical or regulatory safety model. The five-inspection minimum and penalty thresholds are product rules, not official FMCSA confidence or legal thresholds.

- The previous OOS numerical thresholds remain unchanged.
- The previous numerical mortality threshold is retained but explicitly defined as **fatalities (people)** per 100 power units, not fatal crash events. It is not described as twice a national rate; that earlier claim was unsupported.
- The crash-record rate rule still concerns involvement, not fault or preventability. The index does not recreate the FMCSA Crash Indicator BASIC.
- Public SMS flag penalties and inferred MC authority penalties are removed because the implemented source fields do not establish those conclusions. Insurance remains informational with no deduction.
- Missing required data withholds the score rather than treating missingness as success.
- These changes can change the grade without any change in underlying government records. `version=2.0.0` accompanies every new calculation. Both Python and JavaScript produce the same score, reasons and factor text.

The public methodology page documents every threshold, rounding step, category minimum, grade boundary and limitation. It also corrects the inverted benchmark formula: **OOS inspections / total inspections × 100**.

## Validation performed before submission

| Check | Result |
| --- | --- |
| Python representative regression and staged-refresh tests | 16 tests passed |
| JavaScript Worker fixtures | Person/event counts, missing public indicators, exact MC prefix and invalid identifier passed |
| Full Python/JavaScript parity | 13,796 normalized source records matched, including reasons and factor text |
| Source integrity | 13,796 unique normalized records; OOS bounds/counts and crash/person invariants passed |
| Static build | 13,069 pages; 13,006 carrier reports |
| Generated-report claim scan | All 13,006 carrier pages passed; 2,783 have `NR` and no numerical score |
| Rendered interaction/layout checks | 12 checks passed with no JavaScript runtime exceptions; desktop 1440px and mobile 390px/360px, plus a dark-mode capture |

The rendered check used **the actual generated HTML/CSS/JavaScript offline in Chromium**, with mocked fetch/history/clipboard. The environment blocked normal navigation (`ERR_BLOCKED_BY_ADMINISTRATOR`), including a localhost attempt. This is not evidence that the public site is unavailable. External fonts and ads were blocked. Do not describe these checks as production-browser or live-API tests. PDF pagination, actual clipboard permissions and full accessibility compliance were not validated. See `docs/validation/2026-09-18-browser.json` and rerunnable `scripts/test_browser.py`.

## Deployment boundaries

`main` publishes the static site through `.github/workflows/pages.yml`. That workflow now gates deployment on representative regressions, cross-language parity, normalized-data validation, and a generated-report scan. The first code-only deployment uses the existing saved dataset, clearly labeled as such; it does **not** claim a fresh download.

Fresh collection is scheduled weekly on Monday at 04:20 UTC and is also available by running **Build and deploy** with `refresh_data=true`. Source update timestamps are checked before/after collection; changes, request failures or an unexpected >25% carrier-count drop stop publication. Weekly scheduling does not guarantee exact execution time or freshness of the upstream government's data.

`worker/api.mjs` is a **separate Cloudflare deployment**. The baseline repository had no Worker deployment workflow or Wrangler configuration. A GitHub Pages deployment alone does not prove the new Worker code is live. The new frontend and grader deliberately support the old API response shape, so unsafe text, person-count labels, liability-type checks and NR handling are corrected without depending on the Worker release. New row-level event counts and API retrieval timestamps require deployment of the updated Worker or a successful fresh static collection. Until present, the UI reports them as unavailable, not fabricated.

## Reproduction

```sh
python -m pip install jinja2
python scripts/test_safety.py
node scripts/test_safety.mjs
node scripts/test_grade.mjs
python scripts/validate_data.py
python scripts/build.py --adsense-pub ''
python scripts/validate_site.py
# Optional rendered test, with Playwright and Chromium already installed:
python scripts/test_browser.py --offline --output-dir /tmp/dot-browser-evidence
# Or serve dist/ and omit --offline to test localhost HTTP navigation.
```

## Official references consulted on 2026-09-18

1. [FMCSA: What is a private motor carrier?](https://www.fmcsa.dot.gov/faq/what-private-motor-carrier) — registration does not establish for-hire authority requirements or eligibility.
2. [FMCSA: FAST Act / CSA](https://www.fmcsa.dot.gov/fastact/csa) — property-carrier alerts and relative percentiles are removed from public display.
3. [FMCSA: SMS](https://ai.fmcsa.dot.gov/SMS) — public-data limitations, official warnings, and distinct data-current/website-updated dates.
4. [FMCSA: Crash Statistics](https://ai.fmcsa.dot.gov/CrashStatistics/CrashQueryTool) — crash counts, fatal crash counts, fatalities and injuries are distinct measures.
5. [U.S. government SMS dataset catalog](https://catalog.data.gov/dataset/sms-ab-passproperty) — monthly snapshot-based data and dataset metadata. Dataset modification is not a independently verified observation cutoff.

No source establishes that this independent A–F index predicts crashes, that five observations provide statistical confidence, or that a historical insurance filing certifies present coverage. Those claims are intentionally not made.
