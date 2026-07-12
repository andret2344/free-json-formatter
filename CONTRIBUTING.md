# Contributing to Free JSON Formatter

Thanks for your interest in improving Free JSON Formatter! This project is a small,
dependency-light browser extension, so contributing is quick to get into.

## Ground rules

- **Privacy is the point.** No telemetry, no analytics, no external network requests, ever.
  A pull request that adds any of these will be declined.
- **Minimal permissions.** Do not add manifest permissions or host permissions without a
  strong, discussed reason.
- Be respectful - see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

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

Open `test/helpers/sample.json` or any JSON API endpoint to see it in action. Run `yarn watch`
to rebuild on change (reload the extension afterwards).

This project uses [Yarn](https://classic.yarnpkg.com/) (Classic / v1).

## Before you open a pull request

Run the full local check - CI runs the same commands:

```bash
yarn run check         # Biome: format + lint (use `run`; bare `yarn check` is a Yarn built-in)
yarn typecheck         # tsc --noEmit
yarn test              # Vitest
yarn build && yarn test:e2e   # Playwright against the built extension (CI runs this as its own job)
```

Fix formatting and safe lint issues automatically with `yarn check:fix` (or `yarn format` for
formatting only). Formatting and linting are both handled by [Biome](https://biomejs.dev).

## Documentation is part of the change

A change to what the extension **stores, reads, or can reach** - a new `chrome.storage` key, a
changed manifest permission, a new browser API - must update, in the same pull request:

- **[PRIVACY.md](PRIVACY.md)**: the storage-key table and the `Last updated` date. That file is the
  privacy policy the Chrome Web Store listing points at, so a stale table is a false statement to
  users, not a docs nit.
- **[SECURITY.md](SECURITY.md)**: the "Minimal permissions" bullet, which lists the same settings.
- **[README.md](README.md)**: the Privacy table.

The same rule applies to anything else these files describe: if you move a file, rename a script, or
change a documented behavior, fix the sentence that describes it in the same commit.

## Code style

- **TypeScript**, strict mode. Keep it dependency-free at runtime.
- Every `if`/`for`/`while` uses braces `{}`, even one-liners.
- Extract non-trivial union types into named type aliases rather than inlining them.
- Use descriptive names - no single-letter or abbreviated identifiers (`node`, not `n`; `separator`, not `sep`).
- Give array-operation callbacks (`map`/`filter`/`find`/…) a named function instead of an inline arrow.
- **No destructuring in function parameters.** Take the whole object or tuple and read its fields inside the body (`function f(entry: JsonEntry)`, then `entry.key` - not
  `function f({key}: JsonEntry)`). Destructuring a *local* off a call result (`const [open, close] = brackets(collection)`) is fine - the rule is about parameters. The one exception
  is the Playwright fixture and test callbacks in `e2e/`, which *must* destructure: Playwright reads a test's fixture dependencies out of that pattern and rejects a plain parameter
  with *"First argument must use the object destructuring pattern"*.
- Build DOM through the shared factories in `src/viewer/dom.ts` (`createElement`, `button`, `separator`) rather than raw `document.createElement`.
- All injected DOM and CSS is namespaced under `fjf-` to avoid clashing with page styles.
- Add or update tests in `test/` for any behavior change.

## Project layout

| Path                            | Purpose                                                   |
|---------------------------------|-----------------------------------------------------------|
| `src/manifest.json`             | Base MV3 manifest (Firefox id added at build).            |
| `src/content/content.ts`        | Entry point: detection, mounting, toolbar, line links.    |
| `src/content/content.css`       | All `fjf-*` styles + theming.                             |
| `src/content/console-handle.ts` | Page-world script: exposes the document to devtools.      |
| `src/viewer/formatter.ts`       | JSON → collapsible DOM tree (lazy children), expansion.   |
| `src/viewer/search.ts`          | Search over the parsed JSON + navigation and highlights.  |
| `src/viewer/expansion.ts`       | Picks the initial depth from the document's size + shape. |
| `src/viewer/dom.ts`             | Shared DOM element factories (createElement…).            |
| `src/shared/detect.ts`          | Decides whether a document is raw JSON.                   |
| `src/shared/config.ts`          | Persisted prefs: max size, depth, wrap, indent, case.     |
| `src/shared/types.ts`           | JSON value types and helpers.                             |
| `src/shared/bridge.ts`          | The contract between the isolated and page worlds.        |
| `src/popup/`                    | Settings popup (HTML, TypeScript, CSS).                   |
| `scripts/build.mjs`             | esbuild bundle + per-browser packaging.                   |
| `test/`                         | Vitest suites (jsdom), mirroring `src/`.                  |
| `e2e/`                          | Playwright suites (real Chromium, unpacked build).        |
| `.github/workflows/`            | CI: checks on every push/PR, release on `v*` tags.        |

## Releases

Pushing a tag matching `v*` (e.g. `v1.1.0`) triggers CI to build and zip the Chromium and
Firefox packages and attach them to a GitHub Release.
