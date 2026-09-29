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
# Heights are exported above the WGS-84 ellipsoid. The model orbit has radius RE + h (so 275.0-280.6 km above WGS-84);
# the notional ascent and the model descents are tapered so they start at the pad and end at sea level.
import ift14_entry as E
def geodetic_track(met_min, lon, lat, alt):
    lat_c = np.degrees(np.arctan((1 - F.EF2)*np.tan(np.radians(lat))))
    la2, lo2, h2 = [], [], []
    for lo, la, a in zip(lon, lat_c, alt):
        rr = (F.RE + a)*np.array([np.cos(np.radians(la))*np.cos(np.radians(lo)), np.cos(np.radians(la))*np.sin(np.radians(lo)), np.sin(np.radians(la))])
        g = E.geodetic(rr); la2.append(g[0]); lo2.append(g[1]); h2.append(g[2])
    return np.array(lo2), np.array(la2), np.array(h2)
def seg(met_min, lon, lat, alt):
    return dict(met0=round(float(met_min[0])*60, 1), dt=DT, lon=r(lon), lat=r(lat), alt=r(alt, 3))

m_nom = np.arange(0, F.MET_BURN3 + 1e-9, DT/60)
lo, la, h = geodetic_track(m_nom, *pl.nominal(m_nom), pl.alt_nominal(m_nom))
asc = m_nom < F.MET_SECO; h[asc] -= h[0]*(1 - m_nom[asc]/F.MET_SECO)**2              # ascent starts at 0 on the pad
tracks = {'nominal': seg(m_nom, lo, la, h)}
for key, D in [('planned', F.D3), ('cont_indian', F.D1), ('cont_npac', F.D2)]:
    lo, la, h = geodetic_track(D['met'], D['lon'], D['lat'], D['alt'])
    h -= h[-1]*np.clip((D['met'] - D['t_ei'])/(D['met'][-1] - D['t_ei']), 0, 1)       # glide ends at sea level
    tracks[key] = seg(D['met'], lo, la, h)
FL = json.load(open(F.ROOT/'work'/'entry_flown.json'))                                  # physical entry (ift14_entry.py)
tracks['flown'] = dict(met0=FL['met0'], dt=FL['dt'], lon=FL['lon'], lat=FL['lat'], alt=FL['alt'])
fe = FL['events']
branches = {
    'planned': dict(label='Planned: 6 orbits, landing W of Chile (model)', kind='orbit', switch=round(F.MET_BURN3*60, 1), descent='planned',
                    color='#7ad97a', ei=round(F.D3['t_ei']*60, 1), landing='landed W of Chile', burnLabel='deorbit burn', skyLabel='deorbit burn'),
    'flown': dict(label='Flight 14 as flown, 28 Sep: 2 orbits, splashdown N of Hawaii', kind='flown', switch=fe['burn'], descent='flown',
                  color='#c792ea', ei=round(fe['ei'], 1), lb=round(fe['landing_burn'], 1), landing='splashdown N of Hawaii',
                  burnLabel='deorbit burn', skyLabel='deorbit burn'),
    'cont_npac': dict(label='Contingency: deorbit on orbit 2, North Pacific (model)', kind='contingency', switch=round(F.D2['t_burn']*60, 1),
                      descent='cont_npac', color='#ffb84f', ei=round(F.D2['t_ei']*60, 1), landing='splashdown, North Pacific',
                      burnLabel='contingency deorbit burn', skyLabel='contingency burn'),
    'cont_indian': dict(label='Contingency: no insertion burn, Indian Ocean (model)', kind='suborbital', switch=round(F.MET_INS*60, 1),
                        descent='cont_indian', color='#ff5252', ei=round(F.D1['t_ei']*60, 1), landing='splashdown, Indian Ocean',
                        burnLabel='insertion burn skipped', skyLabel='insertion skipped'),
}

# ---------------- events ----------------
def hms(s): return int(s[:2])*3600 + int(s[3:5])*60 + int(s[6:8])
official = [l.split('\t') for l in (F.ROOT/'flight-timeline.txt').read_text().strip().splitlines()]
MAJOR = {'Liftoff', 'Starship engine cutoff', 'Starship orbital insertion burn start', 'Deorbit burn start',
         'Starship entry', 'An exciting landing!'}
ALL = list(branches)
events = []
for t, txt in official:
    booster = txt.startswith('Super Heavy') or txt.startswith('Hot-staging') or txt.startswith('Max Q')
    m = hms(t)
    br = ALL if m <= F.MET_INS*60 + 19 else (['planned', 'cont_npac', 'flown'] if m < F.MET_BURN2*60 else ['planned'])
    events.append(dict(met=m, label=txt, branches=br, ship=not booster, major=txt in MAJOR, official=True))
