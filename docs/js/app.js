// Starship IFT-14 3D trajectory viewer. Earth-fixed scene (Y = north pole); the Sun moves with UTC = T0 + MET.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as A from './astro.js';
import { createSkyChart } from './skychart.js';

const $ = (id) => document.getElementById(id);
const C = { sun: '#ffd54f', accent: '#4fc3f7', ok: '#7ad97a', warn: '#ffb84f', danger: '#ff5252', white: '#ffffff', dim: '#9aa4ae' };
const RE = A.RE;
const setMsg = (t) => { const m = $('loadmsg'); if (m) m.textContent = t; };

let data;
try {
  data = await (await fetch('./data/ift14.json')).json();
} catch (e) {
  setMsg('Could not load data/ift14.json: ' + e.message);
  throw e;
}
const M = data.meta;

// ---------------------------------------------------------------- tracks
class Track {
  constructor(seg) {
    this.met0 = seg.met0; this.dt = seg.dt; this.n = seg.lon.length;
    this.u = new Float32Array(this.n * 3); this.alt = Float32Array.from(seg.alt);
    for (let i = 0; i < this.n; i++) this.u.set(A.llToVec(seg.lon[i], seg.lat[i]), 3 * i);
  }
  get end() { return this.met0 + (this.n - 1) * this.dt; }
  metAt(i) { return this.met0 + i * this.dt; }
  sample(met) {
    let f = Math.max(0, Math.min(this.n - 1, (met - this.met0) / this.dt));
    const i = Math.min(this.n - 2, Math.floor(f)), w = f - i, a = 3 * i, b = a + 3, u = this.u;
    const x = u[a] + (u[b] - u[a]) * w, y = u[a + 1] + (u[b + 1] - u[a + 1]) * w, z = u[a + 2] + (u[b + 2] - u[a + 2]) * w;
    const r = Math.hypot(x, y, z);
    return { u: [x / r, y / r, z / r], alt: this.alt[i] + (this.alt[i + 1] - this.alt[i]) * w };
  }
  // flat xyz array for points i0..i1 (inclusive); ground = surface projection
  pts(exag, i0 = 0, i1 = this.n - 1, ground = false) {
    const out = [];
    for (let i = Math.max(0, i0); i <= Math.min(this.n - 1, i1); i++) {
      const s = ground ? 1.0012 : 1 + this.alt[i] * exag / RE;
      out.push(this.u[3 * i] * s, this.u[3 * i + 1] * s, this.u[3 * i + 2] * s);
    }
    return out;
  }
}
const T = Object.fromEntries(Object.entries(data.tracks).map(([k, v]) => [k, new Track(v)]));
const NOM = T.nominal;
const iAt = (met) => Math.round(met / NOM.dt);
const PAD = A.llToVec(M.starbase[0], M.starbase[1]);
const BR = data.branches;
const EI = { planned: 34132, cont_npac: null, cont_indian: null };
for (const e of data.events) {
  if (e.label.startsWith('Contingency entry')) EI.cont_npac = e.met;
  if (e.label.startsWith('Entry (no insertion')) EI.cont_indian = e.met;
}
const branchEnd = (b) => T[BR[b].descent].end;

function shipAt(met, b) {
  const B = BR[b];
  if (met <= 0) return { u: PAD, alt: 0 };
  if (met <= B.switch) return NOM.sample(met);
  return T[B.descent].sample(met);
}
function phaseOf(met, b) {
  const B = BR[b], end = branchEnd(b);
  if (met < 0) return 'pre-launch';
  if (met < M.met_seco) return 'ascent (powered)';
  if (b === 'cont_indian' && met >= B.switch) {
    if (met < EI.cont_indian) return 'suborbital coast, no insertion burn';
    return met < end ? 'entry and glide' : 'splashdown, Indian Ocean';
  }
  if (met < M.met_ins) return 'suborbital coast';
  if (met < M.met_ins + 19) return 'orbit insertion burn';
  if (met < B.switch) return `orbit ${Math.floor((met - M.met_ins) / (M.T_nodal_min * 60)) + 1} of 6`;
  if (met < B.switch + 11) return b === 'planned' ? 'deorbit burn' : 'contingency deorbit burn';
  if (met < EI[b]) return 'coast to entry';
  if (met < end) return 'entry and glide';
  return b === 'planned' ? 'landed W of Chile' : 'splashdown, North Pacific';
}

// ---------------------------------------------------------------- state (URL-restorable)
const qs = new URLSearchParams(location.search);
const parseMet = (s) => {
  if (s == null) return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return +s;
  const neg = s.startsWith('-'); const v = A.parseHM(s.replace('-', ''));
  return neg ? -v : v;
};
const state = {
  date: [M.date, ...M.alternates].includes(qs.get('date')) ? qs.get('date') : M.date,
  t0: qs.get('t0') ? A.parseHM(qs.get('t0')) : A.parseHM(M.t0_min),
  branch: BR[qs.get('br')] ? qs.get('br') : 'planned',
  met: parseMet(qs.get('met')) ?? 0,
  playing: false, speed: 60, live: false,
  exag: +(qs.get('exag') || 1), follow: qs.get('follow') === '1',
  show: { term: true, zones: true, labels: true, gt: true, fp: qs.get('fp') === '1', grid: true, lights: true, cities: qs.get('cities') !== '0' },
};
state.t0 = Math.max(A.parseHM(M.t0_min), Math.min(A.parseHM(M.t0_max), state.t0));
const t0ms = () => A.dateT0ms(state.date, state.t0);
const metMin = -900;
const metMax = () => branchEnd(state.branch);

