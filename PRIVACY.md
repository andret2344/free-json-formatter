# Privacy Policy

**Free JSON Formatter** (the "extension") does not collect, transmit, sell, or share any user data.

Last updated: 2026-07-12.

## What the extension does with your data

The extension reads the JSON document already open in your browser tab and replaces it with a
formatted, collapsible view of the same document. That processing happens entirely on your machine,
inside the tab. The document is never uploaded, copied to a server, or sent anywhere.

## Data collected

**None.** Specifically, the extension does not collect or transmit:

- the content of the pages you visit, or of the JSON documents it formats
- your browsing history, URLs, or search queries
- personally identifiable information, authentication information, or location
- usage analytics, crash reports, or any other telemetry

There is no analytics SDK, no tracking pixel, no advertising, no affiliate code, and no remote
configuration. The extension makes **no network requests of any kind** - it has no server to talk to.

## Data stored on your device

The extension holds one permission, `storage`, used only to remember your own settings via
`chrome.storage.local`. Nothing in it leaves your device.

| Key          | What it stores                                        |
|--------------|-------------------------------------------------------|
| `fjf-max-mb` | The maximum payload size you allow the viewer to open |
| `fjf-depth`  | How many levels of the tree open by default           |
| `fjf-indent` | Your chosen indentation (spaces or tabs)              |
| `fjf-wrap`   | Whether long lines wrap                               |
| `fjf-case`   | Whether search is case-sensitive                      |
| `fjf-theme`  | Auto / Light / Dark                                   |

Uninstalling the extension removes all of it.

## Clipboard

The copy controls (Copy raw, Copy formatted, and copy-path on a line) write to your clipboard, and
only when you click them. The extension never reads your clipboard.

## Permissions

`storage` is the only permission requested. The content script runs on all URLs because a JSON
document can be served from any address; on a page that is not JSON it does nothing beyond a cheap
check and exits. Broad host access is what makes the check possible - it is not used to read, store,
or transmit the pages you visit.

## Source code

The extension is open source under the MIT license:
<https://github.com/andret2344/free-json-formatter>. Every claim above can be verified in the code.

## Changes

If a future version ever changes what the extension stores or accesses, this policy is updated in
the same release, and the change is listed in the release notes.

## Contact

Questions or concerns: open an issue at
<https://github.com/andret2344/free-json-formatter/issues>.
