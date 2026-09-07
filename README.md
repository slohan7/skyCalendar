# Sky for Google Calendar

An ambient sky layer for Google Calendar. The vertical axis of the grid is already a
clock, so the sky is mapped straight onto it: midnight at the top, midnight at the
bottom, and the real sunrise, golden hour, sunset and civil twilight for that column's
date in between.

Cloud cover buys clouds rather than draining colour out of the sky. Stars come out
between civil dusk and civil dawn, thinned by how much cloud is in the way. Rain falls
only during the hours it actually rains. Events are drawn at whatever opacity their own
label can still afford, so the sky reads through them. Every minute or two an aircraft or a
flock of birds crosses the week. Nothing is an icon.

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
| plate | white, 0.30–0.52, thinnest at dawn and dusk |
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

## See-through events

Events are drawn at partial opacity so the sky reads through them. Four levels — off,
tinted (0.74), clear (0.52), outline (0.12) — and the level is a request, not a setting:
it is where each block *starts*.

**Outline** is the default and the one worth having. The fill drops to a wash, the colour
moves to a 1.5px edge, and the label takes the event's own colour darkened for a bright sky
or lightened for a dark one. With the fill gone the label is the only thing left carrying
which calendar an event belongs to, so it should be that colour if that colour can be read
at all.

Transparency is spent, not given. A block begins at the alpha the setting asked for and is
pushed back toward opaque only as far as its own label needs, and the label is moved
before the alpha is, because moving a label costs nothing and opacity costs sky. That is
the order the plate and the separation guard already use.

The label ladder is Google's own colour, then their text grey `#3C4043`, then white, then
`#202124`: the smallest move that clears the bar. Flipping a white label to grey over a
bright noon sky is not a liberty taken — the thing behind it is no longer the colour white
was chosen against — but it is a change, and changes are rationed. Only a block whose
label actually moved gets `color: inherit` forced on its contents, because Google gives a
chip's title and its time two weights of one colour and flattening that everywhere to fix
it in a few places is a bad trade.

The invariant, and the only reason this is on by default:

> **No block ends up harder to read than it is on stock Google.**

The target is capped at whatever Google's own fill and label already achieve, so a chip
sitting at 4.1:1 today is asked for 4.1, not 4.5 — we are not entitled to fail a bar
Google never set, and not allowed to drop below one it did. If nothing clears the target
even at full opacity, the block is left exactly as Google drew it.

What that looks like in practice: on a clear week every block reaches the full 0.52 and
about half the labels move to grey. A purple event at 05:42, over a sky still dark enough
that white is the only label that works, gets pushed back to 0.62 instead — it spends
transparency to keep its label.

### The edge, and the black line

Two different jobs, and conflating them put a hard dark line under every block on the real
calendar. The separation guard is an *emergency*: it fires rarely, on a block our own sky
broke, and it darkens that block's colour to give it an edge back. Turning the fills
see-through made every block qualify, so every block got a darkened neutral ring — which
reads as a black line, not as a calendar.

They are separate now. With the fill see-through, the edge is deliberate, in the event's
own colour, on every block, walked away from the sky only as far as it has to be. With the
fill left alone, the old guard applies and stays rare.

Google also puts a border colour on the chip, and leaving that opaque while the fill goes
translucent draws a hard outline the extension never asked for. It is managed now — set to
transparent under glass, and put back verbatim when the layer comes off — so it cannot
fight our edge whether or not Google set one.

Two things this deliberately does not do. There is no `backdrop-filter`: blurring the sky
behind a block defeats the point of seeing it, and forty blurred layers is exactly the
compositing cost the rest of this work went to remove. And nothing is predicted in linear
light — CSS composites a translucent background in sRGB, gamma and all, so the solver does
the arithmetic the browser will actually do rather than the arithmetic the rest of the
colour code does.

### What a signature has to cover

The repaint signature is what makes the layer cheap, and it is also the thing most likely
to be quietly wrong. Google throws event chips away and rebuilds them constantly. A rebuilt
chip at the same hour, in the same colour, at the same size signs identically **by value**
while being a different element carrying none of our treatment — so the repaint is skipped
and the new chip stays undressed. On the harness that showed up as all forty-two events
snapping back to opaque after a rebuild.

So the signature includes the treatment marks, not just the geometry, and it is taken again
after the treatment is applied — that second reading is the resting value, and without it
the layer would alternate between dressed and undressed for ever.

## The moon