// ---------------------------------------------------------------- renderer, camera, controls
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
view.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
Object.assign(labels.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
view.appendChild(labels.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#05070a');
const camera = new THREE.PerspectiveCamera(35, 1, 0.005, 200);
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: 1.08, maxDistance: 14, zoomSpeed: 0.9 });
const lineMats = [];

// stars
{
  const n = 2600, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const z = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    p.set([60 * r * Math.cos(t), 60 * z, 60 * r * Math.sin(t)], 3 * i);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8a93a0, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.7 })));
}

// ---------------------------------------------------------------- Earth (day / twilight / night shader + overlay canvas)
const loader = new THREE.TextureLoader();
const loadTex = (url) => new Promise((res, rej) => loader.load(url, (t) => {
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); res(t);
}, undefined, rej));
setMsg('loading textures…');
const [dayTex, nightTex] = await Promise.all([loadTex('./tex/earth_day_4k.jpg'), loadTex('./tex/earth_night.jpg')]);

const ovCanvas = document.createElement('canvas'); ovCanvas.width = 4096; ovCanvas.height = 2048;
const ovCtx = ovCanvas.getContext('2d');
const ovTex = new THREE.CanvasTexture(ovCanvas); ovTex.colorSpace = THREE.NoColorSpace;
ovTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const rgba = (hex, a) => { const c = new THREE.Color(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; };
function drawOverlay() {
  const W = ovCanvas.width, H = ovCanvas.height, X = (lon) => (lon + 180) / 360 * W, Y = (lat) => (90 - lat) / 180 * H;
  ovCtx.clearRect(0, 0, W, H);
  if (state.show.grid) {
    ovCtx.lineWidth = 2;
    for (let lon = -180; lon <= 180; lon += 30) { ovCtx.strokeStyle = lon === 0 ? 'rgba(255,255,255,.26)' : 'rgba(255,255,255,.13)'; ovCtx.beginPath(); ovCtx.moveTo(X(lon), 0); ovCtx.lineTo(X(lon), H); ovCtx.stroke(); }
    for (let lat = -60; lat <= 60; lat += 30) { ovCtx.strokeStyle = lat === 0 ? 'rgba(255,255,255,.26)' : 'rgba(255,255,255,.13)'; ovCtx.beginPath(); ovCtx.moveTo(0, Y(lat)); ovCtx.lineTo(W, Y(lat)); ovCtx.stroke(); }
  }
  if (state.show.zones) {
    for (const z of data.zones) {
      for (const sh of (z.wrap ? [0, -360] : [0])) {
        ovCtx.beginPath();
        z.ring.forEach(([lon, lat], i) => (i ? ovCtx.lineTo : ovCtx.moveTo).call(ovCtx, X(lon + sh), Y(lat)));
        ovCtx.closePath();
        ovCtx.fillStyle = rgba(z.color, 0.26); ovCtx.fill();
      }
    }
  }
  ovTex.needsUpdate = true;
}
drawOverlay();

const earthMat = new THREE.ShaderMaterial({
  uniforms: { dayTex: { value: dayTex }, nightTex: { value: nightTex }, ovTex: { value: ovTex },
              sunDir: { value: new THREE.Vector3(1, 0, 0) }, lights: { value: 1 } },
  vertexShader: `varying vec2 vUv; varying vec3 vP;
    void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D dayTex; uniform sampler2D nightTex; uniform sampler2D ovTex; uniform vec3 sunDir; uniform float lights;
    varying vec2 vUv; varying vec3 vP;
    void main(){
      float mu = dot(normalize(vP), sunDir);                       // sine of the Sun's altitude
      vec3 col = texture2D(dayTex, vUv).rgb * mix(0.20, 1.0, smoothstep(-0.2079, 0.03, mu));   // dims through twilight to -12 deg
      vec3 nl = texture2D(nightTex, vUv).rgb;
      col += nl * nl * vec3(1.0, 0.86, 0.62) * 1.25 * (1.0 - smoothstep(-0.2079, -0.0523, mu)) * lights;
      vec4 ov = texture2D(ovTex, vUv);
      gl_FragColor = vec4(mix(col, ov.rgb, ov.a), 1.0);
    }`,
});
const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 128), earthMat);
scene.add(earth);
// thin atmosphere rim
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.025, 96, 48), new THREE.ShaderMaterial({
  side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `varying vec3 vN; void main(){ float k = pow(max(0.0, 0.62 + dot(vN, vec3(0.0,0.0,1.0))), 3.0); gl_FragColor = vec4(0.30,0.62,0.95,1.0) * k * 0.9; }`,
})));

// ---------------------------------------------------------------- line helpers
function mkLine(flat, { color, width = 2, opacity = 1, dashed = false, dash = 0.012, gap = 0.009, depthTest = true }) {
  const g = new LineGeometry(); g.setPositions(flat);
  const m = new LineMaterial({ color: new THREE.Color(color), linewidth: width, transparent: opacity < 1 || dashed, opacity,
                               dashed, dashSize: dash, gapSize: gap, worldUnits: false, depthTest });
  m.resolution.set(view.clientWidth, view.clientHeight); lineMats.push(m);
  const l = new Line2(g, m); if (dashed) l.computeLineDistances();
  return l;
}
function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { const i = lineMats.indexOf(o.material); if (i >= 0) lineMats.splice(i, 1); o.material.dispose(); }
  });
  g.clear();
}
function circlePts(colatDeg, r, n = 256) {
  const c = colatDeg * A.D2R, out = [];
  for (let i = 0; i <= n; i++) { const p = i / n * Math.PI * 2; out.push(r * Math.sin(c) * Math.cos(p), r * Math.cos(c), r * Math.sin(c) * Math.sin(p)); }
  return out;
}
function spriteTex(draw, size = 64) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size; draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function mkSprite(tex, scale) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: true, transparent: true }));
  s.scale.set(scale, scale, 1); return s;
}
function mkLabel(html, cls = '', color = null) {
  const el = document.createElement('div'); el.className = 'lbl ' + cls; el.innerHTML = html;
  if (color) el.style.color = color;
  const o = new CSS2DObject(el); o.center.set(0, 0.5); return o;
}

