# Test and verification report

## Final verification — 25 October 2026

- **Command:** `npx --yes --package node@22.20.0 -c 'node --version && npm --version && npm run verify'`
- **Result:** exit code 0.
- **Runtime:** Node.js 22.20.0; npm 10.8.2.
- **Browser:** Playwright 1.64.1 with Chromium 156.0.8078.4.

The `verify` script completed all configured gates:

| Gate                                               | Result                                              |
| -------------------------------------------------- | --------------------------------------------------- |
| Prettier `format:check`                            | Passed                                              |
| ESLint                                             | Passed                                              |
| TypeScript builds/typechecks (contracts, API, web) | Passed                                              |
| Contract tests                                     | 2 files, 28 tests passed                            |
| API tests                                          | 9 files, 55 tests passed                            |
| Web tests                                          | 4 files, 35 tests passed                            |
| **Unit/integration total**                         | **15 files, 118 tests passed**                      |
| Chromium end-to-end journeys                       | 4/4 passed                                          |
| Production build (API + SPA)                       | Passed; Vite 8.3.5 reported 124 modules transformed |
| `npm audit --audit-level=high`                     | Passed; 0 vulnerabilities reported                  |
| Current-tree configured secret/data scan           | Passed                                              |
| Reachable-history configured secret/data scan      | Passed                                              |

During that run, the current-tree scanner checked **92 candidate text files**; the history scanner covered **92 current text files, 130 reachable Git blobs, and 17 commit-message/metadata records**. Both reported no configured credential or disclosure-pattern matches.

## Coverage

`npm run coverage` also exited 0 on 25 October 2026. Coverage is reported for visibility; the Vitest configurations do not impose a separate numeric failing threshold.

| Workspace | Statements | Branches | Functions |  Lines |
| --------- | ---------: | -------: | --------: | -----: |
| Contracts |     95.23% |   87.93% |   100.00% | 95.06% |
| API       |     89.19% |   80.09% |    94.50% | 90.75% |
| Web       |     88.99% |   80.11% |    96.11% | 92.87% |

## Live-QA remediation evidence

The hosted Render demo was first audited end to end on 25 October 2026. The effective result was **278 passing assertions and 4 failed assertions mapping to 3 defects**: the edge-returned vehicle ETag could not be replayed as `If-Match`, Unicode search was ASCII-only, and `HEAD /` returned 404. The same review also drove fixes for copied-token reuse after logout, missing favicon/robots responses, and non-immutable hashed-asset caching.

After the Red–Green–Refactor fixes were deployed, a focused live recheck recorded **20/20 passes** covering:

- `/api/health`, GET and HEAD access to the SPA shell, and its `no-cache` policy;
- one-year immutable caching for the built JavaScript and CSS assets;
- `/favicon.svg`, `/favicon.ico`, and `/robots.txt` success responses;
- demo Admin login and the five seeded vehicles;
- creation and update of a temporary Unicode vehicle by replaying the exact ETag returned through the hosted edge;
- Unicode search by make, model, category, and free text;
- rejection of a copied token after logout while a second session remained valid;
- deletion of the temporary vehicle and restoration of exactly the five demo vehicles.

## Remaining platform limits

- Render Free may take roughly a minute to wake after idle time. Its disposable filesystem and the demo start command reset accounts and inventory to the public demo seed on restart, redeploy, or after spin-down.
- Some SQL-looking search strings can receive an edge-generated 403 before reaching the origin. Requests that reach the API use parameterized SQL and escaped literal wildcard handling; the edge response is an availability limitation of the free hosting path.
- The focused live recheck verifies the corrected behavior through the deployed edge, but it is not a load, penetration, backup/restore, or high-availability test.
