# How this compares

A JSON viewer is a small enough tool that the interesting differences are not really about features.
They are about what the thing is *allowed* to do while it sits on `<all_urls>` and watches every page
you open. So this document covers both, in that order.

## Trust

| | **Free JSON Formatter** | **JSON Formatter** (`bcjindc…`) | **JSON Formatter Classic** |
|---|---|---|---|
| Source | MIT, public, current | Closed since 2026 | MIT, frozen at the last open build |
| Maintained | Yes | Yes | No - archived, will not be updated |
| Permissions | `storage` | Broad | Broad |
| Injects into non-JSON pages | Never | Yes - see below | No |
| Network requests | None | Yes | None |
| Telemetry | None | Yes | None |

### What happened to the incumbent

The most-installed JSON viewer for Chrome (two million users, and a *Featured* badge that it still
carries) went closed source in 2026 and shipped an update that bundled a third-party monetisation
script. Users reported that it injected donation prompts into retail checkout pages, scraped store
identifiers, and resolved their geolocation - none of which a JSON viewer needs, and none of which
was announced. Several antivirus products began flagging it, which is how most people found out.

- [Hacker News discussion](https://news.ycombinator.com/item?id=47721946)
- Its own [store reviews](https://chromewebstore.google.com/detail/json-formatter/bcjindcccaagfpapjjmafapmmgkkhgoa/reviews)
  from May 2026 onward

Its author has since published the last clean build separately, as *JSON Formatter Classic*. That is
a reasonable choice if you want exactly the old extension and nothing more - it is the same code, and
it will stay the same code, because it is not being maintained.

The point of the table above is not that this extension is trustworthy because its author says so.
It is that a `storage`-only extension with no network code **cannot** do what the incumbent did, and
you can confirm that in an afternoon: read `src/`, or run `yarn test:e2e`, which asserts that
formatting a document issues no request at all.

## Features

Marked from each extension's own store listing and source.

| | **Free JSON Formatter** | **JSON Formatter** / **Classic** |
|---|---|---|
| Automatic detection of JSON pages | Yes | Yes |
| Collapsible tree | Yes | Yes |
| Lazy rendering (collapsed branches never built) | Yes | No |
| Syntax highlighting | Yes | Yes |
| Indent guides | Yes | Yes |
| Clickable URLs | Yes | Yes |
| Raw / formatted toggle | Yes | Yes |
| Document exposed to devtools as `json` | Yes | Yes |
| Ctrl/Cmd+click to fold a whole level | Yes | Yes |
| **Search**, over the parsed JSON, finding hits in unopened branches | Yes | No |
| **Line numbers**, stable across folding | Yes | No |
| **Line links** (`#L21`), reopening a line inside a collapsed branch | Yes | No |
| **Copy path** as a console-ready accessor (`json.items[0].id`) | Yes | No |
| **Expand all / Collapse all**, cancellable | Yes | No |
| **Automatic initial depth** from the document's size and shape | Yes | No |
| **Copy** raw or re-indented JSON | Yes | No |
| **Configurable indentation** (2/4/6/8 spaces, 1/2 tabs) | Yes | No |
| **Line-wrap** toggle | Yes | No |
| Themes | Auto / Light / Dark | Dark mode |
| Settings page | Yes | No |
| Firefox | Yes | No |

## When you should not use this

- **You want a viewer that never changes again.** Install *JSON Formatter Classic*, or build this one
  from source and load it unpacked - an extension that cannot auto-update cannot surprise you. The
  [Install](../README.md#install) section covers both.
- **You only ever look at tiny payloads and Chrome's own JSON viewer is enough.** It is, and it costs
  you nothing.