// ---------------------------------------------------------------- terminators and Sun
const Y = new THREE.Vector3(0, 1, 0);
const termGroup = new THREE.Group(); scene.add(termGroup);
const termSun = mkLine(circlePts(90, 1.0022), { color: C.sun, width: 1.8 });
const termNaut = mkLine(circlePts(102, 1.0022), { color: C.accent, width: 1.5, opacity: 0.85 });
termGroup.add(termSun, termNaut);
const sunSprite = mkSprite(spriteTex((g, s) => {
  const c = s / 2; g.strokeStyle = C.sun; g.lineWidth = 3;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(c + Math.cos(a) * 17, c + Math.sin(a) * 17); g.lineTo(c + Math.cos(a) * 27, c + Math.sin(a) * 27); g.stroke(); }
  g.fillStyle = C.sun; g.beginPath(); g.arc(c, c, 12, 0, Math.PI * 2); g.fill();
}), 0.036);
sunSprite.material.depthTest = false; sunSprite.renderOrder = 6;
scene.add(sunSprite);

// ---------------------------------------------------------------- zones: labels (fills are in the overlay canvas)
const zoneGroup = new THREE.Group(); scene.add(zoneGroup);
const zoneLines = new THREE.Group(); scene.add(zoneLines);
for (const z of data.zones) {
  const pts = [], R = z.ring;
  for (let i = 0; i < R.length - 1; i++) {                      // densify straight lon/lat edges, as drawn on the 2D map
    const [a0, b0] = R[i], [a1, b1] = R[i + 1], n = Math.max(1, Math.ceil(Math.max(Math.abs(a1 - a0), Math.abs(b1 - b0)) / 0.25));
    for (let k = 0; k < n; k++) pts.push(...A.llToVec(a0 + (a1 - a0) * k / n, b0 + (b1 - b0) * k / n, 1.0015));
  }
  pts.push(...A.llToVec(R[R.length - 1][0], R[R.length - 1][1], 1.0015));
  zoneLines.add(mkLine(pts, { color: z.color, width: 1.6, opacity: 0.95 }));
}
const ZANCHOR = { launchA: [-80.5, 17.6], indian: [86, -22.0], npac: [-168, 33.2], chile: [-126, -33.6] };
for (const z of data.zones) {
  if (!ZANCHOR[z.key]) continue;
  const [lon, lat] = ZANCHOR[z.key];
  const o = mkLabel(`${z.id.split(' = ')[0]} · ${z.t0}–${z.t1}Z`, 'zone', z.color);
  o.position.set(...A.llToVec(lon, lat, 1.001)); o.userData.kind = 'zone'; zoneGroup.add(o);
}
{
  const tri = spriteTex((g, s) => { g.fillStyle = C.danger; g.strokeStyle = '#080a0e'; g.lineWidth = 4; g.beginPath(); g.moveTo(s / 2, 8); g.lineTo(s - 10, s - 12); g.lineTo(10, s - 12); g.closePath(); g.fill(); g.stroke(); });
  const s = mkSprite(tri, 0.028); s.position.set(...PAD.map((v) => v * 1.003)); scene.add(s);
  const o = mkLabel('Starbase', '', '#ffffff'); o.position.set(...PAD.map((v) => v * 1.003)); o.userData.kind = 'site'; zoneGroup.add(o);
}

