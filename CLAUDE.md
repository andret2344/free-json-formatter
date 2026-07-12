# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Manifest V3 browser extension (Chrome + Firefox) that detects raw-JSON pages and replaces them with an interactive, collapsible tree viewer. Hard constraint, enforced in review
and issue/PR templates: **no telemetry, no external network requests, no added manifest permissions** (`storage` is the only permission). A change that breaks this is rejected -
treat it as a build failure.

## Privacy documentation is part of the change, not a follow-up

The privacy claims are the product. Any change that touches **what is stored, what is read, or what an API can reach** - a new `chrome.storage` key, a changed or added manifest
permission, a new browser API (clipboard, cookies, downloads, `history`, …), or anything that touches page content in a new way - must update, in the same commit:

- **`PRIVACY.md`** - the storage-key table and the `Last updated` date. This file is the URL that goes in the Chrome Web Store listing's *Privacy policy* field, so a stale table is
  a
  false statement to users and to Google, not a docs nit.
- **`SECURITY.md`** - the "Minimal permissions" bullet, which enumerates the same settings in prose.
- **`README.md`** - the Privacy table.
- The **Privacy practices tab** in the Web Store dashboard, if the permission set or the data-use answers change (that one is outside the repo - flag it in the PR description).

A storage key added without touching `PRIVACY.md` is an incomplete change. Treat it the way you would treat a behavior change with no test.

## The Markdown in this repo is a claim about the code - keep it true

The rule above is the strictest case of a general one: **every `.md` file here describes the code, and a change that makes one of those descriptions false is not finished.** Fix
the
sentence in the same commit, and do not defer it to a "docs" follow-up. The files, and what each one asserts:

