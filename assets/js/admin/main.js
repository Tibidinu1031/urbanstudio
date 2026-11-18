/* Panoul frizerilor: autentificare, taburi, cont. */
import { Api, Admin, isRemote } from '../api.js';
import { icon } from '../icons.js';
import { logoSVG } from '../logo.js';
import { $, $$, esc, fmt, haptic, toast, openSheet, bus, reduceMotion, setNavHidden, onVisible } from '../lib.js';
import { avatar } from '../components.js';
import { state, reloadAll, loadBookings, barberOf, errText } from './shared.js';
import { initAgenda, showAgenda } from './agenda.js';
import { initHistory, showHistory } from './history.js';
import { initSchedule, showSchedule } from './schedule.js';
import { initTeam, showTeam } from './team.js';

const TABS = [
  { id: 'agenda', label: 'Agenda', icon: 'calendar', show: showAgenda },
  { id: 'history', label: 'Istoric', icon: 'list', show: showHistory },
  { id: 'schedule', label: 'Program', icon: 'clock', show: showSchedule },
  { id: 'team', label: 'Echipa', icon: 'users', show: showTeam },
];
let current = null;
let started = false;
const scrollPos = {};

/* ---------- login ---------- */
function showLogin(message = '') {
  document.body.classList.add('booting');
  $('#app').hidden = true;
  const box = $('#login');
  box.hidden = false;
  box.innerHTML = `
    <div class="login__logo">${logoSVG()}</div>
    <span class="login__eyebrow">Panou frizeri</span>
    <h1>Intră în cont</h1>
    <p class="login__sub">Agenda ta, programul și echipa, într-un singur loc.</p>
    <form novalidate>
      <div class="login__err ${message ? 'is-on' : ''}" role="alert">${esc(message)}</div>
      <div class="field">
        <label class="field__label" for="lg-user">Utilizator</label>
        <input class="input" id="lg-user" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" enterkeyhint="next" placeholder="ex.: user0" required>
      </div>
      <div class="field">
        <label class="field__label" for="lg-pass">Parolă</label>
        <div class="pw">
          <input class="input" id="lg-pass" name="password" type="password" autocomplete="current-password" enterkeyhint="go" placeholder="Parola ta" required>
          <button class="pw__toggle" type="button" aria-label="Arată parola" data-eye>${icon('eye', 'i--sm')}</button>
        </div>
      </div>
      <button class="btn btn--primary btn--block" type="submit">Intră</button>
    </form>
    <div class="login__foot"><a class="link-btn" href="./">${icon('chevL')} Aplicația clienților</a></div>
    <p class="login__mode">${isRemote() ? 'Conectat la serverul salonului' : 'Mod demo: datele sunt salvate doar pe acest dispozitiv'}</p>`;

  const form = box.querySelector('form');
  const err = box.querySelector('.login__err');
  box.querySelector('[data-eye]').addEventListener('click', (e) => {
    const inp = $('#lg-pass');
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    e.currentTarget.innerHTML = icon(show ? 'eyeOff' : 'eye', 'i--sm');
    e.currentTarget.setAttribute('aria-label', show ? 'Ascunde parola' : 'Arată parola');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $('#lg-user').value;
    const p = $('#lg-pass').value;
    if (!u || !p) { err.textContent = 'Completează utilizatorul și parola.'; err.classList.add('is-on'); return; }
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Se verifică';
    const r = await Admin.login(u, p);
    btn.disabled = false;
    btn.textContent = 'Intră';
    if (!r.ok) {
      haptic('heavy');
      err.textContent = r.error === 'network' ? 'Fără conexiune la server.' : 'Utilizator sau parolă greșite.';
      err.classList.add('is-on');
      form.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 320 });
      return;
    }
    haptic('success');
    start();
  });
  setTimeout(() => $('#lg-user')?.focus(), 200);
}