// ---------------------------------------------------------------- major cities in China (labels appear by zoom tier)
// tier 1: shown from a regional view; tier 2: closer; tier 3: close zoom only (keeps clustered cities readable)
const CHINA_CITIES = [
  ['Beijing', 116.407, 39.904, 1], ['Shanghai', 121.474, 31.230, 1], ['Guangzhou', 113.264, 23.129, 1], ['Chengdu', 104.066, 30.573, 1],
  ['Chongqing', 106.551, 29.563, 1], ['Wuhan', 114.305, 30.593, 1], ["Xi'an", 108.940, 34.341, 1], ['Lhasa', 91.172, 29.652, 1],
  ['Ürümqi', 87.617, 43.825, 1], ['Harbin', 126.535, 45.803, 1], ['Kunming', 102.718, 25.038, 1], ['Hong Kong', 114.169, 22.320, 1],
  ['Taipei', 121.565, 25.033, 1],
  ['Tianjin', 117.201, 39.084, 2], ['Shijiazhuang', 114.515, 38.042, 2], ['Taiyuan', 112.549, 37.871, 2], ['Hohhot', 111.749, 40.842, 2],
  ['Shenyang', 123.431, 41.805, 2], ['Changchun', 125.324, 43.817, 2], ['Nanjing', 118.797, 32.060, 2], ['Hangzhou', 120.155, 30.274, 2],
  ['Hefei', 117.227, 31.821, 2], ['Fuzhou', 119.296, 26.074, 2], ['Nanchang', 115.858, 28.682, 2], ['Jinan', 117.120, 36.651, 2],
  ['Zhengzhou', 113.625, 34.747, 2], ['Changsha', 112.939, 28.228, 2], ['Nanning', 108.366, 22.817, 2], ['Haikou', 110.199, 20.044, 2],
  ['Guiyang', 106.630, 26.647, 2], ['Lanzhou', 103.834, 36.061, 2], ['Xining', 101.778, 36.617, 2], ['Yinchuan', 106.231, 38.487, 2],
  ['Qingdao', 120.383, 36.067, 2], ['Dalian', 121.615, 38.914, 2], ['Xiamen', 118.089, 24.480, 2], ['Kashgar', 75.990, 39.470, 2],
  ['Shenzhen', 114.058, 22.543, 3], ['Macau', 113.544, 22.199, 3],
];
const CITY_ZOOM = { 1: 2.9, 2: 2.05, 3: 1.45 };   // camera distance (Earth radii) below which a tier is labelled
const cityGroup = new THREE.Group(); scene.add(cityGroup);
const cityPos = [];
{
  const dotTex = spriteTex((g, s) => { g.fillStyle = '#c9ccd1'; g.strokeStyle = '#080a0e'; g.lineWidth = 7; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 9, 0, Math.PI * 2); g.fill(); g.stroke(); });
  for (const [name, lon, lat, tier] of CHINA_CITIES) {
    const p = A.llToVec(lon, lat, 1.0008);
    const dot = mkSprite(dotTex, 0.0085); dot.position.set(...p); cityGroup.add(dot);
    const o = mkLabel(name, 'city'); o.position.set(...p); o.userData.tier = tier; cityGroup.add(o);
    Object.assign(o.element.style, { pointerEvents: 'auto', cursor: 'pointer' });
    o.element.title = `Sky chart: Starship passes over ${name}`;
    const c = [name, lon, lat, tier];
    o.element.addEventListener('click', () => openSky(c));
    cityPos.push({ c, pos: dot.position });
  }
}
// click (or tap) on a city dot opens its sky chart
function cityAt(clientX, clientY) {
  if (!state.show.cities || camera.position.length() >= 3.6) return null;
  const r = renderer.domElement.getBoundingClientRect();
  let best = null, bd = 14;
  for (const k of cityPos) {
    if (!isVisible(k.pos)) continue;
    const v = k.pos.clone().project(camera);
    const d = Math.hypot((v.x + 1) / 2 * r.width + r.left - clientX, (1 - v.y) / 2 * r.height + r.top - clientY);
    if (d < bd) { bd = d; best = k.c; }
  }
  return best;
}
let downXY = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (downXY && Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) < 5) { const c = cityAt(e.clientX, e.clientY); if (c) openSky(c); }
  downXY = null;
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.buttons) return;
  renderer.domElement.style.cursor = cityAt(e.clientX, e.clientY) ? 'pointer' : '';
});

// ---------------------------------------------------------------- trajectory (rebuilt when altitude scale or profile changes)
const trajGroup = new THREE.Group(); scene.add(trajGroup);
const gtGroup = new THREE.Group(); scene.add(gtGroup);
const evGroup = new THREE.Group(); scene.add(evGroup);
let trail = null, trailNomCount = 0, pathFlat = null, trailKey = '';
const TRAIL_PTS = 300;   // 50 min of flown path
const DESC_COLOR = { planned: C.ok, cont_npac: C.warn, cont_indian: C.danger };
const SHORT = { 'Liftoff': 'Liftoff', 'Starship engine cutoff': 'SECO', 'Starship orbital insertion burn start': 'Orbit insertion burn (19 s)',
                'Deorbit burn start': 'Deorbit burn (11 s)', 'Starship entry': 'Entry', 'An exciting landing!': 'Landing W of Chile' };
const evTex = spriteTex((g, s) => { g.translate(s / 2, s / 2); g.rotate(Math.PI / 4); g.fillStyle = '#ffffff'; g.strokeStyle = '#080a0e'; g.lineWidth = 5; g.fillRect(-11, -11, 22, 22); g.strokeRect(-11, -11, 22, 22); });

