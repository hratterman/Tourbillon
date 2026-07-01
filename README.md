# Minute-Repeating Tourbillon — Browser Simulator

A physically-grounded, interactive simulation of a minute-repeating tourbillon
wristwatch movement. This is not a watch-face animation: every observable
behaviour — the tick, the carriage rotation, the chime count, the rate —
**emerges** from a simulated mechanism. In particular, the repeater's strike
count is read off simulated rack-and-snail geometry, never off the clock.

```bash
npm install
npm run dev    # interactive simulator
npm test       # the eight acceptance suites (headless, no browser needed)
npm run build  # type-check + production bundle
```

## What is simulated

### Going train & escapement
- **Balance + hairspring**: torsional harmonic oscillator at 28,800 vph
  (4 Hz), integrated with semi-implicit (symplectic) Euler at a fixed
  1e-4 s physics step (coarsened to 1e-3 s only above 50× time scale).
  Viscous + Coulomb pivot losses give honest free decay.
- **Swiss lever escapement** with event detection: unlocking against draw
  (with escape-wheel recoil), impulse through a 52° lift window, drop, and
  lock. The wheel is genuinely held by draw between impulses. Energy
  bookkeeping balances: at a given mainspring torque, amplitude settles
  where impulse energy equals unlocking + friction losses.
- **Gear train** (tooth counts asserted at module load): barrel 84 →
  centre 80/12 → third 75/10 → carriage pinion 10, and inside the carriage
  the 8-leaf escape pinion rolls around the **fixed 120-tooth fourth
  wheel** — the tourbillon epicyclic, 16 escape-wheel revs per carriage rev.
- **Mainspring**: non-linear torque curve with an end-of-reserve cliff,
  ~40 h reserve. Amplitude visibly sags as it unwinds; the watch stops when
  the energy balance fails — there is no `if (reserve <= 0)` anywhere.

### Tourbillon
The whole escapement rides in a carriage driven by the train at exactly
1 rev/60 s — the carriage **is** the seconds hand. The oscillator is
simulated in the carriage frame; rendering composes the carriage rotation
with the internal part positions.

### Minute repeater (the mechanical computer)
- **Hour snail** on a star wheel snapped by the jumper; the **surprise
  piece** advances it exactly at the top of the hour (both directions), so
  hour and quarter flip together across the boundary.
- **Quarter snail** (4 steps) and **minute snail** (4×15 steps) on the
  cannon pinion, moving with the hands through the motion works.
- **Racks**: spring-loaded, they fall until the tail lands on the snail
  step; the landing angle exposes exactly N teeth to the gathering pallet,
  and N is the strike count. The count therefore emerges from geometry —
  tamper a snail out of sync and the watch faithfully chimes the wrong time
  (that's one of the test guards; the other bans clock access in
  `repeater.ts` at source level).
- **All-or-nothing piece**: a real latch at 85% slide travel. A short push
  arms nothing: total silence, never a partial chime.
- **Fly governor**: quadratic air drag sets the cadence (terminal speed of
  the strike train), and the strike spring depletes per strike, so a long
  12:59 chime audibly relaxes toward the end. No `setTimeout` between notes.

### Audio
Two cathedral gongs, synthesized in real time by an `AudioWorklet` as sums
of inharmonic decaying modes (recursive-phasor oscillators), excited by a
raised-cosine hammer contact, through a tanh soft limiter. The identical
modal core (one plain-JS module, inlined verbatim into the worklet) renders
buffers for the headless audio tests. Fundamentals are tunable in the UI.

### Assembly & teardown
Every part carries a layer, a Z-depth, an assembled transform (live, driven
by the mechanism) and an exploded offset. The depth slider peels the watch
apart continuously and reversibly; presets show the full case, movement
only, dial side, or going-train side; clicking any part isolates it with a
label and its live state. The simulation keeps running throughout — fire
the repeater in exploded view and watch the racks fall onto their snails
with nothing occluding them.

## Acceptance tests

`npm test` runs the eight suites from the spec against the headless
`Movement`:

1. **Rate** — carriage 1 rev/60.0 s; 240 balance oscillations per rev.
2. **Sustain/decay** — amplitude bands vs wind; smooth decay with impulse
   disabled; self-stopping below a torque threshold.
3. **Chime counts from geometry** — 10:47, 12:59, 1:00, 3:15, 6:44, plus
   the tamper guard and the source-level clock ban.
4. **Surprise-piece boundary** — clean flips seconds either side of the
   hour, including running across it on the train's own power.
5. **All-or-nothing** — partial pushes are silent.
6. **Set-time sync** — randomized times: chimed == displayed, both
   directions through the keyless works.
7. **Audio sanity** — distinct low/high pitches, two-tone ding-dong, and a
   full 12:59 chime that never clips.
8. **Teardown integrity** — layers/Z/transforms defined, presets exact,
   explode↔reassemble exactly reversible, simulation running while exploded.

## Controls

| Control | Action |
| --- | --- |
| **HOLD to push slide** (or drag the slide on the case) | full push + release fires the repeater |
| **Half-push** | demonstrates the all-or-nothing interlock (silence) |
| **HOLD to wind** / drag or scroll the crown | winds the mainspring (kicks the balance if stopped) |
| **Pull crown** (or double-click it) | setting mode: hands + snails move together, both directions |
| **Regulator** | ± rate; watch the s/day readout respond |
| **Time scale** | 0.02× (watch one escapement cycle: lock–impulse–drop) to 1000× (watch the reserve run down) |
| **Teardown slider / presets / layer toggles** | peel the assembly apart while it runs |
| Click any part | isolate + live state; scroll zooms, drag pans |

The timing-machine readouts (rate, amplitude, beat error) are measured from
escapement event timestamps the way a real machine measures them from the
tick sounds — amplitude uses the lift-angle formula, not the simulator's
internal state.
