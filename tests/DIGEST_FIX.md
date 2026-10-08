# Apps Script Digest Repair

Source of truth: the existing `Файрбейс.gs` file in the Google Apps Script
project `Тест приложения клуба`, project ID
`1zPWKg6S_QMc1zXbLHE7XINIw3W9K9Ye5wEc947Y84IcBukFYYufZArgp`.

Applied directly to that file on 2026-10-08. The hourly trigger runs the saved
main deployment every hour; no web-app version change was necessary.

`appscript-digest-fix.gs` is a credential-free copy of the replacement helpers,
not a second file to add alongside identically named functions. The existing
daily digest also now escapes its grouped action heading:

```js
text += `\n<b>${escapeDigestHtml_(action)} (${items.length}):</b>\n`;
```

Live verification at 17:41 Moscow time:

- Legacy formatting: Telegram rejected `hike_<дата>` with
  `Bad Request: can't parse entities: Unsupported start tag "дата" at byte offset 51`.
- Recovered report window: 15:46:42-16:46:42 Moscow time, 87 actions.
- Telegram accepted the repaired report: `digest: successfully sent 1 message(s)`.
- Existing trigger confirmed: `sendHourlyDigest`, main deployment, once per hour.
- Existing empty-hour and test-account exclusions remain unchanged.

Regression command: `node tests/digest.cjs`.
