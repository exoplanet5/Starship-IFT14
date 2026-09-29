"""Starship Flight 14 as flown (28 Sep 2026): deorbit on orbit 2 and aerodynamic entry to the reported splashdown.

3-DOF point-mass simulation in the rotating Earth-fixed frame (WGS-84 ellipsoid, J2 gravity, Coriolis and centrifugal
terms), US Standard Atmosphere 1976 co-rotating with the Earth, finite deorbit burn, lift and drag of a belly-first
Starship with a Mach-dependent aerodynamic schedule, bank-angle steering with one reversal, and the landing burn.

Reported (news, 28-29 Sep): liftoff 12:48:59 UTC; insertion burn as planned; deorbit burn T+02:12:00-02:12:11 (one
sea-level Raptor); entry about T+02:47; splashdown T+03:08:30 (15:57:29 UTC) at 25.499295 N, 155.427536 W (user).
Solved for: deorbit delta-v (entry-interface time), bank magnitude and reversal time (splashdown point), ballistic
coefficient (splashdown time). The orbit before the burn is the zone-fitted model orbit (ift14_fit.py)."""
import sys, json, numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import least_squares
sys.path.insert(0, '/Users/mickey/sda/starship-ITF-14/work')
import ift14_fit as F
from ift14_atmo import atmo

MU, J2, OM = 398600.4418, 1.08262668e-3, 7.2921159e-5        # km^3/s^2, -, rad/s
A_E, E2 = 6378.137, 0.00669437999014
T0_UTC = np.datetime64('2026-09-28T12:48:59')
BURN0, BURN_DUR = 2*3600 + 12*60 + 0.0, 11.0                  # s MET, deorbit burn (reported)
T_EI_TARGET = 2*3600 + 46*60 + 52.0                            # entry interface (120 km): splash - 21:38, as in the planned sequence
T_SPLASH_TARGET = 3*3600 + 8*60 + 30.0                         # reported splashdown
LB_DUR = 19.0                                                  # landing burn, as in the planned sequence (09:50:11 -> 09:50:30)
TARGET = (25.499295, -155.427536)                              # splashdown, deg (user)
H_EI = 120.0

# ---- Starship Block 3 ship, belly-first entry (public dimensions; aerodynamics from modified Newtonian theory)
S_REF = 9.0*52.1                                              # m^2, planform (diameter x length)
ALPHA_HYP = 65.0                                              # deg, hypersonic angle of attack (override: --alpha=deg)
for _a in sys.argv[1:]:
    if _a.startswith('--alpha='): ALPHA_HYP = float(_a.split('=')[1])

CD_SUB_REL = 0.70                                            # subsonic belly-flop C_D relative to hypersonic (supercritical crossflow)
def aero(M, alpha_hyp=None):
    """(L/D, C_D relative to its hypersonic value) vs Mach. Above Mach 2: modified Newtonian cylinder with the angle
    of attack rising from ALPHA_HYP (Mach >= 6) toward the belly flop. Below: transonic drag peak, then the lift-free
    subsonic belly flop, whose supercritical crossflow drag (Re ~ 6e7) is lower than the hypersonic value."""
    ah = ALPHA_HYP if alpha_hyp is None else alpha_hyp
    a_hyp = np.radians(ah)
    aoa = lambda m: np.radians(np.interp(m, [0.8, 1.5, 6.0], [90.0, 82.0, ah]))
    alpha = aoa(M)
    ld = np.cos(alpha)/np.sin(alpha)                          # Newtonian: L/D = cot(alpha)
    newt = lambda a: (np.sin(a)/np.sin(a_hyp))**3             # Newtonian C_D ratio, C_D ~ sin^3(alpha)
    cd = np.interp(M, [0.6, 0.95, 1.2, 2.0], [CD_SUB_REL, 1.05, 1.15, newt(aoa(2.0))]) if M < 2.0 else newt(alpha)
    return ld, cd

def geodetic(r):
    """ECEF km -> (lat deg, lon deg, h km), Bowring"""
    x, y, z = r; p = np.hypot(x, y); b = A_E*np.sqrt(1 - E2); ep2 = E2/(1 - E2)
    th = np.arctan2(z*A_E, p*b)
    lat = np.arctan2(z + ep2*b*np.sin(th)**3, p - E2*A_E*np.cos(th)**3)
    N = A_E/np.sqrt(1 - E2*np.sin(lat)**2)
    return np.degrees(lat), np.degrees(np.arctan2(y, x)), p/np.cos(lat) - N

