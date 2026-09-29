// Pure helpers shared by the page and the Node tests: Sun position, frames, time formatting, hazard windows, TLEs.
export const RE = 6378.137;
export const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);

// Low-precision solar position (Astronomical Almanac), same formula as the Python maps. Returns sub-solar lon/lat (deg).
export function sunSubpoint(ms) {
  const jd = (ms - J2000) / 86400000;
  const g = ((357.529 + 0.98560028 * jd) % 360) * D2R;
  const q = (280.459 + 0.98564736 * jd) % 360;
  const L = ((q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) % 360) * D2R;
  const eps = (23.439 - 0.00000036 * jd) * D2R;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(L), Math.cos(L)) * R2D;
  const dec = Math.asin(Math.sin(eps) * Math.sin(L)) * R2D;
  const gmst = (280.46061837 + 360.98564736629 * jd) % 360;
  return { lon: (((ra - gmst + 540) % 360) + 360) % 360 - 180, lat: dec };
}

// Earth-fixed frame used by the scene (three.js is Y-up): x = lon 0, y = north pole, z = lon 90W.
export function llToVec(lon, lat, r = 1) {
  const cl = Math.cos(lat * D2R);
  return [r * cl * Math.cos(lon * D2R), r * Math.sin(lat * D2R), -r * cl * Math.sin(lon * D2R)];
}
export function vecToLL(x, y, z) {
  const r = Math.hypot(x, y, z);
  return { lon: Math.atan2(-z, x) * R2D, lat: Math.asin(y / r) * R2D };
}
export function sunAltDeg(sunVec, u) {
  return Math.asin(Math.max(-1, Math.min(1, sunVec[0] * u[0] + sunVec[1] * u[1] + sunVec[2] * u[2]))) * R2D;
}
export function lightingClass(altDeg) {
  if (altDeg >= 0) return 'day';
  if (altDeg >= -6) return 'civil twilight';
  if (altDeg >= -12) return 'nautical twilight';
  if (altDeg >= -18) return 'astronomical twilight';
  return 'night';
}
// Sun elevation at the sub-point below which a spacecraft at altitude h (km) is in Earth's shadow.
export function shadowLimitDeg(hKm) { return -Math.acos(RE / (RE + Math.max(0, hKm))) * R2D; }
// Ground radius (deg of arc) from which a spacecraft at h km is seen above elevation e (deg).
export function footprintDeg(hKm, elevDeg) {
  const e = elevDeg * D2R;
  return (Math.acos(RE * Math.cos(e) / (RE + Math.max(0, hKm))) - e) * R2D;
}

const p2 = (n) => String(n).padStart(2, '0');
export function fmtMET(s) {
  const sign = s < 0 ? '−' : '+';
  let a = Math.round(Math.abs(s));
  return `T${sign}${p2(Math.floor(a / 3600))}:${p2(Math.floor(a % 3600 / 60))}:${p2(a % 60)}`;
}
export function fmtHMS(ms, offsetH = 0) {
  const d = new Date(Math.round(ms / 1000) * 1000 + offsetH * 3600000);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}
export function fmtDate(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}
export function dateT0ms(dateStr, t0Sec) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) + t0Sec * 1000;
}
export function parseHM(s) { const [h, m, sec = 0] = s.split(':').map(Number); return h * 3600 + m * 60 + sec; }

// Published daily hazard window "HHMMZ TO HHMMZ" on a given date; an end earlier than the start runs past midnight.
export function hazardWindow(dateStr, t0, t1) {
  const day = dateT0ms(dateStr, 0);
  const a = day + (parseInt(t0.slice(0, 2)) * 3600 + parseInt(t0.slice(2)) * 60) * 1000;
  let b = day + (parseInt(t1.slice(0, 2)) * 3600 + parseInt(t1.slice(2)) * 60) * 1000;
  if (b <= a) b += 86400000;
  return [a, b];
}

