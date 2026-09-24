"""Starship IFT-14 (28 Sep 2026, alternates to 4 Oct): orbit plane fitted to NAVAREA/HYDROPAC zones + mission timeline.
Profile: SECO T+00:08:11 into a suborbital coast ellipse, insertion burn (19 s) at apogee T+00:25:28 -> 275 km
circular, 6 orbits, deorbit burn T+08:52:18. Descent: retro burn sized to reach EI (120 km) at official entry T+09:28:52, glide to landing T+09:50:30."""
import re, json, numpy as np, xml.etree.ElementTree as ET
from pathlib import Path
from shapely.geometry import Polygon, LineString, Point
from scipy.optimize import minimize, brentq

ROOT = Path('/Users/mickey/sda/starship-ITF-14')
NAV = ROOT/'navwarning'
MU, RE, J2 = 398600.4418, 6378.137, 1.08262668e-3
OMEGA_E = 7.2921159e-5*60.0        # rad/min
EF2 = 0.00669438
STARBASE = (-97.155, 25.997)
T0 = np.datetime64('2026-09-28T12:15:00')
T0_CLOSE = np.datetime64('2026-09-28T13:30:00')
WINDOW_T0 = ['12:15:00', '12:40:00', '13:05:00', '13:30:00']
H_ORBIT = 275.0
MET_SECO = 8 + 11/60            # min
MET_INS = 25 + 28/60            # insertion burn (19 s) at apogee
MET_BURN3 = 8*60 + 52 + 18/60   # planned deorbit burn start (official flight-timeline.txt)
MET_BURN3_END = 8*60 + 52 + 29/60
MET_ENTRY_OFF = 9*60 + 28 + 52/60   # official 'Starship entry'
MET_LAND_OFF = 9*60 + 50 + 30/60    # official landing
MET_DEPLOY0, MET_DEPLOY1 = 34 + 18/60, 64 + 50/60   # Starlink V3 deploy start / complete
SECO_DOWNRANGE = 15.0           # deg of arc from pad at SECO (~1700 km)
H_SECO = 150.0                  # km
DV_DEORBIT = None               # km/s retrograde, solved so that EI occurs at the official entry time
H_EI = 120.0
GLIDE_V0, GLIDE_V1 = 7.5, 0.3   # km/s at EI and at splashdown, speed linear in time
GLIDE_T_SUB = 16.0                       # min: steep suborbital entry (IFT-4..11 like)
GLIDE_T_ORB = MET_LAND_OFF - MET_ENTRY_OFF   # 21.6 min: official entry -> landing
BURN_LEAD2 = None               # set below: contingency #2 uses the same lead as the planned burn

def fmt(m):
    s = int(round(m*60)); return f'T+{s//3600:02d}:{s%3600//60:02d}:{s%60:02d}'
def utc(m, t0=T0):
    return str((t0 + np.timedelta64(int(round(m*60)), 's')).astype('datetime64[s]'))[11:19] + 'Z'

# ---------------- zones ----------------
# Current warnings (issued 17-23 Sep, launch 28 Sep, alternates daily 29 Sep - 4 Oct) live in navwarning/;
# the previous issue (22-28 Sep) is kept in navwarning_old/ for comparison. All polygons are unchanged except the
# North Pacific, where NAVAREA XII 657/26 (= HYDROPAC 2761/26) merges old areas A and B across the dateline.
ALT_DATES = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
def read_kml(path):
    ns = {'k': 'http://www.opengis.net/kml/2.2'}
    out = []
    for pm in ET.parse(path).getroot().iter('{%s}Placemark' % ns['k']):
        name = pm.find('k:name', ns).text; desc = pm.find('k:description', ns).text or ''
        coords = pm.find('.//k:coordinates', ns).text.split()
        pts = [(float(c.split(',')[0]), float(c.split(',')[1])) for c in coords]
        lons = np.array([p[0] for p in pts]); wrap = lons.max() - lons.min() > 180      # straddles the dateline
        if wrap: pts = [(x % 360, y) for x, y in pts]                                     # keep the ring continuous in 0..360
        m = re.search(r'(\d{4})Z TO (\d{4})Z', desc)
        out.append(dict(name=name, poly=Polygon(pts), pts=pts, wrap=wrap, t0=m.group(1), t1=m.group(2), desc=desc, file=Path(path).name))
    return out
