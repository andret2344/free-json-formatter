<p align="center">
  <img src="assets/icon-512.png" alt="Free JSON Formatter icon" width="512" height="512" />
</p>

# Free JSON Formatter

[![CI](https://github.com/andret2344/free-json-formatter/actions/workflows/ci.yml/badge.svg)](https://github.com/andret2344/free-json-formatter/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/andret2344/free-json-formatter/branch/main/graph/badge.svg)](https://codecov.io/gh/andret2344/free-json-formatter)
[![Version](https://img.shields.io/github/package-json/v/andret2344/free-json-formatter?label=version)](package.json)
[![Last commit](https://img.shields.io/github/last-commit/andret2344/free-json-formatter)](https://github.com/andret2344/free-json-formatter/commits)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?logo=typescript&logoColor=white)](tsconfig.json)
[![Biome](https://img.shields.io/badge/lint%20%26%20format-Biome-60a5fa.svg?logo=biome&logoColor=white)](biome.json)
[![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18.svg?logo=vitest&logoColor=white)](vitest.config.ts)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-brightgreen.svg)](src/manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-supported-4285F4.svg?logo=googlechrome&logoColor=white)](#install)
[![Firefox](https://img.shields.io/badge/Firefox-supported-FF7139.svg?logo=firefoxbrowser&logoColor=white)](#install)
[![No tracking](https://img.shields.io/badge/tracking-none-success.svg)](SECURITY.md)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A fast, **private** JSON viewer for the browser - a clean-room, open-source alternative to the
popular but abandoned "JSON Formatter" extension. Same convenience, none of the tracking.

When you open a JSON API response, Free JSON Formatter turns the raw text into an interactive,
collapsible, syntax-highlighted tree - while **never sending a single byte anywhere**.

> **Why another JSON formatter?**
> The widely used JSON Formatter extension stopped working reliably and drew credible malware
> reports. This project exists to be the boring, trustworthy replacement: tiny, readable,
> open source, and provably network-silent.

---

## Table of contents

- [Features](#features)
- [Privacy](#privacy)
- [Install](#install)
- [Build from source](#build-from-source)
- [Development](#development)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Automatic detection** of raw JSON pages (an `application/json` response, a `.json` URL, or a
  page that is just a `<pre>` of valid JSON).
- **Collapsible tree** with lazy child rendering, so large documents stay responsive.
- **Syntax highlighting** for keys, strings, numbers, booleans, and `null`.
- **Clickable links** - URL string values become safe `target="_blank"` anchors.
- **Formatted / Raw** toggle - flip back to the original, untouched JSON text at any time.
- **Expand all / Collapse all**.
- **Line wrapping** toggle for long string values.
- **Configurable indentation** - 2/4/6/8 spaces or 1/2 tabs, applied live and remembered.
- **In-tree search** with match count, next/previous navigation, and a case-sensitivity toggle.
- **Copy** - copy the raw JSON, or the re-indented ("formatted") JSON, to the clipboard in one click.
- **Large-payload warning** in the toolbar when a document is big enough that rendering may feel slow.
- **Themes**: Auto (follows your OS), Light, and Dark - remembered across sessions.
- **Settings popup** to set a custom maximum payload size (MB). Changes save automatically and
  reload the active tab so the new limit applies right away.

## Privacy

Privacy is the entire reason this project exists:

| Guarantee             | Status                                            |
|-----------------------|---------------------------------------------------|
| External requests     | **None** - the content script contacts no server. |
| Telemetry / analytics | **None.**                                         |
| Remote code           | **None** - everything ships in the bundle.        |
| Permissions           | **`storage` only** (to remember your preferences).|

See [SECURITY.md](SECURITY.md) for the full policy and how to report issues.

## Install

> Store listings are coming soon. Until then, install the unpacked build (see below) or grab a
> packaged `.zip` from the [Releases](https://github.com/andret2344/free-json-formatter/releases)
> page.

**Chromium (Chrome, Edge, Brave, …)**

1. Download and unzip `free-json-formatter-chromium.zip`, or run `yarn build:chromium`.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the `dist/chromium` folder.

**Firefox**

1. Download `free-json-formatter-firefox.zip`, or run `yarn build:firefox`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on** and select `dist/firefox/manifest.json`.

Then open any JSON endpoint, or the bundled [`test/sample.json`](test/sample.json).

## Build from source

Requires Node.js LTS and [Yarn](https://classic.yarnpkg.com/) (Classic / v1).

```bash
git clone https://github.com/andret2344/free-json-formatter.git
cd free-json-formatter
yarn install

yarn build            # builds both dist/chromium and dist/firefox
yarn build:chromium   # Chromium only
yarn build:firefox    # Firefox only
```

## Development

```bash
yarn watch         # rebuild Chromium bundle on change
yarn typecheck     # tsc --noEmit
yarn test          # Vitest (jsdom)
yarn test:coverage # Vitest + v8 coverage report (CI uploads to Codecov)
yarn run check     # Biome format + lint check (CI runs this)
yarn check:fix     # Biome apply safe fixes
yarn format        # Biome format --write
```

> Use `yarn run check` (not `yarn check`) — bare `yarn check` is a Yarn Classic built-in, not this
> project's script.

The test suite covers JSON detection, tree rendering, collapse/expand, URL linking, and search.

## How it works

At `document_end` a single content script inspects the page. If the document is served as JSON
(or is a lone `<pre>` whose text parses as JSON), it parses the payload once and replaces the
page with a toolbar plus a lazily-rendered tree. Nothing is fetched, stored remotely, or
reported. Normal HTML pages are left completely untouched - the detector deliberately bails on
anything that isn't clearly JSON.

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
| `.github/workflows/` | CI: checks on push/PR, release on `v*` tags.   |

The extension icon is defined once in `assets/icon.svg` and rasterized to `icons/icon{16,48,128}.png`
with `yarn icons` (via [sharp](https://sharp.pixelplumbing.com/)). Edit the SVG and re-run to
regenerate.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). In short: keep it private (no telemetry/requests), brace
every `if`/loop, name your union types, run `yarn run check`, and add tests.

## License

[MIT](LICENSE) © andret2344