// ---- TLEs: the reference set is the SGP4 fit for T0 = 28 Sep 12:15Z. The Earth-fixed track is the same for any T0,
// so a later launch only moves the epoch and advances RAAN at the sidereal rate.
export function tleChecksum(line) {
  let s = 0;
  for (const c of line.slice(0, 68)) s += c === '-' ? 1 : (c >= '0' && c <= '9' ? +c : 0);
  return String(s % 10);
}
export function tleEpochMs(l1) {
  const yy = +l1.slice(18, 20), doy = parseFloat(l1.slice(20, 32));
  return Date.UTC(2000 + yy, 0, 1) + (doy - 1) * 86400000;
}
export function tleEpochString(ms) {
  const d = new Date(ms), y = d.getUTCFullYear(), y0 = Date.UTC(y, 0, 1);
  const secs = Math.round((ms - y0) / 1000), doy = Math.floor(secs / 86400) + 1;   // integer seconds: no float drift
  let frac = ((secs % 86400) / 86400).toFixed(8);
  if (frac.startsWith('1')) frac = '0.99999999';   // never round into the next day
  return `${String(y % 100).padStart(2, '0')}${String(doy).padStart(3, '0')}${frac.slice(1)}`;
}
export function tleForT0(ref, t0ms, satnum = null) {
  const dtMin = (t0ms - Date.parse(ref.t0)) / 60000;
  const epoch = tleEpochMs(ref.l1) + dtMin * 60000;
  const raan = ((parseFloat(ref.l2.slice(17, 25)) + ref.raan_rate_deg_per_min * dtMin) % 360 + 360) % 360;
  let l1 = ref.l1.slice(0, 18) + tleEpochString(epoch) + ref.l1.slice(32, 68);
  let l2 = ref.l2.slice(0, 17) + raan.toFixed(4).padStart(8) + ref.l2.slice(25, 68);
  if (satnum !== null) { const n = String(satnum).padStart(5); l1 = l1.slice(0, 2) + n + l1.slice(7); l2 = l2.slice(0, 2) + n + l2.slice(7); }
  const d = new Date(t0ms), mon = d.toLocaleString('en', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  const name = `STARSHIP IFT-14 T0 ${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}Z ${p2(d.getUTCDate())}${mon} (zone fit)`;
  return { name, l1: l1 + tleChecksum(l1), l2: l2 + tleChecksum(l2), epoch };
}

// ---- sky-chart helpers (topocentric look angles, sidereal time, Moon, Earth shadow) ----
const jdDays = (ms) => (ms - J2000) / 86400000;             // days from J2000.0
export function gmstRad(ms) { return (((280.46061837 + 360.98564736629 * jdDays(ms)) % 360) + 360) % 360 * D2R; }

// Sub-lunar point, ~0.3 deg (truncated ELP series, same as SatObserver-MX)
export function moonSubpoint(ms) {
  const T = jdDays(ms) / 36525, r = (d) => (d % 360) * D2R;
  const Lp = r(218.316 + 481267.8813 * T), M = r(357.529 + 35999.0503 * T), Mp = r(134.963 + 477198.8676 * T);
  const Dm = r(297.850 + 445267.1115 * T), F = r(93.272 + 483202.0175 * T);
  const lam = Lp + D2R * (6.289 * Math.sin(Mp) - 1.274 * Math.sin(Mp - 2 * Dm) + 0.658 * Math.sin(2 * Dm)
    + 0.214 * Math.sin(2 * Mp) - 0.186 * Math.sin(M) - 0.114 * Math.sin(2 * F));
  const bet = D2R * (5.128 * Math.sin(F) + 0.280 * Math.sin(Mp + F) + 0.277 * Math.sin(Mp - F) + 0.173 * Math.sin(2 * Dm - F));
  const eps = (23.439 - 0.013 * T) * D2R;
  const ra = Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(bet) * Math.sin(eps), Math.cos(lam));
  const dec = Math.asin(Math.sin(bet) * Math.cos(eps) + Math.cos(bet) * Math.sin(eps) * Math.sin(lam));
  let lon = (ra - gmstRad(ms)) * R2D; lon = ((lon + 180) % 360 + 360) % 360 - 180;
  return { lon, lat: dec * R2D };
}

// RA/Dec (deg) -> alt/az (deg) for a site with local sidereal time lstRad
export function raDecToAltAz(raDeg, decDeg, lstRad, sinLat, cosLat) {
  const H = lstRad - raDeg * D2R, sd = Math.sin(decDeg * D2R), cd = Math.cos(decDeg * D2R), cH = Math.cos(H), sH = Math.sin(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinLat * sd + cosLat * cd * cH)));
  let az = Math.atan2(-cd * sH, sd * cosLat - cd * sinLat * cH) * R2D;
  if (az < 0) az += 360;
  return { alt: alt * R2D, az };
}

