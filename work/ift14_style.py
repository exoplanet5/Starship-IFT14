"""SatObserver-MX look for matplotlib maps (Blue Marble base, dark palette, halo labels)."""
import numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import patheffects as pe, font_manager
from matplotlib.patches import Rectangle
from PIL import Image
from pathlib import Path

font_manager.fontManager.addfont('/System/Library/Fonts/Menlo.ttc')
plt.rcParams['font.family'] = 'Menlo'
BG, BG2, BG3, FG, FGDIM = '#101418', '#171c22', '#1e242c', '#e8eaed', '#9aa4ae'
ACCENT, WARN, DANGER, OK, SUN = '#4fc3f7', '#ffb84f', '#ff5252', '#7ad97a', '#ffd54f'
HALO = pe.withStroke(linewidth=3, foreground=(5/255, 8/255, 12/255, 0.85))
Image.MAX_IMAGE_PIXELS = None
_IMG = None
def earth_img():
    """PIL image of the base layer: 21600x10800 Blue Marble NG if present, else the 5400x2700 SatObserver asset"""
    global _IMG
    if _IMG is None:
        for c in ['/Users/mickey/sda/basemaps/world.topo.bathy.200409.3x21600x10800.jpg', '/Users/mickey/sda/satobserver/app/assets/earth_day.jpg']:
            if Path(c).exists(): _IMG = Image.open(c); break
    return _IMG

def sun_subpoint(t):
    jd = (np.datetime64(t) - np.datetime64('2000-01-01T12:00:00')) / np.timedelta64(1, 's') / 86400.0
    g = np.radians((357.529 + 0.98560028*jd) % 360); q = (280.459 + 0.98564736*jd) % 360
    L = np.radians((q + 1.915*np.sin(g) + 0.020*np.sin(2*g)) % 360)
    eps = np.radians(23.439 - 0.00000036*jd)
    ra = np.degrees(np.arctan2(np.cos(eps)*np.sin(L), np.cos(L))); dec = np.degrees(np.arcsin(np.sin(eps)*np.sin(L)))
    gmst = (280.46061837 + 360.98564736629*jd) % 360
    return ((ra - gmst + 540) % 360) - 180, dec
def sun_alt(t, lon, lat):
    slon, slat = sun_subpoint(t)
    return np.degrees(np.arcsin(np.sin(np.radians(lat))*np.sin(np.radians(slat)) +
                                np.cos(np.radians(lat))*np.cos(np.radians(slat))*np.cos(np.radians(lon - slon))))

def new_figure(W, H, title, subtitle, clock):
    fig = plt.figure(figsize=(W, H), facecolor=BG)
    fig.text(0.012, 0.975, title, color='#cfd6dd', fontsize=12, fontweight='bold', va='center')
    fig.text(0.012 + (0.105*len(title) + 0.12)/W, 0.975, subtitle, color=FGDIM, fontsize=11, va='center')
    fig.text(0.988, 0.975, clock, color=FG, fontsize=11, va='center', ha='right')
    ax = fig.add_axes([0.012, 0.03, 0.976, 0.925]); ax.set_facecolor('#05070a')
    for s in ax.spines.values(): s.set_edgecolor('#2a323c')
    return fig, ax

