"""Zoom on China: planned deorbit burn at T+08:53:00 with sunrise / nautical-twilight terminators, one map per launch T0."""
import sys, numpy as np
sys.path.insert(0, '/Users/mickey/sda/starship-ITF-14/work')
import ift14_fit as F
from ift14_style import *
pl, EV, D3 = F.pl, F.EV, F.D3
fmt = F.fmt
T_BURN = F.MET_BURN3
T_MAP = 8*60 + 53.0     # map clock T0+08:53:00 (user request)
EXT = (70, 140, 15, 55)
CITIES = [('Beijing', 116.4, 39.9), ('Shanghai', 121.5, 31.2), ('Chengdu', 104.1, 30.7), ('Lhasa', 91.1, 29.65),
          ('Ürümqi', 87.6, 43.8), ('Kunming', 102.7, 25.0), ("Xi'an", 108.9, 34.3), ('Guangzhou', 113.3, 23.1), ('Wuhan', 114.3, 30.6),
          ('Lanzhou', 103.8, 36.1), ('Kashgar', 76.0, 39.5), ('Hong Kong', 114.2, 22.3), ('Taipei', 121.5, 25.0), ('Hotan', 79.9, 37.1),
          ('Xining', 101.8, 36.6), ('Harbin', 126.6, 45.8), ('Hohhot', 111.7, 40.8), ('Shenyang', 123.4, 41.8), ('Nanjing', 118.8, 32.1),
          ('Kathmandu', 85.3, 27.7), ('New Delhi', 77.2, 28.6), ('Hanoi', 105.8, 21.0), ('Ulaanbaatar', 106.9, 47.9)]
SHIP_LIMIT = -np.degrees(np.arccos(F.RE/F.RA))   # sun altitude at subpoint below which a 275 km ship is in shadow
ELEV_MIN = 15.0
from shapely.geometry import Polygon as SPoly
from shapely.ops import unary_union
def footprint(lon0, lat0, h, elev=ELEV_MIN, n=121):
    """ground circle from which a ship at altitude h is seen above elevation elev (deg)"""
    e = np.radians(elev); lam = np.arccos(F.RE*np.cos(e)/(F.RE+h)) - e
    th = np.linspace(0, 2*np.pi, n); p0, l0 = np.radians(lat0), np.radians(lon0)
    lat = np.arcsin(np.sin(p0)*np.cos(lam) + np.cos(p0)*np.sin(lam)*np.cos(th))
    lon = l0 + np.arctan2(np.sin(th)*np.sin(lam)*np.cos(p0), np.cos(lam) - np.sin(p0)*np.sin(lat))
    return np.degrees(lon), np.degrees(lat), np.degrees(lam)


