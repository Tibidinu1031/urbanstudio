/* Controller-ul aplicației: tab bar, rute, splash, service worker. */
import { PHOTOS } from './data.js';
import { icon } from './icons.js';
import { $, $$, bus, haptic, setNavHidden, hideCTA, onBack, onVisible, reduceMotion } from './lib.js';
import { Bookings } from './store.js';
import { runSplash } from './splash.js';
import { checkDue, syncWorker } from './reminders.js';
import { initHome } from './views/home.js';
import { initBooking, onShow as bookShow, onHide as bookHide, handleBack as bookBack } from './views/booking.js';
import { initAgenda, onShow as agendaShow } from './views/agenda.js';
import { initAbout, onShow as aboutShow } from './views/about.js';

const TABS = [
  { id: 'home', label: 'Acasă', icon: 'home', hash: 'acasa' },
  { id: 'book', label: 'Programează', icon: 'book', hash: 'programare' },
  { id: 'agenda', label: 'Agenda', icon: 'ticket', hash: 'agenda' },
  { id: 'about', label: 'Despre salon', icon: 'store', hash: 'despre' },
];
const HOOKS = {
  home: { show: () => setNavHidden(false) },
  book: { show: bookShow, hide: bookHide },
  agenda: { show: () => { setNavHidden(false); agendaShow(); } },
  about: { show: () => { setNavHidden(false); aboutShow(); } },
};

let current = null;
const scrollPos = {};

/* ---------- tab bar ---------- */
const glass = $('#tabbar-glass');
const pill = $('#tabbar-pill');
let pillX = 0;

function buildTabs() {
  TABS.forEach((t) => {
    const b = $(`.tab[data-tab="${t.id}"]`);
    b.innerHTML = `<span class="tab__icon">${icon(t.icon, 'l')}${icon(t.icon + 'Fill', 'f')}${t.id === 'agenda' ? '<span class="tab__badge" hidden></span>' : ''}</span><span class="tab__label">${t.label}</span>`;
  });
}

function movePill(i, animate = true) {
  const w = pill.offsetWidth;
  const to = i * w;
  const from = pillX;
  pillX = to;
  pill.style.transform = `translateX(${to}px)`;
  if (!animate || reduceMotion() || from === to) return;
  const dist = Math.abs(to - from) / w;
  pill.animate([
    { transform: `translateX(${from}px) scale(1, 1)` },
    { transform: `translateX(${(from + to) / 2}px) scale(${1 + Math.min(.4, .16 * dist)}, .92)`, offset: .42 },
    { transform: `translateX(${to}px) scale(1, 1)` },
  ], { duration: 540, easing: 'cubic-bezier(.3,1.3,.5,1)' });
}

function updateBadge() {
  const n = Bookings.upcoming().length;
  const badge = $('.tab__badge');
  if (!badge) return;
  badge.hidden = n === 0;
  badge.textContent = n > 9 ? '9+' : String(n);
}

// glisare pe bară, ca în iOS: pastila urmează degetul și selectează la ridicare
let drag = null;
glass.addEventListener('pointerdown', (e) => {
  const r = glass.getBoundingClientRect();
  drag = { x0: e.clientX, r, moved: false, id: e.pointerId };
});
glass.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved && Math.abs(e.clientX - drag.x0) < 10) return;
  if (!drag.moved) { drag.moved = true; glass.setPointerCapture(e.pointerId); }
  const w = pill.offsetWidth;
  const x = Math.max(0, Math.min(drag.r.width - 10 - w, e.clientX - drag.r.left - 5 - w / 2));
  pill.style.transform = `translateX(${x}px) scale(1.08, 1.04)`;
  pill.style.transition = 'none';
  const i = Math.round(x / w);
  $$('.tab').forEach((b, k) => b.classList.toggle('is-hover', k === i));
});
const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (!d.moved) return;
  const w = pill.offsetWidth;
  const x = Math.max(0, Math.min(d.r.width - 10 - w, e.clientX - d.r.left - 5 - w / 2));
  const i = Math.round(x / w);
  pillX = x;
  pill.style.transition = '';
  $$('.tab').forEach((b) => b.classList.remove('is-hover'));
  glass.dataset.suppress = '1';
  setTimeout(() => { delete glass.dataset.suppress; }, 60);
  haptic('select');
  if (TABS[i].id === current) movePill(i); else go(TABS[i].id);
};
glass.addEventListener('pointerup', endDrag);
glass.addEventListener('pointercancel', endDrag);

