/* Program, disponibilitate și calculul orelor libere. */
import { SALON, CONFIG, BARBERS } from './data.js';
import { fmt } from './lib.js';
import { Bookings } from './store.js';

export const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

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

/* ---------- ocupare ---------- */
// Fără server: ocupare simulată, stabilă pentru fiecare zi și frizer, ca agenda să pară reală.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const simCache = new Map();
function simulatedBusy(iso, barberId, h) {
  const key = `${iso}|${barberId}`;
  if (simCache.has(key)) return simCache.get(key);
  const r = rng(hash(key));
  const load = barberId === 'adita' ? .62 : .42;
  const blocks = [];
  let t = h.open;
  while (t < h.close) {
    const len = [15, 30, 30, 45, 45, 60][Math.floor(r() * 6)];
    if (r() < load) blocks.push([t, Math.min(h.close, t + len)]);
    t += len;
  }
  simCache.set(key, blocks);
  return blocks;
}

// Cu server (Google Apps Script): intervalele ocupate reale, pe zile.
const remote = new Map(); // iso -> { barberId: [[from,to],...] }
const remotePending = new Map();
export async function loadRemote(iso) {
  if (!CONFIG.apiUrl) return null;
  if (remote.has(iso)) return remote.get(iso);
  if (remotePending.has(iso)) return remotePending.get(iso);
  const p = fetch(`${CONFIG.apiUrl}?action=busy&date=${iso}`)
    .then((r) => r.json())
    .then((data) => {
      const map = {};
      for (const it of data.busy || []) (map[it.barberId] ||= []).push([toMin(it.from), toMin(it.to)]);
      remote.set(iso, map);
      return map;
    })
    .catch(() => { remote.set(iso, {}); return {}; })
    .finally(() => remotePending.delete(iso));
  remotePending.set(iso, p);
  return p;
}
export const remoteReady = (iso) => !CONFIG.apiUrl || remote.has(iso);

function localBusy(iso, barberId, ignoreId) {
  return Bookings.list()
    .filter((b) => b.status === 'confirmed' && b.date === iso && b.barberId === barberId && b.id !== ignoreId)
    .map((b) => [toMin(b.time), toMin(b.time) + b.duration]);
}

function busyFor(iso, barberId, h, ignoreId) {
  const base = CONFIG.apiUrl ? (remote.get(iso)?.[barberId] || []) : simulatedBusy(iso, barberId, h);
  return base.concat(localBusy(iso, barberId, ignoreId));
}

const overlaps = (blocks, a, b) => blocks.some(([x, y]) => a < y && b > x);

export function freeSlots(date, barberId, duration, { ignoreId } = {}) {
  const h = hoursFor(date);
  if (!h) return [];
  const iso = fmt.iso(date);
  const now = new Date();
  const isToday = iso === fmt.iso(now);
  const minStart = isToday ? now.getHours() * 60 + now.getMinutes() + CONFIG.minLeadMinutes : -1;
  const ids = barberId === 'any' || !barberId ? BARBERS.map((b) => b.id) : [barberId];
  const busy = Object.fromEntries(ids.map((id) => [id, busyFor(iso, id, h, ignoreId)]));
  const out = [];
  for (let t = h.open; t + duration <= h.close; t += CONFIG.slotStep) {
    if (t < minStart) continue;
    const free = ids.filter((id) => !overlaps(busy[id], t, t + duration));
    if (free.length) out.push({ time: toTime(t), min: t, barbers: free });
  }
  return out;
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