def draw_base(ax, extent, t, grat=30, night=True, sun=True, label_step=None):
    x0, x1, y0, y1 = extent
    img = earth_img(); Ww, Hh = img.size
    c0, c1 = int((x0+180)/360*Ww), int(np.ceil((x1+180)/360*Ww)); r0, r1 = int((90-y1)/180*Hh), int(np.ceil((90-y0)/180*Hh))
    im = img.crop((c0, r0, c1, r1))
    f = int(np.ceil(im.size[0]/8000))            # global 21600 px -> 7200 px; regional crops stay at full resolution
    if f > 1: im = im.reduce(f)
    ax.imshow(np.asarray(im), extent=[c0/Ww*360-180, c1/Ww*360-180, 90-r1/Hh*180, 90-r0/Hh*180], aspect='auto', interpolation='lanczos', zorder=0)
    ax.set_xlim(x0, x1); ax.set_ylim(y0, y1); ax.set_xticks([]); ax.set_yticks([])
    glon, glat = np.meshgrid(np.linspace(x0, x1, 1201), np.linspace(y0, y1, 801))
    alt = sun_alt(t, glon, glat)
    if night:
        sh = np.zeros(glon.shape + (4,)); sh[..., 2] = 10/255; sh[..., 3] = np.where(alt < 0, 0.35, 0)
        ax.imshow(sh, extent=extent, aspect='auto', origin='lower', zorder=1, interpolation='bilinear')
        ax.contour(glon, glat, alt, levels=[0], colors=[(1, 205/255, 110/255, 0.35)], linewidths=1, zorder=2)
    if sun:
        slon, slat = sun_subpoint(t)
        if x0 < slon < x1 and y0 < slat < y1:
            ax.plot(slon, slat, 'o', ms=7, mfc=SUN, mec=(60/255, 40/255, 0, 0.6), mew=1, zorder=6)
            for k in range(8):
                a = k*np.pi/4; ax.plot([slon+np.cos(a)*1.9, slon+np.cos(a)*3.0], [slat+np.sin(a)*1.9, slat+np.sin(a)*3.0], color=SUN, lw=1.5, zorder=6)
    for lon in np.arange(np.ceil(x0/grat)*grat, x1+1e-9, grat):
        ax.axvline(lon, color=(1, 1, 1, 0.22 if lon == 0 else 0.10), lw=1, zorder=3)
    for lat in np.arange(np.ceil(y0/grat)*grat, y1+1e-9, grat):
        ax.axhline(lat, color=(1, 1, 1, 0.22 if lat == 0 else 0.10), lw=1, zorder=3)
    ls = label_step or grat
    def lonlab(l): return '0°' if l == 0 else ('180°' if abs(l) == 180 else f'{abs(int(l))}°{"W" if l < 0 else "E"}')
    def latlab(l): return '0°' if l == 0 else f'{abs(int(l))}°{"S" if l < 0 else "N"}'
    dx, dy = (x1-x0)*0.0022, (y1-y0)*0.0045
    for lon in np.arange(np.ceil(x0/ls)*ls, x1-ls*0.5, ls):
        ax.text(lon+dx, y0+dy, lonlab(lon), color=(1, 1, 1, 0.55), fontsize=9, va='bottom', ha='left', path_effects=[HALO], zorder=8)
    for lat in np.arange(np.ceil(y0/ls)*ls, y1-ls*0.5, ls):
        if lat == y0: continue
        ax.text(x0+dx, lat+dy, latlab(lat), color=(1, 1, 1, 0.55), fontsize=9, va='bottom', ha='left', path_effects=[HALO], zorder=8)
    return glon, glat, alt

def plot_track(ax, lon, lat, **kw):
    lon = np.asarray(lon, float).copy(); lat = np.asarray(lat, float).copy()
    brk = np.where(np.abs(np.diff(lon)) > 180)[0]
    ax.plot(np.insert(lon, brk+1, np.nan), np.insert(lat, brk+1, np.nan), **kw)

def label(ax, x, y, text, color='#ffffff', size=9.5, ha='left', va='center', **kw):
    kw.setdefault('linespacing', 1.2)
    return ax.text(x, y, text, color=color, fontsize=size, ha=ha, va=va, path_effects=[HALO], zorder=9, **kw)

def sq(ax, lon, lat, col, text=None, dx=1.6, dy=0, ha='left', va='center', size=8, hollow=False):
    ax.plot(lon, lat, 's', ms=size, mfc='none' if hollow else col, mec=col if hollow else (8/255, 10/255, 14/255, 0.9), mew=1.4 if hollow else 1, zorder=7)
    if text: label(ax, lon+dx, lat+dy, text, ha=ha, va=va)

def star(ax, lon, lat, col, ms=16, hollow=False):
    ax.plot(lon, lat, '*', ms=ms, mfc='none' if hollow else col, mec=col if hollow else (8/255, 10/255, 14/255, 0.9), mew=1.3 if hollow else 1, zorder=7)

def hud(ax, lines, x0=0.010, y0=0.022, lh=0.026, width=0.30, fontsize=11):
    ax.add_patch(Rectangle((x0-0.004, y0-0.009), width, lh*len(lines)+0.016, transform=ax.transAxes,
                           facecolor=(0.04, 0.05, 0.07, 0.82), edgecolor='#2a323c', lw=1, zorder=10))
    for j, (txt, col, bold) in enumerate(lines):
        ax.text(x0, y0 + lh*(len(lines)-1-j), txt, transform=ax.transAxes, color=col, fontsize=fontsize,
                fontweight='bold' if bold else 'normal', va='bottom', ha='left', zorder=11)

def credit(ax, text='Illustration: Mickey  ·  base map NASA Blue Marble'):
    ax.text(0.995, 0.034, text, transform=ax.transAxes, color=FG, fontsize=11, ha='right', va='bottom', path_effects=[HALO], zorder=11)
