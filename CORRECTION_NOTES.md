# ResolveNet correction notes

Changes applied:
- Disabled photo-based automatic department routing by default until the image model is validated. An explicit ENABLE_IMAGE_AUTO_ROUTING=true environment setting opts in after validation.
- Reset escalationLevel and escalatedAt after monitor rejection so a rework cycle can escalate again.
- Added uploaded-file cleanup for early validation failures and complaint-creation failures.
- Added server-side image signature checks (JPEG, PNG, GIF); removed WEBP from accepted types because the current Jimp pipeline does not decode it.
- Made the DNS resolver override opt-in through DNS_SERVERS.
- Hide internal error details from 500 API responses.
- Validate required MONGO_URI and JWT_SECRET at startup, reject the example JWT placeholder, and start the escalation scheduler only after MongoDB connects.
- Updated frontend accepted image types and relevant documentation.

Validation:
- All JavaScript files passed `node --check`.
- Full npm test suite was not run because dependencies are not installed in this extracted archive. Run `npm ci` in backend/ and frontend/, then run the test/build commands in the root README.

Not included:
- Login/registration rate limiting was not added; it needs a separate dependency and focused tests.
