# Security notes

## Known unresolved dependency vulnerability: Zod (via Jimp)

- **Advisory:** GHSA-mrhx-c7xc-m3w5, "Zod can exhaust memory while validating oversized constrained collections" (affects `zod` below 4.6.6).
- **Affected package:** `zod` 3.25.76, pulled in by `jimp` 1.6.1 (`@jimp/types` and the other `@jimp/*` packages). `jimp` is a direct backend dependency, used to read uploaded complaint photos in `backend/services/teachableMachineClassifier.js`.
- **Status:** not fixed. The newest 3.x release of Zod is still in the vulnerable range, and `jimp` requires Zod 3. The only fix found is to force Zod 4 with an override, which `jimp` does not support. This has not been done. Replacing `jimp` is the planned longer-term option.
- **Assessment:** this advisory concerns validating oversized collections. ResolveNet does not pass user-supplied option data to Jimp; it only calls `Jimp.read` on an uploaded file. This assessment has not been checked line by line against the advisory text.
- **Mitigations in place:** uploads are limited to 5 MB and to JPEG, PNG, GIF, and WebP files (`backend/middleware/uploadMiddleware.js`), and complaint photos are served only to authorized users.

Re-check this note whenever `jimp` or `zod` is updated, and run `npm audit` in `backend/` before each release.
