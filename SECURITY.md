# Security Policy

Free JSON Formatter is built to be safe by design:

- **No external network requests.** The content script never contacts any server.
- **No telemetry or analytics.**
- **Minimal access:** the extension uses the `storage` API permission solely to remember view
  preferences. Its content scripts run on pages opened by the user because JSON documents may be
  served from any URL. On non-JSON pages, they perform a lightweight check and exit.
- **No remote code.** Everything ships in the packaged bundle; nothing is fetched at runtime.

What is stored, key by key, is listed in the [Privacy Policy](PRIVACY.md).

## Reporting a vulnerability

If you believe you've found a security issue, please **do not open a public issue**.
Instead, report it privately via GitHub's
[private vulnerability reporting](https://github.com/andret2344/free-json-formatter/security/advisories/new)
or by contacting the repository owner directly.

Please include:

- A description of the issue and its impact.
- Steps to reproduce (a sample JSON payload or page, if relevant).
- The extension version and browser.

You can expect an initial response within a few days. Fixes for confirmed issues will be
released as soon as practical, with credit to the reporter unless you prefer to remain
anonymous.
