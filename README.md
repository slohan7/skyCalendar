# Sky for Google Calendar

An ambient sky layer for Google Calendar. The vertical axis of the grid is already a
clock, so the sky is mapped straight onto it: midnight at the top, midnight at the
bottom, and the real sunrise, golden hour, sunset and civil twilight for that column's
date in between.

Cloud cover buys clouds rather than draining colour out of the sky. Stars come out
between civil dusk and civil dawn, thinned by how much cloud is in the way. Rain falls
only during the hours it actually rains. Nothing is an icon.

Design file: <https://www.figma.com/design/1rmS2t7RsW98mWcjVgUPD1>

## Install

1. `chrome://extensions` → enable Developer mode
2. **Load unpacked** → choose this folder
3. Open or reload Google Calendar
4. Click the extension icon and set your location

No build step, no dependencies, no bundler.

## Where it attaches, and why

Determined by inspecting the live DOM rather than assumed:

```
role="grid"              painted opaque #FFFFFF  → inject INSIDE it
  └ scroll viewport
      └ role="row"
          └ role="gridcell"   one per day column, full 24h, scrolls with the grid
              └ event         position: absolute, z-index: 5
```

One `.skycal-field` per gridcell at `z-index: 0`. Events stay above without being
touched, and the layer scrolls with the grid for free because the gridcell **is** the
scrolled content.

Class names (`RnuVVe`, `hEtGGf`, `sBn5T`) are hashed and churn. Only `role` and `data-*`
attributes are targeted, because screen readers depend on them and Google therefore
keeps them stable. Hour height is measured (`gridcell.height / 24`), never hardcoded.

## Layers, bottom to top

| | |
|---|---|
| daylight ramp | 14 anchors, four of them solar and different every day |
| cloud, rain, storm, stars, sun | driven by the hourly forecast |
| plate | white, 0.22–0.45, thinnest at dawn and dusk |
| light wash | warm, peaking at sunrise and through golden hour |
| temporal focus | quietens the hours you are nowhere near |
| hourly temperature | right edge, suppressed under events |

## Two guards

**Contrast guard** — text never sits on a known colour, it sits on the plate composited
over whatever the sky is doing. Every label measures its own background and steps
through candidate values until it clears its target. Text is darkened before the plate
is thickened, because darkening a label costs nothing and thickening the plate costs sky.

**Event separation guard** — a stronger sky costs event legibility. Where, and only
where, our own atmosphere pushes a block below 1.6:1 separation *and* below its own
separation against stock Google white, the block gains a 1px inset ring in its own fill
moved away from the surface. Direction matters: darkening a light fill against a
mid-dark surface makes it worse. Turn the weather layer off and every ring disappears.

## Things the browser taught us

1. **`linear-gradient(in oklab, to bottom, …)` is invalid** and fails silently — and
   `CSS.supports()` returns `true` for it. The keyword goes *inside* the direction
   argument: `linear-gradient(to bottom in oklab, …)`.
2. **Never oklch.** Midpoint of `#1F6FC4 → #FF7A45`: sRGB `#8F7484`, oklab `#9F7F92`,
   **oklch `#BD61BC`** — magenta, because it takes the short hue path through purple.
3. **Raw hourly cloud cover is unusable directly.** A real forecast ran 73, 81, 88, 78,
   68, 58, 66, 69, 67, 73, 86, 100, 92, 85, 77, 82. Mapped straight to opacity that is
   exactly the per-hour banding the design forbids. A gaussian over ±3 hours takes the
   worst jump from 14% to 8% without flattening real fronts.
4. **A timezone is not a location.** `America/New_York` spans Maine to Michigan, which
   is 40 minutes of sunrise error end to end. Inference is a fallback that announces
   itself; the settings popup does real geocoding.

## Privacy

Coordinates are rounded to two decimal places (about a kilometre) before any request
leaves the browser. Requests carry no referrer and no credentials. No account, no
analytics, no identifier. Calendar content never leaves the page and is never read
beyond the geometry of the grid.

## Console handles

```js
__SkyCal.render('manual')
__SkyCal.unmount()
__SkyCal.setLocation(42.28, -83.74, 'Ann Arbor')
__SkyCal.setUnits('f')
```

Content scripts run in an isolated world, so switch the DevTools console context from
`top` to **Sky for Google Calendar** to reach these.

## Not built yet

- Time-gutter daylight ribbon, sunrise/sunset staircases, week ribbon — all signature
  elements in the design file, none of them in the extension
- Month view treatment
- Adaptive grid rules (`black 15–18%` replacing Google's fixed `#DADCE0`)
- Anything on mobile: the native Calendar app is closed to extensions on every platform
