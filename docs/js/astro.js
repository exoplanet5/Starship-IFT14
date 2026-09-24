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
