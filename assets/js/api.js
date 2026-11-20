/* Stratul de date comun pentru aplicația clienților și panoul frizerilor.
   Mod local (CONFIG.apiUrl gol): echipa, programul și programările stau în acest browser (demo pe un telefon).
   Mod server: Google Apps Script (backend/), comun pentru toți frizerii, cu SMS automat. */
import { CONFIG, SALON, BARBERS as SEED } from './data.js';
import { store, bus, fmt } from './lib.js';
import { Bookings } from './store.js';
import { planReminder, onCancelled } from './reminders.js';

export const isRemote = () => !!CONFIG.apiUrl;

/* ---------- program ---------- */
// week: intervale pe zi a săptămânii (0 = duminică). days: excepții pe dată ([] = liber).
export function defaultSchedule() {
  const week = {};
  for (let d = 0; d < 7; d++) week[d] = SALON.hours[d] ? [[SALON.hours[d][0], SALON.hours[d][1]]] : [];
  return { week, days: {} };
}

// Conturile de test: user0, user1, user2 (parolele ParolaTest0/1/2, salvate doar ca hash).
const SEED_ACCOUNTS = {
  adita: ['user0', 'e1039ce07ba7aa63f6ce29ef01cbf95b826637f175b52379af133a77cf026c10'],
  radu: ['user1', 'b1a24ee7b31c601ee2fca709774c28f3ea29a2a9e324c31e2d3c8ed7223d6439'],
  stefan: ['user2', 'cf34e64cf414618620b7aaa97358cf307a05e0786952922c455cd728816d0f4f'],
};

