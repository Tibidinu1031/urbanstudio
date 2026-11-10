/* Programările și profilul clientului, păstrate pe dispozitiv. */
import { store, bus } from './lib.js';

export const Bookings = {
  list() { return store.get('bookings', []); },
  save(list) { store.set('bookings', list); bus.emit('bookings', list); },
  get(id) { return this.list().find((b) => b.id === id); },
  add(b) { const l = this.list(); l.push(b); this.save(l); return b; },
  update(id, patch) {
    let out = null;
    const l = this.list().map((b) => {
      if (b.id !== id) return b;
      out = { ...b, ...patch };
      return out;
    });
    this.save(l);
    return out;
  },
  upcoming(now = Date.now()) {
    return this.list()
      .filter((b) => b.status === 'confirmed' && b.endMs > now)
      .sort((a, b) => a.startMs - b.startMs);
  },
  past(now = Date.now()) {
    return this.list()
      .filter((b) => b.status !== 'confirmed' || b.endMs <= now)
      .sort((a, b) => b.startMs - a.startMs);
  },
};

export const Profile = {
  get() { return store.get('profile', {}); },
  set(p) { store.set('profile', { ...this.get(), ...p }); },
};

export function newCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const rnd = crypto.getRandomValues(new Uint8Array(5));
  for (const n of rnd) s += abc[n % abc.length];
  return `US-${s}`;
}
