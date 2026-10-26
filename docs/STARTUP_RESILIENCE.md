# Startup resilience

The Android Telegram `net::ERR_CONNECTION_CLOSED` screen is a navigation failure
before the application document loads. A screenshot alone does not identify
whether the connection was closed by the hosting provider, an intermediary,
the user's network or the device. Application JavaScript cannot recover a first
visit when its own host is unreachable.

## Protection in this release

- A versioned service worker installs a coherent public shell: HTML, CSS,
  the hashed application bundle and three local card/logo images
- Root navigation tries the network for 3.5 seconds, then uses that shell
- The cache is available only after a successful installation; Telegram's
  WebView must support service workers and retain the site's storage
- APIs, POST requests, Telegram launch credentials, external scripts, map tiles
  and private API responses are never stored by the worker
- Saved card and registration state is bound to the current Telegram user ID
- Initial same-origin API requests and external SDK scripts have time limits
- An unresponsive backend no longer holds the entire initial screen
- A missing application bundle leaves an explicit retry button
- Offline content is marked as potentially stale; registration and payment
  still require a working connection and server authorization

New workers do not forcibly activate or reload an open page, so deployment does
not interrupt payment. The next normal worker activation replaces the old shell.
Do not cache newer HTML under an older shell: its bundle may be a different file.

## Verification

Run `node build.js`, then `node tests/startup-resilience-browser.cjs` and
`node tests/startup-state.cjs`. The browser test uses local fixtures and blocks
external requests; it does not create real registrations or payments. It covers
normal startup, offline repeat navigation, private API cache exclusion, missing
bundle recovery and a stalled backend at mobile widths.

This does not establish the affected participant's exact network cause and is
not an Android Telegram device test. To diagnose that incident, compare the same
device on mobile data and Wi-Fi and record the failed URL and time.

No bot URL, DNS, club server, VPN or reverse-proxy configuration is changed by
this release. A separate entry host requires an explicit infrastructure decision.

## Rollback

Reverting application files alone does not uninstall an existing worker. To
retire offline support, deploy a replacement `/sw.js` that deletes only
`club-shell-*` caches, unregisters itself and otherwise leaves requests untouched.
Keep it published while previously installed clients return. Never delete all
origin caches or force-reload a user during a payment flow.