events += [
    dict(met=round(F.D1['t_ei']*60), label='Entry (no insertion burn, model)', branches=['cont_indian'], ship=True, major=True, official=False),
    dict(met=round(F.D1['t_splash']*60), label='Splashdown Indian Ocean (model)', branches=['cont_indian'], ship=True, major=True, official=False),
    dict(met=round(F.D2['t_burn']*60), label='Contingency deorbit burn (model)', branches=['cont_npac'], ship=True, major=True, official=False),
    dict(met=round(F.D2['t_ei']*60), label='Contingency entry (model)', branches=['cont_npac'], ship=True, major=True, official=False),
    dict(met=round(F.D2['t_splash']*60), label='Splashdown North Pacific (model)', branches=['cont_npac'], ship=True, major=True, official=False),
    # Flight 14 as flown: reported times, and events from the entry reconstruction
    dict(met=round(fe['burn']), label='Deorbit burn start', branches=['flown'], ship=True, major=True, official=True),
    dict(met=round(fe['burn_end']), label='Deorbit burn shutdown', branches=['flown'], ship=True, major=False, official=True),
    dict(met=round(fe['ei']), label='Entry interface, 120 km (reconstruction)', branches=['flown'], ship=True, major=True, official=False),
    dict(met=round(fe['peak_heating']), label='Peak heating (reconstruction)', branches=['flown'], ship=True, major=False, official=False),
    dict(met=round(fe['transonic']), label='Transonic, Mach 1.2 (reconstruction)', branches=['flown'], ship=True, major=False, official=False),
    dict(met=round(fe['subsonic']), label='Subsonic, Mach 1 (reconstruction)', branches=['flown'], ship=True, major=False, official=False),
    dict(met=round(fe['landing_burn']), label='Landing burn start (reconstruction)', branches=['flown'], ship=True, major=False, official=False),
    dict(met=round(fe['splash']), label='Splashdown north of Hawaii', branches=['flown'], ship=True, major=True, official=True),
]
events.sort(key=lambda e: e['met'])

# ---------------- zones ----------------
ZDEF = [('launchA', 'launch', '#ffd54f', 'NAVAREA IV 922/26', 'Launch hazard (Gulf / Yucatán Channel)', None),
        ('launchB', 'launch', '#ffd54f', 'NAVAREA IV 922/26', 'Launch hazard area B', None),
        ('indian', 'indian', '#ff5252', 'HYDROPAC 2751/26', 'Indian Ocean: contingency, no insertion burn', F.W1),
        ('npac', 'npac', '#ffb84f', 'NAVAREA XII 657/26 = HYDROPAC 2761/26', 'North Pacific: contingency, orbit 2', F.W2),
        ('chile', 'chile', '#7ad97a', 'HYDROPAC 2750/26', 'South Pacific W of Chile: planned landing', F.W3)]
zones = []
DEF_BRANCH = {'indian': 'cont_indian', 'npac': 'cont_npac', 'chile': 'planned'}
fl_met = FL['met0']/60 + np.arange(len(FL['lon']))*FL['dt']/60
fl_cross = F.crossings(F.Z['npac'], fl_met, np.array(FL['lon']), np.array(FL['lat']))
for key, grp, col, ident, desc, W in ZDEF:
    z = F.Z[key]; cross = {}
    if W is not None: cross[DEF_BRANCH[grp]] = [round(W[0]*60), round(W[1]*60)]
    if key == 'npac' and fl_cross: cross['flown'] = [round(min(c[0] for c in fl_cross)*60), round(max(c[1] for c in fl_cross)*60)]
    zones.append(dict(key=key, group=grp, color=col, id=ident, desc=desc, t0=z['t0'], t1=z['t1'], wrap=bool(z['wrap']),
                      ring=[[round(x, 4), round(y, 4)] for x, y in z['pts']], cross=cross, branch=DEF_BRANCH.get(grp)))
launch_cross = F.crossings(F.Z['launchA'], F.MET_GRID, *pl.nominal(F.MET_GRID))
zones[0]['cross'] = {'launch': [0, round(launch_cross[-1][1]*60)]}

# ---------------- TLE reference (28 Sep 12:15Z fit); other T0: RAAN advances at the sidereal rate ----------------
tle_lines = (F.ROOT/'ift14_tles.txt').read_text().strip().splitlines()
tle_ref = dict(name=tle_lines[0], l1=tle_lines[1], l2=tle_lines[2], t0='2026-09-28T12:15:00Z',
               raan_rate_deg_per_min=360.98564736629/1440.0)

meta = dict(title='Starship IFT-14', inc=round(float(pl.inc), 4), h_orbit=F.H_ORBIT, T_nodal_min=round(float(pl.T_nodal), 3),
            RE=F.RE, starbase=list(F.STARBASE), date='2026-09-28', alternates=F.ALT_DATES,
            t0_min='12:15:00', t0_max='13:30:00', t0_presets=[t[:5] for t in F.WINDOW_T0],
            met_ins=round(F.MET_INS*60, 1), met_seco=round(F.MET_SECO*60, 1), met_burn3=round(F.MET_BURN3*60, 1),
            dv_deorbit_ms=round(float(F.DV_DEORBIT)*1000, 1),
            flown=dict(date='2026-09-28', t0='12:48:59', splash_reported=FL['diag']['target'], diag=FL['diag'], events=fe),
            notes=['Trajectory is a model fitted to the navigational-warning zones (circular 275 km orbit + J2, '
                   'suborbital coast, deorbit ellipse and lifting glide), not official ephemeris.',
                   'Earth-fixed ground track is the same for every launch time in the window; only the Sun moves.',
                   'Flight 14 as flown: liftoff 12:48:59 UTC, deorbit burn T+02:12:00-02:12:11, splashdown T+03:08:30 at '
                   '25.4993 N 155.4275 W (reported). Its entry is a 3-DOF aerodynamic reconstruction (WGS-84, J2, US76 atmosphere, '
                   'Newtonian belly-first aerodynamics, bank steering) solved to hit the splashdown point and time.'])
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
