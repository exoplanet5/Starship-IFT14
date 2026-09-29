"""Physical descents for every profile, all with the Starship calibrated on Flight 14 (ift14_entry.py): same aerodynamics
(hypersonic angle of attack, ballistic coefficient), same 11 s one-Raptor deorbit burn, same 3-DOF simulation.

  flown / North Pacific contingency  burn T+02:12:00, solved in ift14_entry.py to the reported splashdown point and time
  planned (Chile)                    burn T+08:52:18 (official), lift vector up, delta-v solved for the official landing T+09:50:30
  Indian Ocean contingency           no insertion burn: ballistic coast from SECO, payload still aboard (+50 t, assumption),
                                     bank steering solved to land at the middle of the Indian Ocean zone's centreline

Results are cached in descents.json; run with --solve to recompute. Import to get D1 (Indian), D2 (N Pacific = flown),
D3 (planned), the event dict EV and the zone windows W1-W3 in the same shape as ift14_fit's kinematic descents."""
import sys, json, numpy as np
from scipy.optimize import brentq, least_squares
sys.path.insert(0, '/Users/mickey/sda/starship-ITF-14/work')
import ift14_fit as F
import ift14_entry as E
from ift14_atmo import atmo

CACHE = F.ROOT/'work'/'descents.json'
X = json.load(open(F.ROOT/'work'/'entry_solution.json'))['x']
DV_FL, SIG_FL, TREV_FL, BETA, ALPHA = X
S_REF = E.S_REF
M_ENTRY = BETA*(4/3*np.sin(np.radians(ALPHA))**3)*S_REF/1000          # t, implied by beta and the Newtonian C_D
PAYLOAD_T = 50.0                                                       # 26 Starlink V3 still aboard (assumption)
T_LAND_PLANNED = 9*3600 + 50*60 + 30.0

def seco_state():
    pl = F.pl; t0 = F.MET_SECO*60; u = pl.u_seco
    N, Mv, _ = pl._frame(pl.L0 + (pl.Odot - F.OMEGA_E)*F.MET_SECO)
    rh, th = np.cos(u)*N + np.sin(u)*Mv, -np.sin(u)*N + np.cos(u)*Mv
    r0 = (F.RE + F.H_SECO)*rh; c = np.sqrt(E.MU/F.COAST.p); nu = F.NU_SECO
    v_in = c*F.COAST.e*np.sin(nu)*rh + c*(1 + F.COAST.e*np.cos(nu))*th
    return t0, r0, v_in - np.cross([0, 0, E.OM], r0)

def sample(sim, t_from):
    """10 s track from t_from to splashdown (the last sample is splashdown itself), events and loads"""
    s = sim.run(record=True); sol = s.sol; LB = E.LB_DUR
    def state(t):
        if t <= s.t_lb: y = sol.sol(t); return y[:3], y[3:]
        y = sol.sol(s.t_lb); r, v = y[:3], y[3:]; up = r/np.linalg.norm(r)
        vz = -(v @ up); vh = v - (v @ up)*up; tau = min(t - s.t_lb, LB)
        h = max(E.geodetic(r)[2] - vz*tau + vz*tau*tau/(2*LB), 0.0)
        la, lo, _ = E.geodetic(r + vh*(tau - tau*tau/(2*LB))); return E.ecef(la, lo, h), (vh - vz*up)*max(1 - tau/LB, 0)
    grid = np.arange(t_from, s.t_splash - 0.5, 10.0)
    lat, lon, alt = [], [], []
    for t in grid:
        la, lo, h = E.geodetic(state(t)[0]); lat.append(la); lon.append(lo); alt.append(max(h, 0.0))
    lat.append(s.splash[0]); lon.append(s.splash[1]); alt.append(0.0)           # final point: splashdown
    tt = np.arange(max(t_from, s.t_ei - 600), s.t_lb, 1.0); M, Q = [], []
    for t in tt:
        y = sol.sol(t); h = E.geodetic(y[:3])[2]; rho, T, c = atmo(h); V = np.linalg.norm(y[3:])*1000
        M.append(V/c); Q.append(np.sqrt(rho)*V**3)
    M, Q = np.array(M), np.array(Q)
    below = lambda lev: float(tt[np.argmax((M < lev) & (tt > s.t_ei))])
    alt_at = lambda t: float(E.geodetic(sol.sol(t)[:3])[2])
    ei = E.geodetic(sol.sol(s.t_ei)[:3])
    return dict(met0=float(t_from), dt=10.0, t_end=float(s.t_splash), lon=lon, lat=lat, alt=alt,
                t_ei=float(s.t_ei), ei=[ei[1], ei[0]], splash=[float(s.splash[1]), float(s.splash[0])],
                peak_heating=float(tt[int(np.argmax(Q))]), transonic=below(1.2), subsonic=below(1.0),
                landing_burn=float(s.t_lb), splash_t=float(s.t_splash), alt_at=alt_at)

def solve_planned():
    tb = F.MET_BURN3*60
    f = lambda dv: E.Sim(dv, 0.0, 1e9, BETA, ALPHA, t_burn=tb).run().t_splash - T_LAND_PLANNED
    dv = brentq(f, 0.060, DV_FL, xtol=1e-6)
    return dict(dv=dv, sigma=0.0, t_rev=1e9, beta=BETA, t_burn=tb)