function buildTrajectory() {
  disposeGroup(trajGroup); disposeGroup(gtGroup); disposeGroup(evGroup);
  const ex = state.exag, iS = iAt(M.met_seco), iI = iAt(M.met_ins), b = state.branch;
  trajGroup.add(mkLine(NOM.pts(ex, 0, iS), { color: C.sun, width: 2.6 }));
  trajGroup.add(mkLine(NOM.pts(ex, iS, iI), { color: C.sun, width: 2.2, dashed: true }));
  trajGroup.add(mkLine(NOM.pts(ex, iI, NOM.n - 1), { color: C.accent, width: 1.7, opacity: b === 'cont_indian' ? 0.35 : 0.95 }));
  for (const k of Object.keys(BR)) {
    const d = T[BR[k].descent];
    trajGroup.add(mkLine(d.pts(ex), { color: DESC_COLOR[k], width: k === b ? 2.4 : 1.6, dashed: true, opacity: k === b ? 1 : 0.4 }));
  }
  // ground tracks
  gtGroup.add(mkLine(NOM.pts(ex, 0, NOM.n - 1, true), { color: C.white, width: 1, opacity: 0.22 }));
  gtGroup.add(mkLine(T[BR[b].descent].pts(ex, 0, T[BR[b].descent].n - 1, true), { color: DESC_COLOR[b], width: 1, opacity: 0.35 }));
  // flown trail of the selected profile: nominal up to the switch point, then its descent
  const iSw = Math.floor(BR[b].switch / NOM.dt + 1e-6);
  const flat = NOM.pts(ex, 0, iSw).concat(T[BR[b].descent].pts(ex));
  trailNomCount = iSw + 1;
  pathFlat = flat; trailKey = '';
  trail = mkLine(flat.slice(0, 6), { color: C.white, width: 1.3, opacity: 0.95 });
  trajGroup.add(trail);
  // event markers and labels
  for (const e of data.events) {
    if (!e.ship || !e.major || !e.branches.includes(b) || e.met === 0) continue;   // liftoff is labelled by the Starbase marker
    const s = shipAt(e.met, b), r = 1 + s.alt * ex / RE, p = s.u.map((v) => v * r);
    const m = mkSprite(evTex, 0.016); m.position.set(...p); evGroup.add(m);
    const txt = (SHORT[e.label] || e.label.replace(' (model)', '')) + `<br><span class="dim">${A.fmtMET(e.met)}</span>`;
    const o = mkLabel(txt, 'small'); o.position.set(...p); o.userData.kind = 'event'; evGroup.add(o);
  }
}

