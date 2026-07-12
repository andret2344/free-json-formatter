# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Manifest V3 browser extension (Chrome + Firefox) that detects raw-JSON pages and replaces them with an interactive, collapsible tree viewer. Hard constraint, enforced in review
and issue/PR templates: **no telemetry, no external network requests, no added manifest permissions** (`storage` is the only permission). A change that breaks this is rejected -
treat it as a build failure.

## Commands

Package manager is **Yarn Classic (v1)** - not npm.

```bash
yarn build              # build both dist/chromium and dist/firefox
yarn build:chromium     # one target only
yarn build:firefox
yarn watch              # esbuild watch, chromium target

yarn run check          # Biome format + lint (CI gate). NOTE: `yarn run check`, not bare `yarn check` (that's a Yarn built-in)
yarn check:fix          # apply safe Biome fixes
yarn typecheck          # tsc --noEmit
yarn test               # Vitest (jsdom), single run
yarn test:coverage      # Vitest + v8 coverage → coverage/lcov.info (CI uploads to Codecov)
yarn test:e2e           # Playwright, real Chromium with dist/chromium loaded (run `yarn build` first)

yarn icons              # rasterize assets/icon.svg → icons/icon{16,48,128}.png (sharp)
```

Run one test file / one case:

```bash
yarn vitest run test/viewer/formatter.test.ts
yarn vitest run -t "does not create the children of a collapsed collection"
```

CI (`.github/workflows/ci.yml`) runs `yarn run check`, `yarn typecheck`, `yarn build`, `yarn test:coverage` on push/PR to `main`, plus a separate `e2e` job (build + Playwright).
Build+pack+GitHub-release jobs run only on `v*` tags.

## Build system

There is no bundler config file - `scripts/build.mjs` is the whole pipeline (esbuild as a library). It bundles three IIFE entry points (`src/content/content.ts`,
`src/content/console-handle.ts`, `src/popup/popup.ts`), copies static assets (`content/content.css`, `popup/popup.html`, `popup/popup.css`, `icons/`) **flat** into the dist root -
the manifest and `popup.html` reference the flat names, so keep the `STATIC_FILES` mapping in sync when moving a file. The single base manifest is `src/manifest.json`; the Firefox
build injects `browser_specific_settings.gecko` (extension id + `strict_min_version`, which is **128** - the first Firefox with `"world": "MAIN"`) at build time. To change manifest
fields, edit `src/manifest.json`, not the dist output.

## Layout

```
src/
  manifest.json     base manifest (the only permission is `storage`; two content scripts - isolated + page world)
  content/          content-script entry point + injected CSS + the page-world console handle
  popup/            settings page (html + css + ts)
  viewer/           the tree UI: formatter, search, expansion policy, DOM factories
  shared/           config (storage), detect (preflight + parse), JSON types, the two-world bridge
test/               mirrors src: test/viewer, test/shared, test/popup, test/helpers
e2e/                Playwright specs + fixtures (real Chromium, unpacked dist/chromium)
```

Tests are `describe(...)` groups of `it(...)` - never a top-level `it`/`test`, in either suite.

## Architecture

Three independent entry points, no shared runtime framework:

- **`src/content/content.ts`** - injected into every page at `document_end`. Runs the cheap `inspectPotentialJsonDocument()` preflight *before* touching storage (the script runs on
  `<all_urls>`), then reads prefs, parses, and `mount()` builds the toolbar + tree entirely off-DOM before one **atomic swap** into the page (apply theme, clear body, insert). The
  synchronous no-`await` swap block is deliberate - it avoids a white flash and a frame of recolored raw text; preserve that property when editing `mount()`. `syncControls()` is the
  single place that decides control state: while an expansion runs, every tree control is disabled (except **Collapse all**, which cancels it) and **the tree is taken off screen** -
  laying out an on-screen tree after each of the ~60 batches is quadratic (64s to expand a 200 kB document; 1.4s hidden, plus one 4s layout at the end). The preloader stands in for it.
- **`src/content/console-handle.ts`** - runs in the **page's world** (`"world": "MAIN"`), which is where the devtools console evaluates. It defines a lazy `window.json` getter that
  parses the text in the Raw view on access, and logs `Type "json" to inspect`. It must stay in that world: a value defined by the isolated content script is invisible to the console,
  and injecting an inline `<script>` instead is blocked by the extension's CSP. The two worlds talk through `src/shared/bridge.ts` (a `fjf-mounted` event; they start in no fixed order,
  so the handle also checks for an already-mounted viewer).
- **`src/popup/popup.ts`** - the settings page (max payload size, initial expanded depth). Saves to storage and reports `Saved` / `Save failed`. It must **never** reload a tab -
  that would destroy unsaved page state, and `tabs` is not a permission we hold.

Supporting modules:

- **`src/shared/detect.ts`** - two stages, deliberately split. `inspectPotentialJsonDocument()` is the preflight: no storage, no `JSON.parse()`, no DOM writes - content-type,
  `.json` URL, empty body or a lone `<pre>`, and (without a JSON content-type) text that starts with `{`/`[`. `parseDetectedJson()` then measures the real UTF-8 size
  (`TextEncoder().encode(text).byteLength`, computed **once** and carried in `Detected.rawByteLength`) against the limit and parses.
