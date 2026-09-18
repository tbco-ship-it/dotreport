# Published-report integrity follow-up — 2026-09-18

## Preserve the actual production correction

During the owner's requested remediation, PR #1 was merged concurrently into `main` as `3c65cccdaa3b4d19d4a0a4263837e19577ea0215` (policy 2.0.0). The separately prepared `fix/data-integrity-2026-09-18` implementation was NOT merged over it. Its temporary installer was removed. This follow-up preserves PR #1's canonical scoring policy and adds only publication checks, tests and this record.

Primary change rationale and government-source references remain in [TRUST-AUDIT-2026-09-18.md](../TRUST-AUDIT-2026-09-18.md). The original correction and its limits are inspectable in [PR #1](https://github.com/tbco-ship-it/dotreport/pull/1).

## Why a separate publication gate is necessary

Correct calculations alone cannot prevent templates or copy from saying something unsupported. The original audit found A-grade headlines contradicting OOS and insurance details. Therefore `scripts/validate_site.py` checks the generated HTML itself after a full build and before uploading a Pages artifact. A failure stops publication; it is not a warning-only step.

Checks:

- Every carrier in `static/index.json` has exactly its expected page, with no extra stale carrier pages.
- No old blanket dispatch, clean-record, for-hire, full-verification or zero-alert claims, and no known wrong example-carrier labels, occur in generated HTML.
- Every carrier report includes separate registration/authority and unverified-coverage limitations, separate crash-event/person labels, and the no-dispatch-approval statement.
- Each main grade agrees with its numeric score; NR explicitly says Not rated and cannot display a numeric score.
- Every carrier page contains one main report and one report-interaction script.

Seven independent unit tests deliberately inject missing pages, false claims, missing limitations, numeric NR and grade/score mismatches. This verifies that the gate can fail, not merely that it passes the current snapshot.

## Independently executed checks

The exact source from final PR #1 QA artifact `10532499767` (run `35311056575`, PR head `e159b8511a3503b8376b973ed797f61e52f6f2fc`) was used for revalidation, with only the new publication validator and its tests added.

- Existing Python policy/normalization tests: 19 passed.
- Added publication-gate tests: 7 passed; combined Python suite: 26 passed.
- Worker normalization fixtures: 10 assertions passed. These are source tests, not a deployed-Worker test.
- Canonical invariants: all 13,796 retained input records passed.
- Full build: 13,069 indexed pages. There are 13,070 HTML files including the separate 404 page.
- Publication gate: all 13,006 filtered carrier pages passed.
- Published-carrier grade counts: A 4,384; B 2,636; C 1,096; D 509; F 41; NR 4,340.
- Retained-input counts are a different population: A 4,829; B 2,703; C 1,111; D 514; F 41; NR 4,598.
- Carrier-index SHA-256: `7e5d94d48acf4cc9bd9a7a09438437d8a6742cf0b7b31f2329a6481c06ce9a03`.

The validator writes `dist/integrity-check.json` with counts, index checksum and the GitHub source SHA when run in Actions. This is shipped next to `build-info.json`, so verification can be tied to an exact deployment artifact rather than a chat claim.

## Deployment evidence and limits

PR #1's production Pages run [35311136682](https://github.com/tbco-ship-it/dotreport/actions/runs/35311136682) completed successfully for source `3c65cccdaa3b4d19d4a0a4263837e19577ea0215`. The follow-up PR and its separate production run must also pass; that status must not be inferred from the earlier run.

This follow-up does not deploy Cloudflare, fetch a new nationwide snapshot, change scores or overwrite carrier data. The frontend's compatibility handling and the separate Worker deployment boundary remain as documented in PR #1. Local direct access to production was unavailable, so no live API or live-browser correctness claim is made. Existing offline browser evidence is in `browser-results.json`; this CI-only follow-up does not change rendered application code.

A direct invocation of `scripts/validate_data.py` on the retained legacy snapshot fails its schema-v2 assertion by design. That script is for newly collected and normalized snapshots, not ordinary code builds. It remains behind the existing refresh path. The new HTML gate supports both retained legacy and refreshed v2 snapshots.

## Reproduce

```sh
pip install jinja2
python -m unittest discover -s tests -v
node tests/test_worker.mjs
node scripts/test_grade.mjs
python scripts/build.py --base / --origin https://dotreportcard.com --cname dotreportcard.com --api https://api.dotreportcard.com
python scripts/validate_site.py
```

Passing these checks establishes only the listed code and rendered-output invariants. It does not establish current insurance, dispatch eligibility, official carrier safety, legal compliance, full accessibility compliance or third-party API uptime.
