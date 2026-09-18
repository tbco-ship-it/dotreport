# Validation record — 2026-09-18

## Reviewed code

Code commit: `1ccbcad0504222393df10e96e66f15790ecf639f`.
Original production source: `2d305c1f65dae18105eff372f2b00c629ad9aa50`.

The local container could not reach GitHub directly. The exact tested non-workflow patch was transferred through temporary Git blobs and an isolated-branch workflow. Its decompressed SHA-256 was verified before applying: `4e606241fe2c630c80ad95719edb213371052976e8e3b91f169d9b5fa20a58e6`. The transfer files were removed by the code commit; the temporary workflow was removed before promotion to main. No credentials were read and no external deployment was performed by that transfer workflow.

GitHub verification run: https://github.com/tbco-ship-it/dotreport/actions/runs/35310691891 — completed successfully before production promotion. It ran all of the following against the applied code, not the old source:

- 19 Python regression tests.
- Worker normalization fixture checks (10 assertions).
- Canonical policy invariants across all 13,796 stored records.
- Full build: 13,069 pages, including 13,006 filtered carrier pages.

The retained-input grade distribution under policy 2.0.0 is NR 4,598; A 4,829; B 2,703; C 1,111; D 514; F 41. This describes the retained input snapshot, not current nationwide carrier safety.

## Browser checks

Seven local offline Chromium checks passed again after the final code changes. See `browser-results.json`. Static report and print handler, mobile verification-first order with no 390px overflow, legacy and v2 API fixture rendering, missing-data NR/neutral state, API-error handling, and no unhandled application JavaScript errors were checked. All network requests were aborted in this offline harness; no external font, advertisement, actual API response, clipboard action or live production navigation is claimed.

## Deployment verification

A successful isolated-branch run is not itself production deployment. The production `.github/workflows/pages.yml` run for the promoted main commit must succeed. `build-info.json` records the source commit, data commit, policy version, run ID and refresh outcome so a deployed artifact can be matched to its source. The source-data refresh is weekly or manually requested; an ordinary code push rebuilds the retained snapshot without relabeling its dates.

The Cloudflare API remains a separate deployment. Frontend compatibility covers legacy API payloads; the updated Worker normalization cannot be described as deployed without a separate Worker release and real API smoke test.