- **`src/viewer/formatter.ts`** - `renderJson(value, initialDepth)` builds the tree. Every collection is **lazy**: children are created the first time the node is opened and never
  rebuilt, so collapsed branches simply do not exist in the DOM. `initialDepth` only decides which collections *start* open (root = depth 0, open while `depth < initialDepth`) - it
  must never turn into eager rendering. Each entry is registered under its `pathKey()` (JSON-encoded path: array index `0` ≠ object key `"0"`), which is what lets search reveal a
  single branch. `createExpansionController()` owns Expand/Collapse all: a queue walked in batches with a yield between them, one generation per run so a new run or a cancel
  retires the old one.
- **`src/viewer/expansion.ts`** - `resolveInitialExpansionDepth(value, rawByteLength, preference)` turns the stored preference into `1..5 | 'all'`. `auto` decides from a **bounded**
  iterative scan (`SCAN_NODE_LIMIT`): byte size, element count, and nesting depth; it never returns less than 1, and a scan that hits the limit means "large" → depth 1.
- **`src/viewer/search.ts`** - searches the **parsed JSON**, not the DOM, so hits in unrendered branches are found. Matches carry a path + `key`/`value` field; focusing one reveals
  only that branch. Highlights use the **CSS Custom Highlight API** (zero DOM mutation) with a `<mark>`-wrapping fallback where it is unavailable (e.g. jsdom in tests).
- **`src/viewer/dom.ts`** - shared element factories (`createElement`, `button`, `separator`). Build DOM through these, not raw `document.createElement`.
- **Line numbers** live in `data-line`, written at render time from `lineCount()` - a line's number is its position in the *fully expanded* document, so a collapsed branch leaves a
  gap (as code folding does) and nothing ever has to renumber. Do not go back to a CSS counter: a counter on the gutter pseudo makes the browser rebuild the whole counter tree on
  every layout. The gutter is a `::before` (so selecting the tree never copies the numbers) that is `position: sticky` in the line's flow, undoing the nesting indent with a negative
  margin so it still forms a straight column. Lines are sized by `.fjf-tree > .fjf-entry { width: max-content }` - a viewport-wide line box would end at the fold, and hover with it.
- **`src/shared/config.ts`** - thin `chrome.storage.local` wrappers for persisted prefs (max-MB, initial expansion depth, wrap, indentation, search case). All storage access is
  wrapped in try/catch and degrades silently. `INDENT_OPTIONS` and `depthFromValue()` are the source of truth for those choices. Theme is persisted separately, inside `content.ts`
  (`THEME_KEY`).
- **`src/shared/types.ts`** - JSON value types plus `isExpandable()`, `entriesOf()`, `childCount()`, `looksLikeUrl()`.
- **`e2e/`** - Playwright against a real Chromium with the unpacked `dist/chromium` loaded: plain pages stay untouched, JSON pages format, depth settings, cancellable expansion,
  search into unrendered branches, popup saves without reloading, and no external requests. The extension id is read from `chrome://extensions-internals` - MV3 without a background
  worker exposes it nowhere else, and adding one is not allowed.

All injected DOM and CSS is namespaced under `fjf-` to avoid clashing with page styles.

## Code style (enforced by Biome + convention)

- Strict TypeScript; runtime must stay dependency-free (only dev deps).
- Every `if`/`for`/`while` uses braces, even one-liners.
- Extract non-trivial union types into named aliases; don't inline them.
- Descriptive names - no single-letter or abbreviated identifiers (`node` not `n`, `separator` not `sep`).
- Array-operation callbacks (`map`/`filter`/`find`/…) get a named function, not an inline arrow.
- Add or update tests in `test/` for any behavior change.

Conventions observed throughout the source (match them):

- **Explicit types everywhere** - annotate locals, parameters, and return types, even when inferable (`const node: HTMLDivElement = …`, every function ends `: void` /
  `: Promise<void>`). Typed event-listener arrows too: `(event: MouseEvent): void => {…}`.
- **Relative imports carry the `.js` extension** (`from './config.js'`), even though the sources are `.ts`. Keep it - the ESM resolution depends on it.
- **Explicit null comparisons** - `if (target !== null)`, `text === null`; not truthiness checks.
- **Fire-and-forget promises use the `void` operator** (`void chrome.storage.local.set(...)`, `void start()`).
- **Storage / clipboard access is wrapped in try/catch and degrades silently**, with a short comment stating why (`/* storage may be unavailable */`). Don't let a blocked API throw
  into the UI.
- **No enums / no `switch` for small closed sets** - use string-literal unions with a `const` array or object map as the source of truth (`INDENT_OPTIONS`, `THEME_ORDER`,
  `THEME_LABELS`). Add a case by extending the data, not by writing a branch.
- **`readonly` on every interface field, always.** No exceptions - interface properties are `readonly` by default. If a field genuinely must be mutated after construction, that is
  a design smell to reconsider, not a reason to drop `readonly`.
- **Interface members are arrow-function properties**, never method shorthand: `readonly expandAll: () => Promise<void>;`, not `expandAll(): Promise<void>;`.
- **Named constants for magic values and storage keys**, UPPER_SNAKE at module scope (`THEME_KEY`, `LARGE_BYTES`, `DEBOUNCE_MS`).
- **Comments explain *why*, not *what*** - the non-obvious rationale (atomic swap, lazy-render loop, dual highlight paths) is documented; trivial mechanics are not.

Biome config (`biome.json`): tabs, width 120, single quotes, no trailing commas, semicolons always, **CRLF line endings**.
