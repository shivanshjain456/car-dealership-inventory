# Test and verification report

## Final verification

- **Command:** `npx --yes --package node@22.20.0 -c 'node --version && npm --version && npm run verify'`
- **Result:** exit code 0.
- **Runtime:** Node.js 22.20.0; npm 10.8.2.
- **Browser:** Playwright 1.64.1 with Chromium 156.0.8078.4. The browser and Linux runtime dependencies were installed in the verification environment before the passing run.

The `verify` script completed all configured gates:

| Gate                                               | Result                                              |
| -------------------------------------------------- | --------------------------------------------------- |
| Prettier `format:check`                            | Passed                                              |
| ESLint                                             | Passed                                              |
| TypeScript builds/typechecks (contracts, API, web) | Passed                                              |
| Contract tests                                     | 2 files, 28 tests passed                            |
| API tests                                          | 7 files, 45 tests passed                            |
| Web tests                                          | 4 files, 35 tests passed                            |
| **Unit/integration total**                         | **13 files, 108 tests passed**                      |
| Chromium end-to-end journeys                       | 4/4 passed                                          |
| Production build (API + SPA)                       | Passed; Vite 8.3.5 reported 124 modules transformed |
| `npm audit --audit-level=high`                     | Passed; 0 vulnerabilities reported                  |
| Current-tree configured secret/data scan           | Passed                                              |
| Reachable-history configured secret/data scan      | Passed                                              |

The final passing `npm run verify` ran after the private remote update and publication-status documentation corrections. The current-tree scanner checked **102 candidate text files**; the history scanner covered **102 current text files, 163 reachable Git blobs, and 14 commit-message/metadata records**. Both reported no configured credential or disclosure-pattern matches.