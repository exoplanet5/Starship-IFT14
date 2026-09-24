"""Export the zone-fitted IFT-14 trajectory, hazard zones, events and TLE reference for the 3D web page (docs/)."""
import sys, json, shutil, numpy as np
sys.path.insert(0, '/Users/mickey/sda/starship-ITF-14/work')
import ift14_fit as F
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

DOCS = F.ROOT/'docs'
(DOCS/'data').mkdir(parents=True, exist_ok=True); (DOCS/'tex').mkdir(parents=True, exist_ok=True)
pl = F.pl
DT = 10.0   # s

def r(a, n=4): return [round(float(x), n) for x in a]
def seg(met_min, lon, lat, alt):
    return dict(met0=round(float(met_min[0])*60, 1), dt=DT, lon=r(lon), lat=r(lat), alt=r(alt, 2))

# ---------------- tracks (Earth-fixed; identical for every T0, only the Sun moves) ----------------
m_nom = np.arange(0, F.MET_BURN3 + 1e-9, DT/60)
lon, lat = pl.nominal(m_nom)
tracks = {'nominal': seg(m_nom, lon, lat, pl.alt_nominal(m_nom))}
for key, D in [('planned', F.D3), ('cont_indian', F.D1), ('cont_npac', F.D2)]:
    tracks[key] = seg(D['met'], D['lon'], D['lat'], D['alt'])
branches = {
    'planned': dict(label='Nominal: 6 orbits, landing W of Chile', switch=round(F.MET_BURN3*60, 1), descent='planned', color='#7ad97a'),
    'cont_npac': dict(label='Contingency: deorbit on orbit 2, North Pacific', switch=round(F.D2['t_burn']*60, 1), descent='cont_npac', color='#ffb84f'),
    'cont_indian': dict(label='Contingency: no insertion burn, Indian Ocean', switch=round(F.MET_INS*60, 1), descent='cont_indian', color='#ff5252'),
}

# ---------------- events ----------------
def hms(s): return int(s[:2])*3600 + int(s[3:5])*60 + int(s[6:8])
official = [l.split('\t') for l in (F.ROOT/'flight-timeline.txt').read_text().strip().splitlines()]
MAJOR = {'Liftoff', 'Starship engine cutoff', 'Starship orbital insertion burn start', 'Deorbit burn start',
         'Starship entry', 'An exciting landing!'}
events = []
for t, txt in official:
    booster = txt.startswith('Super Heavy') or txt.startswith('Hot-staging') or txt.startswith('Max Q')
    m = hms(t)
    br = ['planned', 'cont_npac', 'cont_indian'] if m <= F.MET_INS*60 + 19 else (['planned', 'cont_npac'] if m < F.D2['t_burn']*60 else ['planned'])
    events.append(dict(met=m, label=txt, branches=br, ship=not booster, major=txt in MAJOR, official=True))
events += [
    dict(met=round(F.D1['t_ei']*60), label='Entry (no insertion burn, model)', branches=['cont_indian'], ship=True, major=True, official=False),
    dict(met=round(F.D1['t_splash']*60), label='Splashdown Indian Ocean (model)', branches=['cont_indian'], ship=True, major=True, official=False),
    dict(met=round(F.D2['t_burn']*60), label='Contingency deorbit burn (model)', branches=['cont_npac'], ship=True, major=True, official=False),
    dict(met=round(F.D2['t_ei']*60), label='Contingency entry (model)', branches=['cont_npac'], ship=True, major=True, official=False),
    dict(met=round(F.D2['t_splash']*60), label='Splashdown North Pacific (model)', branches=['cont_npac'], ship=True, major=True, official=False),
]
events.sort(key=lambda e: e['met'])