// ship marker, drop line, 15-degree visibility circle
const ship = mkSprite(spriteTex((g, s) => {
  const c = s / 2, gr = g.createRadialGradient(c, c, 0, c, c, c);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(79,195,247,.9)'); gr.addColorStop(1, 'rgba(79,195,247,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
}), 0.042);
ship.material.depthTest = true; ship.renderOrder = 5; scene.add(ship);
const shipLabel = mkLabel('Starship', '', '#ffffff'); shipLabel.userData.kind = 'ship'; scene.add(shipLabel);
const dropGeom = new THREE.BufferGeometry(); dropGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const drop = new THREE.Line(dropGeom, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
scene.add(drop);
let fpLine = null, fpLam = -1;
function updateFootprint(u, alt) {
  const lam = A.footprintDeg(alt, 15);
  if (!fpLine || Math.abs(lam - fpLam) > 0.02) {
    if (fpLine) { scene.remove(fpLine); fpLine.geometry.dispose(); lineMats.splice(lineMats.indexOf(fpLine.material), 1); fpLine.material.dispose(); }
    fpLine = mkLine(circlePts(lam, 1.0018, 180), { color: C.sun, width: 1.4, dashed: true, dash: 0.01, gap: 0.007 });
    scene.add(fpLine); fpLam = lam;
  }
  fpLine.quaternion.setFromUnitVectors(Y, new THREE.Vector3(...u));
  fpLine.visible = state.show.fp && alt > 1;
}

// ---------------------------------------------------------------- sky chart pop-up for China cities
const BURN_LABEL = { planned: 'deorbit burn', cont_npac: 'contingency burn', cont_indian: 'insertion skipped' };
const sky = createSkyChart({
  shipAt, branchEnd, fmtMET: A.fmtMET,
  branchInfo: (b) => ({ switch: BR[b].switch, color: DESC_COLOR[b], burnLabel: BURN_LABEL[b] }),
  getState: () => ({ met: Math.max(metMin, Math.min(metMax(), state.met)), t0ms: t0ms(), branch: state.branch }),
  onJump: (met) => { setPlaying(false); setMet(met); },
});
let skyCity = null;
function openSky(c) { skyCity = c[0]; sky.open(c); }

// ---------------------------------------------------------------- camera views
const VIEWS = [['Global', -40, 12, 3.6], ['Starbase', -88, 22, 1.75], ['Indian Ocean', 82, -22, 1.9],
               ['N Pacific', -178, 29, 1.95], ['China / Tibet', 95, 28, 1.9], ['W of Chile', -118, -27, 1.95]];
let fly = null;
function flyTo(lon, lat, dist) {
  setFollow(false);
  fly = { from: camera.position.clone(), to: new THREE.Vector3(...A.llToVec(lon, lat, dist)), t0: performance.now(), dur: 1300 };
}
function setFollow(on) { state.follow = on; $('o-follow').checked = on; }

// ---------------------------------------------------------------- UI
const allDates = [M.date, ...M.alternates];
$('date').innerHTML = allDates.map((d, i) => `<option value="${d}">${d}${i ? '  (alternate)' : '  (primary)'}</option>`).join('');
$('date').value = state.date;
Object.assign($('t0'), { min: A.parseHM(M.t0_min), max: A.parseHM(M.t0_max), value: state.t0 });
$('t0presets').innerHTML = M.t0_presets.map((p) => `<button class="btn" data-t0="${p}">${p}Z</button>`).join('');
$('branch').innerHTML = Object.entries(BR).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
$('branch').value = state.branch;
$('views').innerHTML = VIEWS.map((v, i) => `<button class="btn" data-view="${i}">${v[0]}</button>`).join('');
$('exag').value = state.exag;
for (const [k, id] of [['term', 'o-term'], ['zones', 'o-zones'], ['labels', 'o-labels'], ['gt', 'o-gt'], ['fp', 'o-fp'], ['grid', 'o-grid'], ['lights', 'o-lights'], ['cities', 'o-cities']]) {
  $(id).checked = state.show[k];
  $(id).addEventListener('change', () => { state.show[k] = $(id).checked; if (k === 'zones' || k === 'grid') drawOverlay(); dirty(); });
}
$('o-follow').checked = state.follow;
$('o-follow').addEventListener('change', () => setFollow($('o-follow').checked));

function setLive(on) {
  state.live = on; $('live').classList.toggle('on', on);
  if (on) { setPlaying(false); }
}
function setPlaying(on) {
  if (on && state.live) setLive(false);
  if (on && state.met >= metMax()) state.met = metMin;
  state.playing = on; $('play').textContent = on ? '❚❚ Pause' : '▶ Play';
}
function setMet(v) { state.met = Math.max(metMin, Math.min(metMax(), v)); if (state.live) setLive(false); dirty(); }
function updateMetRange() { Object.assign($('met'), { min: metMin, max: metMax() }); }
updateMetRange();

let tablesDirty = true;
const dirty = () => { tablesDirty = true; };
$('date').addEventListener('change', () => { state.date = $('date').value; dirty(); });
$('t0').addEventListener('input', () => { state.t0 = +$('t0').value; dirty(); });
$('t0presets').addEventListener('click', (e) => { const p = e.target.dataset.t0; if (p) { state.t0 = A.parseHM(p); $('t0').value = state.t0; dirty(); } });
$('branch').addEventListener('change', () => { state.branch = $('branch').value; updateMetRange(); setMet(state.met); buildTrajectory(); dirty(); });
$('met').addEventListener('input', () => { setPlaying(false); setMet(+$('met').value); });
$('play').addEventListener('click', () => setPlaying(!state.playing));
$('speed').addEventListener('change', () => { state.speed = +$('speed').value; });
$('live').addEventListener('click', () => setLive(!state.live));
$('back').addEventListener('click', () => setMet(state.met - 60));
$('fwd').addEventListener('click', () => setMet(state.met + 60));
$('views').addEventListener('click', (e) => { const i = e.target.dataset.view; if (i != null) { const v = VIEWS[+i]; flyTo(v[1], v[2], v[3]); } });
$('exag').addEventListener('input', () => { state.exag = +$('exag').value; $('exagv').textContent = '×' + state.exag; buildTrajectory(); });
$('exagv').textContent = '×' + state.exag;
$('events').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-met]'); if (tr) { setPlaying(false); setMet(+tr.dataset.met); } });
async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  const old = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = old), 1200);
}
$('copytle').addEventListener('click', () => copyText($('tle').textContent, $('copytle')));
$('link').addEventListener('click', () => {
  const ll = A.vecToLL(camera.position.x, camera.position.y, camera.position.z);
  const q = new URLSearchParams({ date: state.date, t0: A.fmtHMS(state.t0 * 1000).slice(0, 5), met: A.fmtMET(state.met).slice(2).replace('−', '-'),
    br: state.branch, cam: `${ll.lon.toFixed(1)},${ll.lat.toFixed(1)},${camera.position.length().toFixed(2)}` });
  if (state.exag !== 1) q.set('exag', state.exag);
  if (state.follow) q.set('follow', '1');
  if (skyCity) q.set('sky', skyCity);
  copyText(`${location.origin}${location.pathname}?${q}`, $('link'));
});
document.querySelectorAll('.tog').forEach((b) => b.addEventListener('click', () => {
  const p = $(b.dataset.panel), open = !p.classList.contains('open');
  document.querySelectorAll('.panel').forEach((x) => x.classList.remove('open'));
  p.classList.toggle('open', open);
}));
renderer.domElement.addEventListener('pointerdown', () => { if (state.follow) setFollow(false); fly = null; });
addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'SELECT' || (tag === 'INPUT' && document.activeElement.type !== 'checkbox')) return;
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!state.playing); }
  else if (e.key === 'ArrowRight') setMet(state.met + (e.shiftKey ? 600 : 60));
  else if (e.key === 'ArrowLeft') setMet(state.met - (e.shiftKey ? 600 : 60));
});
$('about').innerHTML = [...M.notes,
  'Hazard zones: NAVAREA IV 922/26 (launch), HYDROPAC 2751/26 (Indian Ocean), NAVAREA XII 657/26 = HYDROPAC 2761/26 (North Pacific), HYDROPAC 2750/26 (South Pacific W of Chile), all daily 28 Sep – 4 Oct 2026.',
  'Event times are the official flight timeline; positions of contingency events come from the model.',
  `Model: i = ${M.inc.toFixed(2)}°, h = ${M.h_orbit} km, nodal period ${M.T_nodal_min.toFixed(2)} min, deorbit Δv ${M.dv_deorbit_ms} m/s.`].map((t) => `<p>${t}</p>`).join('');