| File                                                           | What it claims, and what makes it stale                                                                                                                                                              |
|----------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `PRIVACY.md`                                                   | The storage-key table, the permission set, the "no requests" claim, and `Last updated`. See the section above - this one is a legal statement, not documentation.                                    |
| `SECURITY.md`                                                  | The "Minimal permissions" bullet: the same settings, in prose.                                                                                                                                       |
| `README.md`                                                    | The Features list, the Privacy table, the `yarn` commands, the project-layout table, what the test suites cover, and the packed size. A renamed or moved file breaks the layout table and the links. |
| `CONTRIBUTING.md`                                              | The code-style rules, the pre-PR commands, and its own project-layout table (which must agree with the README's).                                                                                    |
| `CHANGELOG.md`                                                 | What shipped in each version. A user-visible change with no entry is an incomplete change; the version heading must match `src/manifest.json` and `package.json`.                                    |
| `docs/COMPARISON.md`                                           | The feature and trust tables against the other JSON viewers. Adding or removing a user-visible feature changes a row here.                                                                           |
| `CLAUDE.md`                                                    | This file: the architecture notes, the module descriptions below, the layout tree, and the commands. Deleting an exported function that is named here means deleting its name here too.              |
| `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/*` | The checklist items and the privacy ground rules.                                                                                                                                                    |

Practical triggers, none of which are optional:

- **Moved, renamed, or added a source file** → both project-layout tables (`README.md`, `CONTRIBUTING.md`), the layout tree in this file, and `STATIC_FILES` in `scripts/build.mjs`
  if it is an asset.
- **Added, renamed, or removed a `package.json` script** → the command blocks in `README.md`, `CONTRIBUTING.md`, and this file.
- **Added or removed a user-visible feature** → the Features list in `README.md`, the feature table in `docs/COMPARISON.md`, an entry in `CHANGELOG.md` (and a screenshot in
  `docs/screenshots/` if it changes what the toolbar looks like).
- **Deleted or renamed an exported function/type named in prose** → every file that names it.
- **Added a test suite or a new area of coverage** → the "what the suites cover" paragraph in `README.md` and the module notes here.

When in doubt: grep the docs for the identifier or path you touched (`rg -n 'childIndexOf|src/dom.ts' *.md .github`) before you call the change done.

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
test/               mirrors src: test/content, test/viewer, test/shared, test/popup, test/helpers
e2e/                Playwright specs + fixtures (real Chromium, unpacked dist/chromium)
```

Tests are `describe(...)` groups of `it(...)` - never a top-level `it`/`test`, in either suite.

## Architecture

Three independent entry points, no shared runtime framework:

- **`src/content/content.ts`** - injected into every page at `document_end`. Runs the cheap `inspectPotentialJsonDocument()` preflight *before* touching storage (the script runs on
  `<all_urls>`), then reads prefs, parses, and `mount()` builds the toolbar + tree entirely off-DOM before one **atomic swap** into the page (apply theme, clear body, insert). The
  synchronous no-`await` swap block is deliberate - it avoids a white flash and a frame of recolored raw text; preserve that property when editing `mount()`. `syncControls()` is
  the
  single place that decides control state: while an expansion runs, every tree control is disabled (except **Collapse all**, which cancels it) and **the tree is taken off screen
  ** -
  laying out an on-screen tree after each of the ~60 batches is quadratic (64s to expand a 200 kB document; 1.4s hidden, plus one 4s layout at the end). The preloader stands in for
  it.
- **`src/content/console-handle.ts`** - runs in the **page's world** (`"world": "MAIN"`), which is where the devtools console evaluates. It defines a lazy `window.json` getter that
  parses the text in the Raw view on access, and logs `Type "json" to inspect`. It must stay in that world: a value defined by the isolated content script is invisible to the
  console,
  and injecting an inline `<script>` instead is blocked by the extension's CSP. The two worlds talk through `src/shared/bridge.ts` (a `fjf-mounted` event; they start in no fixed
  order,
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
- **`src/viewer/expansion.ts`** - `resolveInitialExpansionDepth(value, rawByteLength, preference)` turns the stored preference into `1..5 | 'all'`. `auto` decides from a **bounded
  **
  iterative scan (`SCAN_NODE_LIMIT`): byte size, element count, and nesting depth; it never returns less than 1, and a scan that hits the limit means "large" → depth 1.
- **`src/viewer/search.ts`** - searches the **parsed JSON**, not the DOM, so hits in unrendered branches are found. Matches carry a path + `key`/`value` field; focusing one reveals
  only that branch. Highlights use the **CSS Custom Highlight API** (zero DOM mutation) with a `<mark>`-wrapping fallback where it is unavailable (e.g. jsdom in tests).
- **`src/viewer/dom.ts`** - shared element factories (`createElement`, `button`, `separator`). Build DOM through these, not raw `document.createElement`.
- **Line numbers** live in `data-line`, written at render time from `lineCount()` - a line's number is its position in the *fully expanded* document, so a collapsed branch leaves a
  gap (as code folding does) and nothing ever has to renumber. Do not go back to a CSS counter: a counter on the gutter pseudo makes the browser rebuild the whole counter tree on
  every layout. The gutter is a `::before` (so selecting the tree never copies the numbers) that is `position: sticky` in the line's flow, undoing the nesting indent with a
  negative
  margin so it still forms a straight column. Lines are sized by `.fjf-tree > .fjf-entry { width: max-content }` - a viewport-wide line box would end at the fold, and hover with
  it.
- **`src/shared/config.ts`** - thin `chrome.storage.local` wrappers for persisted prefs (max-MB, initial expansion depth, wrap, indentation, search case). All storage access is
  wrapped in try/catch and degrades silently. `INDENT_OPTIONS` and `depthFromValue()` are the source of truth for those choices. Theme is persisted separately, inside `content.ts`
  (`THEME_KEY`).
- **`src/shared/types.ts`** - JSON value types plus `isExpandable()`, `entriesOf()`, `childCount()`, `looksLikeUrl()`.
- **`e2e/`** - Playwright against a real Chromium with the unpacked `dist/chromium` loaded: plain pages stay untouched, JSON pages format, oversized and unparseable documents are
  left
  alone, depth settings, cancellable expansion, search into unrendered branches (painted through the **CSS Custom Highlight API** - the path jsdom cannot exercise), line links and
  the
  gutter, theme/wrap/indent persisting across pages, the clipboard, popup saves without reloading, and no external requests. The extension id is read from
  `chrome://extensions-internals` - MV3 without a background worker exposes it nowhere else, and adding one is not allowed.

All injected DOM and CSS is namespaced under `fjf-` to avoid clashing with page styles.

## Code style (enforced by Biome + convention)

- Strict TypeScript; runtime must stay dependency-free (only dev deps).
- Every `if`/`for`/`while` uses braces, even one-liners.
- Extract non-trivial union types into named aliases; don't inline them.
- Descriptive names - no single-letter or abbreviated identifiers (`node` not `n`, `separator` not `sep`).
- Array-operation callbacks (`map`/`filter`/`find`/…) get a named function, not an inline arrow.
- **No destructuring in function parameters** - not object patterns, not array patterns. A parameter is one named binding of a named type; the fields come off it in the body
  (`function renderEntry(entry: JsonEntry)` … `entry.key`, never `function renderEntry({key, value}: JsonEntry)`). The rule is about parameters only: destructuring a *local* from a
  call result (`const [open, close]: BracketPair = brackets(collection)`) is fine and used throughout. **The single exception is `e2e/`**: Playwright derives a test's fixture
  dependencies by parsing the source of the callback's first parameter, and rejects anything else - *"First argument must use the object destructuring pattern"*
  (`playwright/lib/common/index.js`). So `async ({context, baseUrl})` in a fixture or an `it(...)` body is load-bearing, not a style lapse, and the empty-pattern cases carry a
  `biome-ignore` explaining it. Nothing else in the repo may destructure a parameter.
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
- **Module-scope declarations live at the top of the file, above every function** - the file reads like a class: imports, then types, then constants, then module-level state (a
  `WeakMap` cache, a counter), and only then the functions. Never introduce a `const`/`let` halfway down a file, next to the one function that happens to use it: a reader looking
  for
  what a module holds must find all of it in one place. This applies to module scope only - locals stay where they are used, declared as late as possible.
- **Comments explain *why*, not *what*** - the non-obvious rationale (atomic swap, lazy-render loop, dual highlight paths) is documented; trivial mechanics are not.

Biome config (`biome.json`): tabs, width 180, single quotes, no trailing commas, semicolons always, **CRLF line endings**. `.idea/codeStyles/Project.xml` mirrors it for the IDE
(right margin 180, continuation indent one tab, no aligning arguments or object members to the opening brace) - the two formatters must agree, or every IDE save fights `yarn run
check`.
