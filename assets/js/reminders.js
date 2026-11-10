/* Reamintiri cu o zi înainte: calendar (.ics cu alarmă), notificări pe telefon și, opțional, email prin server. */
import { SALON, CONFIG } from './data.js';
import { Bookings } from './store.js';
import { fmt, bus, isIOS, isStandalone, toast } from './lib.js';

const DAY = 864e5;
const HOUR = 36e5;

/* Când trimitem reamintirea: cu 24h înainte; dacă programarea e mai devreme, cu 2h înainte. */
export function planReminder(startMs, now = Date.now()) {
  const day = CONFIG.reminderHours * HOUR;
  if (startMs - now > day + 5 * 6e4) return { at: startMs - day, kind: 'day' };
  if (startMs - now > 2 * HOUR + 5 * 6e4) return { at: startMs - 2 * HOUR, kind: 'hours' };
  return null;
}

export function reminderText(b) {
  const r = b.reminder;
  if (!b.remind || !r) return null;
  const d = new Date(r.at);
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${fmt.relDay(d)}, la ${hh}`;
}

/* ---------- calendar ---------- */
const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const stamp = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
const utcStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function fold(line) {
  // RFC 5545: linii de max. 75 de octeți
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 73) { out.push(cur); cur = ' ' + ch; }
    else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

export function icsFor(b) {
  const start = new Date(b.startMs), end = new Date(b.endMs);
  const loc = `${SALON.fullName}, ${SALON.address}, ${SALON.city}`;
  const desc = `${b.serviceName} cu ${b.barberName}\nCod programare: ${b.id}\nTelefon salon: ${SALON.phone}\n${SALON.addressHint}`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Urban Studio//Programari//RO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${b.id}@urbanstudio`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART;TZID=Europe/Bucharest:${stamp(start)}`,
    `DTEND;TZID=Europe/Bucharest:${stamp(end)}`,
    `SUMMARY:${icsEsc(`${b.serviceName} · Urban Studio`)}`,
    `LOCATION:${icsEsc(loc)}`,
    `DESCRIPTION:${icsEsc(desc)}`,
    `GEO:${SALON.geo.lat};${SALON.geo.lng}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc('Mâine ai programare la Urban Studio')}`, 'TRIGGER:-P1D', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc('În 2 ore ai programare la Urban Studio')}`, 'TRIGGER:-PT2H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n');
}

export function downloadICS(b) {
  const blob = new Blob([icsFor(b)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  if (isIOS()) {
    // Safari pe iPhone deschide direct foaia „Adaugă în Calendar”
    window.location.assign(url);
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = `urban-studio-${b.date}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  Bookings.update(b.id, { calendar: true });
}

export function googleCalUrl(b) {
  const start = new Date(b.startMs), end = new Date(b.endMs);
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${b.serviceName} · Urban Studio`,
    dates: `${stamp(start)}/${stamp(end)}`,
    ctz: 'Europe/Bucharest',
    details: `Cu ${b.barberName}. Cod: ${b.id}. Telefon salon: ${SALON.phone}.`,
    location: `${SALON.address}, ${SALON.city}`,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

/* ---------- linkuri utile ---------- */
export function whatsappUrl(b) {
  const d = fmt.date(b.date, b.time);
  const lines = [
    'Bună! Am făcut o programare din aplicația Urban Studio:',
    `${b.serviceName}, ${fmt.dayLong(d).toLowerCase()}, ora ${b.time}`,
    `Frizer: ${b.barberName}`,
    `Nume: ${b.name}`,
    `Cod: ${b.id}`,
  ];
  return `https://wa.me/${SALON.whatsapp}?text=${encodeURIComponent(lines.join('\n'))}`;
}
export const mapsLinks = () => {
  const { lat, lng } = SALON.geo;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
    apple: `https://maps.apple.com/?daddr=${lat},${lng}&q=Urban%20Studio`,
  };
};

/* ---------- notificări ---------- */
export function notifState() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported';
  }
  return Notification.permission; // default | granted | denied
}

export async function enableNotifications() {
  const st = notifState();
  if (st !== 'default') return st;
  try {
    const res = await Notification.requestPermission();
    if (res === 'granted') { await syncWorker(); await registerPeriodic(); await scheduleAll(); }
    bus.emit('notif', res);
    return res;
  } catch { return 'denied'; }
}

function payload(b) {
  const d = fmt.date(b.date, b.time);
  const soon = b.reminder?.kind === 'hours';
  return {
    title: soon ? 'Ai programare în curând' : 'Mâine ai programare la Urban Studio',
    body: `${fmt.dayMed(d)}, ora ${b.time} · ${b.serviceName} cu ${b.barberShort}. Te așteptăm!`,
    tag: `us-${b.id}`,
  };
}

async function swReg() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.ready; } catch { return null; }
}

