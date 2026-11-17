# Hof deep-link scrolling

The `hof` deep link uses a dedicated, cancellable scroll controller. It waits for
the loader, achievement gate and stable target geometry before starting. During
the animation, full home renders are coalesced; the page keeps its height until
the queued render is applied. Layout changes restart a segment from the current
position instead of interpolating from an obsolete origin.

Touch, pointer, wheel and scroll-navigation keys cancel the controller. Pending
data is still rendered, but cancellation schedules no more scroll writes.
Generation guards invalidate older home-position restoration callbacks and
legacy scroll jobs when a Hof transition takes over.

Checks:

- `node tests/hof-link-scroll-browser.cjs`: mobile/desktop, delayed readiness,
  400px layout change, coalesced renders, temporary target removal, cancellation,
  repeated link, timeout and style restoration.
- `node tests/hof-startup-browser.cjs`: real application boot with mocked Telegram
  and delayed Firebase for members and guests; centered smooth arrival and no
  late position restoration.
- `node tests/startup-state.cjs` and `npm run build` pass.

Known unrelated baseline: `tests/next-hike-startup-browser.cjs` fails its expected
60px top assertion with 205.828125px on both unmodified `e0fb8e7` and this change.
`tests/next-hike-link-browser.cjs` also fails with vertical scroll 205 on both.
Native Telegram/iOS behavior still needs device confirmation.