def ecef(lat, lon, h):
    la, lo = np.radians(lat), np.radians(lon); N = A_E/np.sqrt(1 - E2*np.sin(la)**2)
    return np.array([(N + h)*np.cos(la)*np.cos(lo), (N + h)*np.cos(la)*np.sin(lo), (N*(1 - E2) + h)*np.sin(la)])

def gravity(r):
    x, y, z = r; rr = np.linalg.norm(r); k = 1.5*J2*MU*A_E**2/rr**5; zz = 5*z*z/rr**2
    return -MU*r/rr**3 + k*np.array([x*(zz - 1), y*(zz - 1), z*(zz - 3)])

def initial_state(met_s):
    """ECEF position/velocity on the fitted orbit at MET met_s (circular, radius RA)"""
    pl = F.pl; m = met_s/60
    u = float(pl.u_nominal(np.array([m]))[0]); L = pl.L0 + (pl.Odot - F.OMEGA_E)*m
    N, M, _ = pl._frame(L)
    r = F.RA*(np.cos(u)*N + np.sin(u)*M)
    v_in = np.sqrt(MU/F.RA)*(-np.sin(u)*N + np.cos(u)*M)
    return r, v_in - np.cross([0, 0, OM], r)

class Sim:
    def __init__(self, dv, sigma, t_rev, beta, alpha=None, t_burn=BURN0, start=None):
        self.dv, self.sigma, self.t_rev, self.beta = dv, np.radians(sigma), t_rev, beta   # km/s, deg, s MET, kg/m^2
        self.alpha = ALPHA_HYP if alpha is None else alpha                              # deg, hypersonic angle of attack
        self.t_burn = t_burn                                                             # s MET, start of the 11 s burn
        self.start = start if start is not None else (t_burn, *initial_state(t_burn))   # (MET s, r ECEF, v ECEF)
    def bank(self, t, M):
        s = self.sigma if t < self.t_rev else -self.sigma
        return s*np.clip((M - 1.5)/1.5, 0, 1)                   # steering fades out toward the belly flop
    def rhs(self, t, y):
        r, v = y[:3], y[3:]
        a = gravity(r) - 2*np.cross([0, 0, OM], v) - np.cross([0, 0, OM], np.cross([0, 0, OM], r))
        if self.dv and self.t_burn <= t < self.t_burn + BURN_DUR:   # retrograde in the inertial frame
            vi = v + np.cross([0, 0, OM], r); a = a - (self.dv/BURN_DUR)*vi/np.linalg.norm(vi)
        lat, lon, h = geodetic(r)
        if h < 200:
            rho, T, c = atmo(h); V = np.linalg.norm(v)*1000; M = V/c
            ld, cdr = aero(M, self.alpha)
            D = 0.5*rho*V*V*cdr/self.beta/1000                       # km/s^2; beta = hypersonic ballistic coefficient m/(C_D S)
            vh = v/np.linalg.norm(v); up = r/np.linalg.norm(r)
            l0 = up - (up @ vh)*vh; l0 /= np.linalg.norm(l0); side = np.cross(vh, l0)
            s = self.bank(t, M)
            a = a - D*vh + ld*D*(np.cos(s)*l0 + np.sin(s)*side)
        return np.r_[v, a]
    def run(self, t_end=None, record=False):
        t_start, r0, v0 = self.start
        if t_end is None: t_end = t_start + 2*3600
        def ev_ei(t, y): return geodetic(y[:3])[2] - H_EI
        ev_ei.direction = -1
        def ev_lb(t, y):                                          # landing burn: vertical speed x LB_DUR/2 of height left
            r, v = y[:3], y[3:]; up = r/np.linalg.norm(r); h = geodetic(r)[2]
            return h - max(-(v @ up), 0.0)*LB_DUR/2 if h < 5 else 1.0
        ev_lb.terminal = True; ev_lb.direction = -1
        sol = solve_ivp(self.rhs, (t_start, t_end), np.r_[r0, v0], method='DOP853', rtol=1e-9, atol=1e-9,
                        events=[ev_ei, ev_lb], max_step=20.0, dense_output=record)
        self.sol = sol
        self.t_ei = sol.t_events[0][0] if len(sol.t_events[0]) else np.nan
        if not len(sol.t_events[1]): self.t_lb = np.nan; return self
        self.t_lb = sol.t_events[1][0]; y = sol.y_events[1][0]; r, v = y[:3], y[3:]
        up = r/np.linalg.norm(r); vh = v - (v @ up)*up                               # horizontal drift during the burn
        rs = r + vh*LB_DUR/2
        lat, lon, _ = geodetic(rs); self.splash = (lat, lon); self.t_splash = self.t_lb + LB_DUR
        return self