zones = {z['name']: z for f in sorted(NAV.glob('*.kml')) for z in read_kml(f)}
KEYS = {'launchA': 'NAVAREA IV 922/2026 AREA A', 'launchB': 'NAVAREA IV 922/2026 AREA B',
        'indian': 'NAVAREA-PAC-2751-26', 'npac': 'NAVAREA XII 657/2026', 'chile': 'NAVAREA-PAC-2750-26'}
Z = {k: zones[v] for k, v in KEYS.items()}
ZONE_ID = {'launch': 'NAVAREA IV 922/26', 'indian': 'HYDROPAC 2751/26', 'npac': 'NAVAREA XII 657/26 = HYDROPAC 2761/26',
           'chile': 'HYDROPAC 2750/26'}
def zcontains(z, lon, lat):
    p = Point(lon, lat)
    return z['poly'].contains(p) or (z['wrap'] and z['poly'].contains(Point(lon % 360, lat)))
def centerline(poly, step=0.5, lon_max=None):
    x0, _, x1, _ = poly.bounds; pts = []
    if lon_max is not None: x1 = min(x1, lon_max)
    for lon in np.arange(x0+step, x1, step):
        cut = poly.intersection(LineString([(lon, -89), (lon, 89)]))
        if not cut.is_empty: pts.append((((lon+180) % 360)-180, 0.5*(cut.bounds[1]+cut.bounds[3])))
    return np.array(pts)
# fit on the track-aligned strips only; for the merged North Pacific zone that is its western part (old area A, <172.6E)
CL = {k: centerline(Z[k]['poly']) for k in ['launchA', 'indian', 'chile']}
CL['npac'] = centerline(Z['npac']['poly'], lon_max=172.6)

# ---------------- Kepler helpers ----------------
def kepler_E(M, e):
    E = M.copy() if isinstance(M, np.ndarray) else M
    for _ in range(12): E = E - (E - e*np.sin(E) - M)/(1 - e*np.cos(E))
    return E
def nu_from_E(E, e): return 2*np.arctan2(np.sqrt(1+e)*np.sin(E/2), np.sqrt(1-e)*np.cos(E/2))
def E_from_nu(nu, e): return 2*np.arctan2(np.sqrt(1-e)*np.sin(nu/2), np.sqrt(1+e)*np.cos(nu/2))
class Ellipse:
    def __init__(self, ra, rp):
        self.a, self.e = (ra+rp)/2, (ra-rp)/(ra+rp); self.n = np.sqrt(MU/self.a**3)*60   # rad/min
        self.p = self.a*(1-self.e**2)
    def nu_at_r(self, r): return np.arccos(np.clip((self.p/r - 1)/self.e, -1, 1))   # 0..pi
    def M_at_nu(self, nu): E = E_from_nu(nu, self.e); return E - self.e*np.sin(E)
    def nu_at_M(self, M): return nu_from_E(kepler_E(M, self.e), self.e)
    def r_at_nu(self, nu): return self.p/(1 + self.e*np.cos(nu))

RA = RE + H_ORBIT
# coast ellipse: apogee 275 km, SECO at H_SECO ascending, SECO->apogee = MET_INS-MET_SECO
def _coast_time(rp):
    el = Ellipse(RA, rp); nu = el.nu_at_r(RE+H_SECO); return (np.pi - el.M_at_nu(nu))/el.n