for hms in F.WINDOW_T0:
    t0 = np.datetime64(f'2026-09-28T{hms}'); tb = t0 + np.timedelta64(int(round(T_MAP*60)), 's'); tburn = t0 + np.timedelta64(int(round(T_BURN*60)), 's')
    tbs = str(tb)[11:19]; cst = str(tb + np.timedelta64(8, 'h'))[11:19]; bs = str(tburn)[11:19]; bcst = str(tburn + np.timedelta64(8, 'h'))[11:19]
    fig, ax = new_figure(16, 9.9, '2D Map', f'—  Starship IFT-14  ·  deorbit burn over Tibet {fmt(T_BURN)}–{fmt(F.MET_BURN3_END)[2:]}  ·  T0 {hms}Z',
                         f'{str(tb)[:10]} {tbs} UTC = {cst} CST')
    glon, glat, alt = draw_base(ax, EXT, tb, grat=10, label_step=10)
    # terminators (labels horizontal, alternating rows, at the line's crossing of the label latitude)
    for lev, col, lw, ls, name, ylab in [(0, SUN, 1.8, '-', 'sunrise (sun 0°)', 51.0), (-12, ACCENT, 1.8, '-', 'nautical twilight (sun −12°)', 51.0)]:
        cs = ax.contour(glon, glat, alt, levels=[lev], colors=[col], linewidths=lw, linestyles=[ls], zorder=6)
        for path in cs.get_paths():
            v = path.vertices
            if len(v) < 2: continue
            i = np.argmin(np.abs(v[:, 1] - ylab))
            label(ax, v[i, 0] + 0.4, ylab, name, color=col if isinstance(col, str) else '#ffffff', size=9.5, ha='left', va='center')
            break
    # where along the descent does the ship leave Earth's shadow / cross the twilight lines
    tt = D3['met']; tabs = t0 + (tt*60).astype('timedelta64[s]')
    a_track = np.array([float(sun_alt(ta, lo, la)) for ta, lo, la in zip(tabs, D3['lon'], D3['lat'])])
    def first_cross(level):
        i = np.where(a_track > level)[0]
        return None if len(i) == 0 else i[0]
    # 15-deg-elevation footprint of the burn point, and the visible swath from shadow exit to the sunrise line
    fx, fy, lam_b = footprint(*D3['burn'], float(np.interp(T_BURN, D3['met'], D3['alt'])))
    ax.fill(fx, fy, facecolor=OK, alpha=0.12, edgecolor='none', zorder=4)
    ax.plot(fx, fy, color=OK, lw=1.3, ls=(0, (4, 3)), alpha=0.9, zorder=6)
    label(ax, D3['burn'][0], D3['burn'][1] - lam_b + 1.2, f'deorbit burn visible ≥{ELEV_MIN:.0f}° elevation\n(r {lam_b*111:.0f} km)', color=OK, size=9, ha='center', va='bottom')
    notes = []
    for level, txt in [(SHIP_LIMIT, 'ship exits Earth shadow'), (-12, 'ground in nautical twilight')]:
        i = first_cross(level)
        if i is not None and EXT[0] < D3['lon'][i] < EXT[1]:
            notes.append(f'{txt} from {fmt(tt[i])} at {D3["lon"][i]:.1f}°E')
            if level == SHIP_LIMIT:
                ax.plot(D3['lon'][i], D3['lat'][i], 'o', ms=8, mfc=SUN, mec=(8/255, 10/255, 14/255, 0.9), mew=1, zorder=8)
                label(ax, D3['lon'][i]+0.6, D3['lat'][i]-2.4, f'ship exits Earth shadow\n{fmt(tt[i])}', color=SUN, va='top')
    # cities
    for name, x, y in CITIES:
        ax.plot(x, y, 'o', ms=3.5, mfc='#c9ccd1', mec=(8/255, 10/255, 14/255, 0.8), mew=0.8, zorder=7)
        label(ax, x+0.5, y+0.3, name, color=(1, 1, 1, 0.8), size=8, va='bottom')
    # track: orbits 5-6 (cyan), descent (green dashed), time ticks every 2 min
    m = np.arange(T_BURN - 200, T_BURN, 1/6); plot_track(ax, *pl.nominal(m), color=ACCENT, lw=1.6, alpha=0.9, zorder=5)
    plot_track(ax, D3['lon'], D3['lat'], color=OK, lw=2.0, ls=(0, (3, 3)), alpha=0.95, zorder=5)
    for k in range(1, 7):
        for node in (np.radians(360*k), np.radians(180+360*k)):
            t = F.MET_INS + (node - pl.u_ins)/pl.udot
            if t > T_BURN: continue
    # orbit number labels for passes through the window: at the west edge crossing
    for k, lon_lab in ((5, 90.0), (6, 75.0)):
        mm = np.arange(F.MET_INS + (k-1)*pl.T_nodal, F.MET_INS + k*pl.T_nodal, 1/6); lo, la = pl.nominal(mm)
        i = np.argmin(np.abs(lo - lon_lab)); label(ax, lo[i], la[i]+0.8, f'orbit {k}', color=ACCENT, size=9.5, ha='center', va='bottom')
    sq(ax, *D3['burn'], OK, f'planned deorbit burn (11 s)\n{fmt(T_BURN)}  ({bcst} CST)', dx=0.8, dy=1.2, va='bottom', size=10)
    lo_m, la_m = np.interp(T_MAP, D3['met'], D3['lon']), np.interp(T_MAP, D3['met'], D3['lat'])
    ax.plot(lo_m, la_m, 'x', ms=9, mec='#ffffff', mew=1.6, zorder=8); label(ax, lo_m+0.5, la_m-1.0, f'ship {fmt(T_MAP)}', color='#ffffff', size=8.5, va='top')
    a_b = float(sun_alt(tburn, *D3['burn']))
    ship_sunlit = 'in sunlight' if a_b > SHIP_LIMIT else 'in Earth shadow'
    ground = 'night' if a_b < -18 else ('astronomical twilight' if a_b < -12 else ('nautical twilight' if a_b < -6 else ('civil twilight' if a_b < 0 else 'daylight')))
    i0 = first_cross(SHIP_LIMIT); i1 = first_cross(0)
    if i0 is not None:
        if i1 is None: i1 = len(tt) - 1
        circles = [SPoly(np.c_[footprint(D3['lon'][i], D3['lat'][i], D3['alt'][i])[:2]]) for i in list(range(i0, i1)) + [i1]]
        sw = unary_union(circles)
        # clip to the night/twilight side of the sunrise line (sun altitude < 0 at map time)
        cf = ax.contourf(glon, glat, alt, levels=[-90, 0], alpha=0)
        night = unary_union([SPoly(pg).buffer(0) for path in cf.get_paths() for pg in path.to_polygons() if len(pg) > 3])
        cf.remove()
        sw = sw.intersection(night)
        for geom in (sw.geoms if hasattr(sw, 'geoms') else [sw]):
            xs, ys = geom.exterior.xy
            ax.fill(xs, ys, facecolor=SUN, alpha=0.15, edgecolor='none', zorder=4)
            ax.plot(xs, ys, color=SUN, lw=1.3, alpha=0.9, zorder=6)
        lam_x = footprint(D3['lon'][i0], D3['lat'][i0], D3['alt'][i0])[2]
        label(ax, D3['lon'][i0] + 1.0, D3['lat'][i0] + lam_x + 0.5, f'sunlit ship visible ≥{ELEV_MIN:.0f}° elevation\nfrom shadow exit {fmt(tt[i0])} to sunrise line {fmt(tt[i1])}', color=SUN, size=9, ha='left', va='bottom')
    hud(ax, [('STARSHIP IFT-14  planned deorbit burn', FG, True),
             (f'T0 {hms[:5]}Z   map clock {fmt(T_MAP)} = {cst} CST', FG, False),
             (f'deorbit burn {fmt(T_BURN)}–{fmt(F.MET_BURN3_END)[2:]} = {bcst} CST', OK, False),
             *[(n, SUN, False) for n in notes]], width=0.46, lh=0.030)
    credit(ax)
    out = F.ROOT/f'ift14_china_T0_{hms[:2]}{hms[3:5]}.png'; fig.savefig(out, dpi=180, facecolor=BG); plt.close(fig)
    print(f'wrote {out.name}: burn {bs}Z {bcst} CST, sun alt at burn subpoint {a_b:+.1f} deg -> ground {ground}, ship {ship_sunlit}; ' + '; '.join(notes))