At the phase it is actually at, in the part of the night it is actually up. Open-Meteo
carries no lunar data, so this is computed: Schlyter's low-precision elements with the
principal perturbations, good to a couple of arcminutes, which is several orders of
magnitude finer than a calendar column can draw. Checked against known events — the new
moon of 2000-01-06 18:14 comes back at k=0.0002, the full moon of 2000-01-21 04:40 at
k=1.0000, first quarter at 0.4993.

The terminator is a half-ellipse whose width is `|2k-1|` of the radius, not a second
circle offset sideways. The offset-circle trick is the usual shortcut and it is wrong: it
cannot make a crescent thinner than a quarter without the horns turning the wrong way.

It is drawn only where the moon is both above the horizon and it is dark, which means it
comes and goes across the week rather than sitting in every column. Near a new moon it is
up in the daytime and there is nothing to draw at night at all. That is the whole reason
for computing it rather than decorating with it — and the moon's rise slipping about an
hour later each day is a thing you can watch happen across the columns.

Altitude is sampled through the day and the crossings bisected, rather than solved between
two assumed bounds the way sunrise is. The moon rises roughly fifty minutes later each day,
so a given date may hold a rise, a set, both, or neither, and hunting between assumed
bounds is how you end up asserting the moon is never up on a Tuesday.

## Traffic

Something is nearly always crossing the sky. An empty sky refills within a second or two;
a busy one is left alone, and three at once is the ceiling. The retire path is what makes
that hold — a flyer leaving is the moment to ask whether the sky is now empty, because
otherwise the next arrival is whatever was scheduled back when there were two in the air.

Aircraft fly at any hour and carry a contrail that draws itself in behind them; after
civil dusk there is no contrail worth drawing, only the anticollision beacon. Birds keep
daylight hours and crowd the ends of the day, because that is when they actually move.
Shooting stars are deep night only, need a clear sky to be seen through, and are over in
under two seconds — everything else in this layer crosses the whole week at walking pace,
and a meteor you can rely on is not a shooting star, it is a metronome.

Nothing flies through a downpour, and nothing is visible through a full deck.

**`animationend` bubbles.** The contrail finishes drawing itself in after eleven seconds,
that event rises to the wrapper, and a `{once: true}` listener there took a child finishing
for the flight finishing and removed the aircraft in mid-air — eleven seconds into a
forty-second crossing. Birds never showed it because their wingbeat is infinite and never
ends; nor did night aircraft, whose beacon is infinite too. It only touched the one flyer
with a finite child animation, which is to say every plane in daylight.

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

The see-through check is deliberately not written in terms of what the extension thinks it
did. It reads the fill and label the harness itself drew, composites them over the surface
at that hour, and measures the result — so the thing under test is never also the witness.

`test/popupshim.html` is the settings surface, standing in only for `chrome.storage`:
same markup, same stylesheet, same script, so a control that does not wire up shows it.

`getBoundingClientRect` and `getComputedStyle` are wrapped before the extension loads, so
forced layout is counted rather than timed. Nothing asserts on milliseconds: wall-clock in
a browser swung between 4.3 and 16.8ms across four consecutive identical runs, and a
millisecond budget is a coin toss dressed up as an assertion. The work that drives the
time — nodes replaced, layouts forced — is exact.

The harness is not Google Calendar. It reproduces the DOM contract the extension depends
on, which is what the extension is written against, but nothing here has been run on
calendar.google.com.

## Two guards

One table defines the plate, and it has to stay one. There were three: `S.PLATE` in
palette.js, used by nothing; the one `buildPlate` drew, 0.30 to 0.52; and the one the
guard modelled, 0.24 to 0.45. So the guard had been measuring event legibility against a
plate about 0.07 thinner than the plate on the screen — conservative, but wrong, and
see-through events cannot be solved at all against a surface model that does not match
what is drawn.

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
__SkyCal.stockOf(document.querySelector('[data-eventid]'))   // what Google drew, before us
__SkyCal.refresh()                                  // throw the cached forecast away
__SkyCal.unmount()
__SkyCal.setLocation(42.28, -83.74, 'Ann Arbor')
__SkyCal.setUnits('f')
__SkyCal.flyNow()                                   // do not wait for the next one
__SkyCal.diagnose()                                 // what is drawing on an event block
```

Content scripts run in an isolated world, so switch the DevTools console context from
`top` to **Sky for Google Calendar** to reach these.

## Not built yet

- Time-gutter daylight ribbon, sunrise/sunset staircases, week ribbon — all signature
  elements in the design file, none of them in the extension
- Month view treatment
- Adaptive grid rules (`black 15–18%` replacing Google's fixed `#DADCE0`)
- Anything on mobile: the native Calendar app is closed to extensions on every platform
