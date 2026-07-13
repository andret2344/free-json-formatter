# Privacy Policy

**Free JSON Formatter** (the "extension") does not collect, transmit, sell, or share any user data.

Last updated: 2026-07-13.

## What the extension does with your data

The extension reads the JSON document already open in your browser tab and replaces it with a
formatted, collapsible view of the same document. That processing happens entirely on your machine,
inside the tab. The document is never uploaded, copied to a server, or sent anywhere.

## Website content processed locally

The extension reads the JSON document currently open in your browser tab solely to determine whether
it contains JSON and to render the formatted view. This processing happens entirely on your device.

The extension may inspect the current page's content type, URL path, and visible document text to
determine whether the page contains raw JSON. This information is not retained or transmitted.

## Data collected or transmitted by the developer

**None.** The extension does not transmit, retain, sell, or share:

- the contents of JSON documents or other pages
- URLs or browsing activity
- personally identifiable information
- authentication information
- location information
- usage analytics, diagnostics, or telemetry

There is no analytics SDK, tracking pixel, advertising, affiliate code, remote configuration, or
developer-operated server. The extension makes no external network requests.

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

`storage` is the only API permission requested. The extension also uses content-script site access
because JSON documents may be served from any URL. On a page that is not JSON, it performs a
lightweight check and exits. This access is not used to retain or transmit page content, URLs, or
browsing activity.

## Source code

The extension is open source under the MIT license:
<https://github.com/andret2344/free-json-formatter>. Every claim above can be verified in the code.

## Changes

If a future version ever changes what the extension stores or accesses, this policy is updated in
the same release, and the change is listed in the release notes.

## Contact

Questions or concerns: open an issue at
<https://github.com/andret2344/free-json-formatter/issues>.
