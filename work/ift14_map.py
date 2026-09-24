"""Starship IFT-14 global map: ground track, NAVAREA zones, mission events (SatObserver-MX style)."""
import sys, numpy as np
sys.path.insert(0, '/Users/mickey/sda/starship-ITF-14/work')
import ift14_fit as F
from ift14_style import *
from matplotlib.patches import Polygon as MPoly

pl, Z, T0, EV, D1, D2, D3 = F.pl, F.Z, F.T0, F.EV, F.D1, F.D2, F.D3
fmt, utc = F.fmt, F.utc
def rng(w): return f'{fmt(w[0])}–{fmt(w[1])[2:]}'

fig, ax = new_figure(22, 12.2, '2D Map', '—  Starship IFT-14  ·  first orbital flight  ·  ground track fitted to NAVAREA IV 922/26, XII 657/26, HYDROPAC 2750/26, 2751/26, 2761/26',
                     '2026-09-28 12:15:00 UTC  (window 12:15:00–13:30:00Z · alternates daily 29 Sep–4 Oct)')
draw_base(ax, (-180, 180, -90, 90), T0)

# zones
ZSTYLE = {'launchA': (SUN, 'NAVAREA IV 922/26  launch hazard  1215–1414Z'), 'launchB': (SUN, None),
          'indian': (DANGER, 'HYDROPAC 2751/26  Indian Ocean  1223–1447Z\ncontingency reentry (no insertion burn)'),
          'npac': (WARN, 'NAVAREA XII 657/26 · HYDROPAC 2761/26  North Pacific  1427–1833Z\ncontingency reentry (orbit 2)'),
          'chile': (OK, 'HYDROPAC 2750/26  South Pacific W of Chile  2107–0108Z\nplanned reentry & splashdown (after 6 orbits)')}
for k, (col, lab) in ZSTYLE.items():
    pts = np.array(Z[k]['pts'])
    for shift in ([0, -360] if Z[k]['wrap'] else [0]):          # dateline-straddling ring is stored in 0..360
        q = pts + [shift, 0]
        ax.add_patch(MPoly(q, closed=True, facecolor=col, alpha=0.20, edgecolor='none', zorder=4))
        ax.add_patch(MPoly(q, closed=True, facecolor='none', edgecolor=col, alpha=0.95, lw=1.2, zorder=4))
for k, (x, y, ha, va) in {'launchA': (-92, 30.0, 'left', 'bottom'), 'indian': (68, -31.5, 'left', 'top'),
                          'npac': (178, 34.5, 'right', 'bottom'), 'chile': (-150, -35.5, 'left', 'top')}.items():
    label(ax, x, y, ZSTYLE[k][1], color=ZSTYLE[k][0], ha=ha, va=va, linespacing=1.25)

# tracks
m = np.arange(0, EV['seco'], 1/30); plot_track(ax, *pl.nominal(m), color=SUN, lw=2.4, alpha=0.95, zorder=5)
m = np.arange(EV['seco'], EV['ins'], 1/6); plot_track(ax, *pl.nominal(m), color=SUN, lw=1.8, ls=(0, (3, 3)), alpha=0.95, zorder=5)
m = np.arange(EV['ins'], EV['burn3'], 1/6); plot_track(ax, *pl.nominal(m), color=ACCENT, lw=1.6, alpha=0.9, zorder=5, solid_capstyle='round')
for D, col in [(D1, DANGER), (D2, WARN), (D3, OK)]:
    plot_track(ax, D['lon'], D['lat'], color=col, lw=1.8, ls=(0, (3, 3)), alpha=0.95, zorder=5)

# orbit numbers at nodes (orbit k = k-th rev after insertion)
ang = 33.7
def t_of_u(u): return F.MET_INS + (u - pl.u_ins)/pl.udot
for k in range(1, 7):
    for node, rot, off in ((np.radians(180 + 360*k), -ang, (1.0, 1.5)), (np.radians(360*k), ang, (-1.0, 1.5))):
        t = t_of_u(node)
        if t > EV['burn3']: continue
        lo, la = pl.lonlat(t, node)
        ax.text(lo+off[0], la+off[1], f'orbit {k}', color=ACCENT, fontsize=9, ha='center', va='center',
                rotation=rot, rotation_mode='anchor', path_effects=[HALO], zorder=9)

