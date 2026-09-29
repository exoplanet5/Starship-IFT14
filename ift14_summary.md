# Starship IFT-14 — orbit fit from navigational warnings

Launch window: 28 Sep 2026, 12:15:00–13:30:00Z (75 min), alternates daily 29 Sep – 4 Oct.
**Flown 28 Sep 2026, liftoff 12:48:59 UTC.** One Raptor Vacuum shut down early on ascent; the ship still reached
orbit, deployed 26 Starlink V3, and returned early: deorbit burn T+02:12:00, splashdown north of Hawaii at T+03:08:30
(see "Flight 14 as flown" below).

Inputs (navwarning/, issued 17–23 Sep, all valid daily 28 Sep – 4 Oct):
NAVAREA IV 922/26 (launch A+B, 1215–1414Z), HYDROPAC 2751/26 (Indian Ocean, 1223–1447Z),
NAVAREA XII 657/26 = HYDROPAC 2761/26 (North Pacific, 1427–1833Z), HYDROPAC 2750/26 (S Pacific W of Chile, 2107–0108Z).
The previous issue (NAVAREA IV 897/26, XII 637/26, HYDROPAC 2686/26, 2687/26; valid 22–28 Sep) is kept in navwarning_old/.

## Verification of the re-issued warnings (24 Sep)
| zone | new | previous | polygon | daily window |
|---|---|---|---|---|
| launch A, B | NAVAREA IV 922/26 | NAVAREA IV 897/26 | vertices identical | 1215–1414Z, unchanged |
| Indian Ocean | HYDROPAC 2751/26 | HYDROPAC 2687/26 | vertices identical | 1223–1447Z, unchanged |
| W of Chile | HYDROPAC 2750/26 | HYDROPAC 2686/26 | vertices identical | 2107–0108Z, unchanged |
| North Pacific | NAVAREA XII 657/26 = HYDROPAC 2761/26 | NAVAREA XII 637/26 areas A, B | same vertices, merged into one ring | 1427–1833Z, unchanged |

The merged North Pacific ring contains both old areas exactly and adds one bridge quadrilateral between them,
172.7°E–180°, 29.7–30.9°N (about 61,000 km²), where the orbit-2 track crosses from area A to area B. The two
North Pacific files carry the identical polygon (NAVAREA XII and HYDROPAC broadcasts of the same warning).
The fit uses the track-aligned western strip (old area A, west of 172.6°E); the plane moved by 0.01° in
longitude and every event time and zone crossing below is unchanged to the second.

## Flight profile used (work/ift14_fit.py)
- T+00:00:00 liftoff from Starbase, heading ESE over the Gulf, Yucatán Channel, south of Cuba. The ascent is an
  Earth-fixed curve that leaves the pad at rest and meets the coast trajectory at SECO in position and velocity
  (earlier versions started the ascent 1.6° east of the pad).
- T+00:08:11 SECO into a suborbital coast ellipse (assumed SECO at 150 km, ~1700 km downrange):
  apogee 275 km, perigee −99 km, e = 0.029.
