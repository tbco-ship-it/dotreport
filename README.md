# DOT Report Card

Static site (Python/Jinja2 → GitHub Pages) + one Cloudflare Worker that proxies FMCSA open data for live lookups.

- `scripts/collect.py [MIN_PU]` — download the static carrier set (active interstate carriers with ≥ MIN_PU power units) + SMS/insurance/crash rows into `data/raw/` (resumable per file).
- `scripts/normalize.py` — `data/raw/*` → `data/carriers.json` (graded) + `data/national.json`.
- `scripts/build.py` — render `dist/`. Local preview: `python3 -m http.server 8000 -d dist` + `node scripts/dev_api.mjs`, build with `--api http://localhost:8787 --origin http://localhost:8000 --cname ""`.
- `scripts/test_grade.mjs` — asserts `static/grade.js` reproduces `scripts/grading.py` for every carrier (run after touching either).
- `worker/api.mjs` — Cloudflare Worker `dotreport-api` (`/carrier?dot=`, `/search?q=`).
- `data/partners.json` — affiliate slots; a slot renders only when `url` is set.


## Trust policy and validation

Requires Node 22+ as well as Python/Jinja2: static builds call the same screening policy as the browser.
Read [the 2026-09-18 trust remediation record](docs/TRUST-AUDIT-2026-09-18.md) for findings, official references, regression commands, source-date semantics, and the separate API Worker deployment boundary.

Do not use stored `grade` values as current output; run `scripts/build.py`. `NR` means insufficient evidence, not an adverse safety rating. GitHub Pages builds run regression checks. Weekly/manual source refreshes validate data before replacing the retained snapshot.
