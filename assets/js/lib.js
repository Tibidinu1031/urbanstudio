/* Utilitare comune: DOM, evenimente, stocare, formatare, haptic, sheet-uri, toast-uri, istoric. */
import { icon } from './icons.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/* ---------- event bus ---------- */
const listeners = {};
export const bus = {
  on(e, f) { (listeners[e] ||= []).push(f); return () => { listeners[e] = listeners[e].filter((x) => x !== f); }; },
  emit(e, d) { (listeners[e] || []).slice().forEach((f) => f(d)); },
};

/* ---------- storage (cu protecție pentru modul privat) ---------- */
const NS = 'urbanstudio.v1.';
export const store = {
  get(k, d) {
    try { const v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch { /* stocare indisponibilă */ }
  },
};

/* ---------- formatare în română ---------- */
const DOW = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const DOW_S = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'];
const MON = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const MON_S = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
const MON_XS = ['IAN', 'FEB', 'MAR', 'APR', 'MAI', 'IUN', 'IUL', 'AUG', 'SEP', 'OCT', 'NOI', 'DEC'];

const pad = (n) => String(n).padStart(2, '0');
// Regula „de” din română: 20 de minute, dar 5 minute, 101 minute.
export const plural = (n, one, many) => {
  if (n === 1) return one;
  const r = n % 100;
  return (n === 0 || (r >= 1 && r <= 19)) ? `${n} ${many}` : `${n} de ${many}`;
};

export const fmt = {
  iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
  date(iso, time = '00:00') {
    const [y, m, d] = iso.split('-').map(Number);
    const [h, mi] = time.split(':').map(Number);
    return new Date(y, m - 1, d, h, mi);
  },
  addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); x.setHours(0, 0, 0, 0); return x; },
  dow: (d) => DOW[d.getDay()],
  dowShort: (d) => DOW_S[d.getDay()],
  month: (d) => MON[d.getMonth()],
  monthXS: (d) => MON_XS[d.getMonth()],
  dayLong(d) { return `${cap(DOW[d.getDay()])}, ${d.getDate()} ${MON[d.getMonth()]}`; },
  dayMed(d) { return `${cap(DOW[d.getDay()])}, ${d.getDate()} ${MON_S[d.getMonth()]}`; },
  dayShort(d) { return `${d.getDate()} ${MON_S[d.getMonth()]}`; },
  dayTiny(d) { return `${['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'][d.getDay()]}, ${d.getDate()} ${MON_S[d.getMonth()]}`; },
  relDay(d, now = new Date()) {
    const a = fmt.addDays(now, 0).getTime();
    const b = fmt.addDays(d, 0).getTime();
    const diff = Math.round((b - a) / 864e5);
    if (diff === 0) return 'Azi';
    if (diff === 1) return 'Mâine';
    if (diff === 2) return 'Poimâine';
    if (diff > 2 && diff < 7) return cap(DOW[d.getDay()]);
    return fmt.dayShort(d);
  },
  relDayLong(d, now = new Date()) {
    const r = fmt.relDay(d, now);
    if (r === 'Azi' || r === 'Mâine' || r === 'Poimâine') return `${r}, ${d.getDate()} ${MON[d.getMonth()]}`;
    return fmt.dayLong(d);
  },
  price: (n) => `${n.toLocaleString('ro-RO')} lei`,
  duration(min) {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  },
  countdown(ms) {
    const min = Math.round(ms / 6e4);
    if (min < 1) return 'acum';
    if (min < 60) return `peste ${plural(min, 'un minut', 'minute')}`;
    const h = Math.floor(min / 60);
    if (h < 36) return `peste ${plural(h, 'o oră', 'ore')}`;
    const target = new Date(Date.now() + ms);
    const d = Math.round((fmt.addDays(target, 0) - fmt.addDays(new Date(), 0)) / 864e5);
    return `peste ${plural(d, 'o zi', 'zile')}`;
  },
  phone(v) {
    const d = String(v).replace(/\D/g, '');
    if (d.length === 10 && d.startsWith('0')) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
    return v;
  },
  greeting(d = new Date()) {
    const h = d.getHours();
    if (h < 5) return 'Bună seara';
    if (h < 12) return 'Bună dimineața';
    if (h < 18) return 'Bună ziua';
    return 'Bună seara';
  },
};