RP_COAST = brentq(lambda rp: _coast_time(rp) - (MET_INS - MET_SECO), RE-3000, RE+H_SECO-1)
COAST = Ellipse(RA, RP_COAST)
NU_SECO = COAST.nu_at_r(RE+H_SECO); M_SECO = COAST.M_at_nu(NU_SECO)
# deorbit ellipse: dv chosen so that the 120 km entry interface is reached at the official entry time
V_CIRC = np.sqrt(MU/RA)
def _deorb(dv):
    a = 1/(2/RA - (V_CIRC-dv)**2/MU); return Ellipse(RA, 2*a - RA)
def _t_to_ei(dv):
    el = _deorb(dv); return (el.M_at_nu(np.pi) - el.M_at_nu(el.nu_at_r(RE+H_EI)))/el.n   # apogee -> EI (descending), min
DV_DEORBIT = brentq(lambda dv: _t_to_ei(dv) - (MET_ENTRY_OFF - MET_BURN3), 0.03, 0.12)
DEORB = _deorb(DV_DEORBIT); A_D = DEORB.a

def geoc2geod(lat_c): return np.degrees(np.arctan(np.tan(np.radians(lat_c))/(1-EF2)))

class Plane:
    def __init__(self, inc, dlon=0.0):
        self.inc, self.dlon = inc, dlon
        n = np.sqrt(MU/RA**3)*60; k = 1.5*J2*(RE/RA)**2
        self.ci, self.si = np.cos(np.radians(inc)), np.sin(np.radians(inc))
        self.udot = n*(1 + k*(4*self.ci**2 - 1)); self.Odot = -n*k*self.ci
        self.T_nodal = 2*np.pi/self.udot
        lat_sc = np.arctan((1-EF2)*np.tan(np.radians(STARBASE[1])))
        self.u0 = np.pi - np.arcsin(np.sin(lat_sc)/self.si)                       # pad, descending branch, at T0
        self.L0 = np.radians(STARBASE[0] + dlon) - np.arctan2(self.ci*np.sin(self.u0), np.cos(self.u0))
        self.u_seco = self.u0 + np.radians(SECO_DOWNRANGE)
        self.u_ins = self.u_seco + (np.pi - NU_SECO)
    def lonlat(self, met, u):
        L = self.L0 + (self.Odot - OMEGA_E)*np.asarray(met, float)
        lon = np.degrees(L + np.arctan2(self.ci*np.sin(u), np.cos(u))); lon = (lon+180) % 360 - 180
        return lon, geoc2geod(np.degrees(np.arcsin(self.si*np.sin(u))))
    # --- nominal timeline: ascent, coast ellipse, circular orbit
    def u_nominal(self, met):
        met = np.asarray(met, float); u = np.empty_like(met)
        a = met < MET_SECO; c = (met >= MET_SECO) & (met < MET_INS); o = met >= MET_INS
        u[a] = self.u0 + np.radians(SECO_DOWNRANGE)*(met[a]/MET_SECO)**2
        u[c] = self.u_seco + (COAST.nu_at_M(M_SECO + COAST.n*(met[c]-MET_SECO)) - NU_SECO)
        u[o] = self.u_ins + self.udot*(met[o] - MET_INS)
        return u
    def nominal(self, met): return (*self.lonlat(met, self.u_nominal(met)), )
    def alt_nominal(self, met):
        """altitude (km): ascent 0->H_SECO (smooth), coast ellipse, then circular orbit"""
        met = np.asarray(met, float); h = np.full_like(met, H_ORBIT)
        a = met < MET_SECO; c = (met >= MET_SECO) & (met < MET_INS)
        h[a] = H_SECO*(1 - (1 - met[a]/MET_SECO)**2)
        h[c] = COAST.r_at_nu(COAST.nu_at_M(M_SECO + COAST.n*(met[c]-MET_SECO))) - RE
        return h
    # --- descents: ellipse from apogee (burn or skipped insertion) to EI, then glide
    def descent(self, el, met_b, u_b, glide_T):
        """returns dict with met arrays and lon/lat plus event times"""
        M0 = np.pi
        def r_at(t): return el.r_at_nu(el.nu_at_M(M0 + el.n*(t-met_b)))
        t_ei = brentq(lambda t: r_at(t) - (RE+H_EI), met_b+0.1, met_b + np.pi/el.n)
        t_sp = t_ei + glide_T
        met = np.arange(met_b, t_sp, 1/6); u = np.empty_like(met)
        e_ = met <= t_ei; g = ~e_
        nu = np.unwrap(el.nu_at_M(M0 + el.n*(met[e_]-met_b)))
        u[e_] = u_b + (nu - np.pi)
        alt = np.empty_like(met); alt[e_] = el.r_at_nu(nu) - RE
        u_ei = u_b + (np.unwrap(np.array([np.pi, el.nu_at_M(M0 + el.n*(t_ei-met_b))]))[1] - np.pi)
        tau = (met[g] - t_ei)*60
        s = GLIDE_V0*tau - (GLIDE_V0-GLIDE_V1)*tau**2/(2*glide_T*60)
        u[g] = u_ei + s/RE
        alt[g] = H_EI*(1 - (met[g]-t_ei)/glide_T)
        lon, lat = self.lonlat(met, u)
        nu_ei = el.nu_at_M(M0 + el.n*(t_ei-met_b)); gamma = np.degrees(np.arctan(el.e*np.sin(nu_ei)/(1+el.e*np.cos(nu_ei))))
        return dict(met=met, lon=lon, lat=lat, u=u, alt=alt, t_burn=met_b, t_ei=t_ei, t_splash=t_sp, gamma_ei=gamma, glide_T=glide_T,
                    ei=self.lonlat(t_ei, u_ei), splash=(lon[-1], lat[-1]), burn=self.lonlat(met_b, u_b))
    def descent_from_orbit(self, met_b): return self.descent(DEORB, met_b, float(self.u_nominal(met_b)), GLIDE_T_ORB)
    def descent_no_insertion(self): return self.descent(COAST, MET_INS, self.u_ins, GLIDE_T_SUB)

