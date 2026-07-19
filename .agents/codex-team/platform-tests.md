# Platform and Persistence Validation

## Coverage

- Persistence: v1 defaults and save key, full board unlocks, Golden Coast selection, full Wave Read Assist, legacy v1 default merging, invalid-version fallback, monotonic run records, condition metadata, and single-key writes.
- Static host: relative and present HTML assets, recursively resolved local native-module imports, absence of remote runtime URLs, 384×216 canvas invariants, source-entry hosting without build output, integration-adapter lifecycle, and local-only QA references.

## Fresh Verification

Recorded at `2026-07-19T09:49:51-05:00`.

- `node --test tests/persistence.test.js tests/static-host.test.js` — 12 passed, 0 failed, 0 skipped; duration 353.3248 ms.
- `node --check tests/persistence.test.js` and `node --check tests/static-host.test.js` — passed.
- PowerShell loop running `node --check` over all 19 `js/*.js` modules — passed.

No blockers found.