# ---------------- zones ----------------
ZDEF = [('launchA', 'launch', '#ffd54f', 'NAVAREA IV 922/26', 'Launch hazard (Gulf / Yucatán Channel)', None),
        ('launchB', 'launch', '#ffd54f', 'NAVAREA IV 922/26', 'Launch hazard area B', None),
        ('indian', 'indian', '#ff5252', 'HYDROPAC 2751/26', 'Indian Ocean: contingency, no insertion burn', F.W1),
        ('npac', 'npac', '#ffb84f', 'NAVAREA XII 657/26 = HYDROPAC 2761/26', 'North Pacific: contingency, orbit 2', F.W2),
        ('chile', 'chile', '#7ad97a', 'HYDROPAC 2750/26', 'South Pacific W of Chile: planned landing', F.W3)]
zones = []
for key, grp, col, ident, desc, W in ZDEF:
    z = F.Z[key]
    zones.append(dict(key=key, group=grp, color=col, id=ident, desc=desc, t0=z['t0'], t1=z['t1'], wrap=bool(z['wrap']),
                      ring=[[round(x, 4), round(y, 4)] for x, y in z['pts']],
                      cross=None if W is None else [round(W[0]*60), round(W[1]*60)],
                      branch={'indian': 'cont_indian', 'npac': 'cont_npac', 'chile': 'planned'}.get(grp)))
launch_cross = F.crossings(F.Z['launchA'], F.MET_GRID, *pl.nominal(F.MET_GRID))
zones[0]['cross'] = [0, round(launch_cross[-1][1]*60)]

# ---------------- TLE reference (28 Sep 12:15Z fit); other T0: RAAN advances at the sidereal rate ----------------
tle_lines = (F.ROOT/'ift14_tles.txt').read_text().strip().splitlines()
tle_ref = dict(name=tle_lines[0], l1=tle_lines[1], l2=tle_lines[2], t0='2026-09-28T12:15:00Z',
               raan_rate_deg_per_min=360.98564736629/1440.0)

meta = dict(title='Starship IFT-14', inc=round(float(pl.inc), 4), h_orbit=F.H_ORBIT, T_nodal_min=round(float(pl.T_nodal), 3),
            RE=F.RE, starbase=list(F.STARBASE), date='2026-09-28', alternates=F.ALT_DATES,
            t0_min='12:15:00', t0_max='13:30:00', t0_presets=[t[:5] for t in F.WINDOW_T0],
            met_ins=round(F.MET_INS*60, 1), met_seco=round(F.MET_SECO*60, 1), met_burn3=round(F.MET_BURN3*60, 1),
            dv_deorbit_ms=round(float(F.DV_DEORBIT)*1000, 1),
            notes=['Trajectory is a model fitted to the navigational-warning zones (circular 275 km orbit + J2, '
                   'suborbital coast, deorbit ellipse and lifting glide), not official ephemeris.',
                   'Earth-fixed ground track is the same for every launch time in the window; only the Sun moves.'])
data = dict(meta=meta, tracks=tracks, branches=branches, events=events, zones=zones, tle_ref=tle_ref)
out = DOCS/'data'/'ift14.json'
out.write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False))
print(f'wrote {out} ({out.stat().st_size/1e3:.0f} kB); nominal pts {len(m_nom)}, events {len(events)}, zones {len(zones)}')

# ---------------- textures ----------------
if '--tex' in sys.argv:
    src = Image.open('/Users/mickey/sda/basemaps/world.topo.bathy.200409.3x21600x10800.jpg'); src.load()
    for w, name in [(8192, 'earth_day_8k.jpg'), (4096, 'earth_day_4k.jpg')]:
        im = src.resize((w, w//2), Image.LANCZOS); im.save(DOCS/'tex'/name, quality=86, optimize=True, progressive=True)
        print('wrote', name, f'{(DOCS/"tex"/name).stat().st_size/1e6:.1f} MB')
    shutil.copy('/Users/mickey/sda/satobserver/app/assets/earth_night.jpg', DOCS/'tex'/'earth_night.jpg')
    print('copied earth_night.jpg')
