# Club analytics v1

## Live integration

Append `appscript-analytics.gs` to the current Apps Script project. Preserve all existing code and credentials. Add these hooks to `Файрбейс.gs`:

1. In `doPost`, before any debug logging: `if (fastAction === 'analyticsEvent') return handleClubAnalytics_(e.parameter);`
2. Inside the already authenticated `handleAdmin` switch: `case 'adminAnalytics': return _adminOut(clubAnalyticsReport_(params));`
3. After the verified Robokassa completion write: `try { caPaymentRecorded_(pending, invId); } catch (analyticsError) { Logger.log('Analytics payment event unavailable'); }`

Run `installClubAnalytics` once. It is idempotent: creates a hidden `analytics_events` sheet in the existing spreadsheet, records the collection start without resetting it, and installs only its own daily trigger. Hiding the sheet is organizational, not an access boundary; existing spreadsheet access must remain restricted. Signed admin authorization protects the report endpoint. No events or images are published in public Firebase nodes. Existing hourly, daily and weekly digests are unchanged.

Redeploy the existing Web App deployment (same URL and permissions), then deploy the frontend. `sendClubAnalyticsDaily` can be run manually for a first real report. Destination must be Max's numeric chat ID. Schedule is approximately 20:30 Europe/Moscow (Apps Script time triggers can vary by 15 minutes).

## Definitions

- Unique people, not taps. Exclude stable admin IDs 163665735 and 7845375334.
- Cohort: people who opened the app during the selected Moscow period; first opening within that period is the entry. Later ordered steps count up to the report time, at most seven days from entry. Cohort windows can overlap across reports; do not sum them.
- Guest: no active membership at entry. Path: open → view chosen hike → completed registration swipe → server-created ticket invoice → verified payment → server-confirmed registration.
- Member: active membership at entry. Path: open → view → intent → confirmed registration.
- Card purchase instead of ticket is a separate alternative conversion.
- Payment milestones come from server `pending_payments.completed/paid_at`. Registrations require matching `userRegistrations` and a timestamped participant, or the verified payment callback. Client success screens alone are insufficient.
- Current registrations and payments *during the selected period* are operational totals, not funnel stages. They can include people outside the selected cohort. A paid person no longer registered may have cancelled; never label all such cases failed payments.
- Initial partial days and periods predating collection are explicit. No historical reconstruction from text click labels.
- Recommendations are deterministic observations, not causal claims. Suppress bottleneck conclusions with denominators below 10.

## Operations

`CLUB_ANALYTICS_SENT` records the delivered Moscow day plus `:preview` (before 20:00) or `:evening`, and `CLUB_ANALYTICS_MESSAGE_ID` the Telegram message ID. A daytime manual preview does not consume the evening delivery. A send attempt is marked immediately before transport; an ambiguous timeout leaves `CLUB_ANALYTICS_SENDING` set to prevent accidental duplicate reports in that slot. Inspect Telegram before manually clearing that property. A rejected Telegram API response clears the attempt so a deliberate rerun is possible. No automatic retry sends duplicate pictures.

The event endpoint accepts signed Telegram users, bounded batches and event age, with a per-user rate cap. No names, message contents, payment amounts, or Telegram initData are stored in the analytics sheet. Events carry user IDs (personal data), retained under the existing restricted spreadsheet permissions. At 200,000 rows ingestion fails closed until the journal is archived under a separately agreed retention policy. Current pilot reads the journal in one pass; monitor execution duration as it grows.

## Verification

`node tests/analytics.cjs` and `node tests/analytics-browser.cjs`; standard production build. Tests never call Telegram or payment providers. Live setup and first delivery must be checked separately before claiming they work.