// Copie a programărilor în Cache Storage, ca service worker-ul să le poată citi în fundal.
const DATA_URL = () => new URL('__us/reminders.json', document.baseURI).href;
export async function syncWorker() {
  if (!('caches' in window)) return;
  try {
    const items = Bookings.upcoming()
      .filter((b) => b.remind && b.reminder)
      .map((b) => ({ id: b.id, at: b.reminder.at, startMs: b.startMs, notified: !!b.reminder.notified, ...payload(b) }));
    const c = await caches.open('us-data');
    await c.put(DATA_URL(), new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } }));
  } catch { /* fără cache */ }
}

// Preia înapoi ce a notificat deja service worker-ul, ca să nu dublăm notificarea.
export async function pullWorkerState() {
  if (!('caches' in window)) return;
  try {
    const c = await caches.open('us-data');
    const r = await c.match(DATA_URL());
    if (!r) return;
    const items = await r.json();
    for (const it of items) {
      const b = Bookings.get(it.id);
      if (it.notified && b?.reminder && !b.reminder.notified) Bookings.update(b.id, { reminder: { ...b.reminder, notified: true } });
    }
  } catch { /* ignoră */ }
}

async function registerPeriodic() {
  const reg = await swReg();
  if (!reg || !('periodicSync' in reg)) return;
  try {
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (st.state === 'granted') await reg.periodicSync.register('us-reminders', { minInterval: 3 * HOUR });
  } catch { /* nesuportat */ }
}

// Notification Triggers (unde există): notificarea e programată direct în sistem.
async function trigger(b) {
  if (!('showTrigger' in Notification.prototype) || typeof window.TimestampTrigger !== 'function') return false;
  const reg = await swReg();
  if (!reg) return false;
  const p = payload(b);
  try {
    await reg.showNotification(p.title, {
      body: p.body, tag: p.tag, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/favicon-64.png',
      data: { url: './#/agenda' }, showTrigger: new window.TimestampTrigger(b.reminder.at),
    });
    return true;
  } catch { return false; }
}

let timers = [];
function armTimers() {
  timers.forEach(clearTimeout);
  timers = [];
  for (const b of Bookings.upcoming()) {
    if (!b.remind || !b.reminder || b.reminder.notified) continue;
    const dt = b.reminder.at - Date.now();
    if (dt > 0 && dt < 12 * HOUR) timers.push(setTimeout(() => fire(b.id), dt));
  }
}

async function fire(id) {
  const b = Bookings.get(id);
  if (!b || b.status !== 'confirmed' || !b.reminder || b.reminder.notified) return;
  Bookings.update(id, { reminder: { ...b.reminder, notified: true } });
  const p = payload(b);
  if (notifState() === 'granted') {
    const reg = await swReg();
    try {
      await reg?.showNotification(p.title, { body: p.body, tag: p.tag, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/favicon-64.png', data: { url: './#/agenda' } });
    } catch { /* ignoră */ }
  }
  toast(p.title, { ic: 'bell', tone: 'blue' });
  bus.emit('reminder', b);
  syncWorker();
}

export async function scheduleAll() {
  for (const b of Bookings.upcoming()) {
    if (b.remind && b.reminder && !b.reminder.notified && !b.reminder.triggered && notifState() === 'granted') {
      if (await trigger(b)) Bookings.update(b.id, { reminder: { ...b.reminder, triggered: true } });
    }
  }
  armTimers();
}

export async function checkDue() {
  await pullWorkerState();
  const now = Date.now();
  for (const b of Bookings.upcoming(now)) {
    if (b.remind && b.reminder && !b.reminder.notified && now >= b.reminder.at) await fire(b.id);
  }
  armTimers();
}

export async function onBooked(b) {
  await syncWorker();
  if (notifState() === 'granted') { await registerPeriodic(); await scheduleAll(); }
  else armTimers();
}

export async function onCancelled(b) {
  const reg = await swReg();
  try {
    const list = await reg?.getNotifications({ tag: `us-${b.id}`, includeTriggered: true });
    list?.forEach((n) => n.close());
  } catch { /* ignoră */ }
  await syncWorker();
  armTimers();
}

/* ---------- server opțional (Google Apps Script) ---------- */
export async function api(action, data) {
  if (!CONFIG.apiUrl) return { ok: false, skipped: true };
  try {
    await fetch(CONFIG.apiUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...data }),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
export const hasServer = () => !!CONFIG.apiUrl;

export { DAY, HOUR };