// ---------------------------------------------------------------- tables
const hazardRows = [['launchA', null], ['indian', 'cont_indian'], ['npac', 'cont_npac'], ['chile', 'planned']];
function buildTables() {
  const T0 = t0ms(), b = state.branch;
  // hazard windows
  $('hazard').querySelector('tbody').innerHTML = hazardRows.map(([k]) => {
    const z = data.zones.find((q) => q.key === k), [w0, w1] = A.hazardWindow(state.date, z.t0, z.t1);
    const c0 = k === 'launchA' ? T0 : T0 + z.cross[0] * 1000, c1 = k === 'launchA' ? T0 : T0 + z.cross[1] * 1000;
    const ok = c0 >= w0 && c1 <= w1;
    const cross = k === 'launchA' ? `T0 ${A.fmtHMS(T0).slice(0, 5)}` : `${A.fmtHMS(c0).slice(0, 5)}–${A.fmtHMS(c1).slice(0, 5)}`;
    const name = { launchA: 'Launch', indian: 'Indian Oc.', npac: 'N Pacific', chile: 'W of Chile' }[k];
    return `<tr title="${z.id}: ${z.desc}"><td><span class="sw" style="background:${z.color}"></span>${name}</td><td>${z.t0}–${z.t1}Z</td><td>${cross}</td><td class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗ outside'}</td></tr>`;
  }).join('');
  $('hazardnote').textContent = 'Crossing is the model entry and exit of each zone on the profile that uses it; the launch row checks T0 against the launch warning.';
  // events
  $('events').querySelector('tbody').innerHTML = data.events.filter((e) => e.branches.includes(b)).map((e) =>
    `<tr data-met="${e.met}"><td class="t">${A.fmtMET(e.met)}</td><td class="t">${A.fmtHMS(T0 + e.met * 1000)}</td><td>${e.official ? e.label : `<span class="dim">${e.label}</span>`}</td></tr>`).join('');
  // TLE
  const tle = A.tleForT0(data.tle_ref, T0);
  $('tle').textContent = `${tle.name}\n${tle.l1}\n${tle.l2}`;
  $('t0v').textContent = A.fmtHMS(T0).slice(0, 5) + 'Z';
  document.querySelectorAll('#t0presets .btn').forEach((x) => x.classList.toggle('on', A.parseHM(x.dataset.t0) === state.t0));
  tablesDirty = false;
}

function updateUI(s, sunVec) {
  const T0 = t0ms(), utc = T0 + state.met * 1000, b = state.branch;
  $('c-date').textContent = A.fmtDate(utc); $('c-utc').textContent = A.fmtHMS(utc);
  $('c-met').textContent = A.fmtMET(state.met); $('c-cst').textContent = A.fmtHMS(utc, 8);
  if (document.activeElement !== $('met')) $('met').value = state.met;
  if (tablesDirty) buildTables();
  // next event
  const evs = data.events.filter((e) => e.branches.includes(b));
  const next = evs.find((e) => e.met > state.met);
  document.querySelectorAll('#events tbody tr').forEach((tr) => {
    const m = +tr.dataset.met; tr.classList.toggle('past', m <= state.met); tr.classList.toggle('next', next && m === next.met);
  });
  // status
  const ll = A.vecToLL(...s.u), sunAlt = A.sunAltDeg(sunVec, s.u), lim = A.shadowLimitDeg(s.alt);
  const sunlit = s.alt > 1 ? (sunAlt > lim ? 'in sunlight' : 'in Earth shadow') : (sunAlt > 0 ? 'in sunlight' : 'in darkness');
  const a = shipAt(state.met - 5, b), c = shipAt(state.met + 5, b);
  const pa = a.u.map((v) => v * (RE + a.alt)), pc = c.u.map((v) => v * (RE + c.alt));
  const vef = pc.map((v, i) => (v - pa[i]) / 10), w = 7.2921159e-5, r = s.u.map((v) => v * (RE + s.alt));
  const vin = [vef[0] + w * r[2], vef[1], vef[2] - w * r[0]];
  const speed = state.met > 0 && state.met < metMax() ? `${Math.hypot(...vin).toFixed(2)} km/s inertial` : '—';
  const latS = `${Math.abs(ll.lat).toFixed(2)}°${ll.lat >= 0 ? 'N' : 'S'}`, lonS = `${Math.abs(ll.lon).toFixed(2)}°${ll.lon >= 0 ? 'E' : 'W'}`;
  const phase = phaseOf(state.met, b);
  const rows = [['UTC', `${A.fmtDate(utc)} ${A.fmtHMS(utc)}Z`], ['China (CST)', A.fmtHMS(utc, 8)], ['MET', A.fmtMET(state.met)], ['Phase', phase],
    ['Sub-point', `${latS} ${lonS}`], ['Altitude', `${s.alt.toFixed(1)} km`], ['Speed', speed],
    ['Ship', sunlit], ['Ground below', `${A.lightingClass(sunAlt)} (Sun ${sunAlt.toFixed(1)}°)`],
    ['Seen ≥15° within', s.alt > 1 ? `${(A.footprintDeg(s.alt, 15) * 111.195).toFixed(0)} km` : '—'],
    ['Next event', next ? `${next.label.replace(' (model)', '')} in ${A.fmtMET(next.met - state.met).slice(2)}` : '—']];
  $('status').querySelector('tbody').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  $('hud').innerHTML = `<div class="hl"><b>STARSHIP IFT-14</b>  first orbital flight · i = ${M.inc.toFixed(2)}°  h = ${M.h_orbit} km  period ${M.T_nodal_min.toFixed(2)} min</div>` +
    `<div>T0 ${state.date} ${A.fmtHMS(T0)}Z   <b>${A.fmtMET(state.met)}</b>   ${phase}</div>` +
    `<div>${latS} ${lonS}  alt ${s.alt.toFixed(0)} km  ·  ship ${sunlit}  ·  ground ${A.lightingClass(sunAlt)}</div>`;
}

