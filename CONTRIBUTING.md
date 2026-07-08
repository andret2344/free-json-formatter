# Contributing to Free JSON Formatter

Thanks for your interest in improving Free JSON Formatter! This project is a small,
dependency-light browser extension, so contributing is quick to get into.

## Ground rules

- **Privacy is the point.** No telemetry, no analytics, no external network requests, ever.
  A pull request that adds any of these will be declined.
- **Minimal permissions.** Do not add manifest permissions or host permissions without a
  strong, discussed reason.
- Be respectful — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Getting started

```bash
git clone https://github.com/andret2344/free-json-formatter.git
cd free-json-formatter
yarn install
yarn build         # builds dist/chromium and dist/firefox
```

Load the unpacked extension:

- **Chromium:** `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
  select `dist/chromium`.
- **Firefox:** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
  select `dist/firefox/manifest.json`.

Open `test/sample.json` or any JSON API endpoint to see it in action. Run `yarn watch`
to rebuild on change (reload the extension afterwards).

This project uses [Yarn](https://classic.yarnpkg.com/) (Classic / v1).

## Before you open a pull request

Run the full local check — CI runs the same commands:

```bash
yarn run check         # Biome: format + lint (use `run`; bare `yarn check` is a Yarn built-in)
yarn typecheck         # tsc --noEmit
yarn test              # Vitest
```

Fix formatting and safe lint issues automatically with `yarn check:fix` (or `yarn format` for
formatting only). Formatting and linting are both handled by [Biome](https://biomejs.dev).

## Code style

- **TypeScript**, strict mode. Keep it dependency-free at runtime.
- Every `if`/`for`/`while` uses braces `{}`, even one-liners.
- Extract non-trivial union types into named type aliases rather than inlining them.
- Use descriptive names - no single-letter or abbreviated identifiers (`node`, not `n`; `separator`, not `sep`).
- Give array-operation callbacks (`map`/`filter`/`find`/…) a named function instead of an inline arrow.
- Build DOM through the shared factories in `src/dom.ts` (`createElement`, `button`, `separator`) rather than raw `document.createElement`.
- All injected DOM and CSS is namespaced under `fjf-` to avoid clashing with page styles.
- Add or update tests in `test/` for any behavior change.

## Project layout

| Path                 | Purpose                                        |
|----------------------|------------------------------------------------|
| `src/content.ts`     | Entry point: detection, mounting, toolbar.     |
| `src/detect.ts`      | Decides whether a document is raw JSON.        |
| `src/formatter.ts`   | JSON → collapsible DOM tree (lazy children).   |
| `src/search.ts`      | In-tree text search + navigation.              |
| `src/dom.ts`         | Shared DOM element factories (createElement…). |
| `src/config.ts`      | Persisted prefs: max size, wrap, indent, case. |
| `src/popup.*`        | Settings popup (HTML, TypeScript, CSS).        |
| `src/types.ts`       | JSON value types and helpers.                  |
| `src/content.css`    | All `fjf-*` styles + theming.                  |
| `src/manifest.json`  | Base MV3 manifest (Firefox id added at build). |
| `scripts/build.mjs`  | esbuild bundle + per-browser packaging.        |
| `test/`              | Vitest suites (jsdom).                         |
| `.github/workflows/` | CI: check on every push/PR, release on tags.   |

## Releases

Pushing a tag matching `v*` (e.g. `v1.1.0`) triggers CI to build and zip the Chromium and
Firefox packages and attach them to a GitHub Release.
