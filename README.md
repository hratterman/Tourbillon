# Minute-Repeating Tourbillon — Browser Simulator

A physically-grounded, interactive **3D simulation** of a minute-repeating
tourbillon wristwatch movement — a functional model you can orbit from any
angle and tear apart layer by layer, rendered as real metal (PBR brass,
polished and brushed steel, blued screws-and-springs, ruby jewels, sapphire
crystal) under a studio environment. This is not a watch-face animation:
every observable behaviour — the tick, the carriage rotation, the chime
count, the rate — **emerges** from a simulated mechanism. In particular, the
repeater's strike count is read off simulated rack-and-snail geometry,
never off the clock.

```bash
npm install
npm run dev    # interactive simulator
npm test       # the ten acceptance suites (headless, no browser needed)
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

### Assembly & teardown (3D)
Every part is a solid — extruded gears with real teeth, stepped snail cams
cut to the exact profile the physics reads, spiral-tube hairspring and
cathedral gongs, lathed case, domed sapphire with transmission — carrying a
layer, a stack Z-depth, an assembled transform (live, driven by the
mechanism) and an exploded offset along the true watch axis. Drag to orbit,
scroll to zoom. The depth slider peels the watch apart continuously and
reversibly like a real disassembly; presets show the full case, movement
only, dial side, or going-train side; clicking any part isolates it with a
label and its live state. Flip it over: the sapphire exhibition back shows
the ratchet wheel, bridges and the flying tourbillon cock. The simulation
keeps running throughout — fire the repeater in exploded view and watch the
racks fall onto their snails with nothing occluding them.

Rendering is three.js (rendering only — the physics integrator, event
detection and the audio synth remain hand-written per the ground rules).

### Mechanical layout (render3d/layout.ts)
Every arbor position, pitch radius (r = module × teeth / 2), tooth count
and z-tier lives in one audited module. Every spur mesh's centre distance
equals the sum of pitch radii; tooth tiers overlap axially; driven wheels
render tooth-phase-locked to their drivers (`meshedAngle`), so teeth
genuinely interleave at any zoom.

**The open caseback shows real architecture.** The back of the movement is
bridgework, exactly as a watchmaker expects: a barrel bridge (audited
outline, jewelled centre and transfer bearings, feet and screws) and the
tourbillon cock carry every lower pivot, and the RATCHET, CROWN WHEEL and
CLICK ride the barrel bridge's back face — the classic winding cluster in
plain view. The stem, far up at the dial side, reaches them through an
intermediate transfer wheel (winding pinion ⇄ contrate ring on a tall
arbor down to a spur at the bridge): 12/36 × 36/36 × 36/60 = exactly the
1/5 barrel turn per crown turn the physics uses. The dial side gets its
own strike bridge over the gathering staff, intermediate and governor.

**Pulling the crown is a real mechanism.** The stem is cut like a real
stem — tip pivot (running in a pierced boss on the plate), square,
winding-pinion seat, setting-lever groove, hub. The SETTING LEVER's pin
rides the groove; pulling the stem rotates the lever, which throws the
YOKE, whose fork (riding the castle's waist groove) slides the castle
inboard off the winding pinion's dogs and onto the setting idler. Both
lever angles are solved exactly from the geometry for each crown position
and asserted. Setting runs castle → s1 idler → two-tier s2 → minute
wheel → cannon, exactly 10 minutes of hand travel per crown turn.
Winding is one-way and solid: the click holds the ratchet, the crown
stops dead at full wind, backward turns ratchet the castle's saw dogs
over the held pinion, and the transfer's contrate face-ring is mounted at
the offset that keeps a ring gap under every bottoming pinion tooth
(phase-locked, asserted). The slide's lever carries a pin whose drawn
all-or-nothing notch is cut at exactly the core's 85% latch travel.

**Nothing occupies the same space twice.** Every part contributes solid
volumes (swept envelopes for everything that moves — racks through their
full fall, hammers at rest and fully cocked, the castle across its
travel); a collision audit tests every cross-part pair against a
whitelist naming only real engagements (meshes, bearings, pallets in
tooth paths), and the acceptance suite requires ZERO interpenetrations.
That audit drove the architecture: the barrel module grew so its arbor
clears the centre wheel's teeth, the drum wall thinned under the centre
wheel, the hour wheel rides ABOVE the quarter/minute snail stack on a
tall minute-wheel pinion (a real repeater constraint), the strike wheel
ducked under all three rack tiers so only its gathering pallets rise into
their paths, the fly's vanes dropped below the racks, the high gong/hammer
plane rose above the minute rack, both hammers found pivots outside every
rack's swept sector, the high hammer's arm is a dog-leg, the plate is
milled with a keyless slot and a transfer-ring recess, and the gong block
sits radially outside every inner coil pass.
The hands mount on a real centre-post stack (centre arbor → cannon pinion
pipe → hour-wheel pipe) through the dial's centre hole; racks pivot on
plate studs under shoulder screws with return springs; all three racks'
toothed sectors converge on the strike wheel's three-tier gathering pallet
staff, which drives the governor through an intermediate two-tier wheel;
the hammers' heads are aimed at their gong's INNER coil (computed from the
same spiral the tube is drawn from, at the audited strike gap) and their
cocking is driven geometrically by the strike train's approach to each
strike, dropping exactly on it. The hairspring genuinely breathes inside
cage pillars that arch around it, and the balance's upper pivot carries a
cap jewel under a three-armed anti-shock spring.

## Acceptance tests

`npm test` runs ten suites against the headless `Movement`:

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
9. **Mechanical truth** — every declared gear mesh has exact centre
   distance and axial tooth overlap; tooth phases stay locked through the
   whole chain at arbitrary states (including the tourbillon epicyclic
   and the 90° contrate turn); the keyless chain's ratios match the
   physics; the pull linkage's lever pin and yoke fork land exactly; the
   stem line clears every wheel it passes.
10. **Collision audit** — every cross-part volume pair (swept envelopes
    included) is tested; only whitelisted DESIGNED engagements may touch;
    the assembled movement has zero interpenetrations.

## Controls

| Control | Action |
| --- | --- |
| **HOLD to push slide** (or drag the slide on the case) | full push + release fires the repeater |
| **Half-push** | demonstrates the all-or-nothing interlock (silence) |
| **HOLD to wind** / drag or scroll the crown | winds the mainspring (kicks the balance if stopped) |
| **Pull crown** (or double-click it) | setting mode: hands + snails move together, both directions |
| **Regulator** | ± rate; watch the s/day readout respond |
| **Time scale** | 0.02× (watch one escapement cycle: lock–impulse–drop) to 1000× (watch the reserve run down) |
| **Teardown slider / presets / layer toggles** | peel the assembly apart in 3D while it runs |
| Click any part | isolate + live state; drag orbits, scroll zooms, right-drag pans |

The timing-machine readouts (rate, amplitude, beat error) are measured from
escapement event timestamps the way a real machine measures them from the
tick sounds — amplitude uses the lift-angle formula, not the simulator's
internal state.
