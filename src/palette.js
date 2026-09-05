// Sky palette. Values are sampled sky colours at full chroma; the plate does the
// attenuating at paint time, so nothing here is pre-faded.
// Ported from the Figma file, collection "Sky · Primitives".
(() => {
  const S = (window.__SkyCal = window.__SkyCal || {});

  // Fourteen anchors covering midnight to midnight. Four of them are solar and move
  // every day: civil dawn, sunrise, golden hour, sunset, civil dusk.
  // Index:      0        1        2         3        4          5     6     7     8
  // Meaning: 00:00    03:00  civilDawn  sunrise  sunrise+33m  09:00 12:00 15:00 17:30
  //             9        10       11        12       13
  //         golden   sunset  civilDusk  dusk+48m  24:00
  S.RAMP = {
    clear: [
      '#070C28', '#070C28', '#36428A', '#FF8A44', '#93D0FA',
      '#5CB4F2', '#2E90E8', '#3D9BEC', '#6CB6EE',
      '#F0AE44', '#FF6B33', '#63407E', '#18225C', '#070C28'
    ],
    // Barely used now. Cloud cover is expressed by the number and size of clouds, not by
    // draining the colour out of the sky, so this only ever contributes a small residual
    // dimming at heavy cover. A cloudy sky is still a blue sky with things in front of it.
    overcast: [
      '#12162C', '#12162C', '#454A5C', '#93867E', '#8E99A4',
      '#87929E', '#808B98', '#848F9C', '#8A939E',
      '#8E8272', '#8A6E62', '#4A4256', '#1E2238', '#12162C'
    ],
    // Pulled toward when precipitation is present.
    rain: [
      '#080C20', '#080C20', '#343A4C', '#6E6258', '#69747F',
      '#626E7A', '#5C6874', '#606C78', '#66717C',
      '#6A6050', '#6A5348', '#3A3448', '#151A2A', '#080C20'
    ]
  };

  // Plate opacity by fraction of the day. Thinnest at dawn and dusk, where the colour
  // is worth the most and the event density is lowest. See "the contrast guard".
  S.PLATE = [
    [0.00, 0.24], [0.22, 0.28], [0.30, 0.40], [0.38, 0.44],
    [0.50, 0.45], [0.68, 0.44], [0.78, 0.34], [0.83, 0.25],
    [0.88, 0.22], [1.00, 0.24]
  ];

  // Warm light falling on the calendar surface, peaking at sunrise and through
  // golden hour. Layered above the plate, not behind it.
  S.WASH = { sunrise: ['#FFC08A', 0.20], golden: ['#FFB347', 0.16], sunset: ['#FF8A50', 0.20], night: ['#3E4890', 0.14] };

  S.BLOOM = { sunrise: ['#FFC08A', 0.62], golden: ['#FFB347', 0.66] };

  // Google's own hour rule is #DADCE0 on white, which measures 1.37:1. A fixed grey
  // inverts and disappears over a saturated sky, so we draw black at these alphas
  // instead; on stock white this resolves to #D9D9D9.
  S.RULE = { mid: 0.15, edge: 0.18 };

  // Below this the block stops having a visible edge against its surroundings. Google's
  // own Banana on white sits at 1.65:1, so the floor is set just under what they accept.
  S.SEPARATION_FLOOR = 1.6;

  S.MOTION = { skyCrossfade: 1200, weatherChange: 2400, ui: 160 };
})();
