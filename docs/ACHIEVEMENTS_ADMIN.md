# Achievement administration

## Current release

Entry: existing admin panel, tab `ачивки`. Server authentication uses signed Telegram initData and the numeric admin IDs from `api/tg-auth.js`. Username checks in the menu are visibility only.

Administrators create a batch with a title, rarity (`common`, `rare`, `legendary`, `mythical`), kind (`special` or `route`), optional existing hike and award date. The latest titled non-city hike on or before the Moscow date is preselected. No recipient is selected automatically. The hike roster is registration data, not proof of attendance; the administrator explicitly picks actual attendees. All profile/card owners remain available through the full participant list.

Names are populated from profiles, card records or the hike roster. Each recipient's engraving name and date are editable. The initial button remains `выдать ачивку`, but saving creates only a PRIVATE DRAFT: `publicationStatus: 'draft'`, planned `recipients`, empty `grants`, no `publishedAt` or personal issue timestamps. The UI confirms `черновик ачивки сохранён`. No Telegram notification is sent. Drafts must never be displayed or counted in member profiles.

## Storage and safety

`clubAchievements/<UUID>` (schema version 2) contains the shared award definition, planned `recipients/<Telegram ID>`, actual issued `grants/<Telegram ID>`, explicit `publicationStatus`, optional `medal`, timestamps, administrator IDs, retry token and a bounded modification history. These are private server-owned records, separate from spreadsheet synchronization. New Firebase nodes are denied by default; do not enable public reads or client writes for this path. Legacy records without a medal are treated as drafts even if the old version stored issue timestamps in `recipients`; those fields are excluded from API draft responses and never treated as actual grants.

Each record uses Firebase ETag/If-Match compare-and-set. The client retains a stable record ID and request ID through uncertain network retries. The server validates request contents against the retry fingerprint. Simultaneous writes cannot overwrite each other. Saving an edited recipient list removes omitted recipients. Changing title, rarity or kind clears obsolete art and actual grants, retaining the selected people as a private draft. Editing an already published award without changing its design can reuse its already attached medal.

`POST /api/achievements` accepts `list`, `roster`, `get`, `save`, `set_medal`. All actions require administrator authentication; no public data endpoint is added.

## Later medal generation and attachment

1. Open the saved achievement and use `скопировать задание для медали`. It includes the exact award ID, title, rarity and per-person engraving details.
2. Generate/review the medal against the saved style guide in the original workspace: `design/achievements/2026-10-26/STYLE.md`. Every medal includes brand lime `#D9FD19`; mushroom blue is `#519ABF`. Text is part of the lower integrated metal contour, never a detached plaque.
3. Add approved image/model assets under `/assets/achievements/` in this publication checkout. Saved concept PNGs are not rotatable models and must not be presented as such. Route terrain/track must use actual GPX/elevation data in final models.
4. Get the current achievement with `get`, then authenticated `set_medal` with the record `id`, current `revision`, fresh UUID `requestId`, and `medal: { imageUrl: '/assets/achievements/...webp', modelUrl: '/assets/achievements/...glb' }`. Image is required, model is optional; only local PNG/WebP/JPG/GLB asset paths are accepted. Deploy files before attaching them.
5. Only `set_medal` first publishes the definition: atomically sets `publicationStatus: 'published'`, a publication timestamp, and actual `grants` with personal `issuedAt`/`issuedBy` for all selected people. Admin response status becomes `ready`. No intermediate partially issued batch is possible. Adding recipients to an already published award can reuse its attached art. Individual names/dates remain separate engraving data.

Future member collections must require BOTH a current medal and `publicationStatus: 'published'` and must use actual `grants`, never the planned `recipients` map.

Member collection UI, 3D rotation, story sharing and explicit bot-notification controls are separate later steps. Saving awards does not trigger any of those actions automatically.

## Verification

`node tests/achievements.cjs`

`node tests/achievements-browser.cjs`

The browser suite uses fixtures, never real grants. Production verification must not create real awards just to test the endpoint.
