# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - latest

### Changed

- Privacy wording in `README.md`, `SECURITY.md`, and `PRIVACY.md` now describes both parts of the
  extension's access: the `storage` API permission and the content-script site access that lets it
  detect a JSON document served from any URL. Nothing about what the extension stores, reads, or
  sends changed.
- The settings popup states that JSON is processed locally in the tab and nothing is uploaded.

## [0.2.0] - 2026-07-12

### Added

- **Line numbers**, in a gutter, written at render time - a line keeps the number it has in the fully
  expanded document, so folding a branch leaves a gap instead of renumbering everything below it.
- **Line links** - click a line number to put `#L21` in the address bar. Opening that link reveals the
  line again, even when it sits inside a branch nobody has expanded.
- **Copy path** - hover any line and copy its path as a console-ready accessor chain
  (`json.items[0].id`).
- **`json` in devtools** - a page-world script exposes the parsed document to the console, lazily.
- **Expand all / Collapse all**, run in cancellable batches so a huge document does not lock the tab;
  Ctrl/Cmd+click on a node folds or opens its whole level.
- **Automatic initial expansion depth**, chosen from the document's byte size, element count, and
  nesting depth (a bounded scan - it never walks a whole multi-megabyte document to decide).
- **Indent guides**, highlighted for the nesting level under the pointer.
- **Large-payload warning** in the toolbar when a document is big enough that rendering may feel slow.
- **Firefox support** (Manifest V3, `strict_min_version` 128 - the first release with `"world": "MAIN"`).
- [`PRIVACY.md`](PRIVACY.md), naming every key the extension writes to your device.
- [`docs/COMPARISON.md`](docs/COMPARISON.md).

### Changed

- Collections now render **lazily**: a collapsed branch is not merely hidden, it does not exist in
  the DOM until you open it. Large documents stay responsive.
- The viewer is built off-DOM and swapped into the page in one synchronous step - no flash of
  recoloured raw text.
- Source restructured into `content/`, `viewer/`, `shared/`, and `popup/`.

### Security

- Still one permission (`storage`), still no network requests. The end-to-end suite now asserts the
  second of those against a real browser.

## [0.1.0] - 2026-07-10

Initial release.

### Added

- Automatic detection of raw-JSON pages, replaced with a collapsible, syntax-highlighted tree.
- In-tree search with match count, next/previous navigation, and a case-sensitivity toggle.
- Formatted / Raw toggle, and copy to clipboard.
- Themes (Auto / Light / Dark), configurable indentation, and a line-wrap toggle - all remembered.
- Settings popup for the maximum payload size and the initial tree depth.
- Clickable URL string values.

[0.2.1]: https://github.com/andret2344/free-json-formatter/releases/tag/v0.2.1

[0.2.0]: https://github.com/andret2344/free-json-formatter/releases/tag/v0.2.0

[0.1.0]: https://github.com/andret2344/free-json-formatter/releases/tag/v0.1.0