# markers
ax.plot(*F.STARBASE, marker='^', ms=10, mfc=DANGER, mec=(8/255, 10/255, 14/255, 0.9), mew=1, ls='none', zorder=7)
label(ax, F.STARBASE[0]-2.0, F.STARBASE[1]+1.2, 'Starbase\nlaunch T+00:00:00', ha='right', va='bottom')
lo, la = pl.lonlat(EV['seco'], pl.u_seco); sq(ax, lo, la, SUN, f'SECO (suborbital)\n{fmt(EV["seco"])}', dx=1.8, dy=-1.0, va='top', hollow=True)
lo, la = pl.lonlat(EV['ins'], pl.u_ins); sq(ax, lo, la, SUN, f'orbit insertion burn (19 s)\n{fmt(EV["ins"])}', dx=2.0, dy=0.5, va='top')
# contingency 1
sq(ax, *D1['ei'], DANGER, f'entry  {fmt(EV["ei1"])}', dx=0, dy=1.4, ha='center', va='bottom', hollow=True)
star(ax, *D1['splash'], DANGER, ms=11, hollow=True)
label(ax, 100.5, -17.5, f'no insertion burn →\nentry {fmt(EV["ei1"])}\nsplash {fmt(EV["sp1"])}', color='#ffffff')
# contingency 2
sq(ax, *D2['burn'], WARN, f'contingency deorbit burn\n{fmt(EV["burn2"])}', dx=2.0, dy=-1.0, va='top')
sq(ax, *D2['ei'], WARN, None, hollow=True)
star(ax, *D2['splash'], WARN, ms=11, hollow=True)
label(ax, D2['ei'][0]-1.5, D2['ei'][1]-1.2, f'contingency entry {fmt(EV["ei2"])}\nsplash {fmt(EV["sp2"])}', color='#ffffff', ha='right', va='top')
# planned
sq(ax, *D3['burn'], OK, f'planned deorbit burn (11 s)\n{fmt(EV["burn3"])}', dx=2.0, dy=1.0, va='bottom')
sq(ax, *D3['ei'], OK, f'entry\n{fmt(EV["ei3"])}', dx=-2.0, dy=-1.0, ha='right', va='top', hollow=True)
star(ax, *D3['splash'], OK, ms=17)
label(ax, D3['splash'][0]+2.5, D3['splash'][1]+2.2, f'landing W of Chile\n{fmt(EV["sp3"])}', va='bottom')

hud(ax, [('STARSHIP IFT-14  first orbital flight', FG, True),
         (f'i = {pl.inc:.2f}°   h = {F.H_ORBIT:.0f} km   period {pl.T_nodal:.2f} min', FG, False),
         ('launch 28 Sep 2026 12:15:00–13:30:00Z  (T+ from 12:15:00Z)', FG, False),
         ('alternates daily 29 Sep–4 Oct, same window', FGDIM, False),
         (f'SECO {fmt(EV["seco"])}   insertion burn {fmt(EV["ins"])} (19 s)', SUN, False),
         (f'Indian Ocean   no insertion burn        entry {fmt(EV["ei1"])}  splash {fmt(EV["sp1"])}', DANGER, False),
         (f'North Pacific  contingency burn {fmt(EV["burn2"])}  entry {fmt(EV["ei2"])}  splash {fmt(EV["sp2"])}', WARN, False),
         (f'W of Chile     deorbit burn {fmt(EV["burn3"])}      entry {fmt(EV["ei3"])}  landing {fmt(EV["sp3"])}', OK, False),
         ('solid = powered flight / orbit   dashed = coast / descent   □ entry interface   ★ splashdown', FGDIM, False)], width=0.47, lh=0.026)
credit(ax)
out = F.ROOT/'ift14_navwarning_map.png'; fig.savefig(out, dpi=180, facecolor=BG); print('wrote', out)