T_SUB_TO_LB = 2*60 + 4.0                                      # planned sequence: subsonic 09:48:07 -> landing burn 09:50:11
def residuals(p):
    s = Sim(*p).run(record=True)
    if np.isnan(getattr(s, 't_lb', np.nan)): return np.array([1e3, 1e3, 1e3, 1e3])
    lat, lon = s.splash
    dn = (lat - TARGET[0])*111.2; de = ((lon - TARGET[1] + 540) % 360 - 180)*111.2*np.cos(np.radians(lat))
    t_sub = mach_crossing(s, 1.0)
    return np.array([dn/5.0, de/5.0, (s.t_splash - T_SPLASH_TARGET)/5.0, (s.t_lb - t_sub - T_SUB_TO_LB)/5.0])

def mach_crossing(s, level):
    """MET (s) of the last downward crossing of `level` Mach before the landing burn, interpolated"""
    tt = np.arange(s.t_lb - 900, s.t_lb, 2.0); ys = s.sol.sol(tt)
    M = np.array([np.linalg.norm(ys[3:, i])*1000/atmo(geodetic(ys[:3, i])[2])[2] for i in range(len(tt))])
    i = np.where((M[:-1] >= level) & (M[1:] < level))[0]
    if not len(i): return s.t_lb
    i = i[-1]; return tt[i] + 2.0*(M[i] - level)/(M[i] - M[i + 1])

def solve():
    best = None
    for x0 in ([0.062, 30.0, BURN0 + 5000, 250.0, ALPHA_HYP], [0.068, 20.0, BURN0 + 5000, 400.0, ALPHA_HYP]):
        r = least_squares(residuals, x0, x_scale=[0.005, 10, 300, 50, 3], bounds=([0.02, -89, BURN0 + 1800, 60, 50], [0.20, 89, BURN0 + 7200, 1500, 72]), diff_step=2e-3, max_nfev=150)
        print(f'  start {x0[:2]}: dv {r.x[0]*1000:.2f} m/s bank {r.x[1]:+.2f} rev T+{F.fmt(r.x[2]/60)[2:]} beta {r.x[3]:.1f} alpha {r.x[4]:.2f}  resid [N km, E km, splash s, sub->LB s] {np.round(r.fun*5, 3)}', flush=True)
        if best is None or r.cost < best.cost: best = r
    return best.x

