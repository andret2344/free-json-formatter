# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Manifest V3 browser extension (Chrome + Firefox) that detects raw-JSON pages and replaces them with an interactive, collapsible tree viewer. Hard constraint, enforced in review
and issue/PR templates: **no telemetry, no external network requests, no added manifest permissions** (`storage` is the only permission). A change that breaks this is rejected —
treat it as a build failure.

## Commands

Package manager is **Yarn Classic (v1)** — not npm.

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

yarn icons              # rasterize assets/icon.svg → icons/icon{16,48,128}.png (sharp)
```

Run one test file / one case:

```bash
yarn vitest run test/formatter.test.ts
yarn vitest run -t "collapses and expands on toggle click"
```

CI (`.github/workflows/ci.yml`) runs `yarn run check`, `yarn typecheck`, `yarn test:coverage` on push/PR to `main`. Build+pack+GitHub-release jobs run only on `v*` tags.

## Build system

There is no bundler config file — `scripts/build.mjs` is the whole pipeline (esbuild as a library). It bundles two IIFE entry points (`src/content.ts`, `src/popup.ts`), copies
static assets (`content.css`, `popup.html`, `popup.css`, `icons/`), and writes a per-browser `manifest.json`. The single base manifest is `src/manifest.json`; the Firefox build
injects `browser_specific_settings.gecko` (extension id + `strict_min_version`) at build time. To change manifest fields, edit `src/manifest.json`, not the dist output.

## Architecture

Two independent entry points, no shared runtime framework:

- **`src/content.ts`** — injected into every page at `document_end`. Calls `detect()`; if the page is JSON, `mount()` builds the toolbar + tree entirely off-DOM, then does one *
  *atomic swap** into the page (apply theme, clear body, insert). The synchronous no-`await` swap block is deliberate — it avoids a white flash and a frame of recolored raw text;
  preserve that property when editing `mount()`.
- **`src/popup.ts`** — the settings page (max payload size). Saves to storage and reloads the active tab so the new limit applies.

Supporting modules:

- **`src/detect.ts`** — decides whether a document is raw JSON (content-type, `.json` URL, or a lone `<pre>` that parses). Deliberately conservative: without a JSON content-type it
  only takes over text starting with `{`/`[`, so normal HTML pages are left untouched.
- **`src/formatter.ts`** — `renderJson()` → `renderEntry()` builds the DOM tree. Children of expandable nodes are built **lazily on first expand**. Because of this,
  `setAllExpanded()` loops until the tree stops changing (expanding reveals new collapsed nodes).
- **`src/search.ts`** — highlights matches via the **CSS Custom Highlight API** (zero DOM mutation) with a `<mark>`-wrapping fallback for environments without it (e.g. jsdom in
  tests). Expands the whole tree before searching.
- **`src/config.ts`** — thin `chrome.storage.local` wrappers for persisted prefs (max-MB, wrap, indentation, search case). All storage access is wrapped in try/catch and degrades
  silently. `INDENT_OPTIONS` is the source of truth for indentation choices. Theme is persisted separately, inside `content.ts` (`THEME_KEY`).
- **`src/dom.ts`** — shared element factories (`createElement`, `button`, `separator`). Build DOM through these, not raw `document.createElement`.
- **`src/types.ts`** — JSON value types plus `isExpandable()` / `looksLikeUrl()`.

All injected DOM and CSS is namespaced under `fjf-` to avoid clashing with page styles.

## Code style (enforced by Biome + convention)

- Strict TypeScript; runtime must stay dependency-free (only dev deps).
- Every `if`/`for`/`while` uses braces, even one-liners.
- Extract non-trivial union types into named aliases; don't inline them.
- Descriptive names — no single-letter or abbreviated identifiers (`node` not `n`, `separator` not `sep`).
- Array-operation callbacks (`map`/`filter`/`find`/…) get a named function, not an inline arrow.
- Add or update tests in `test/` for any behavior change.

Conventions observed throughout the source (match them):

- **Explicit types everywhere** — annotate locals, parameters, and return types, even when inferable (`const node: HTMLDivElement = …`, every function ends `: void` /
  `: Promise<void>`). Typed event-listener arrows too: `(event: MouseEvent): void => {…}`.
- **Relative imports carry the `.js` extension** (`from './config.js'`), even though the sources are `.ts`. Keep it — the ESM resolution depends on it.
- **Explicit null comparisons** — `if (target !== null)`, `text === null`; not truthiness checks.
- **Fire-and-forget promises use the `void` operator** (`void chrome.storage.local.set(...)`, `void start()`).
- **Storage / clipboard access is wrapped in try/catch and degrades silently**, with a short comment stating why (`/* storage may be unavailable */`). Don't let a blocked API throw
  into the UI.
- **No enums / no `switch` for small closed sets** — use string-literal unions with a `const` array or object map as the source of truth (`INDENT_OPTIONS`, `THEME_ORDER`,
  `THEME_LABELS`). Add a case by extending the data, not by writing a branch.
- **`readonly` on every interface field, always.** No exceptions — interface properties are `readonly` by default. If a field genuinely must be mutated after construction, that is
  a design smell to reconsider, not a reason to drop `readonly`.
- **Named constants for magic values and storage keys**, UPPER_SNAKE at module scope (`THEME_KEY`, `LARGE_BYTES`, `DEBOUNCE_MS`).
- **Comments explain *why*, not *what*** — the non-obvious rationale (atomic swap, lazy-render loop, dual highlight paths) is documented; trivial mechanics are not.

Biome config (`biome.json`): tabs, width 120, single quotes, no trailing commas, semicolons always.
