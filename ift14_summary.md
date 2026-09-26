# Starship IFT-14 — orbit fit from navigational warnings

Launch: 28 Sep 2026, window 12:15:00–13:30:00Z (75 min). Alternates daily 29 Sep – 4 Oct, same window.

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
- T+00:00:00 liftoff, launch azimuth ≈107° (SE over the Gulf, Yucatán Channel, south of Cuba).
- T+00:08:11 SECO into a suborbital coast ellipse (assumed SECO at 150 km, ~1700 km downrange):
  apogee 275 km, perigee −99 km, e = 0.029.
- T+00:25:28–00:25:47 orbit insertion burn (19 s) at apogee (12.4°S 25.0°W, mid South Atlantic) → 275 km circular.
- T+00:34:18–01:04:50 Starlink V3 deployment (official timeline, flight-timeline.txt).
- Six revolutions; deorbit burn T+08:52:18–08:52:29 (official), subpoint 29.9°N 79.6°E over western Tibet.
- Official entry T+09:28:52, landing T+09:50:30. Descent model calibrated to these: retrograde 49 m/s →
  perigee 108 km, entry interface (EI, 120 km) 36.6 min after the burn at flight-path angle −0.38°, then a
  21.6 min lifting glide (speed 7.5 → 0.3 km/s, ~5050 km). With these official numbers the entry point lands
  at the west end of the Chile zone and the touchdown ~75 % along it, and the same model applied to the
  North Pacific contingency puts entry at the west end of that zone and splashdown in its eastern part.
  The skipped-insertion case re-enters on the coast ellipse (EI 19.6 min after apogee, γ = −1.6°) with a
  16 min, ~3750 km glide as on Flights 4–11.