def gc_dist_deg(lon1, lat1, lon2, lat2):
    p1, p2 = np.radians(lat1), np.radians(lat2); dl = np.radians(lon2-lon1)
    return np.degrees(np.arccos(np.clip(np.sin(p1)*np.sin(p2)+np.cos(p1)*np.cos(p2)*np.cos(dl), -1, 1)))

MET_GRID = np.arange(0, 12*60, 1/6)
FIT_ZONES = ['launchA', 'indian', 'npac', 'chile']
def cost(p, keys=FIT_ZONES, return_res=False):
    inc, dlon = p
    if not (20 < inc < 60): return 1e9
    lon, lat = Plane(inc, dlon).nominal(MET_GRID)
    res = {k: gc_dist_deg(CL[k][:, 0][:, None], CL[k][:, 1][:, None], lon[None, :], lat[None, :]).min(axis=1) for k in keys}
    return res if return_res else sum((r**2).sum() for r in res.values())

best = minimize(cost, [30.5, 0.0], method='Nelder-Mead', options=dict(xatol=1e-4, fatol=1e-6))
inc_fit, dlon_fit = best.x
pl = Plane(inc_fit, dlon_fit)

def crossings(z, met, lon, lat):
    inside = np.array([zcontains(z, x, y) for x, y in zip(lon, lat)])
    idx = np.where(inside)[0]
    if len(idx) == 0: return []
    return [(met[g[0]], met[g[-1]]) for g in np.split(idx, np.where(np.diff(idx) > 1)[0]+1)]

# ---- timeline
nom_lon, nom_lat = pl.nominal(MET_GRID)
D1 = pl.descent_no_insertion()
# contingency pass = the orbit-2 pass that enters the North Pacific zone at its western (Japan) end
npac_orbital_entry = [c for c in crossings(Z['npac'], MET_GRID, nom_lon, nom_lat)
                      if 140 < float(np.interp(c[0], MET_GRID, nom_lon)) < 150][0][0]
