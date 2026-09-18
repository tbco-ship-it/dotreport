# DOT Report Card

Static site (Python/Jinja2 → GitHub Pages) + one Cloudflare Worker that proxies FMCSA open data for live lookups.

- `scripts/collect.py [MIN_PU]` — download the static carrier set (active interstate carriers with ≥ MIN_PU power units) + SMS/insurance/crash rows into `data/raw/` (resumable per file).
- `scripts/normalize.py` — `data/raw/*` → `data/carriers.json` (graded) + `data/national.json`.
- `scripts/build.py` — render `dist/`. Local preview: `python3 -m http.server 8000 -d dist` + `node scripts/dev_api.mjs`, build with `--api http://localhost:8787 --origin http://localhost:8000 --cname ""`.
- `scripts/test_grade.mjs` — asserts `static/grade.js` reproduces `scripts/grading.py` for every carrier (run after touching either).
- `worker/api.mjs` — Cloudflare Worker `dotreport-api` (`/carrier?dot=`, `/search?q=`).
- `data/partners.json` — affiliate slots; a slot renders only when `url` is set.

## Integrity release (2026-09-18)

Read [the evidence ledger and release limits](docs/2026-09-18-data-integrity.md) before interpreting grades. Index v2.0.0 withholds scores (`NR`) for insufficient data; it does not verify dispatch eligibility, operating authority or active insurance coverage. Crash person counts and event counts are distinct. Saved JSON grades are recalculated during every build.

Required checks: `python scripts/test_safety.py`, `node scripts/test_safety.mjs`, `node scripts/test_grade.mjs`, `python scripts/validate_data.py`, then build and `python scripts/validate_site.py`. `scripts/test_browser.py` supplies optional rendered fixture tests with Playwright/Chromium; `--offline` mocks network/history/clipboard and is not a live-site test.

`python scripts/refresh.py` performs a fresh staged collection, validates source consistency, and records per-source provenance. The Pages workflow runs it weekly or manually with `refresh_data=true`; code-only deploys do not recollect data. A failed refresh cannot publish partial data. Worker changes still require a separate Cloudflare deployment; the browser supports legacy response fields in the meantime.
