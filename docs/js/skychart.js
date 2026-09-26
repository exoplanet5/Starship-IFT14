// Starship pass sky chart for a city: polar alt-az chart in the SatObserver-MX style (drawing ported from
// satobserver/app/js/skychart.js). The ship's alt-az track over a city depends only on MET (the Earth-fixed
// trajectory is the same for every T0); stars, Sun, Moon, sky twilight tint and the ship's sunlit/eclipsed
// state follow UTC = T0 + MET, so they move with the time slider and the launch-time shift.
import * as A from './astro.js';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const RISE_EL = 1.0;          // deg: pass tracks are cut off below this elevation (as in SatObserver-MX)
const STEP = 5;               // s: pass sampling
const COL_ORBIT = '#4fc3f7';

function hexA(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// sky-disc shade by twilight stage (discrete, SatObserver-MX palette)
function skyBg(sunAlt) {
  if (sunAlt >= 0) return '#1e3348';
  if (sunAlt >= -6) return '#182a3c';
  if (sunAlt >= -12) return '#131f2e';
  if (sunAlt >= -18) return '#0e1620';
  return '#0a0e13';
}
const STAGE = (a) => a >= 0 ? 'day' : a >= -6 ? 'civil twilight' : a >= -12 ? 'nautical twilight' : a >= -18 ? 'astronomical twilight' : 'night';
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const dir16 = (az) => COMPASS[Math.round(az / 22.5) % 16];
const MW_GP_RA = 192.859, MW_GP_DEC = 27.128;    // north galactic pole (J2000)

const CSS = `
.skw{position:fixed;z-index:26;left:330px;top:58px;width:540px;height:600px;min-width:340px;min-height:380px;display:flex;flex-direction:column;
  background:#171c22;border:1px solid #3a4654;border-radius:8px;box-shadow:0 10px 34px rgba(0,0,0,.7);resize:both;overflow:hidden}
.skw-title{height:26px;flex:none;display:flex;align-items:center;gap:8px;padding:0 4px 0 10px;background:linear-gradient(#232b35,#1b2129);
  border-bottom:1px solid #2a323c;cursor:grab;user-select:none;font:600 12px ${MONO};color:#e8eaed}
.skw-title .sub{color:#9aa4ae;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.skw-close{margin-left:auto;width:22px;height:20px;border:0;border-radius:4px;background:none;color:#9aa4ae;cursor:pointer;font-size:13px;line-height:1}
.skw-close:hover{background:#ff5252;color:#fff}
.skw-body{position:relative;flex:1;min-height:0}
.skw canvas{position:absolute;left:0;top:0;display:block;cursor:crosshair}
.skc-hud{font:11px ${MONO};font-variant-numeric:tabular-nums;color:#e8eaed;background:rgba(10,14,18,.62);padding:2px 7px;border-radius:3px;pointer-events:none;line-height:1.5}
.skc-topstack{position:absolute;top:34px;left:6px;right:6px;display:flex;flex-direction:column;gap:4px;align-items:flex-start;pointer-events:none;z-index:5}
.skc-foot{color:#9aa4ae}
.skc-toolbar{position:absolute;top:6px;left:6px;display:flex;gap:3px;z-index:6;opacity:.85}
.skc-toolbar:hover{opacity:1}
.skc-tbtn{min-width:26px;padding:2px 6px;font:11px ${MONO};background:#1e242c;border:1px solid #2a323c;border-radius:4px;color:#e8eaed;cursor:pointer}
.skc-tbtn:hover{border-color:#2a7ea8}
.skc-tbtn.skc-on{outline:1px solid #4fc3f7;color:#4fc3f7}
.skc-passes{flex:none;display:flex;flex-wrap:wrap;gap:4px;padding:6px;border-top:1px solid #2a323c;background:#12171c;max-height:84px;overflow:auto}
.skc-chip{font:11px ${MONO};font-variant-numeric:tabular-nums;background:#1e242c;border:1px solid #2a323c;border-radius:10px;color:#cfd6dd;padding:2px 8px;cursor:pointer;white-space:nowrap}
.skc-chip:hover{border-color:#2a7ea8;color:#fff}
.skc-chip.on{color:#4fc3f7;border-color:#2a7ea8;background:rgba(79,195,247,.10)}
.skc-chip .vis{color:#ffd54f}
.skc-none{font:11px ${MONO};color:#9aa4ae;padding:2px 4px}
@media (max-width:860px){.skw{left:6px!important;right:6px;width:auto!important;top:52px!important;height:68vh!important;resize:none}}
`;

export function createSkyChart({ shipAt, branchEnd, branchInfo, getState, onJump, fmtMET }) {
  let stars = null, mw = null, mwVecs = null, loading = null;
  let win = null, canvas = null, ctx = null, elHud = null, elFoot = null, elTitle = null, elPasses = null, body = null;
  let cssW = 0, cssH = 0, dpr = 1;
  let city = null, frame = null, passes = [], passKey = '', chipKey = '', selIdx = 'auto';
  const cfg = { eastLeft: true, elStep: 30, stars: true, starNames: false, constLines: false, constNames: false, sunMoon: true, mw: false };

  function load() {
    if (!loading) loading = Promise.all([fetch('./data/stars.json').then((r) => r.json()), fetch('./data/milkyway.json').then((r) => r.json())])
      .then(([s, m]) => { stars = s; mw = m; });
    return loading;
  }

  // ---------------------------------------------------------------- passes over the city (fixed geometry)
  function computePasses(branch) {
    const end = branchEnd(branch), out = [];
    let cur = null, prev = null;
    for (let met = 0; met <= end + 1e-6; met += STEP) {
      const s = shipAt(met, branch), la = A.lookAngles(frame, s.u, s.alt);
      const p = { met, az: la.az, el: la.el, rng: la.rng, u: s.u, alt: s.alt };
      if (p.el > RISE_EL) {
        if (!cur) {
          cur = { pts: [] };
          if (prev) { const f = (RISE_EL - prev.el) / (p.el - prev.el); cur.pts.push(lerpPt(prev, p, f, branch)); }
        }
        cur.pts.push(p);
      } else if (cur) {
        const f = (RISE_EL - prev.el) / (p.el - prev.el); cur.pts.push(lerpPt(prev, p, f, branch));
        out.push(cur); cur = null;
      }
      prev = p;
    }
    if (cur) out.push(cur);
    for (const q of out) {
      q.aos = q.pts[0].met; q.los = q.pts[q.pts.length - 1].met;
      const top = q.pts.reduce((a, b) => (b.el > a.el ? b : a));
      q.maxEl = top.el; q.tMax = top.met; q.azA = q.pts[0].az; q.azL = q.pts[q.pts.length - 1].az;
    }
    return out.filter((q) => q.los - q.aos >= 10);
  }
  function lerpPt(a, b, f, branch) {
    const met = a.met + (b.met - a.met) * f, s = shipAt(met, branch), la = A.lookAngles(frame, s.u, s.alt);
    return { met, az: la.az, el: Math.max(la.el, RISE_EL), rng: la.rng, u: s.u, alt: s.alt };
  }
  // seconds of a pass with the ship sunlit, >= 10 deg up, and the site sky at least nautically dark (sun < -6)
  function visibleSeconds(q, t0ms) {
    let sec = 0;
    for (let i = 1; i < q.pts.length; i++) {
      const p = q.pts[i], utc = t0ms + p.met * 1000;
      if (p.el < 10) continue;
      const ss = A.sunSubpoint(utc), sv = A.llToVec(ss.lon, ss.lat);
      if (A.sunlit(p.u, p.alt, sv) && A.altAzOfSubpoint(frame, ss).alt < -6) sec += p.met - q.pts[i - 1].met;
    }
    return sec;
  }
  function currentPass(met) {
    if (!passes.length) return -1;
    if (selIdx !== 'auto') return selIdx;
    let i = passes.findIndex((q) => met >= q.aos - 60 && met <= q.los + 60);
    if (i < 0) i = passes.findIndex((q) => q.aos > met);
    if (i < 0) i = passes.length - 1;
    return i;
  }

  // ---------------------------------------------------------------- window
  function build() {
    if (!document.getElementById('skw-style')) {
      const st = document.createElement('style'); st.id = 'skw-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    win = document.createElement('div'); win.className = 'skw';
    win.innerHTML = `<div class="skw-title"><span>Sky Chart</span><span class="sub"></span><button class="skw-close" title="Close (Esc)">✕</button></div>
      <div class="skw-body"><canvas></canvas>
        <div class="skc-toolbar"></div>
        <div class="skc-topstack"><div class="skc-hud"></div><div class="skc-hud skc-foot"></div></div></div>
      <div class="skc-passes"></div>`;
    document.body.appendChild(win);
    body = win.querySelector('.skw-body'); canvas = win.querySelector('canvas'); ctx = canvas.getContext('2d');
    elHud = win.querySelector('.skc-hud'); elFoot = win.querySelector('.skc-foot'); elTitle = win.querySelector('.skw-title .sub');
    elPasses = win.querySelector('.skc-passes');
    win.querySelector('.skw-close').addEventListener('click', close);
    // toolbar (SatObserver-MX layout)
    const tb = win.querySelector('.skc-toolbar'), btns = {};
    const mk = (key, label, title, fn) => { const b = document.createElement('button'); b.className = 'skc-tbtn'; b.textContent = label; b.title = title; b.addEventListener('click', fn); tb.appendChild(b); if (key) btns[key] = b; };
    const refresh = () => { btns.grid.textContent = cfg.elStep + '°'; for (const k of ['sunMoon', 'stars', 'mw', 'starNames', 'constLines', 'constNames']) btns[k].classList.toggle('skc-on', cfg[k]); };
    const tog = (k) => () => { cfg[k] = !cfg[k]; refresh(); };
    mk('grid', '30°', 'elevation grid spacing: 30° / 10° per ring', () => { cfg.elStep = cfg.elStep === 30 ? 10 : 30; refresh(); });
    mk('sunMoon', '☉', 'sun & moon (moon shows phase)', tog('sunMoon'));
    mk('stars', '✶', 'stars (to mag 4.6)', tog('stars'));
    mk('mw', 'MW', 'Milky Way glow (fades out above sun alt −6°)', tog('mw'));
    mk('starNames', 'SN', 'bright star names', tog('starNames'));
    mk('constLines', 'CL', 'constellation lines', tog('constLines'));
    mk('constNames', 'CN', 'constellation names', tog('constNames'));
    mk(null, 'E⇄', 'flip east/west (sky view vs map view)', () => { cfg.eastLeft = !cfg.eastLeft; });
    refresh();
    // drag by the title bar
    const title = win.querySelector('.skw-title');
    title.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = win.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      title.setPointerCapture(e.pointerId); title.style.cursor = 'grabbing';
      const mv = (ev) => { win.style.left = Math.max(0, Math.min(innerWidth - 80, ev.clientX - dx)) + 'px'; win.style.top = Math.max(42, Math.min(innerHeight - 40, ev.clientY - dy)) + 'px'; };
      const up = () => { title.removeEventListener('pointermove', mv); title.removeEventListener('pointerup', up); title.style.cursor = ''; };
      title.addEventListener('pointermove', mv); title.addEventListener('pointerup', up);
    });
    elPasses.addEventListener('click', (e) => {
      const c = e.target.closest('.skc-chip'); if (!c) return;
      if (c.dataset.i === 'auto') { selIdx = 'auto'; chipKey = ''; return; }
      selIdx = +c.dataset.i; chipKey = '';
      onJump(Math.max(0, passes[selIdx].aos - 60));
    });
    new ResizeObserver(resize).observe(body);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });
  }
  function resize() {
    const r = body.getBoundingClientRect(), w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height)), d = devicePixelRatio || 1;
    if (w === cssW && h === cssH && d === dpr) return;
    cssW = w; cssH = h; dpr = d; canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  }
  async function open(c) {
    if (!win) build();
    city = { name: c[0], lon: c[1], lat: c[2] };
    frame = A.siteFrame(city.lon, city.lat);
    passKey = ''; chipKey = ''; selIdx = 'auto';
    elTitle.textContent = `— Starship passes over ${city.name}`;
    win.style.display = 'flex';
    resize();
    await load();
    render();
  }
  function close() { if (win) win.style.display = 'none'; }
  function isOpen() { return !!win && win.style.display !== 'none'; }

  // ---------------------------------------------------------------- projection
  const TOP = 100;  // toolbar + HUD band above the chart
  const metrics = () => ({ cx: cssW / 2, cy: TOP + (cssH - TOP) / 2, R: Math.max(30, Math.min(cssW, cssH - TOP) / 2 - 26) });
  function project(az, el, m) {
    const r = (90 - Math.max(el, -5)) / 90 * m.R, a = az * D2R, sx = cfg.eastLeft ? -1 : 1;
    return { x: m.cx + sx * r * Math.sin(a), y: m.cy - r * Math.cos(a) };
  }
  function projectSky(az, el, m) {
    const r = (90 - el) / 90 * m.R, a = az * D2R, sx = cfg.eastLeft ? -1 : 1;
    return { x: m.cx + sx * r * Math.sin(a), y: m.cy - r * Math.cos(a) };
  }
  function haloText(text, x, y, fill, align) {
    if (!align && x + ctx.measureText(text).width > cssW - 3) { align = 'right'; x -= 8; }
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(5,8,12,0.85)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y);
  }
  function timeBox(text, x, y) {
    const w = ctx.measureText(text).width + 6, h = 12;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y - h + 2, w, h, 3); else ctx.rect(x, y - h + 2, w, h);
    ctx.fillStyle = 'rgba(10,14,18,0.72)'; ctx.fill();
    ctx.fillStyle = '#e8eaed'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(text, x + 3, y);
  }

  // ---------------------------------------------------------------- layers
  function drawGrid(m) {
    ctx.lineWidth = 1;
    for (let el = 0; el < 90; el += cfg.elStep) {
      ctx.beginPath(); ctx.arc(m.cx, m.cy, (90 - el) / 90 * m.R, 0, Math.PI * 2);
      ctx.strokeStyle = el === 0 ? 'rgba(232,234,237,0.5)' : (el % 30 === 0 ? 'rgba(232,234,237,0.16)' : 'rgba(232,234,237,0.08)');
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(m.cx, m.cy, 1.6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(232,234,237,0.5)'; ctx.fill();
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    ctx.font = '11px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 8; i++) {
      const pe = project(i * 45, 0, m);
      ctx.beginPath(); ctx.moveTo(m.cx, m.cy); ctx.lineTo(pe.x, pe.y); ctx.strokeStyle = 'rgba(232,234,237,0.10)'; ctx.stroke();
      const pl = project(i * 45, -14, m);
      ctx.fillStyle = i === 0 ? '#e8eaed' : 'rgba(154,164,174,0.9)'; ctx.fillText(names[i], pl.x, pl.y);
    }
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(154,164,174,0.75)'; ctx.font = '10px ' + MONO;
    for (const el of [0, 30, 60]) { const p = project(22.5, el, m); ctx.fillText(el + '°', p.x + 2, p.y); }
  }

  function drawStars(m, lst) {
    if (!stars) return;
    const sinLat = Math.sin(city.lat * D2R), cosLat = Math.cos(city.lat * D2R);
    if (cfg.constLines) {
      ctx.strokeStyle = 'rgba(110,150,215,0.30)'; ctx.lineWidth = 1;
      for (const seg of stars.lines) {
        let prev = null; ctx.beginPath();
        for (const [ra, de] of seg) {
          const a = A.raDecToAltAz(ra, de, lst, sinLat, cosLat);
          if (a.alt <= 0) { prev = null; continue; }
          const p = project(a.az, a.alt, m); if (prev) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); prev = p;
        }
        ctx.stroke();
      }
    }
    if (cfg.stars) {
      for (const [ra, de, mag] of stars.stars) {
        const a = A.raDecToAltAz(ra, de, lst, sinLat, cosLat);
        if (a.alt <= 0.3) continue;
        const p = project(a.az, a.alt, m);
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.6, 2.7 - 0.45 * mag), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(225,235,255,${Math.max(0.25, 0.95 - 0.13 * mag).toFixed(2)})`; ctx.fill();
      }
    }
    if (cfg.starNames) {
      ctx.font = '9px ' + MONO;
      for (const [ra, de, nm] of stars.names) {
        const a = A.raDecToAltAz(ra, de, lst, sinLat, cosLat);
        if (a.alt <= 1) continue;
        const p = project(a.az, a.alt, m); haloText(nm, p.x + 5, p.y - 4, 'rgba(185,205,240,0.9)');
      }
    }
    if (cfg.constNames) {
      ctx.font = 'italic 10px ' + MONO; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      for (const [ra, de, nm] of stars.cons) {
        const a = A.raDecToAltAz(ra, de, lst, sinLat, cosLat);
        if (a.alt <= 4) continue;
        const p = project(a.az, a.alt, m); ctx.fillStyle = 'rgba(140,165,205,0.55)'; ctx.fillText(nm, p.x, p.y);
      }
      ctx.textAlign = 'left';
    }
  }

  // Milky Way isophotes (see SatObserver-MX for the even-odd parity fix near the nadir)
  function drawMW(m, lst, dark) {
    if (!mw || !cfg.mw || dark <= 0.02) return;
    if (!mwVecs) mwVecs = mw.levels.map((lev) => lev.rings.map((ring) => {
      const v = new Float64Array(ring.length * 3);
      ring.forEach(([ra, de], i) => { const r = ra * D2R, d = de * D2R, cd = Math.cos(d); v[i * 3] = cd * Math.cos(r); v[i * 3 + 1] = cd * Math.sin(r); v[i * 3 + 2] = Math.sin(d); });
      return v;
    }));
    const sinLat = Math.sin(city.lat * D2R), cosLat = Math.cos(city.lat * D2R), sinL = Math.sin(lst), cosL = Math.cos(lst), sx = cfg.eastLeft ? -1 : 1;
    const pt = (ux, uy, uz) => {
      const cH = cosL * ux + sinL * uy, sH = sinL * ux - cosL * uy;
      const alt = Math.asin(Math.max(-1, Math.min(1, sinLat * uz + cosLat * cH))), az = Math.atan2(-sH, uz * cosLat - sinLat * cH);
      const r = (90 - alt * R2D) / 90 * m.R; return { x: m.cx + sx * r * Math.sin(az), y: m.cy - r * Math.cos(az) };
    };
    const maxChord2 = (0.25 * m.R) ** 2;
    const subdiv = (out, x0, y0, z0, p0, x1, y1, z1, p1, depth) => {
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      if (depth > 0 && dx * dx + dy * dy > maxChord2) {
        let xm = x0 + x1, ym = y0 + y1, zm = z0 + z1; const n = Math.hypot(xm, ym, zm);
        if (n > 1e-9) { xm /= n; ym /= n; zm /= n; const pm = pt(xm, ym, zm); subdiv(out, x0, y0, z0, p0, xm, ym, zm, pm, depth - 1); subdiv(out, xm, ym, zm, pm, x1, y1, z1, p1, depth - 1); return; }
      }
      out.push(p1);
    };
    const inPoly = (px, py, P) => { let ins = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i].y > py) !== (P[j].y > py) && px < (P[j].x - P[i].x) * (py - P[i].y) / (P[j].y - P[i].y) + P[i].x) ins = !ins; } return ins; };
    const gp = A.raDecToAltAz(MW_GP_RA, MW_GP_DEC, lst, sinLat, cosLat), gpP = projectSky(gp.az, gp.alt, m), RIM = m.R * 2.2;
    ctx.save(); ctx.beginPath(); ctx.arc(m.cx, m.cy, m.R, 0, Math.PI * 2); ctx.clip();
    const blur = typeof ctx.filter === 'string'; if (blur) ctx.filter = `blur(${(m.R * 0.01).toFixed(1)}px)`;
    mw.levels.forEach((lev, L) => {
      ctx.beginPath();
      for (const v of mwVecs[L]) {
        const n = v.length / 3; let p0 = pt(v[0], v[1], v[2]); const P = [p0];
        for (let i = 1; i <= n; i++) { const j = (i % n) * 3, k = (i - 1) * 3, p1 = pt(v[j], v[j + 1], v[j + 2]); subdiv(P, v[k], v[k + 1], v[k + 2], p0, v[j], v[j + 1], v[j + 2], p1, 4); p0 = p1; }
        ctx.moveTo(P[0].x, P[0].y); for (let q = 1; q < P.length; q++) ctx.lineTo(P[q].x, P[q].y); ctx.closePath();
        if (inPoly(gpP.x, gpP.y, P)) { ctx.moveTo(m.cx + RIM, m.cy); ctx.arc(m.cx, m.cy, RIM, 0, Math.PI * 2); }
      }
      ctx.fillStyle = `rgba(172,192,222,${(lev.a * dark).toFixed(3)})`; ctx.fill('evenodd');
    });
    if (blur) ctx.filter = 'none';
    ctx.restore();
  }

  function drawSunMoon(m, utc, sunSub, sun) {
    if (!cfg.sunMoon) return;
    const moonSub = A.moonSubpoint(utc), moon = A.altAzOfSubpoint(frame, moonSub);
    moon.alt -= 0.95 * Math.cos(moon.alt * D2R);            // lunar parallax (mean 57')
    if (sun.alt > 0) {
      const p = project(sun.az, sun.alt, m);
      ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 1.5;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * 7, p.y + Math.sin(a) * 7); ctx.lineTo(p.x + Math.cos(a) * 11, p.y + Math.sin(a) * 11); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = '#ffd54f'; ctx.fill(); ctx.strokeStyle = 'rgba(60,40,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    }
    if (moon.alt > 0) {
      const q = project(moon.az, moon.alt, m);
      const f1 = moonSub.lat * D2R, f2 = sunSub.lat * D2R, dl = (sunSub.lon - moonSub.lon) * D2R;
      const cosPsi = Math.sin(f1) * Math.sin(f2) + Math.cos(f1) * Math.cos(f2) * Math.cos(dl);
      const ps = project(sun.az, sun.alt, m), phi = Math.atan2(ps.y - q.y, ps.x - q.x), R = 5.5;
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(phi);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = '#3c4148'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false);
      ctx.ellipse(0, 0, R * Math.abs(cosPsi), R, 0, Math.PI / 2, -Math.PI / 2, cosPsi > 0);
      ctx.fillStyle = '#e6e2d6'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(8,10,14,0.7)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
  }

  function drawPass(m, q, st) {
    const bi = branchInfo(st.branch);
    ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
    let prev = null;
    for (const p of q.pts) {
      const xy = project(p.az, Math.max(p.el, RISE_EL), m);
      if (prev) {
        const utc = st.t0ms + p.met * 1000, ss = A.sunSubpoint(utc);
        const ecl = !A.sunlit(p.u, p.alt, A.llToVec(ss.lon, ss.lat));
        const col = p.met > bi.switch ? bi.color : COL_ORBIT;
        ctx.strokeStyle = hexA(col, (p.met <= st.met ? 0.35 : 0.85) * (ecl ? 0.5 : 1));
        ctx.setLineDash(ecl ? [3, 3] : []);
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(xy.x, xy.y); ctx.stroke();
      }
      prev = xy;
    }
    ctx.setLineDash([]);
    // time ticks: per minute when short enough, else the smallest step that keeps <= 16 labels
    const durMin = (q.los - q.aos) / 60;
    const stepMin = [1, 2, 5, 10, 30, 60].find((s) => durMin / s <= 16) || 60;
    const a = q.pts[0], b = q.pts[q.pts.length - 1], pa = project(a.az, Math.max(a.el, RISE_EL), m), pb = project(b.az, Math.max(b.el, RISE_EL), m);
    const boxes = [[pa.x - 2, pa.y - 16, 84, 14], [pb.x - 2, pb.y + 1, 84, 14]];
    const free = (x, y, w, h) => !boxes.some(([bx, by, bw, bh]) => x < bx + bw && bx < x + w && y < by + bh && by < y + h);
    ctx.font = '9px ' + MONO;
    for (let t = Math.ceil(q.aos / 60) * 60; t < q.los; t += stepMin * 60) {
      const s = shipAt(t, st.branch), la = A.lookAngles(frame, s.u, s.alt);
      if (la.el < RISE_EL) continue;
      const xy = project(la.az, la.el, m);
      ctx.beginPath(); ctx.arc(xy.x, xy.y, 2.2, 0, Math.PI * 2); ctx.fillStyle = t > bi.switch ? bi.color : COL_ORBIT; ctx.fill();
      ctx.strokeStyle = 'rgba(8,10,14,0.9)'; ctx.lineWidth = 1; ctx.stroke();
      const lbl = fmtMET(t), w = ctx.measureText(lbl).width + 6;
      let lx = xy.x + 5; if (lx + w > cssW - 3) lx = xy.x - 5 - w;
      if (free(lx, xy.y - 15, w, 12)) { timeBox(lbl, lx, xy.y - 5); boxes.push([lx, xy.y - 15, w, 12]); }
    }
    // deorbit burn inside this pass
    if (bi.switch >= q.aos && bi.switch <= q.los) {
      const s = shipAt(bi.switch, st.branch), la = A.lookAngles(frame, s.u, s.alt), xy = project(la.az, la.el, m);
      ctx.save(); ctx.translate(xy.x, xy.y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = bi.color; ctx.strokeStyle = '#080a0e'; ctx.lineWidth = 1; ctx.fillRect(-3.5, -3.5, 7, 7); ctx.strokeRect(-3.5, -3.5, 7, 7); ctx.restore();
      ctx.font = '10px ' + MONO; haloText(`${bi.burnLabel} ${fmtMET(bi.switch)}`, xy.x + 7, xy.y + 9, bi.color);
    }
    // AOS / LOS at the 1-deg threshold
    ctx.font = '10px ' + MONO;
    haloText('↑' + fmtMET(q.aos), pa.x + 4, pa.y - 8, COL_ORBIT);
    haloText('↓' + fmtMET(q.los), pb.x + 4, pb.y + 8, q.los > bi.switch ? bi.color : COL_ORBIT);
  }

  function updateChips(st) {
    const key = `${passKey}|${st.t0ms}|${selIdx}`;
    if (key === chipKey) return;
    chipKey = key;
    if (!passes.length) { elPasses.innerHTML = '<span class="skc-none">No pass above 1° elevation for this profile.</span>'; return; }
    elPasses.innerHTML = `<span class="skc-chip${selIdx === 'auto' ? ' on' : ''}" data-i="auto" title="follow the current or next pass">Auto</span>` +
      passes.map((q, i) => {
        const vis = visibleSeconds(q, st.t0ms), vm = Math.floor(vis / 60), vs = Math.round(vis % 60);
        const v = vis > 0 ? ` · <span class="vis">☀ ${vm}m${String(vs).padStart(2, '0')}s visible</span>` : '';
        return `<span class="skc-chip${selIdx === i ? ' on' : ''}" data-i="${i}" title="jump to 1 min before rise">${fmtMET(q.aos)} · max ${q.maxEl.toFixed(0)}° ${dir16(q.azA)}→${dir16(q.azL)}${v}</span>`;
      }).join('');
  }

  // ---------------------------------------------------------------- render
  function render() {
    if (!isOpen() || !ctx || !city || cssW < 2) return;
    const st = getState(), utc = st.t0ms + st.met * 1000, m = metrics();
    const pk = `${city.name}|${st.branch}`;
    if (pk !== passKey) { passes = computePasses(st.branch); passKey = pk; chipKey = ''; if (selIdx !== 'auto' && selIdx >= passes.length) selIdx = 'auto'; }
    updateChips(st);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0e13'; ctx.fillRect(0, 0, cssW, cssH);
    const sunSub = A.sunSubpoint(utc), sun = A.altAzOfSubpoint(frame, sunSub);
    ctx.beginPath(); ctx.arc(m.cx, m.cy, m.R, 0, Math.PI * 2); ctx.fillStyle = skyBg(sun.alt); ctx.fill();
    const lst = A.gmstRad(utc) + city.lon * D2R;
    try { drawMW(m, lst, Math.max(0, Math.min(1, (-6 - sun.alt) / 12))); } catch (e) { /* optional layer */ }
    drawGrid(m);
    drawStars(m, lst);
    drawSunMoon(m, utc, sunSub, sun);
    const pi = currentPass(st.met);
    if (pi >= 0) drawPass(m, passes[pi], st);
    // ship now
    const s = shipAt(st.met, st.branch), la = A.lookAngles(frame, s.u, s.alt);
    const lit = A.sunlit(s.u, s.alt, A.llToVec(sunSub.lon, sunSub.lat));
    if (la.el > 0 && st.met > 0) {
      const p = project(la.az, la.el, m);
      ctx.fillStyle = COL_ORBIT; ctx.strokeStyle = 'rgba(8,10,14,0.9)'; ctx.lineWidth = 1;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6); ctx.strokeRect(p.x - 3, p.y - 3, 6, 6);
      ctx.beginPath(); ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.font = '11px ' + MONO; haloText('Starship', p.x + 8, p.y, '#ffffff');
    }
    // HUD
    let txt = `Starship  AZ ${la.az.toFixed(1)}°  EL ${la.el.toFixed(1)}°  RNG ${la.rng.toFixed(0)} km  |  ${lit ? '● sunlit' : '✕ eclipsed'} · site sun ${sun.alt.toFixed(1)}° (${STAGE(sun.alt)})`;
    if (la.el <= 0 && pi >= 0) {
      const q = passes[pi];
      txt += st.met < q.aos ? `  ·  next pass ${fmtMET(q.aos)} → ${fmtMET(q.los).slice(2)}, max ${q.maxEl.toFixed(0)}°` : `  ·  pass ${fmtMET(q.aos)} → ${fmtMET(q.los).slice(2)} done`;
    }
    elHud.textContent = txt;
    const lt = new Date(utc + 8 * 3600000);
    const p2 = (n) => String(n).padStart(2, '0');
    elFoot.textContent = `${city.name}  ${Math.abs(city.lat).toFixed(2)}°${city.lat >= 0 ? 'N' : 'S'} ${Math.abs(city.lon).toFixed(2)}°${city.lon >= 0 ? 'E' : 'W'}  ·  ` +
      `CST ${p2(lt.getUTCHours())}:${p2(lt.getUTCMinutes())}:${p2(lt.getUTCSeconds())}  ·  ${fmtMET(st.met)}`;
  }

  return { open, close, isOpen, render };
}
