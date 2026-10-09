# Admission pilot

## Scope

Only the signed Telegram username `HelloIntelligent` enters the applicant flow.
The first submission binds the application to that signed Telegram ID. An account
that later obtains the same username cannot read that application as an applicant.
The existing admins, MaxMolotov and HelloIntelligent, can review the pilot.
Other visitors retain their existing experience. Invitation links are out of scope.

## Experience

- A glass entry below the calendar invites the visitor to fill out the form.
- Browsing remains available; no automatic entry popup.
- Attempting to register or buy a card opens the introduction/status screen.
- Form: first name, city, a short answer about joining, respectful-conduct checkbox.
- Submission: pending state, one-day review message, receipt in the bot.
- Admin: application details, accept/reject with confirmation, delivery status,
  explicit retry, and reset of the pilot application only.
- Approval: bot deep link `https://t.me/yaltahiking_bot?startapp=admission` opens
  welcome and three pilot rules. After acknowledgement, return to the intended
  hike or the calendar. Card/ticket checkout remains a separate paid action.
- Rejection: a calm explanation and the possibility of a member invitation.

The three initial rules concern personal boundaries, nature, and cancellation
notice. They are pilot copy for review, not a replacement for legal terms.

## Data and authorization

`api/admission.js` authenticates Telegram initData using the existing bot secret.
It reuses the existing service-account token helper. Firebase storage is the
private, server-only path `admissionPilot/helloIntelligent`; anonymous reads were
confirmed denied before implementation. Existing Firebase rules need no change.
Responses use `Cache-Control: no-store`. Form text is escaped on rendering and is
not written into activity analytics. ETag checks protect transitions and reset.

Notification state is persisted with the decision, then sent synchronously.
An explicit Telegram `ok:false` is failure, a transport timeout is uncertain.
There is no silent automatic retry after an uncertain send. The admin may retry
with confirmation; Telegram does not support an exactly-once sendMessage key.
There is no background notification worker in this pilot.

The client simulates an inactive card for this pilot without writing membership,
registrations, or purchases. The original card value is retained in runtime and
cache. Admin access remains available. Reset deletes only the pilot application.

Pilot checkout uses the new authenticated server proxy, which checks approval and
rules acknowledgement and derives the payment identity from signed Telegram data.
The legacy Apps Script payment endpoint is unchanged. Before rollout to all users,
admission enforcement must also be integrated there; this pilot is not a universal
payment authorization migration. Existing payment eligibility and capacity rules
are not overridden. No real payments are made by tests.

## Verification

- `node tests/admission.cjs`: auth, private-path isolation, ID binding, validation,
  duplicate submissions, concurrent writes, both decisions, notification failure
  and retry, rules acknowledgement, paid-access gate.
- `node tests/admission-preview.cjs 4185`: local-only in-memory preview; never sends
  real bot messages, never writes Firebase, never opens a real payment provider.
- `node tests/admission-browser.cjs`: Chrome workflow and 320/390/600/1100px checks.
  Set PLAYWRIGHT_MODULE to the local Playwright module when running elsewhere.
- Existing club-content, profile-hikes and ticket-recovery regression suites.

The final acceptance is a real HelloIntelligent submission and admin decision in
Telegram. Local tests prove code and UI behavior, not delivery to the real chat.