def solve_indian():
    cl = F.CL['indian']; lon_t = 0.5*(cl[0, 0] + cl[-1, 0]); lat_t = float(np.interp(lon_t, cl[:, 0], cl[:, 1]))
    start = seco_state(); beta = BETA*(M_ENTRY + PAYLOAD_T)/M_ENTRY
    def res(p):
        s = E.Sim(0.0, p[0], p[1], beta, ALPHA, t_burn=1e9, start=start).run()
        if np.isnan(getattr(s, 't_lb', np.nan)): return np.array([1e3, 1e3])
        la, lo = s.splash
        return np.array([(la - lat_t)*111.2/5, (lo - lon_t)*111.2*np.cos(np.radians(la))/5])
    best = None
    for x0 in ([60.0, 2900.0], [75.0, 3100.0]):
        r = least_squares(res, x0, x_scale=[10, 200], bounds=([0, 2000], [89, 4500]), diff_step=2e-3, max_nfev=120)
        if best is None or r.cost < best.cost: best = r
    return dict(dv=0.0, sigma=float(best.x[0]), t_rev=float(best.x[1]), beta=beta, target=[lon_t, lat_t])

def build(solve=False):
    cache = json.load(open(CACHE)) if CACHE.exists() and not solve else {}
    if 'planned' not in cache: cache['planned'] = solve_planned()
    if 'indian' not in cache: cache['indian'] = solve_indian()
    p, i = cache['planned'], cache['indian']
    out = {}
    out['planned'] = sample(E.Sim(p['dv'], p['sigma'], p['t_rev'], p['beta'], ALPHA, t_burn=p['t_burn']), p['t_burn'])
    out['planned']['official_entry_alt'] = out['planned']['alt_at'](9*3600 + 28*60 + 52)
    out['flown'] = sample(E.Sim(*X), E.BURN0)
    out['flown']['reported_entry_alt'] = out['flown']['alt_at'](E.T_EI_TARGET)
    st = seco_state()
    out['indian'] = sample(E.Sim(0.0, i['sigma'], i['t_rev'], i['beta'], ALPHA, t_burn=1e9, start=st), F.MET_INS*60)
    for v in out.values(): v.pop('alt_at')
    cache.update(tracks=out, vehicle=dict(alpha=ALPHA, beta=BETA, m_entry_t=M_ENTRY, dv_flown_ms=DV_FL*1000, payload_t=PAYLOAD_T))
    json.dump(cache, open(CACHE, 'w'), default=float)
    return cache

C = build(solve='--solve' in sys.argv and __name__ == '__main__')

def _D(tr, t_burn_s):
    met = (tr['met0'] + np.arange(len(tr['lon']))*tr['dt'])/60
    met[-1] = tr['t_end']/60
    lon, lat = np.array(tr['lon']), np.array(tr['lat'])
    i_b = int(np.argmin(np.abs(met - t_burn_s/60)))
    return dict(met=met, lon=lon, lat=lat, alt=np.array(tr['alt']), t_burn=t_burn_s/60, t_ei=tr['t_ei']/60, t_splash=tr['t_end']/60,
                burn=(lon[i_b], lat[i_b]), ei=tuple(tr['ei']), splash=tuple(tr['splash']), tr=tr)
D1 = _D(C['tracks']['indian'], F.MET_INS*60)          # Indian Ocean: no insertion burn (track starts at the skipped burn)
D2 = _D(C['tracks']['flown'], E.BURN0)                # North Pacific: as flown
D3 = _D(C['tracks']['planned'], F.MET_BURN3*60)       # planned, W of Chile
def zone_window(D, key):
    c = F.crossings(F.Z[key], D['met'], D['lon'], D['lat'])
    return None if not c else (min(x[0] for x in c), min(max(x[1] for x in c), D['t_splash']))
W1, W2, W3 = zone_window(D1, 'indian'), zone_window(D2, 'npac'), zone_window(D3, 'chile')
EV = dict(F.EV); EV.update(ei1=D1['t_ei'], w1=W1, sp1=D1['t_splash'], burn2=D2['t_burn'], ei2=D2['t_ei'], w2=W2, sp2=D2['t_splash'],
                      burn3=D3['t_burn'], ei3=D3['t_ei'], w3=W3, sp3=D3['t_splash'])

if __name__ == '__main__':
    fmt = F.fmt
    v = C['vehicle']; print(f"vehicle: alpha {v['alpha']:.2f} deg, beta {v['beta']:.1f} kg/m^2, entry mass {v['m_entry_t']:.0f} t")
    print(f"planned: dv {C['planned']['dv']*1000:.2f} m/s (flown {DV_FL*1000:.2f}), lift up")
    print(f"Indian: bank {C['indian']['sigma']:.1f} deg reversing T+{fmt(C['indian']['t_rev']/60)[2:]}, beta {C['indian']['beta']:.0f}, target {np.round(C['indian']['target'], 2)}")
    for name, D, key in [('Indian', D1, 'indian'), ('N Pacific (flown)', D2, 'npac'), ('planned Chile', D3, 'chile')]:
        tr = D['tr']; W = zone_window(D, key)
        print(f"{name:18s} EI120 {fmt(D['t_ei'])} @ {D['ei'][1]:.1f},{D['ei'][0]:.1f}  peak heat {fmt(tr['peak_heating']/60)}  transonic {fmt(tr['transonic']/60)}  "
              f"subsonic {fmt(tr['subsonic']/60)}  LB {fmt(tr['landing_burn']/60)}  splash {fmt(D['t_splash'])} @ {D['splash'][1]:.2f},{D['splash'][0]:.2f}  "
              f"in zone {F.zcontains(F.Z[key], *D['splash'])}  zone {fmt(W[0])}-{fmt(W[1])[2:] if W else '--'}")
    print(f"planned: altitude at the official entry T+09:28:52 = {C['tracks']['planned']['official_entry_alt']:.1f} km; "
          f"flown: altitude at the reported entry T+02:46:52 = {C['tracks']['flown']['reported_entry_alt']:.1f} km")