## Plane fit
| parameter | value |
|---|---|
| inclination | 30.49° |
| nodal period | 89.75 min, ground-track shift 23.0° W per rev |
| plane longitude offset at the pad | +1.6° (absorbs yaw steering and the ascent's Earth-rotation lag) |
| cross-track rms | launch 0.48°, Indian 0.24°, N Pac A 0.20°, Chile 0.66° |

## Timeline (T+ from a 12:15:00Z launch; every UTC shifts 1:1 with the actual T0)

| event | MET | UTC (12:15 T0) | position |
|---|---|---|---|
| SECO | T+00:08:11 | 12:23:11Z | 20.9°N 82.3°W |
| insertion burn | T+00:25:28 | 12:40:28Z | 12.4°S 25.0°W |
| Starlink V3 deploy start / complete | T+00:34:18 / 01:04:50 | 12:49:18 / 13:19:50Z | 28°S 9°E / 0° 123°E |
| #1 no-insertion entry | T+00:45:03 | 13:00:03Z | 29.8°S 53.5°E |
| #1 Indian Ocean zone | T+00:50:38–01:00:58 | 13:05:38–13:15:58Z | splash 20.4°S 85.3°E at T+01:01:03 |
| #2 contingency deorbit burn | T+02:11:08 | 14:26:08Z | 30.7°S 14.7°E (S Atlantic off the Cape) |
| #2 entry | T+02:47:42 | 15:02:42Z | 25.3°N 149.8°E (west end of the zone) |
| #2 North Pacific zone | T+02:46:28–03:09:18 | 15:01:28–15:24:18Z | splash 29.9°N 164.3°W at T+03:09:20 |
| planned deorbit burn | T+08:52:18–08:52:29 | 21:07:18Z | 29.9°N 79.6°E (Tibet) |
| entry | T+09:28:52 | 21:43:52Z | 21.6°S 143.9°W (west end of zone) |
| Chile zone | T+09:27:38–09:50:28 | 21:42:38–22:05:28Z | landing 30.6°S 99.4°W at T+09:50:30 |

Ascending nodes: T+01:04:00 (122.9°E), 02:33:50 (100.2°E), 04:03:30 (77.0°E), 05:33:20 (54.3°E), 07:03:00 (31.0°E), 08:32:50 (8.4°E).

## Hazard windows vs. mission time
- North Pacific opens 14:27Z = T+02:12 for a 12:15 launch: exactly the contingency #2 deorbit burn (T+02:11:08),
  35.7 min before the track reaches the zone at orbital rate. The re-issued warning joins the old areas A (Japan side)
  and B (Hawaii side) into one zone along this pass; its eastern wedge ends at 145°W.
- Chile opens 21:07Z = T+08:52: the official deorbit burn (T+08:52:18) to the minute. Landing T+09:50:30,
  "nearly 10 h", after six full revolutions.
- Indian Ocean opens 12:23Z = T+00:08 = SECO: from SECO the ship is on a ballistic path into the Indian Ocean
  unless the insertion burn is made at T+00:25:28. The zone closes 14:47Z; with the 13:30Z window close the latest
  crossing is 14:20:38–14:30:58Z, so every launch time in the 75 min window is covered (with the earlier 2 h window
  it would not have been).
- Zone closing times carry roughly one extra revolution of margin.
- The east end of the Indian zone is cut by a 393 km radius arc centred on Cocos (Keeling) Islands, not a target.

| zone | crossing, T0 12:15Z | crossing, T0 13:30Z | published |
|---|---|---|---|
| Indian Ocean | 13:05:38–13:15:58Z | 14:20:38–14:30:58Z | 1223–1447Z |
| North Pacific | 15:01:28–15:24:18Z | 16:16:28–16:39:18Z | 1427–1833Z |
| W of Chile | 21:42:38–22:05:28Z | 22:57:38–23:20:28Z | 2107–0108Z |

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
| 12:15Z | 21:07:18Z / 05:07:18 | −44.1° | T+08:59:48, 112.0°E | T+09:00:58, 116.9°E | T+09:03:58, 129.0°E |
| 12:40Z | 21:32:18Z / 05:32:18 | −39.2° | T+08:58:18, 105.6°E | T+08:59:28, 110.6°E | T+09:02:38, 123.7°E |
| 13:05Z | 21:57:18Z / 05:57:18 | −34.2° | T+08:56:58, 99.8°E | T+08:58:08, 104.9°E | T+09:01:08, 117.6°E |
| 13:30Z | 22:22:18Z / 06:22:18 | −29.0° | T+08:55:38, 94.0°E | T+08:56:48, 99.1°E | T+08:59:48, 112.0°E |

## TLEs (ift14_tles.txt, ift14_tles_alternates.txt, work/ift14_tle.py)
SGP4 mean elements least-squares fitted to the model track from insertion to the deorbit burn, one per launch time.
Epoch = insertion burn (T0 + 00:25:28); valid from then until the deorbit burn at T+08:52:18. Same i, n and argument
of latitude; RAAN advances at the sidereal rate, 6.27° per 25 min of launch delay and 0.986° per day. Fit rms 8.5 km
(J2 short-period terms), ground track within 0.07° of the model. Refit on 24 Sep against the re-issued warnings:
elements moved by less than 0.01°, positions by at most 0.54 km. Placeholder catalog numbers 99990–99993
(28 Sep) and 99960–99983 (alternates 29 Sep – 4 Oct, four T0 each), designator 26999A, bstar 0.

```
STARSHIP IFT-14 T0 1215Z 28SEP (zone fit)
1 99990U 26999A   26271.52810185  .00000000  00000-0  00000+0 0    01
2 99990  30.5122 330.6861 0000100   0.0000 204.8093 16.01248341    05
STARSHIP IFT-14 T0 1240Z 28SEP (zone fit)
1 99991U 26999A   26271.54546296  .00000000  00000-0  00000+0 0    03
2 99991  30.5122 336.9532 0000100   0.0000 204.8093 16.01248341    00
STARSHIP IFT-14 T0 1305Z 28SEP (zone fit)
1 99992U 26999A   26271.56282407  .00000000  00000-0  00000+0 0    07
2 99992  30.5122 343.2203 0000100   0.0000 204.8093 16.01248341    07
STARSHIP IFT-14 T0 1330Z 28SEP (zone fit)
1 99993U 26999A   26271.58018519  .00000000  00000-0  00000+0 0    01
2 99993  30.5122 349.4875 0000100   0.0000 204.8093 16.01248341    01
```

## Maps (ift14_navwarning_map.png, ift14_china_T0_*.png; style in work/ift14_style.py)
NASA Blue Marble NG base (world.topo.bathy.200409, 21600 × 10800; global map downsampled to 7200 px, China maps
cropped at full resolution), dark palette, 30° graticule, night shading and terminator. Yellow: ascent (solid),
coast (dashed), launch hazard zone. Cyan: orbit, numbered at each descending and ascending node. Dashed in zone
colour: descents. Hollow square: entry interface. Star: splashdown. Event notes carry T+ only; UTC values for any
launch time are in the tables above. Illustration: Mickey.

## 3D page (docs/, exported by work/ift14_web_export.py)
Three.js globe in the Earth-fixed frame with the fitted trajectory (ascent, suborbital coast, six orbits, planned
descent and both contingencies), hazard zones, launch date and T0 selectors, MET scrubbing and playback, a live
wall-clock mode, and day, sunrise/sunset and −12° nautical-twilight terminators that follow UTC = T0 + MET.
The panel checks every zone crossing against its published window for the chosen T0 and generates the TLE for
that T0. Serve locally with `python3 -m http.server 8000` inside docs/.

Clicking a China city (label or dot) opens a SatObserver-MX style sky chart (docs/js/skychart.js): polar alt-az
view with every Starship pass above 1° for the chosen profile. The track over a city depends only on MET, so it
is fixed; stars (to mag 4.6), Milky Way, Sun, Moon with phase, the twilight-tinted sky disc and the sunlit or
eclipsed styling of the track follow UTC = T0 + MET. Each pass chip lists rise time, maximum elevation, direction
and, for the chosen T0, how long the ship is sunlit, at least 10° up and against a sky darker than civil twilight.