/* ---------- haptic ---------- */
// Android: Vibration API. iOS 18+: comutarea unui <input switch> nativ declanșează Taptic Engine.
export function haptic(kind = 'light') {
  try {
    if (typeof navigator.vibrate === 'function' && !isIOS()) {
      navigator.vibrate(kind === 'success' ? [12, 60, 18] : kind === 'heavy' ? 22 : kind === 'select' ? 6 : 10);
      return;
    }
    const lbl = document.getElementById('haptic');
    if (lbl) lbl.click();
  } catch { /* fără haptic */ }
}

/* ---------- animații JS ---------- */
export const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  inOut: (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
export function tweenChain(segments, apply) {
  return new Promise((resolve) => {
    let i = 0, t0 = performance.now();
    const tick = (now) => {
      const s = segments[i];
      const p = Math.min(1, (now - t0) / s.d);
      apply(s.from + (s.to - s.from) * (s.e || ease.out)(p));
      if (p >= 1) { i += 1; t0 = now; if (i >= segments.length) return resolve(); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/* ---------- imagini: fade-in la încărcare ---------- */
export function fadeImages(root) {
  $$('img.fade-img', root).forEach((img) => {
    if (img.complete && img.naturalWidth) img.classList.add('is-loaded');
    else img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
  });
}

/* ---------- istoric (butonul Back pe Android închide sheet-uri și pași) ---------- */
const overlayStack = [];
let ignorePops = 0;
let popFallback = null;
export function onBack(fn) { popFallback = fn; }
export function pushOverlay(close) {
  overlayStack.push(close);
  history.pushState({ us: 'overlay' }, '');
}
export function popOverlay() {
  if (overlayStack.length) history.back();
}
export function pushStep() { history.pushState({ us: 'step' }, ''); }
export function unwind(n) {
  if (n > 0) { ignorePops += 1; history.go(-n); }
}
window.addEventListener('popstate', () => {
  if (ignorePops) { ignorePops -= 1; return; }
  if (overlayStack.length) { const close = overlayStack.pop(); close(); return; }
  if (popFallback) popFallback();
});

/* ---------- navigație + CTA ---------- */
export function setNavHidden(hidden) {
  document.getElementById('tabbar')?.classList.toggle('is-hidden', hidden);
  document.body.classList.toggle('nav-hidden', hidden);
}

let ctaHandler = null;
export function showCTA({ title, sub = '', label, onClick, disabled = false }) {
  const el = document.getElementById('cta');
  document.getElementById('cta-title').textContent = title;
  document.getElementById('cta-sub').textContent = sub;
  const btn = document.getElementById('cta-btn');
  btn.innerHTML = label;
  btn.disabled = disabled;
  ctaHandler = onClick;
  el.classList.add('is-visible');
  el.setAttribute('aria-hidden', 'false');
  document.body.classList.add('has-cta');
}
export function hideCTA() {
  const el = document.getElementById('cta');
  el.classList.remove('is-visible');
  el.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('has-cta');
  ctaHandler = null;
}
document.addEventListener('click', (e) => {
  if (e.target.closest('#cta-btn') && ctaHandler) { haptic(); ctaHandler(); }
});

/* ---------- toast ---------- */
let toastTimer;
export function toast(text, { ic = 'check', tone = '' } = {}) {
  const host = document.getElementById('toast-host');
  host.innerHTML = '';
  const t = document.createElement('div');
  t.className = `toast ${tone ? 'toast--' + tone : ''}`;
  t.innerHTML = `<span class="toast__ico">${icon(ic)}</span><span>${esc(text)}</span>`;
  host.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('is-shown')));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('is-shown');
    setTimeout(() => t.remove(), 600);
  }, 2800);
}

/* ---------- bottom sheet cu drag-to-dismiss ---------- */
export function openSheet({ title = '', body = '', foot = '', label = '', onClose } = {}) {
  const host = document.getElementById('sheet-host');
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', label || title || 'Detalii');
  sheet.innerHTML = `
    <div class="sheet__grab"><div class="sheet__handle"></div></div>
    ${title ? `<div class="sheet__head"><h2 class="sheet__title">${title}</h2><button class="icon-btn" type="button" data-sheet-close aria-label="Închide">${icon('x', 'i--sm')}</button></div>` : ''}
    <div class="sheet__body">${typeof body === 'string' ? body : ''}</div>
    ${foot ? `<div class="sheet__foot">${foot}</div>` : ''}`;
  if (typeof body !== 'string' && body) sheet.querySelector('.sheet__body').appendChild(body);
  host.append(backdrop, sheet);
  document.body.classList.add('lock');
  const prevFocus = document.activeElement;

  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    sheet.classList.remove('is-open', 'is-dragging');
    sheet.style.transform = '';
    backdrop.classList.remove('is-open');
    setTimeout(() => {
      sheet.remove(); backdrop.remove();
      if (!document.querySelector('.sheet')) document.body.classList.remove('lock');
      prevFocus?.focus?.({ preventScroll: true });
    }, 480);
    onClose?.();
  };
  pushOverlay(finish);
  const close = () => { if (!closed) popOverlay(); };

  requestAnimationFrame(() => requestAnimationFrame(() => {
    sheet.classList.add('is-open');
    backdrop.classList.add('is-open');
    sheet.querySelector('[data-sheet-close]')?.focus({ preventScroll: true });
  }));

  backdrop.addEventListener('click', close);
  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-sheet-close]')) close(); });
  sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // drag: de pe mâner/antet oricând, din corp doar când e derulat sus
  const bodyEl = sheet.querySelector('.sheet__body');
  let startY = 0, dy = 0, lastY = 0, lastT = 0, vel = 0, dragging = false, armed = false;
  const onDown = (e) => {
    const fromHandle = e.target.closest('.sheet__grab, .sheet__head');
    if (!fromHandle && bodyEl.scrollTop > 0) return;
    if (e.target.closest('input, textarea, select')) return;
    armed = true; dragging = false; startY = lastY = e.clientY; lastT = performance.now(); dy = 0; vel = 0;
  };
  const onMove = (e) => {
    if (!armed) return;
    const d = e.clientY - startY;
    if (!dragging) {
      if (d > 6) { dragging = true; sheet.classList.add('is-dragging'); sheet.setPointerCapture?.(e.pointerId); }
      else if (d < -6) { armed = false; return; }
      else return;
    }
    const now = performance.now();
    vel = (e.clientY - lastY) / Math.max(1, now - lastT);
    lastY = e.clientY; lastT = now;
    dy = Math.max(0, d) + Math.min(0, d) * .15;
    sheet.style.transform = `translate(-50%, ${dy}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - dy / (sheet.offsetHeight * 1.1)));
  };
  const onUp = () => {
    if (!armed) return;
    armed = false;
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('is-dragging');
    backdrop.style.opacity = '';
    if (dy > sheet.offsetHeight * .28 || vel > .55) { close(); }
    else { sheet.style.transform = ''; }
  };
  sheet.addEventListener('pointerdown', onDown);
  sheet.addEventListener('pointermove', onMove);
  sheet.addEventListener('pointerup', onUp);
  sheet.addEventListener('pointercancel', onUp);

  return { el: sheet, body: bodyEl, close };
}

/* ---------- intrare fluidă a numerelor (ex. countdown) ---------- */
export function onVisible(fn) {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fn(); });
}