export async function hashPassword(pw) {
  const data = new TextEncoder().encode(`urbanstudio:${pw}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const PUBLIC_FIELDS = ['id', 'name', 'short', 'role', 'photo', 'rating', 'reviews', 'bio', 'tags', 'phone', 'active', 'schedule', 'username', 'placeholder'];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/* ---------- mod local ---------- */
function localTeam() {
  let team = store.get('team', null);
  if (!team) {
    team = SEED.map((b) => ({
      ...b,
      username: SEED_ACCOUNTS[b.id]?.[0],
      passHash: SEED_ACCOUNTS[b.id]?.[1],
      phone: CONFIG.smsPhone,
      active: true,
      schedule: defaultSchedule(),
      createdAt: Date.now(),
    }));
    store.set('team', team);
  }
  return team;
}
const saveTeam = (team) => { store.set('team', team); bus.emit('team', team); };

/* ---------- mod server ---------- */
const remote = { barbers: [], busy: {}, sms: false, loaded: false };

async function post(payload) {
  const res = await fetch(CONFIG.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function applyPublic(data) {
  remote.barbers = data.barbers || [];
  remote.busy = {};
  for (const it of data.busy || []) {
    const day = (remote.busy[it.date] ||= {});
    (day[it.barberId] ||= []).push([toMin(it.from), toMin(it.to)]);
  }
  remote.sms = !!data.sms;
}

async function loadPublic() {
  try {
    const res = await fetch(`${CONFIG.apiUrl}?action=public`);
    const data = await res.json();
    if (!data.ok) throw new Error('public');
    applyPublic(data);
    remote.loaded = true;
    store.set('remoteCache', { barbers: data.barbers || [], busy: data.busy || [], sms: !!data.sms, at: Date.now() });
    return true;
  } catch {
    // offline: ultima copie cunoscută
    const c = store.get('remoteCache', null);
    if (c) applyPublic(c);
    else if (!remote.barbers.length) remote.barbers = localTeam().map((b) => pick(b, PUBLIC_FIELDS));
    return false;
  }
}

const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

/* Programările viitoare de pe acest telefon: dacă frizerul le-a anulat din panou, apar anulate și aici. */
let syncing = null;
function syncMine() {
  if (syncing) return syncing;
  const now = Date.now();
  const ids = Bookings.mine().filter((b) => b.status === 'confirmed' && b.endMs > now).map((b) => b.id);
  if (!ids.length) return Promise.resolve();
  syncing = fetch(`${CONFIG.apiUrl}?action=mine&ids=${encodeURIComponent(ids.join(','))}`)
    .then((r) => r.json())
    .then((data) => {
      if (!data.ok) return;
      for (const s of data.bookings || []) {
        if (s.status === 'confirmed') continue;
        const upd = Bookings.update(s.id, { status: s.status === 'rescheduled' ? 'rescheduled' : 'cancelled', cancelledAt: s.cancelledAt || now, cancelledBy: 'salon' });
        if (upd) onCancelled(upd).catch(() => {}); // oprește reamintirea de pe telefon
      }
    })
    .catch(() => {})
    .finally(() => { syncing = null; });
  return syncing;
}

/* ---------- SMS pe programare ---------- */
export function withSms(b, serverSms = false) {
  const plan = b.remind ? (b.reminder || planReminder(b.startMs)) : null;
  return {
    ...b,
    sms: b.sms || {
      confirm: { status: serverSms ? 'queued' : 'pending' },
      remind: plan ? { status: 'scheduled', at: plan.at, kind: plan.kind } : { status: 'skipped' },
    },
  };
}

/* ---------- API public ---------- */
export const Api = {
  async init() {
    if (!isRemote()) { localTeam(); return; }
    // pornire instantă din ultima copie, apoi actualizare în fundal (serverul răspunde în 2-3 secunde)
    const cached = store.get('remoteCache', null);
    if (cached) applyPublic(cached);
    const fresh = loadPublic().then((ok) => { if (ok && cached) bus.emit('team'); });
    syncMine();
    if (!cached) await Promise.race([fresh, new Promise((r) => setTimeout(r, 7000))]);
  },
  reloadLocal() { /* echipa locală se recitește la fiecare apel */ },

  /* frizeri vizibili pentru clienți (activi) */
  barbers() {
    const list = isRemote() ? remote.barbers : localTeam();
    return list.filter((b) => b.active !== false);
  },
  /* orice frizer, inclusiv inactiv (pentru istoric) */
  barber(id) {
    const list = isRemote() ? remote.barbers.concat(adminCache.team || []) : localTeam();
    return list.find((b) => b.id === id) || null;
  },
  smsAuto() { return isRemote() && remote.sms; },

  /* intervale ocupate [min, min] pentru o zi și un frizer */
  busy(iso, barberId, ignoreId) {
    const local = Bookings.list()
      .filter((b) => b.status === 'confirmed' && b.date === iso && b.barberId === barberId && b.id !== ignoreId)
      .map((b) => [toMin(b.time), toMin(b.time) + b.duration]);
    if (!isRemote()) {
      // în mod local, programările adăugate din panou sunt tot în acest browser
      return local;
    }
    // la reprogramare, ora veche a clientului nu blochează noua oră (serverul nu trimite coduri, deci o scoatem după interval)
    const server = (remote.busy[iso]?.[barberId] || []).slice();
    const old = ignoreId && Bookings.get(ignoreId);
    if (old && old.date === iso && old.barberId === barberId) {
      const i = server.findIndex(([a, c]) => a === toMin(old.time) && c === toMin(old.time) + old.duration);
      if (i >= 0) server.splice(i, 1);
    }
    return server.concat(local);
  },

  async refresh() { if (isRemote()) { await loadPublic(); syncMine(); } },

  /* programare din aplicația clienților */
  async book(b) {
    if (!isRemote()) {
      const full = withSms({ ...b, source: 'app' });
      Bookings.add(full);
      return { ok: true, booking: full };
    }
    try {
      const r = await post({ action: 'book', booking: { ...b, source: 'app' } });
      if (!r.ok) return r;
      const full = { ...b, source: 'app', sms: r.booking?.sms || withSms(b, true).sms };
      Bookings.add(full);
      loadPublic();
      return { ok: true, booking: full };
    } catch {
      return { ok: false, error: 'network' };
    }
  },

  async cancel(b, reason = 'client') {
    const patch = { status: reason === 'reprogramare' ? 'rescheduled' : 'cancelled', cancelledAt: Date.now() };
    if (isRemote()) {
      try { await post({ action: 'cancel', id: b.id, phone: b.phone, reason }); } catch { /* se reîncearcă la următoarea deschidere */ }
    }
    return Bookings.update(b.id, patch);
  },
};

/* ---------- panoul frizerilor ---------- */
const adminCache = { team: null };

export const Admin = {
  session() { return store.get('session', null); },

  async login(username, password) {
    const u = username.trim().toLowerCase();
    if (!isRemote()) {
      const hash = await hashPassword(password);
      const b = localTeam().find((x) => (x.username || '').toLowerCase() === u && x.active !== false);
      if (!b || b.passHash !== hash) return { ok: false, error: 'credentials' };
      const s = { token: `local:${b.id}`, userId: b.id, exp: Date.now() + 30 * 864e5 };
      store.set('session', s);
      return { ok: true, user: pick(b, PUBLIC_FIELDS) };
    }
    try {
      const r = await post({ action: 'login', username: u, password });
      if (!r.ok) return r;
      store.set('session', { token: r.token, userId: r.user.id, exp: r.exp });
      return r;
    } catch {
      return { ok: false, error: 'network' };
    }
  },

  logout() { store.set('session', null); },

  async call(op, data = {}) {
    const s = this.session();
    if (!s || s.exp < Date.now()) { bus.emit('auth:expired'); return { ok: false, error: 'auth' }; }
    if (!isRemote()) return localOp(s.userId, op, data);
    try {
      const r = await post({ action: 'admin', token: s.token, op, ...data });
      if (r.error === 'auth') { this.logout(); bus.emit('auth:expired'); }
      return r;
    } catch {
      return { ok: false, error: 'network' };
    }
  },

  me() { return this.call('me'); },
  async team() {
    const r = await this.call('team');
    if (r.ok) adminCache.team = r.team;
    return r;
  },
  bookings(filters = {}) { return this.call('bookings', filters); },
  saveSchedule(id, schedule) { return this.call('saveSchedule', { id, schedule }); },
  saveBarber(barber, password) { return this.call('saveBarber', { barber, password }); },
  setActive(id, active) { return this.call('setActive', { id, active }); },
  book(booking) { return this.call('book', { booking }); },
  cancel(id) { return this.call('cancel', { id }); },
  deleteBooking(id) { return this.call('deleteBooking', { id }); },
  markSms(id, kind, status) { return this.call('markSms', { id, kind, status }); },
  resendSms(id, kind) { return this.call('resendSms', { id, kind }); },
  changePassword(oldPw, newPw) { return this.call('password', { old: oldPw, next: newPw }); },
  smsAuto() { return Api.smsAuto(); },
};

/* Operațiile panoului în mod local (aceleași răspunsuri ca serverul). */
async function localOp(userId, op, d) {
  const team = localTeam();
  const me = team.find((b) => b.id === userId);
  if (!me || me.active === false) return { ok: false, error: 'auth' };
  const strip = (b) => { const { passHash, ...rest } = b; return rest; };

  switch (op) {
    case 'me': return { ok: true, user: strip(me) };
    case 'team': return { ok: true, team: team.map(strip) };

    case 'bookings': {
      let list = Bookings.list();
      if (d.barberId) list = list.filter((b) => b.barberId === d.barberId);
      if (d.from) list = list.filter((b) => b.date >= d.from);
      if (d.to) list = list.filter((b) => b.date <= d.to);
      return { ok: true, bookings: list.map((b) => withSms(b)) };
    }

    case 'saveSchedule': {
      const b = team.find((x) => x.id === d.id);
      if (!b) return { ok: false, error: 'notfound' };
      b.schedule = d.schedule;
      saveTeam(team);
      return { ok: true };
    }

    case 'saveBarber': {
      const src = d.barber;
      const uname = (src.username || '').trim().toLowerCase();
      if (!uname) return { ok: false, error: 'username' };
      if (team.some((x) => x.username?.toLowerCase() === uname && x.id !== src.id)) return { ok: false, error: 'username-taken' };
      let b = src.id ? team.find((x) => x.id === src.id) : null;
      if (!b) {
        if (!d.password) return { ok: false, error: 'password' };
        const id = `${fmt.slug(src.short || src.name)}-${Math.random().toString(36).slice(2, 6)}`;
        b = { id, active: true, createdAt: Date.now(), schedule: defaultSchedule(), tags: [] };
        team.push(b);
      }
      Object.assign(b, {
        name: src.name.trim(),
        short: (src.short || src.name.split(' ')[0]).trim(),
        role: (src.role || 'Barber').trim(),
        phone: src.phone.trim(),
        username: uname,
        bio: (src.bio || '').trim(),
      });
      delete b.placeholder;
      if (d.password) b.passHash = await hashPassword(d.password);
      saveTeam(team);
      return { ok: true, barber: strip(b) };
    }

    case 'setActive': {
      if (d.id === userId && !d.active) return { ok: false, error: 'self' };
      const b = team.find((x) => x.id === d.id);
      if (!b) return { ok: false, error: 'notfound' };
      if (!d.active && team.filter((x) => x.active !== false).length <= 1) return { ok: false, error: 'last' };
      b.active = !!d.active;
      saveTeam(team);
      return { ok: true };
    }

    case 'book': {
      const b = withSms({ ...d.booking, source: 'admin' });
      const clash = Bookings.list().some((x) => x.status === 'confirmed' && x.barberId === b.barberId && x.date === b.date &&
        toMin(x.time) < toMin(b.time) + b.duration && toMin(b.time) < toMin(x.time) + x.duration);
      if (clash) return { ok: false, error: 'taken' };
      Bookings.add(b);
      return { ok: true, booking: b };
    }

    case 'cancel': {
      const b = Bookings.update(d.id, { status: 'cancelled', cancelledAt: Date.now(), cancelledBy: userId });
      return b ? { ok: true, booking: b } : { ok: false, error: 'notfound' };
    }

    case 'deleteBooking': {
      const b = Bookings.get(d.id);
      if (!b) return { ok: true };
      if (b.status === 'confirmed' && b.endMs > Date.now()) return { ok: false, error: 'live' };
      Bookings.remove(d.id);
      return { ok: true };
    }

    case 'markSms': {
      const b = Bookings.get(d.id);
      if (!b) return { ok: false, error: 'notfound' };
      const sms = withSms(b).sms;
      sms[d.kind] = { ...sms[d.kind], status: d.status, at: Date.now(), by: userId };
      Bookings.update(d.id, { sms });
      return { ok: true };
    }

    case 'resendSms': return { ok: false, error: 'manual' };

    case 'password': {
      if (me.passHash !== await hashPassword(d.old)) return { ok: false, error: 'credentials' };
      me.passHash = await hashPassword(d.next);
      saveTeam(team);
      return { ok: true };
    }

    default: return { ok: false, error: 'op' };
  }
}