// WGS-84 ellipsoid (scene frame: y = polar axis, x = lon 0, z = lon 90W)
export const WGS84_E2 = 0.00669437999014, WGS84_B = RE * Math.sqrt(1 - 0.00669437999014);
export const geocLat = (latDeg) => Math.atan((1 - WGS84_E2) * Math.tan(latDeg * D2R)) * R2D;   // surface point: geodetic -> geocentric
export const geocUnit = (lon, latDeg) => llToVec(lon, geocLat(latDeg));                         // true direction of a track point
// Observer on the WGS-84 ellipsoid at geodetic lat/lon and height hKm: position P (km) and the local
// east / north / up unit vectors, "up" being the ellipsoid normal (the astronomical vertical).
// Point at geodetic lon/lat and height hKm above the WGS-84 ellipsoid, in the scene frame (km).
export function geodeticToScene(lon, lat, hKm) {
  const l = lon * D2R, p = lat * D2R, Nr = RE / Math.sqrt(1 - WGS84_E2 * Math.sin(p) ** 2);
  return [(Nr + hKm) * Math.cos(p) * Math.cos(l), (Nr * (1 - WGS84_E2) + hKm) * Math.sin(p), -(Nr + hKm) * Math.cos(p) * Math.sin(l)];
}
export function siteFrame(lon, lat, hKm = 0) {
  const l = lon * D2R, p = lat * D2R, Nr = RE / Math.sqrt(1 - WGS84_E2 * Math.sin(p) ** 2);
  const P = [(Nr + hKm) * Math.cos(p) * Math.cos(l), (Nr * (1 - WGS84_E2) + hKm) * Math.sin(p), -(Nr + hKm) * Math.cos(p) * Math.sin(l)];
  const U = llToVec(lon, lat);
  const E = [-Math.sin(l), 0, -Math.cos(l)];
  const N = [-Math.sin(p) * Math.cos(l), Math.cos(p), Math.sin(p) * Math.sin(l)];
  return { P, U, E, N };
}
// Look angles from a site (frame from siteFrame) to a spacecraft at scene-frame position P (km, geodeticToScene).
export function lookAngles(fr, P) {
  const d = [P[0] - fr.P[0], P[1] - fr.P[1], P[2] - fr.P[2]];
  const rng = Math.hypot(d[0], d[1], d[2]);
  const up = (d[0] * fr.U[0] + d[1] * fr.U[1] + d[2] * fr.U[2]) / rng;
  const e = d[0] * fr.E[0] + d[1] * fr.E[1] + d[2] * fr.E[2], n = d[0] * fr.N[0] + d[1] * fr.N[1] + d[2] * fr.N[2];
  let az = Math.atan2(e, n) * R2D; if (az < 0) az += 360;
  return { az, el: Math.asin(Math.max(-1, Math.min(1, up))) * R2D, rng };
}
// Direction (alt/az) of a body whose sub-point is `sub`, seen from a site (no parallax).
export function altAzOfSubpoint(fr, sub) {
  const v = llToVec(sub.lon, sub.lat);
  const up = v[0] * fr.U[0] + v[1] * fr.U[1] + v[2] * fr.U[2];
  let az = Math.atan2(v[0] * fr.E[0] + v[1] * fr.E[1] + v[2] * fr.E[2], v[0] * fr.N[0] + v[1] * fr.N[1] + v[2] * fr.N[2]) * R2D;
  if (az < 0) az += 360;
  return { alt: Math.asin(Math.max(-1, Math.min(1, up))) * R2D, az };
}
// Fraction of the solar disc visible from a spacecraft at geocentric unit vector u, altitude hKm:
// 1 = full sunlight, 0 = umbra, in between = penumbra. The WGS-84 ellipsoid is handled by stretching the
// polar axis by a/b (the ellipsoid becomes a sphere of radius a); the Sun is a disc of radius 0.2666 deg
// and the Earth's limb is treated as straight across it. No atmosphere.
const SUN_R = 0.2666 * D2R;
export function litFraction(P, sunVec) {
  const k = RE / WGS84_B;
  const x = P[0], y = P[1] * k, z = P[2];
  let sx = sunVec[0], sy = sunVec[1] * k, sz = sunVec[2]; const sn = Math.hypot(sx, sy, sz); sx /= sn; sy /= sn; sz /= sn;
  const d = Math.hypot(x, y, z);
  const rhoE = Math.asin(Math.min(1, RE / d));                                         // Earth's angular radius
  const theta = Math.acos(Math.max(-1, Math.min(1, -(x * sx + y * sy + z * sz) / d))); // Sun to Earth-centre angle
  const g = theta - rhoE;                                                              // Sun centre above the limb
  if (g >= SUN_R) return 1;
  if (g <= -SUN_R) return 0;
  const seg = SUN_R * SUN_R * Math.acos(g / SUN_R) - g * Math.sqrt(SUN_R * SUN_R - g * g); // disc part below the limb
  return 1 - seg / (Math.PI * SUN_R * SUN_R);
}
export const sunlit = (P, sunVec) => litFraction(P, sunVec) >= 0.5;
