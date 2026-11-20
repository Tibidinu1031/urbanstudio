/* Program, disponibilitate și calculul orelor libere.
   Orele libere = programul fiecărui frizer (setat din panou) minus programările existente. */
import { SALON, CONFIG } from './data.js';
import { fmt } from './lib.js';
import { Api, defaultSchedule } from './api.js';

export const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
export const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/* programul general al salonului (pentru „Deschis acum”) */
export function hoursFor(date) {
  const h = SALON.hours[date.getDay()];
  return h ? { open: toMin(h[0]), close: toMin(h[1]) } : null;
}

export function openStatus(now = new Date()) {
  const m = now.getHours() * 60 + now.getMinutes();
  const h = hoursFor(now);
  if (h && m >= h.open && m < h.close) {
    const left = h.close - m;
    return { open: true, text: 'Deschis acum', sub: left <= 60 ? `închidem la ${toTime(h.close)}` : `până la ${toTime(h.close)}` };
  }
  for (let i = 0; i < 8; i++) {
    const d = fmt.addDays(now, i);
    const hh = hoursFor(d);
    if (!hh) continue;
    if (i === 0 && m >= hh.open) continue;
    const when = i === 0 ? 'azi' : i === 1 ? 'mâine' : fmt.dow(d);
    return { open: false, text: 'Închis acum', sub: `deschidem ${when} la ${toTime(hh.open)}` };
  }
  return { open: false, text: 'Închis', sub: '' };
}

/* intervalele de lucru ale unui frizer într-o zi, în minute */
export function barberIntervals(barber, date) {
  if (!barber) return [];
  const s = barber.schedule || defaultSchedule();
  const iso = fmt.iso(date);
  const list = s.days && Object.prototype.hasOwnProperty.call(s.days, iso) ? s.days[iso] : (s.week?.[date.getDay()] || []);
  return (list || []).map(([a, b]) => [toMin(a), toMin(b)]).filter(([a, b]) => b > a);
}

const pool = (barberId) => (barberId === 'any' || !barberId ? Api.barbers() : [Api.barber(barberId)].filter(Boolean));

/* lucrează cineva (sau frizerul ales) în ziua asta? */
export function worksOn(date, barberId) {
  return pool(barberId).some((b) => barberIntervals(b, date).length > 0);
}

const overlaps = (blocks, a, b) => blocks.some(([x, y]) => a < y && b > x);

/* grila de intervale (implicit 45 de minute de la 08:30): începuturile, în minute */
export function gridSlots() {
  const out = [];
  const end = toMin(CONFIG.slotEnd || '21:15');
  for (let t = toMin(CONFIG.slotStart || '08:30'); t + CONFIG.slotStep <= end; t += CONFIG.slotStep) out.push(t);
  return out;
}

/* ---------- matematică pe intervale (în minute) ---------- */
export function normalize(iv) {
  const s = iv.filter(([a, b]) => b > a).map(([a, b]) => [a, b]).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
export const union = (iv, a, b) => normalize([...iv, [a, b]]);
export function subtract(iv, a, b) {
  const out = [];
  for (const [x, y] of iv) {
    if (b <= x || a >= y) { out.push([x, y]); continue; }
    if (x < a) out.push([x, a]);
    if (b < y) out.push([b, y]);
  }
  return normalize(out);
}
export const coverage = (iv, a, b) => iv.reduce((s, [x, y]) => s + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);
export const totalMinutes = (iv) => normalize(iv).reduce((s, [a, b]) => s + b - a, 0);
export const toTimes = (iv) => normalize(iv).map(([a, b]) => [toTime(a), toTime(b)]);

/* intervalele bifate (începuturi în minute) → intervale continue [['08:30','10:00'], ...] */
export function mergeSlots(starts) {
  return toTimes(starts.map((t) => [t, t + CONFIG.slotStep]));
}

/* Clienții pot începe pe orice sfert de oră liber din intervalele deschise de frizer,
   dacă serviciul (15, 30, 45, 75 de minute...) încape întreg în interval și nu se suprapune cu altă programare. */
export function freeSlots(date, barberId, duration, { ignoreId, ignoreLead = false, barbers, busyFn } = {}) {
  const iso = fmt.iso(date);
  const now = new Date();
  const isToday = iso === fmt.iso(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const minStart = !isToday ? -1 : ignoreLead ? nowMin : nowMin + CONFIG.minLeadMinutes;
  const step = CONFIG.startStep || 15;
  const map = new Map();
  const list = barbers ? barbers.filter((b) => b.active !== false && (!barberId || barberId === 'any' || b.id === barberId)) : pool(barberId);
  for (const b of list) {
    const busy = busyFn ? busyFn(iso, b.id) : Api.busy(iso, b.id, ignoreId);
    for (const [a, c] of normalize(barberIntervals(b, date))) {
      for (let t = a; t + duration <= c; t += step) {
        if (t < minStart || overlaps(busy, t, t + duration)) continue;
        if (!map.has(t)) map.set(t, new Set());
        map.get(t).add(b.id);
      }
    }
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([t, ids]) => ({ time: toTime(t), min: t, barbers: [...ids] }));
}

export function nextAvailable(barberId = 'any', duration = 30, from = new Date()) {
  for (let i = 0; i < CONFIG.bookingDays; i++) {
    const d = fmt.addDays(from, i);
    const s = freeSlots(d, barberId, duration);
    if (s.length) return { date: d, slot: s[0] };
  }
  return null;
}

export function bookingDays(from = new Date()) {
  return Array.from({ length: CONFIG.bookingDays }, (_, i) => fmt.addDays(from, i));
}