/* ---------- shell ---------- */
async function start() {
  const me = await Admin.me();
  if (!me.ok) { showLogin(me.error === 'network' ? 'Fără conexiune la server.' : ''); return; }
  state.user = me.user;
  state.autoSms = Admin.smsAuto();
  await reloadAll();
  $('#login').hidden = true;
  $('#app').hidden = false;
  if (!started) {
    started = true;
    buildTabs();
    initAgenda($('#view-agenda'));
    initHistory($('#view-history'));
    initSchedule($('#view-schedule'));
    initTeam($('#view-team'));
  }
  setNavHidden(false);
  document.body.classList.remove('booting');
  go(sessionStorage.getItem('us-admin-tab') || 'agenda', true);
}

function buildTabs() {
  TABS.forEach((t) => {
    const b = $(`.tab[data-tab="${t.id}"]`);
    b.innerHTML = `<span class="tab__icon">${icon(t.icon, 'l')}${icon(t.icon + 'Fill', 'f')}</span><span class="tab__label">${t.label}</span>`;
  });
  $('#tabbar-glass').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    haptic('select');
    if (b.dataset.tab === current) { window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); return; }
    go(b.dataset.tab);
  });
  addEventListener('resize', () => movePill(TABS.findIndex((t) => t.id === current), false));
}

let pillX = 0;
function movePill(i, animate = true) {
  const pill = $('#tabbar-pill');
  const w = pill.offsetWidth;
  const to = i * w, from = pillX;
  pillX = to;
  pill.style.transform = `translateX(${to}px)`;
  if (!animate || reduceMotion() || from === to) return;
  pill.animate([
    { transform: `translateX(${from}px) scale(1, 1)` },
    { transform: `translateX(${(from + to) / 2}px) scale(${1 + Math.min(.4, .16 * Math.abs(to - from) / w)}, .92)`, offset: .42 },
    { transform: `translateX(${to}px) scale(1, 1)` },
  ], { duration: 540, easing: 'cubic-bezier(.3,1.3,.5,1)' });
}

