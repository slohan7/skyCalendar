# Sky for Google Calendar

An ambient sky layer for Google Calendar. The vertical axis of the grid is already a
clock, so the sky is mapped straight onto it: midnight at the top, midnight at the
bottom, and the real sunrise, golden hour, sunset and civil twilight for that column's
date in between.

Cloud cover buys clouds rather than draining colour out of the sky. Stars come out
between civil dusk and civil dawn, thinned by how much cloud is in the way. Rain falls
only during the hours it actually rains. Every minute or two an aircraft or a flock of
birds crosses the week. Nothing is an icon.

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
| sunrise and sunset bloom | the horizon swelling and settling, out of phase with each other |
| plate | white, 0.22–0.45, thinnest at dawn and dusk |
| light wash | warm, peaking at sunrise and through golden hour |
| stars · sun · cloud · rain and storm | four standing slots, driven by the hourly forecast |
| temporal focus | quietens the hours you are nowhere near |
| hourly temperature | right edge, suppressed under events |

The four weather slots are separate elements rather than one container that gets emptied,
so a change to the cloud does not take the stars down with it. See **What a repaint costs**.

One further layer sits outside all of this, mounted on the row that holds the day columns
rather than inside any one of them, at `z-index: 1` — above the sky, below events:

| | |
|---|---|
| traffic | aircraft and birds, crossing the whole week |

## The sun

It used to read as something behind the sky rather than in it, and there were three
reasons.

It composited as an ordinary translucent overlay on top of a white plate that had already
washed the sky out, so it had nothing to be brighter *than*. Its opacity was
`0.9 - mean_cloud * 1.1`, which is 0.29 at half cover — a smudge. And it was a 58px disc
whose gradient had faded to nothing by 72%, so it had neither a core nor a corona.

It is now two sibling elements. A **halo** paints normally and carries the warmth, because
warmth cannot survive a screen blend: a midday sky is already at 0.94 in the blue channel,
and screening anything onto that returns white. A **core** screens on top of it, which is
what makes it brighter than whatever the sky is doing underneath.

They are siblings and not nested, and the sun has its own slot rather than living inside
the weather layer's group opacity. Both for the same reason: an element inside an opacity
group blends against a transparent backdrop, and screening against nothing gets you
nothing. Set intensity to Subtle and check the sun still says `mix-blend-mode: screen`
against the real sky — there is a test for exactly this.

The blend cannot reach Google's own pixels. `.skycal-field` sets `isolation: isolate`, so
it stops at our own sky.

## Traffic

An aircraft or a flock of birds crosses the grid every half-minute to two minutes, never
more than two at once. If you sit and wait for one you have misunderstood it.

Aircraft fly at any hour and carry a contrail that draws itself in behind them; after
civil dusk there is no contrail worth drawing, only the anticollision beacon. Birds keep
daylight hours and crowd the ends of the day, because that is when they actually move.
Neither flies through a downpour, and nothing is visible through a full deck.

The flock is a loose skein rather than a V. A V is a goose thing, and at nine pixels it
reads as a logo. The wingbeat is the glyph squashed vertically, for the same reason:
anything more literal becomes an emoji.

## What a repaint costs

Google mutates its own DOM constantly — hover states, chips re-rendering, the mini
calendar ticking — and almost none of it changes what the sky should look like. The layer
used to repaint from scratch on every one of them. Measured on the harness in `test/`:

| | before | after |
|---|---|---|
| one Google DOM mutation | **1279 of 1303 layer nodes replaced** | 0 |
| …and the long task it caused | 163ms | none |
| a repaint with nothing changed | 47.9ms | ~6ms |
| 200 mousemoves | 59.6ms, 763 forced layout reads | ~1ms, 1 read |
| moving every event | 1268 nodes replaced | 156 |

Replacing those nodes is what the flashing was: every cloud drift, every twinkle and every
raindrop restarting from zero, several times a minute. Four things fixed it.

**Signatures.** What the sky is a function of — date, forecast, column geometry, settings
— is hashed, and so, separately, is where the events are. Nothing is rebuilt unless its
own signature moved.

**One read pass per column, before any write.** The old code read an event's rect, wrote a
box-shadow, read the next event's rect, and so on. Every write invalidated layout and
every following read forced it again. That cost does not land in our frame; it lands in
Google's next one, which is what "the calendar feels slower" actually was.

**The hover hit test, split in two.** Working out which column and hour the cursor is over
is four comparisons. Solving the day's solar geometry is three forty-step binary searches
over solar altitude. Both used to run on every `mousemove`. Now the move path does the
cheap half against cached rectangles, and the expensive half runs once, inside the dwell,
when the popover is actually about to be drawn. Solar days are memoised on top of that.

**Timers that do one thing.** The minute tick moves the focus band and nothing else, so it
writes one gradient string per column instead of running the whole painter.

## Tests

No build step and no dependencies here either. `test/harness.html` is a stand-in for
Google Calendar's week grid, built from the structure documented above, and the extension
runs against it unmodified — same files, same load order, a fixture instead of the network.

```
python3 -m http.server 8778
open http://localhost:8778/test/harness.html
```

then in the console:

```js
await __h.run()      // every check, with the number behind it
await __h.perf()     // just the measurements
await __h.matrix()   // every setting, on and off
```

`getBoundingClientRect` and `getComputedStyle` are wrapped before the extension loads, so
forced layout is counted rather than timed. Nothing asserts on milliseconds: wall-clock in
a browser swung between 4.3 and 16.8ms across four consecutive identical runs, and a
millisecond budget is a coin toss dressed up as an assertion. The work that drives the
time — nodes replaced, layouts forced — is exact.

The harness is not Google Calendar. It reproduces the DOM contract the extension depends
on, which is what the extension is written against, but nothing here has been run on
calendar.google.com.

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
__SkyCal.refresh()                                  // throw the cached forecast away
__SkyCal.unmount()
__SkyCal.setLocation(42.28, -83.74, 'Ann Arbor')
__SkyCal.setUnits('f')
__SkyCal.flyNow()                                   // do not wait for the next one
```

Content scripts run in an isolated world, so switch the DevTools console context from
`top` to **Sky for Google Calendar** to reach these.

## Not built yet

- Time-gutter daylight ribbon, sunrise/sunset staircases, week ribbon — all signature
  elements in the design file, none of them in the extension
- Month view treatment
- Adaptive grid rules (`black 15–18%` replacing Google's fixed `#DADCE0`)
- Anything on mobile: the native Calendar app is closed to extensions on every platform