def export(x, path):
    """Sample the solved entry on the page's 10 s grid (MET BURN0 .. splash) and record events and diagnostics."""
    s = Sim(*x).run(record=True); sol = s.sol
    def state(t):
        if t <= s.t_lb: y = sol.sol(t); return y[:3], y[3:]
        y = sol.sol(s.t_lb); r, v = y[:3], y[3:]; up = r/np.linalg.norm(r)       # landing burn: linear deceleration to rest
        vz = -(v @ up); vh = v - (v @ up)*up; tau = min(t - s.t_lb, LB_DUR)
        h_lb = geodetic(r)[2]; h = max(h_lb - vz*tau + vz*tau*tau/(2*LB_DUR), 0.0)
        rh = r + vh*(tau - tau*tau/(2*LB_DUR))
        lat, lon, _ = geodetic(rh); rr = ecef(lat, lon, h); f = max(1 - tau/LB_DUR, 0)
        return rr, (vh - vz*up)*f
    grid = np.arange(BURN0, s.t_splash + 1e-6, 10.0)
    if s.t_splash - grid[-1] > 0.5: grid = np.r_[grid, grid[-1] + 10.0]
    lat, lon, h, mach, gl, q = [], [], [], [], [], []
    for t in grid:
        r, v = state(min(t, s.t_splash)); la, lo, hh = geodetic(r)
        rho, T, c = atmo(max(hh, 0)); V = np.linalg.norm(v)*1000
        lat.append(la); lon.append(lo); h.append(max(hh, 0.0)); mach.append(V/c); q.append(np.sqrt(rho)*V**3)
    # fine scan for events and loads
    tt = np.arange(BURN0, s.t_lb, 1.0); M, G, Q, H = [], [], [], []
    for t in tt:
        y = sol.sol(t); r, v = y[:3], y[3:]; la, lo, hh = geodetic(r); rho, T, c = atmo(hh); V = np.linalg.norm(v)*1000
        M.append(V/c); H.append(hh); Q.append(np.sqrt(rho)*V**3 if hh < 200 else 0)
        ld, cdr = aero(V/c, x[4]); D = 0.5*rho*V*V*cdr/x[3] if hh < 200 else 0.0
        G.append(D*np.sqrt(1 + ld*ld)/9.80665)
    M, G, Q, H = map(np.array, (M, G, Q, H))
    first_below = lambda arr, lev: float(tt[np.argmax((arr < lev) & (tt > s.t_ei))])
    i_q, i_g = int(np.argmax(Q)), int(np.argmax(G))
    burn_ll = geodetic(initial_state(BURN0)[0]); ei = geodetic(sol.sol(s.t_ei)[:3])
    out = dict(met0=float(BURN0), dt=10.0, t_end=float(s.t_splash),
               lon=[round(float(v), 4) for v in lon], lat=[round(float(v), 4) for v in lat], alt=[round(float(v), 3) for v in h],
               events=dict(burn=BURN0, burn_end=BURN0 + BURN_DUR, ei=float(s.t_ei), peak_heating=float(tt[i_q]), max_g=float(tt[i_g]),
                           mach5=first_below(M, 5.0), transonic=first_below(M, 1.2), subsonic=first_below(M, 1.0),
                           landing_burn=float(s.t_lb), splash=float(s.t_splash)),
               diag=dict(dv_ms=round(x[0]*1000, 2), bank_deg=round(x[1], 2), bank_reversal=float(x[2]), beta=round(x[3], 1),
                         alpha_hyp=round(x[4], 2), ld_hyp=round(float(aero(20, x[4])[0]), 3), max_g=round(float(G.max()), 2),
                         peak_heating_alt_km=round(float(H[i_q]), 1), peak_heating_mach=round(float(M[i_q]), 1),
                         burn_point=[round(burn_ll[0], 3), round(burn_ll[1], 3)], ei_point=[round(ei[0], 3), round(ei[1], 3)],
                         splash=[round(s.splash[0], 6), round(s.splash[1], 6)], target=list(TARGET),
                         miss_km=round(float(np.hypot((s.splash[0] - TARGET[0])*111.2, ((s.splash[1] - TARGET[1] + 540) % 360 - 180)*111.2*np.cos(np.radians(TARGET[0])))), 3)))
    json.dump(out, open(path, 'w'), indent=None)
    return out

if __name__ == '__main__':
    x = solve() if '--solve' in sys.argv else json.load(open(F.ROOT/'work'/'entry_solution.json'))['x']
    json.dump({'x': [float(v) for v in x]}, open(F.ROOT/'work'/'entry_solution.json', 'w'))
    s = Sim(*x).run(record=True)
    print(f'alpha {x[4]:.2f} deg (hypersonic L/D {aero(20, x[4])[0]:.3f}): deorbit dv {x[0]*1000:.2f} m/s, bank {x[1]:+.2f} deg reversing at T+{F.fmt(x[2]/60)[2:]}, beta {x[3]:.1f} kg/m^2')
    print(f'EI T+{F.fmt(s.t_ei/60)[2:]}  landing burn T+{F.fmt(s.t_lb/60)[2:]}  splash T+{F.fmt(s.t_splash/60)[2:]} at {s.splash[0]:.6f}, {s.splash[1]:.6f}')
    if '--export' in sys.argv:
        o = export(x, F.ROOT/'work'/'entry_flown.json')
        print('events:', {k: F.fmt(v/60) for k, v in o['events'].items()}); print('diag:', o['diag'])