function go(id, instant = false) {
  const t = TABS.find((x) => x.id === id) || TABS[0];
  if (current) scrollPos[current] = window.scrollY;
  // ascunde toate celelalte ecrane (și la prima pornire, când se intră direct pe alt tab)
  $$('main .view').forEach((v) => {
    if (v.id === `view-${t.id}`) return;
    v.hidden = true;
    v.classList.remove('is-active', 'is-entering');
  });
  const view = $(`#view-${t.id}`);
  view.hidden = false;
  view.classList.add('is-active');
  current = t.id;
  sessionStorage.setItem('us-admin-tab', t.id);
  t.show();
  window.scrollTo(0, scrollPos[t.id] || 0);
  if (!instant && !reduceMotion()) { view.classList.remove('is-entering'); void view.offsetWidth; view.classList.add('is-entering'); }
  const i = TABS.indexOf(t);
  $$('.tab').forEach((b, k) => { if (k === i) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  movePill(i, !instant);
  onScroll();
}

let sraf = 0;
function onScroll() {
  sraf = 0;
  const v = current && $(`#view-${current}`);
  if (v) v.classList.toggle('is-scrolled', window.scrollY > 6);
}
addEventListener('scroll', () => { if (!sraf) sraf = requestAnimationFrame(onScroll); }, { passive: true });

/* ---------- cont ---------- */
function accountSheet() {
  const me = barberOf(state.user.id) || state.user;
  const s = openSheet({
    label: 'Contul meu',
    body: `
      <div class="profile-hero">
        ${avatar(me)}
        <h3>${esc(me.name)}</h3>
        <p>@${esc(me.username || '')} · ${esc(fmt.phone(me.phone || ''))}</p>
      </div>
      <p class="sheet-sub">SMS către clienți</p>
      <div class="list">
        <div class="list__item"><span class="list__icon">${icon('message')}</span><span class="list__main"><b>${state.autoSms ? 'Automat' : 'Cu un tap, din Agenda'}</b>
          <small style="white-space:normal">${state.autoSms
            ? `Confirmarea și reminderul pleacă singure de pe ${esc(fmt.phone(me.phone || ''))}.`
            : `Confirmările și reminderele apar în Agenda la „SMS-uri de trimis”. Un tap deschide Mesaje cu textul gata scris, de pe telefonul tău.`}</small></span></div>
        <div class="list__item"><span class="list__icon">${icon(isRemote() ? 'globe' : 'smartphone')}</span><span class="list__main"><b>${isRemote() ? 'Conectat la server' : 'Mod demo'}</b>
          <small style="white-space:normal">${isRemote() ? 'Toți frizerii văd aceleași programări.' : 'Vezi programările făcute din aplicație pe acest dispozitiv. Pentru date comune și SMS automat, activează serverul (backend/README.md).'}</small></span></div>
      </div>
      <p class="sheet-sub">Cont</p>
      <div class="list">
        <button class="list__item" type="button" data-pw><span class="list__icon">${icon('lock')}</span><span class="list__main"><b>Schimbă parola</b><small>Recomandat după prima logare</small></span><span class="list__chev">${icon('chevR')}</span></button>
        <a class="list__item" href="./"><span class="list__icon">${icon('home')}</span><span class="list__main"><b>Aplicația clienților</b><small>Vezi ce văd clienții</small></span><span class="list__chev">${icon('chevR')}</span></a>
        <button class="list__item" type="button" data-logout><span class="list__icon">${icon('logout')}</span><span class="list__main"><b>Ieși din cont</b></span></button>
      </div>`,
  });
  s.el.querySelector('[data-logout]').addEventListener('click', () => {
    haptic();
    Admin.logout();
    s.close();
    setTimeout(() => showLogin(), 300);
  });
  s.el.querySelector('[data-pw]').addEventListener('click', () => { s.close(); setTimeout(passwordSheet, 320); });
}

function passwordSheet() {
  const s = openSheet({
    title: 'Schimbă parola',
    body: `
      <div class="field" style="margin:0 0 12px" data-f="old"><label class="field__label" for="pw-old">Parola curentă</label><input class="input" id="pw-old" type="password" autocomplete="current-password"><div class="field__err">Parola curentă nu e corectă.</div></div>
      <div class="field" style="margin:0 0 12px" data-f="new"><label class="field__label" for="pw-new">Parola nouă <small>minim 6 caractere</small></label><input class="input" id="pw-new" type="password" autocomplete="new-password"><div class="field__err">Minim 6 caractere.</div></div>`,
    foot: '<button class="btn btn--primary btn--block" type="button" data-save>Salvează parola</button>',
  });
  s.el.querySelector('[data-save]').addEventListener('click', async () => {
    const o = s.el.querySelector('#pw-old').value;
    const n = s.el.querySelector('#pw-new').value;
    s.el.querySelector('[data-f="new"]').classList.toggle('is-invalid', n.length < 6);
    if (n.length < 6) return;
    const r = await Admin.changePassword(o, n);
    if (!r.ok) {
      s.el.querySelector('[data-f="old"]').classList.toggle('is-invalid', r.error === 'credentials');
      if (r.error !== 'credentials') toast(errText(r.error), { ic: 'info', tone: 'red' });
      return;
    }
    s.close();
    toast('Parola a fost schimbată', { ic: 'check' });
  });
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-act="account"]')) { haptic(); accountSheet(); }
});

/* ---------- pornire ---------- */
async function boot() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  await Api.init().catch(() => {});
  bus.on('auth:expired', () => showLogin('Sesiunea a expirat. Intră din nou.'));
  const s = Admin.session();
  if (s && s.exp > Date.now()) await start();
  else showLogin();

  // programările noi apar fără reîncărcare
  onVisible(() => { if (state.user) loadBookings().then(() => bus.emit('admin:data')); });
  setInterval(() => { if (state.user && document.visibilityState === 'visible') loadBookings().then(() => bus.emit('admin:data')); }, 60000);
  addEventListener('storage', (e) => { if (state.user && e.key && /\.(bookings|team)$/.test(e.key)) reloadAll(); });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