// ---------------------------------------------------------------- per-frame scene update
const tmpV = new THREE.Vector3(), camDir = new THREE.Vector3();
function isVisible(p) { return p.dot(camera.position) > 1.0 + 0.002; }   // horizon test for points on or above the unit sphere
function frame(now) {
  const dt = Math.min(0.1, (now - (frame.last ?? now)) / 1000); frame.last = now;
  if (state.live) state.met = (Date.now() - t0ms()) / 1000;
  else if (state.playing) { state.met += dt * state.speed; if (state.met >= metMax()) { state.met = metMax(); setPlaying(false); } }
  const metC = Math.max(metMin, Math.min(metMax(), state.met));
  const utc = t0ms() + state.met * 1000;
  // Sun
  const ss = A.sunSubpoint(utc), sunVec = A.llToVec(ss.lon, ss.lat);
  earthMat.uniforms.sunDir.value.set(...sunVec); earthMat.uniforms.lights.value = state.show.lights ? 1 : 0;
  tmpV.set(...sunVec); termGroup.quaternion.setFromUnitVectors(Y, tmpV); termGroup.visible = state.show.term;
  sunSprite.position.set(...sunVec.map((v) => v * 1.004)); sunSprite.visible = isVisible(sunSprite.position);
  // ship
  const s = shipAt(metC, state.branch), rr = 1 + s.alt * state.exag / RE;
  ship.position.set(...s.u.map((v) => v * rr)); shipLabel.position.copy(ship.position);
  const dp = dropGeom.attributes.position; dp.setXYZ(0, ...s.u.map((v) => v * rr)); dp.setXYZ(1, ...s.u.map((v) => v * 1.001)); dp.needsUpdate = true;
  updateFootprint(s.u, s.alt);
  if (trail) {
    let n = metC <= 0 ? 0 : Math.min(trailNomCount, Math.floor(metC / NOM.dt) + 1);
    const B = BR[state.branch];
    if (metC > B.switch) n = trailNomCount + Math.min(T[B.descent].n, Math.floor((metC - B.switch) / NOM.dt) + 1);
    const key = `${n}|${Math.round(now / 250)}`;
    if (key !== trailKey) {
      trailKey = key;
      const i0 = Math.max(0, n - TRAIL_PTS), seg = pathFlat.slice(3 * i0, 3 * n);
      seg.push(ship.position.x, ship.position.y, ship.position.z);
      trail.visible = seg.length >= 6;
      if (trail.visible) { const g = new LineGeometry(); g.setPositions(seg); trail.geometry.dispose(); trail.geometry = g; }
    }
  }
  gtGroup.visible = state.show.gt; zoneGroup.visible = state.show.labels; zoneLines.visible = state.show.zones;
  // camera
  if (fly) {
    const k = Math.min(1, (now - fly.t0) / fly.dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    const d = fly.from.length() * (1 - e) + fly.to.length() * e;
    camDir.copy(fly.from).normalize().lerp(tmpV.copy(fly.to).normalize(), e).normalize();
    camera.position.copy(camDir.multiplyScalar(d)); if (k >= 1) fly = null;
  } else if (state.follow) {
    const d = camera.position.length();
    camDir.copy(camera.position).normalize().lerp(tmpV.set(...s.u), 1 - Math.exp(-dt * 2.5)).normalize();
    camera.position.copy(camDir.multiplyScalar(d));
  }
  controls.rotateSpeed = Math.min(1, 0.12 + 0.3 * (camera.position.length() - 1));
  controls.update();
  // label visibility (behind the globe or switched off)
  for (const g of [zoneGroup, evGroup]) for (const o of g.children) if (o.isCSS2DObject) o.visible = state.show.labels && isVisible(o.position);
  for (const o of evGroup.children) if (o.isSprite) o.visible = true;
  shipLabel.visible = state.show.labels && isVisible(ship.position);
  cityGroup.visible = state.show.cities;
  if (state.show.cities) {
    const d = camera.position.length();
    for (const o of cityGroup.children) {
      const vis = isVisible(o.position);
      o.visible = o.isCSS2DObject ? vis && state.show.labels && d < CITY_ZOOM[o.userData.tier] : vis && d < 3.6;
    }
  }
  renderer.render(scene, camera); labels.render(scene, camera);
  if (sky.isOpen()) sky.render(); else skyCity = null;
  if (now - (frame.ui ?? 0) > 100) { frame.ui = now; updateUI(s, sunVec); }
  requestAnimationFrame(frame);
}

function onResize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h); labels.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  for (const m of lineMats) m.resolution.set(w, h);
}
addEventListener('resize', onResize);
onResize();

// initial camera: URL cam=lon,lat,dist or a view that shows the Gulf, Atlantic and Africa
{
  const cam = (qs.get('cam') || '').split(',').map(Number);
  const [lon, lat, dist] = cam.length === 3 && cam.every(Number.isFinite) ? cam : [-40, 12, 3.6];
  camera.position.set(...A.llToVec(lon, lat, dist)); camera.lookAt(0, 0, 0);
}
buildTrajectory();
requestAnimationFrame((t) => { frame(t); $('loading').remove(); });
{
  const want = (qs.get('sky') || '').toLowerCase();
  const c = CHINA_CITIES.find((x) => x[0].toLowerCase() === want);
  if (c) openSky(c);
}
window.__ift14 = { state, setMet, flyTo, camera,    // for debugging and automated tests
  cityScreen: (name) => { const k = cityPos.find((x) => x.c[0] === name); if (!k) return null; const r = renderer.domElement.getBoundingClientRect(), v = k.pos.clone().project(camera);
    return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top }; } };

// sharper day texture once the page is up, where the GPU allows 8k textures
if (renderer.capabilities.maxTextureSize >= 8192) {
  loadTex('./tex/earth_day_8k.jpg').then((t) => { earthMat.uniforms.dayTex.value = t; dayTex.dispose(); window.__ift14.hires = true; }).catch(() => {});
}