chile_orbital_entry = [c for c in crossings(Z['chile'], MET_GRID, nom_lon, nom_lat) if c[0] > 540][0][0]
BURN_LEAD = chile_orbital_entry - MET_BURN3
D3 = pl.descent_from_orbit(MET_BURN3)
D2 = pl.descent_from_orbit(npac_orbital_entry - BURN_LEAD)
def zone_window(D, keys):
    c = []
    for k in keys: c += crossings(Z[k], D['met'], D['lon'], D['lat'])
    if not c: return None
    return min(x[0] for x in c), min(max(x[1] for x in c), D['t_splash'])
W1 = zone_window(D1, ['indian']); W2 = zone_window(D2, ['npac']); W3 = zone_window(D3, ['chile'])
EV = dict(seco=MET_SECO, ins=MET_INS, dep0=MET_DEPLOY0, dep1=MET_DEPLOY1, ei1=D1['t_ei'], w1=W1, sp1=D1['t_splash'],
          burn2=D2['t_burn'], ei2=D2['t_ei'], w2=W2, sp2=D2['t_splash'],
          burn3=MET_BURN3, burn3_end=MET_BURN3_END, ei3=D3['t_ei'], w3=W3, sp3=D3['t_splash'])

if __name__ == '__main__':
    print(f'FIT: inc = {inc_fit:.2f} deg, plane lon offset = {dlon_fit:+.2f} deg, cost = {best.fun:.3f}')
    for k, r in cost(best.x, return_res=True).items():
        print(f'   {k:8s} rms {np.sqrt((r**2).mean()):.2f} deg, max {r.max():.2f} deg')
    print(f'nodal period {pl.T_nodal:.2f} min; coast ellipse perigee {RP_COAST-RE:.0f} km, e={COAST.e:.4f}; '
          f'deorbit dv {DV_DEORBIT*1000:.0f} m/s -> perigee {2*A_D-RA-RE:.0f} km; burn lead to zone (orbital rate) {BURN_LEAD:.1f} min')
    print(f'SECO {fmt(MET_SECO)} at {pl.lonlat(MET_SECO, pl.u_seco)}; insertion {fmt(MET_INS)} at {pl.lonlat(MET_INS, pl.u_ins)}')
    for name, D, W in [('#1 Indian (no insertion)', D1, W1), ('#2 N Pacific', D2, W2), ('planned Chile', D3, W3)]:
        wz = f'zone {fmt(W[0])}-{fmt(W[1])}' if W else 'zone NOT REACHED'
        print(f'{name:26s} burn {fmt(D["t_burn"])} @ {D["burn"][1]:.1f},{D["burn"][0]:.1f}  EI {fmt(D["t_ei"])} @ {D["ei"][1]:.1f},{D["ei"][0]:.1f} gamma {D["gamma_ei"]:.2f} deg'
              f'  {wz}  splash {fmt(D["t_splash"])} @ {D["splash"][1]:.1f},{D["splash"][0]:.1f}')
    print('launch zone A crossings (ascent):', [(fmt(a), fmt(b)) for a, b in crossings(Z['launchA'], MET_GRID, nom_lon, nom_lat)])
    print('hazard windows vs T0=12:15 / 13:30:')
    for k, W in [('indian', W1), ('npac', W2), ('chile', W3)]:
        if W is None: continue
        print(f'   {k:7s} published {Z[k]["t0"]}Z-{Z[k]["t1"]}Z | zone crossing {utc(W[0])}-{utc(W[1])} (12:15) | {utc(W[0], T0_CLOSE)}-{utc(W[1], T0_CLOSE)} (13:30)')
    asc = np.where(np.diff(np.sign(nom_lat)) > 0)[0]
    print('asc nodes:', [(fmt(MET_GRID[i]), round(float(nom_lon[i]), 1)) for i in asc if MET_GRID[i] < 600])
    json.dump(dict(inc=float(inc_fit), dlon=float(dlon_fit), events={k: (v if not isinstance(v, tuple) else list(v)) for k, v in EV.items()}),
              open(ROOT/'work'/'fit_result.json', 'w'), indent=1, default=float)