- T+00:25:28–00:25:47 orbit insertion burn (19 s) at apogee (12.5°S 24.6°W, mid South Atlantic) → 275 km circular.
- T+00:34:18–01:04:50 Starlink V3 deployment (official timeline, flight-timeline.txt).
- Six revolutions; deorbit burn T+08:52:18–08:52:29 (official), subpoint 30.0°N 80.0°E over western Tibet.
- Descents (work/ift14_descents.py): every profile uses the same 3-DOF aerodynamic entry model and the Starship
  calibrated on Flight 14 (hypersonic angle of attack 55.1°, L/D 0.70, ballistic coefficient 331 kg/m², ~114 t).
  - Planned: 11 s burn at T+08:52:18 with the lift vector up; Δv solved for the official landing T+09:50:30 gives
    68.8 m/s (Flight 14 needed 69.6 m/s for the same 11 s burn), perigee 43.7 km. It lands at 29.9°S 86.9°W, inside
    the Chile zone, and goes subsonic at T+09:48:08 (official 09:48:07). At the official "entry" T+09:28:52 the
    model is at 85.7 km (Flight 14: 81.5 km at the reported entry), so SpaceX's "entry" marks heating onset near
    80–86 km, not 120 km.
  - North Pacific contingency: identical to Flight 14 as flown (same burn time T+02:12:00).
  - Indian Ocean contingency: no insertion burn; the ship coasts from SECO on the −99 km-perigee ellipse with the
    Starlinks still aboard (+50 t assumed, ballistic coefficient 475 kg/m²) and steers with a 66° bank and one
    reversal to the middle of the Indian Ocean zone.
  The earlier kinematic model used a 49 m/s burn (entry defined as 120 km at the official entry time) and a
  prescribed glide. A 49 m/s burn only lowers perigee to 108 km: in the 3-DOF model the ship then skims the upper
  atmosphere and does not land on the planned timeline, so that number was not physically consistent.

## Plane fit
| parameter | value |
|---|---|
| inclination | 30.58° |
| nodal period | 89.75 min, ground-track shift 23.0° W per rev |
| plane position | passes about 60 km from the pad; the ascent steers into it (a small dogleg) |
| cross-track rms | launch 0.47°, Indian 0.27°, N Pacific 0.21°, Chile 0.63° |

