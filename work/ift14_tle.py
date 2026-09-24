"""SGP4 TLEs for the IFT-14 zone-fitted orbit, epoch = insertion burn, for each launch T0."""
import sys, numpy as np
sys.path.insert(0, '/Users/mickey/sda/starship-ITF-14/work')
import ift14_fit as F
from sgp4.api import Satrec, WGS72, jday
from sgp4 import exporter
from scipy.optimize import least_squares
from skyfield.api import load
from skyfield.sgp4lib import TEME_to_ITRF
ts = load.timescale(builtin=True); pl = F.pl

def dt_parts(t):
    d = np.datetime64(t).astype('datetime64[s]').astype(object); return d.year, d.month, d.day, d.hour, d.minute, d.second
def model_eci(t0, met):
    gmst0 = np.radians(ts.utc(*dt_parts(t0)).gmst*15.0)
    u = pl.u_nominal(met); Om = pl.L0 + gmst0 + pl.Odot*met
    x = F.RA*(np.cos(Om)*np.cos(u) - np.sin(Om)*np.sin(u)*pl.ci); y = F.RA*(np.sin(Om)*np.cos(u) + np.cos(Om)*np.sin(u)*pl.ci)
    return np.c_[x, y, F.RA*np.sin(u)*pl.si]
def make_sat(p, jd, fr, satnum):
    n, inc, raan, u0 = p; s = Satrec()
    s.sgp4init(WGS72, 'i', satnum, jd + fr - 2433281.5, 0.0, 0.0, 0.0, 1e-5, 0.0, np.radians(inc), np.radians(u0 % 360), n*2*np.pi/1440.0, np.radians(raan % 360))
    return s
def cks(l): return str(sum(int(c) if c.isdigit() else (1 if c == '-' else 0) for c in l[:68]) % 10)

def fit_tle(date, hms, satnum):
    t0 = np.datetime64(f'{date}T{hms}')
    te = t0 + np.timedelta64(int(round(F.MET_INS*60)), 's'); jd, fr = jday(*dt_parts(te))
    met = np.arange(F.MET_INS, F.MET_BURN3, 2.0); r_ref = model_eci(t0, met); tmin = met - F.MET_INS
    def resid(p):
        _, r, _ = make_sat(p, jd, fr, satnum).sgp4_array(np.full(len(tmin), jd), fr + tmin/1440.0); return (r - r_ref).ravel()
    gmst0 = ts.utc(*dt_parts(t0)).gmst*15
    p0 = [1440/pl.T_nodal, pl.inc, (np.degrees(pl.L0) + gmst0) % 360, np.degrees(pl.u_ins) % 360]
    sol = least_squares(resid, p0, x_scale=[1e-3, 0.1, 0.1, 0.1]); rms = np.sqrt((sol.fun**2).mean()*3)
    sat = make_sat(sol.x, jd, fr, satnum)
    l1, l2 = exporter.export_tle(sat); l1 = l1[:9] + f'{"26999A":<8s}' + l1[17:]; l1 = l1[:68] + cks(l1); l2 = l2[:68] + cks(l2)
    mon = np.datetime64(date).astype(object).strftime('%d%b').upper()
    name = f'STARSHIP IFT-14 T0 {hms[:2]}{hms[3:5]}Z {mon} (zone fit)'
    # verify vs model ground track
    mv = np.arange(F.MET_INS, F.MET_BURN3, 1.0); _, r, _ = sat.sgp4_array(np.full(len(mv), jd), fr + (mv - F.MET_INS)/1440.0)
    rr = np.array([TEME_to_ITRF(j, ri, np.zeros(3))[0] for j, ri in zip(jd + fr + (mv - F.MET_INS)/1440.0, r)])
    lon = np.degrees(np.arctan2(rr[:, 1], rr[:, 0])); lat = np.degrees(np.arctan(rr[:, 2]/np.hypot(rr[:, 0], rr[:, 1])/(1-F.EF2)))
    lonm, latm = pl.nominal(mv); sep = F.gc_dist_deg(lon, lat, lonm, latm); alt = np.linalg.norm(rr, axis=1) - F.RE
    print(f'{name}: n={sol.x[0]:.5f} i={sol.x[1]:.3f} RAAN={sol.x[2]%360:.3f} u_epoch={sol.x[3]%360:.3f}  fit rms {rms:.1f} km; '
          f'track vs model max {sep.max():.3f} deg; alt {alt.min():.0f}-{alt.max():.0f} km; epoch {str(te)[11:19]}Z (insertion)')
    return [name, l1, l2]

out = []
for k, hms in enumerate(F.WINDOW_T0):
    out += fit_tle('2026-09-28', hms, 99990 + k)
open(F.ROOT/'ift14_tles.txt', 'w').write('\n'.join(out) + '\n'); print('\n'.join(out))
alt_out = []
for d, date in enumerate(F.ALT_DATES):
    for k, hms in enumerate(F.WINDOW_T0):
        alt_out += fit_tle(date, hms, 99960 + 4*d + k)     # placeholder catalog numbers 99960-99983 (stay 5-digit)
open(F.ROOT/'ift14_tles_alternates.txt', 'w').write('\n'.join(alt_out) + '\n')
print(f'wrote ift14_tles_alternates.txt: {len(alt_out)//3} TLEs')
