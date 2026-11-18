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

export function freeSlots(date, barberId, duration, { ignoreId, ignoreLead = false, barbers, busyFn } = {}) {
  const iso = fmt.iso(date);
  const now = new Date();
  const isToday = iso === fmt.iso(now);
  const minStart = isToday && !ignoreLead ? now.getHours() * 60 + now.getMinutes() + CONFIG.minLeadMinutes : -1;
  const map = new Map();
  const list = barbers ? barbers.filter((b) => !barberId || barberId === 'any' || b.id === barberId) : pool(barberId);
  for (const b of list) {
    const busy = busyFn ? busyFn(iso, b.id) : Api.busy(iso, b.id, ignoreId);
    for (const [from, to] of barberIntervals(b, date)) {
      for (let t = from; t + duration <= to; t += CONFIG.slotStep) {
        if (t < minStart || overlaps(busy, t, t + duration)) continue;
        if (!map.has(t)) map.set(t, []);
        map.get(t).push(b.id);
      }
    }
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([t, ids]) => ({ time: toTime(t), min: t, barbers: ids }));
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