glass.addEventListener('click', (e) => {
  if (glass.dataset.suppress) return;
  const b = e.target.closest('.tab');
  if (!b) return;
  haptic('select');
  const id = b.dataset.tab;
  if (id === current) {
    if (id === 'book') HOOKS.book.show();
    window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
    return;
  }
  go(id);
});

/* ---------- rute ---------- */
function go(id, { instant = false } = {}) {
  const t = TABS.find((x) => x.id === id) || TABS[0];
  if (current === t.id) { HOOKS[t.id].show?.(); return; }
  if (current) {
    scrollPos[current] = window.scrollY;
    HOOKS[current].hide?.();
    const prev = $(`#view-${current}`);
    prev.hidden = true;
    prev.classList.remove('is-active', 'is-entering');
  }
  hideCTA();
  const view = $(`#view-${t.id}`);
  view.hidden = false;
  view.classList.add('is-active');
  current = t.id;
  HOOKS[t.id].show?.();
  window.scrollTo(0, scrollPos[t.id] || 0);
  if (!instant && !reduceMotion()) {
    view.classList.remove('is-entering');
    void view.offsetWidth;
    view.classList.add('is-entering');
  }
  const i = TABS.indexOf(t);
  $$('.tab').forEach((b, k) => { if (k === i) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  movePill(i, !instant);
  history.replaceState(history.state, '', `#/${t.hash}`);
  onScroll();
}

function fromHash() {
  const h = location.hash.replace(/^#\/?/, '');
  return (TABS.find((t) => t.hash === h) || TABS[0]).id;
}

/* ---------- bara de sus devine opacă la scroll ---------- */
let sraf = 0;
function onScroll() {
  sraf = 0;
  const v = current && $(`#view-${current}`);
  if (v) v.classList.toggle('is-scrolled', window.scrollY > 6);
}
addEventListener('scroll', () => { if (!sraf) sraf = requestAnimationFrame(onScroll); }, { passive: true });
addEventListener('resize', () => movePill(TABS.findIndex((t) => t.id === current), false));
addEventListener('hashchange', () => go(fromHash()));

/* ---------- pornire ---------- */
function boot() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  buildTabs();
  initHome($('#view-home'));
  initBooking($('#view-book'));
  initAgenda($('#view-agenda'));
  initAbout($('#view-about'));

  bus.on('nav', (id) => go(id));
  bus.on('bookings', updateBadge);
  onBack(() => { if (current === 'book') bookBack(); });
  updateBadge();
  go(fromHash(), { instant: true });

  const critical = [PHOTOS[0].src, PHOTOS[0].thumb, PHOTOS[1].thumb, PHOTOS[2].thumb, 'assets/img/team/adita.jpg'];
  runSplash(critical).then(() => {
    document.body.classList.remove('booting');
    document.body.classList.add('intro');
    movePill(TABS.findIndex((t) => t.id === current), false);
    setTimeout(() => document.body.classList.remove('intro'), 1800);
    checkDue();
  });

  onVisible(() => checkDue());

  if ('serviceWorker' in navigator) {
    const register = () => navigator.serviceWorker.register('sw.js').then(() => syncWorker()).catch(() => {});
    if (document.readyState === 'complete') register();
    else addEventListener('load', register, { once: true });
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'open') go(e.data.tab || 'agenda');
    });
  }
}

boot();