Why the plane is off the pad: forcing the plane through the pad (no dogleg) raises the fit error by 20 % and doubles
the Indian Ocean residual (inclination would be 30.13°). Matching each zone to its own descent instead of the orbit
does not help (the descents follow the orbit's track within a fraction of a degree). The offset at the pad is about
46 km across the track (the rest is along-track and irrelevant to strip-shaped zones), so the published zones imply
a plane slightly northeast of the pad, reached by yaw steering during the ascent. The earlier fit expressed this as a
1.6° longitude offset and started the drawn ascent there, east of Starbase; the ascent now starts on the pad.

## Timeline (T+ from a 12:15:00Z launch; every UTC shifts 1:1 with the actual T0)

| event | MET | UTC (12:15 T0) | position |
|---|---|---|---|
| SECO | T+00:08:11 | 12:23:11Z | 20.8°N 81.8°W |
| insertion burn | T+00:25:28 | 12:40:28Z | 12.5°S 24.6°W |
| Starlink V3 deploy start / complete | T+00:34:18 / 01:04:50 | 12:49:18 / 13:19:50Z | 26°S 8°E / 2°N 126°E |
| #1 no-insertion entry (120 km) | T+00:44:29 | 12:59:29Z | 30.0°S 52.0°E |
| #1 Indian Ocean zone | T+00:49:18–00:57:43 | 13:04:18–13:12:43Z | splash 21.2°S 85.4°E at T+00:57:43 |
| #2 contingency deorbit burn | T+02:12:00 | 14:27:00Z | 30.7°S 19.0°E (S Atlantic off the Cape); as flown |
| #2 entry (120 km) | T+02:38:23 | 14:53:23Z | 9.6°N 116.0°E |
| #2 North Pacific zone | T+02:46:20–03:08:30 | 15:01:20–15:23:30Z | splash 25.5°N 155.4°W at T+03:08:30 (as flown) |
| planned deorbit burn | T+08:52:18–08:52:29 | 21:07:18Z | 30.0°N 80.0°E (Tibet) |
| entry (120 km) / official entry | T+09:18:52 / 09:28:52 | 21:33:52 / 21:43:52Z | 2.8°S 178.3°W / 85.7 km altitude |
| Chile zone | T+09:27:28–09:50:30 | 21:42:28–22:05:30Z | landing 29.9°S 86.9°W at T+09:50:30 |

Ascending nodes: T+01:04:00 (123.3°E), 02:33:50 (100.6°E), 04:03:30 (77.4°E), 05:33:20 (54.7°E), 07:03:00 (31.5°E), 08:32:50 (8.8°E).

## Hazard windows vs. mission time
- North Pacific opens 14:27Z = T+02:12 for a 12:15 launch: exactly the contingency deorbit burn, which Flight 14
  flew at T+02:12:00, 35.5 min before the track reaches the zone at orbital rate. The re-issued warning joins the old areas A (Japan side)
  and B (Hawaii side) into one zone along this pass; its eastern wedge ends at 145°W.
- Chile opens 21:07Z = T+08:52: the official deorbit burn (T+08:52:18) to the minute. Landing T+09:50:30,
  "nearly 10 h", after six full revolutions.
- Indian Ocean opens 12:23Z = T+00:08 = SECO: from SECO the ship is on a ballistic path into the Indian Ocean
  unless the insertion burn is made at T+00:25:28. The zone closes 14:47Z; with the 13:30Z window close the latest
  crossing is 14:19:18–14:27:43Z, so every launch time in the 75 min window is covered (with the earlier 2 h window
  it would not have been).
- Zone closing times carry roughly one extra revolution of margin.
- The east end of the Indian zone is cut by a 393 km radius arc centred on Cocos (Keeling) Islands, not a target.

| zone | crossing, T0 12:15Z | crossing, T0 13:30Z | published |
|---|---|---|---|
| Indian Ocean | 13:04:18–13:12:43Z | 14:19:18–14:27:43Z | 1223–1447Z |
| North Pacific | 15:01:20–15:23:30Z | 16:16:20–16:38:30Z | 1427–1833Z |
| W of Chile | 21:42:28–22:05:30Z | 22:57:28–23:20:30Z | 2107–0108Z |
| North Pacific, as flown (T0 12:48:59Z) | 15:35:19–15:57:29Z | | 1427–1833Z |

## Deorbit burn seen from China (ift14_china_T0_*.png, work/ift14_china.py)
Zoom 70–140°E, 15–55°N with the map clock at T0+08:53:00 (as requested; the burn is T+08:52:18–08:52:29, 2.8° of
track earlier, shown as the green square; × = ship at 08:53:00). Lines: sunrise (0°), civil (−6°), nautical (−12°)
terminators and the −16.5° line below which a 275 km spacecraft is in Earth's shadow. The burn over western Tibet
is in darkness for all four launch times; the ship exits shadow over central China 3 to 7.5 min later and flies
east over twilight ground toward the coast. Green dashed circle: ground area that sees the burn point above 15°
elevation (radius 797 km for 275 km altitude). Yellow swath: union of the same 15° footprints along the descent
from the shadow-exit point to where the subpoint crosses the sunrise line, i.e. where a sunlit ship can be seen
against a dark or twilight sky.

| T0 | burn UTC / CST | sun at burn point | ship sunlit from | ground in nautical twilight from | ground sunrise from |
|---|---|---|---|---|---|
| 12:15Z | 21:07:18Z / 05:07:18 | −43.6° | T+08:59:38, 111.8°E | T+09:00:48, 116.7°E |  |
| 12:40Z | 21:32:18Z / 05:32:18 | −38.8° | T+08:58:08, 105.3°E | T+08:59:18, 110.3°E |  |
| 12:46Z | 21:38:18Z / 05:38:18 | −37.6° | T+08:57:48, 103.9°E | T+08:58:58, 108.9°E |  |
| 13:05Z | 21:57:18Z / 05:57:18 | −33.8° | T+08:56:48, 99.6°E | T+08:57:58, 104.6°E |  |
| 13:30Z | 22:22:18Z / 06:22:18 | −28.6° | T+08:55:28, 93.8°E | T+08:56:38, 98.9°E |  |

(The planned deorbit over Tibet did not happen on Flight 14, which returned after two orbits.)

## TLEs (ift14_tles.txt, ift14_tles_alternates.txt, work/ift14_tle.py)
SGP4 mean elements least-squares fitted to the model track from insertion to the deorbit burn, one per launch time.
Epoch = insertion burn (T0 + 00:25:28); valid from then until the deorbit burn at T+08:52:18. Same i, n and argument
of latitude; RAAN advances at the sidereal rate, 6.27° per 25 min of launch delay and 0.986° per day. Fit rms 8.5 km
(J2 short-period terms), ground track within 0.07° of the model. Refit on 29 Sep with the pad-anchored ascent:
inclination 30.51° → 30.60°, RAAN +0.23°. Placeholder catalog numbers 99990–99993
(28 Sep) and 99960–99983 (alternates 29 Sep – 4 Oct, four T0 each), designator 26999A, bstar 0.

The TLE inclination (30.60°) and the model's (30.58°) describe the same orbital plane. The model value is the plane
itself. The TLE carries SGP4 mean elements: SGP4 adds J2 short-period terms that make the osculating inclination
oscillate by ±0.019° twice per revolution (30.582°–30.620°, mean 30.601°), so the fitted mean value sits 0.019°
above the plane. Propagated, the TLE reaches the same maximum latitude as the model (30.582°), its best-fit plane is
30.582°, and it stays within 0.32 km cross-track of the model; the 8.4 km fit rms is almost entirely along-track and
radial, where the model ignores the J2 short-period motion.

```
STARSHIP IFT-14 T0 1215Z 28SEP (zone fit)
1 99990U 26999A   26271.52810185  .00000000  00000-0  00000+0 0    01
2 99990  30.6009 330.9167 0000100   0.0000 205.0605 16.01243558    09
STARSHIP IFT-14 T0 1240Z 28SEP (zone fit)
1 99991U 26999A   26271.54546296  .00000000  00000-0  00000+0 0    03
2 99991  30.6009 337.1838 0000100   0.0000 205.0605 16.01243558    04
STARSHIP IFT-14 T0 1305Z 28SEP (zone fit)
1 99992U 26999A   26271.56282407  .00000000  00000-0  00000+0 0    07
2 99992  30.6009 343.4509 0000100   0.0000 205.0605 16.01243558    00
STARSHIP IFT-14 T0 1330Z 28SEP (zone fit)
1 99993U 26999A   26271.58018519  .00000000  00000-0  00000+0 0    01
2 99993  30.6009 349.7180 0000100   0.0000 205.0605 16.01243558    05
```

## Maps (ift14_navwarning_map.png, ift14_china_T0_*.png; style in work/ift14_style.py)
NASA Blue Marble NG base (world.topo.bathy.200409, 21600 × 10800; global map downsampled to 7200 px, China maps
cropped at full resolution), dark palette, 30° graticule, night shading and terminator. Yellow: ascent (solid),
coast (dashed), launch hazard zone. Cyan: orbit, numbered at each descending and ascending node. Dashed in zone
colour: descents. Hollow square: entry interface. Star: splashdown. Event notes carry T+ only; UTC values for any
launch time are in the tables above. Illustration: Mickey.

## Flight 14 as flown (28 Sep 2026; work/ift14_entry.py, work/ift14_atmo.py)

Reported (Wikipedia, Spaceflight Now, Space.com, Starlust live blogs; splashdown point from the user):

| event | MET | UTC | source |
|---|---|---|---|
| liftoff | T+00:00:00 | 12:48:59Z | reported |
| Raptor Vacuum early shutdown, remaining engines burn longer | ascent | | reported |
| orbit insertion burn | T+00:25:28–00:25:47 | 13:14:27Z | reported as planned |
| orbit ≈275 km; webcast 276 km, 26,370 km/h | | | livestream (user) |
| 26 Starlink V3 deployed | T+00:34:18–01:04:50 | | reported |
| deorbit burn, one sea-level Raptor | T+02:12:00–02:12:11 | 15:00:59Z | reported |
| entry | ≈T+02:47 | ≈15:36Z | reported |
| splashdown, hard, north of Hawaii | T+03:08:30 | 15:57:29Z | reported; 25.499295°N 155.427536°W |

The webcast readout fits the model orbit: it reads 276 km above WGS-84 and 26,370 km/h relative to the Earth
wherever the ship is at 9–15° latitude (the orbit spans 275.0–280.6 km and 26,361–26,376 km/h).

Entry reconstruction: 3-DOF point mass in the rotating Earth frame from the deorbit burn to splashdown; WGS-84
ellipsoid, J2 gravity, US Standard Atmosphere 1976 (checked to 4 decimals against the tables), finite 11 s retrograde
burn, belly-first aerodynamics from modified Newtonian theory (L/D = cot α, C_D ∝ sin³α) with the angle of attack
rising to the 90° belly flop below Mach 6, a transonic drag peak and supercritical crossflow drag subsonic, constant
bank toward the south, and the 19 s landing burn. Four unknowns solved so the flight hits the reported splashdown
point and time and the planned 2:04 from subsonic to landing-burn start; both solver starts converge to the same
answer, miss 0 km and 0 s:

| quantity | solved value | implication |
|---|---|---|
| deorbit Δv | 69.6 m/s | one Raptor at about 30 % thrust for 11 s on a 130 t ship; orbit after the burn 275.0 × 41.1 km (e 0.018), lowest point without atmosphere 38.7 km above WGS-84 at 30.7°N 171.1°W |
| hypersonic angle of attack | 55.1° (L/D 0.70) | |
| ballistic coefficient | 331 kg/m² hypersonic, 472 subsonic | about 114 t at entry (9 × 52 m planform), belly-flop C_D ≈ 0.5, 313 km/h near sea level |
| bank | 19.4° toward the south, no reversal | the target lies 395 km south of the ground track, in the southern lobe of the North Pacific zone |

| reconstructed event | MET | where |
|---|---|---|
| deorbit burn | T+02:12:00–02:12:11 | 30.7°S 19.0°E |
| 120 km | T+02:38:23 | 9.6°N 116.0°E, Mach 19.6 |
| reported "entry" | T+02:46:52 | 81.5 km, 25,770 km/h, entering the North Pacific zone |
| peak heating | T+02:53:25 | 72 km, Mach 22.4 |
| maximum deceleration | T+03:04:35 | 1.7 g |
| transonic / subsonic | T+03:05:55 / 03:06:07 | |
| landing burn | T+03:08:11 | |
| splashdown | T+03:08:30 | 25.4993°N 155.4275°W |

Lighting: the deorbit burn was in daylight over the South Atlantic; the ship entered Earth's shadow during the coast,
so entry and peak heating were in darkness; it came back into sunlight at about 45 km in the final five minutes and
splashed down in civil twilight (Sun −4.3°, 05:57 HST).
The ascent is still the nominal one; the extended burn after the engine loss is not modelled.

## Ascent and descent profiles: how they are built

In short: only the two ends of the ascent are physical. It starts at rest on the pad and meets a physically
computed coast at engine cutoff (SECO). The descent is a physics simulation solved to match every reported fact
about Flight 14.

### Ascent (work/ift14_fit.py, Plane.nominal and alt_nominal)
- Ground path: a cubic Hermite curve on the sphere from Starbase to the SECO point, matching the SECO position and
  Earth-fixed velocity. It starts with zero ground velocity. The orbital plane sits about 60 km from the pad, so this
  curve is also the small sideways steer into the plane.
- Height: h = 150 km × (1 − (1 − t/T_SECO)²), rising from 0 to 150 km at SECO (T+00:08:11, 15° of arc ≈ 1,670 km
  downrange). SECO height and downrange are assumptions, not reported values.
- Coast: from SECO a Kepler ellipse, apogee 275 km and perigee −99 km (e = 0.029). It leaves SECO climbing at a
  1.6° flight-path angle and covers 69° of arc in 17.3 min.
- Insertion: at apogee, T+00:25:28, a 19 s burn adds 113 m/s (7,627 → 7,740 m/s) for a 275 km circular orbit.

| time | height | ground speed | climb rate |
|---|---|---|---|
| T+00:01:00 | 34 km | 3,421 km/h | +536 m/s |
| T+00:04:00 | 111 km | 11,885 km/h | +312 m/s |
| T+00:08:00 | 150 km | 25,781 km/h | +14 m/s |
| just after SECO | 150 km | 26,490 km/h | +170 m/s |
| T+00:16:00 | 234 km | 26,122 km/h | +138 m/s |
| T+00:25:27 | 275 km | 26,035 km/h | 0 |

Limitations of the ascent:
- Too fast early: a real Starship is near 12 km and about 1,500 km/h at Max Q (T+00:58); the model is at 34 km and
  3,400 km/h.
- Climb-rate jump at SECO: the height curve arrives level, but the coast leaves climbing at 170 m/s.
- The longer burn after the Raptor Vacuum shutdown on Flight 14 is not modelled.
None of this affects the orbit or the descents; it only changes how the first 8 minutes look. A gravity-turn ascent
tuned to Max Q (T+00:58), MECO (T+02:20) and SECO (T+08:11) would remove the early excess and the jump at SECO.

### Descent (work/ift14_entry.py, work/ift14_descents.py, work/ift14_atmo.py)
A 3-degree-of-freedom (point-mass) simulation from the start of the deorbit burn to splashdown:
- Earth and gravity: rotating WGS-84 Earth, J2 gravity, Coriolis and centrifugal terms.
- Burn: 11 s retrograde thrust in the inertial frame.
- Air: US Standard Atmosphere 1976, rotating with the Earth (checked to 4 decimals against the tables).
- Aerodynamics: belly-first body, modified Newtonian theory (L/D = cot α, C_D ∝ sin³ α). Angle of attack 55° above
  Mach 6 (L/D 0.70), 82° at Mach 1.5, lift-free 90° belly flop at Mach 0.8; transonic drag peak; broadside
  cylinder drag below Mach 1 lower than hypersonic (supercritical Reynolds number, about 6×10⁷).
- Steering: constant bank of 19.4° to the south, faded out between Mach 3 and Mach 1.5.
- Landing burn: 19 s, linear deceleration to rest at the surface.

How it is determined: a least-squares solver chose four unknowns to satisfy four facts about Flight 14. The four are
coupled, so they are fitted together; two independent starting guesses converged to the same answer with zero miss.

| unknown | solved value | constraint it mainly satisfies |
|---|---|---|
| deorbit Δv | 69.6 m/s | splashdown time T+03:08:30 |
| ballistic coefficient | 331 kg/m² | 2:04 from subsonic to landing burn (planned sequence) |
| bank angle | 19.4° to the south | splashdown latitude, 395 km south of the ground track |
| angle of attack | 55° | splashdown longitude (glide range) |

The planned and contingency descents reuse this vehicle; the planned one only re-solves the burn (68.8 m/s).

Descent rate along the flown entry:

| moment | time | height | speed | sink rate | path angle | deceleration |
|---|---|---|---|---|---|---|
| burn end | T+02:12:11 | 280 km | 26,111 km/h | 1 m/s | 0.0° | 0 |
| coast | T+02:32:00 | 174 km | 26,589 km/h | 142 m/s | −1.1° | 0 |
| 120 km | T+02:38:23 | 120 km | 26,834 km/h | 140 m/s | −1.1° | 0 |
| first dip | T+02:45:15 | 79.0 km | 26,299 km/h | 7 m/s | 0.0° | 0.22 g |
| reported entry | T+02:46:52 | 81.5 km | 25,770 km/h | climbing 34 m/s | +0.3° | 0.14 g |
| peak heating | T+02:53:25 | 71.8 km | 23,702 km/h | 28 m/s | −0.2° | 0.52 g |
| Mach 10 | T+03:01:49 | 53.2 km | 11,730 km/h | 69 m/s | −1.2° | 1.40 g |
| Mach 5 | T+03:04:11 | 41.8 km | 5,721 km/h | 100 m/s | −3.6° | 1.67 g |
| Mach 2 | T+03:05:23 | 30.6 km | 2,132 km/h | 216 m/s | −21° | 1.56 g |
| Mach 1.2 | T+03:05:55 | 22.9 km | 1,274 km/h | 258 m/s | −47° | 1.25 g |
| Mach 0.5 | T+03:07:01 | 9.0 km | 544 km/h | 151 m/s | −87° | 1.16 g |
| landing burn | T+03:08:11 | 0.9 km | 334 km/h | 93 m/s | −90° | 1.04 g |

The descent has four regimes:
1. Coast, 26 min: gravity alone; the sink rate grows to about 140 m/s.
2. Hypersonic glide, about 18 min: lift holds the ship between 72 and 85 km while it sheds speed. The sink rate
   stays under 30 m/s and the ship even climbs back 6 km after the first dip. The constant bank causes that skip;
   real guidance varies the bank and would give a smoother path.
3. Steep dive, about 4 min: from Mach 10 lift can no longer carry the weight. The path steepens to vertical and the
   sink rate peaks at about 260 m/s near 23 km, with a maximum of 1.7 g.
4. Belly flop, about 2 min: the thickening air slows the fall toward terminal speed, 151 m/s at 9 km and 93 m/s at
   the landing burn. The burn then removes the last 93 m/s over about 880 m.

How far to trust it: the descent reproduces every reported Flight 14 time and the exact splashdown point, and the
planned landing it predicts falls inside the Chile zone and goes subsonic within 1 s of the official time. Its
individual numbers, such as the glide heights and the angle of attack, are the solver's best consistent answer, not
measurements.

## 3D page (docs/, exported by work/ift14_web_export.py)
Three.js globe in the Earth-fixed frame with four profiles: planned (6 orbits, Chile), Flight 14 as flown (2 orbits,
aerodynamic entry to the reported splashdown), the North Pacific contingency (the same path, any launch time) and the
Indian Ocean contingency. Only the selected profile's path is
drawn. Choosing the flown profile sets 28 Sep, T0 12:48:59Z (also a preset button). Hazard zones, launch date and T0
selectors, MET scrubbing and playback, a live wall-clock mode, and day, sunrise/sunset and −12° nautical-twilight
terminators that follow UTC = T0 + MET. The panel checks every zone crossing against its published window for the
chosen T0 and profile and generates the TLE for that T0. Status shows height above WGS-84 and speed relative to the
Earth (as on the webcast) and inertial. Serve locally with `python3 -m http.server 8000` inside docs/.
Every track carries geodetic latitude, longitude and height above WGS-84; the page draws them on the textured globe
and uses the exact WGS-84 positions for look angles, sunlight and speed (checked against Python to 1e-12°).
Sunlight uses an umbra/penumbra model on the WGS-84 Earth; the ship marker is a Starship cartoon that glints in
sunlight and dims in Earth's shadow.

Clicking a China city (label or dot), or entering coordinates, opens a SatObserver-MX style sky chart
(docs/js/skychart.js): polar alt-az view with every Starship pass above 1° for the chosen profile. The track over a
site depends only on MET, so it is fixed; stars (to mag 4.6), Milky Way, Sun, Moon with phase, the twilight-tinted
sky disc and the sunlit or eclipsed styling of the track follow UTC = T0 + MET. Each pass chip lists rise time,
maximum elevation, direction and, for the chosen T0, how long the ship is sunlit, at least 10° up and against a sky
darker than civil twilight.
