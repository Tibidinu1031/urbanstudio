/* Fluxul de programare: serviciu → frizer → dată și oră → detalii → confirmare. */
import { SERVICES, SERVICE_GROUPS, BARBERS, ACADEMY } from '../data.js';
import { icon } from '../icons.js';
import { esc, fmt, bus, haptic, toast, showCTA, hideCTA, setNavHidden, pushStep, unwind, fadeImages, $ } from '../lib.js';
import { Bookings, Profile, newCode } from '../store.js';
import { freeSlots, nextAvailable, bookingDays, hoursFor, loadRemote, remoteReady, toMin, toTime } from '../slots.js';
import { planReminder, reminderText, notifState, enableNotifications, onBooked, onCancelled, api, hasServer, whatsappUrl } from '../reminders.js';
import { avatar, barberById, serviceById, academySheet, calendarSheet, notifSheet, privacySheet } from '../components.js';

const STEPS = [
  { label: 'Serviciu', title: 'Ce facem azi?', sub: 'Prețurile sunt finale, plătești la salon.' },
  { label: 'Frizer', title: 'Alege frizerul', sub: 'Sau lasă-ne să alegem primul liber.' },
  { label: 'Data și ora', title: 'Când vii?', sub: '' },
  { label: 'Detalii', title: 'Aproape gata', sub: 'Verifică programarea și lasă-ne un număr de telefon.' },
];

let el;
let state;
let depth = 0;
let mode = 'flow'; // flow | success
let last = null;
let active = false;

function fresh(pre = {}) {
  const p = Profile.get();
  return {
    step: 0,
    serviceId: pre.serviceId || null,
    barberId: pre.barberId || null,
    date: null,
    time: null,
    name: p.name || '',
    phone: p.phone || '',
    email: p.email || '',
    notes: '',
    remind: true,
    rescheduleId: pre.rescheduleId || null,
  };
}

export function initBooking(root) {
  el = root;
  state = fresh();
  el.addEventListener('click', onClick);
  el.addEventListener('input', onInput);
  el.addEventListener('focusout', onBlur);
  bus.on('book:start', (pre = {}) => {
    if (depth) { unwind(depth); depth = 0; }
    state = fresh(pre);
    mode = 'flow';
    if (state.serviceId) state.step = state.barberId ? 2 : 1;
    if (state.step > 0) { pushStep(); depth = 1; }
    bus.emit('nav', 'book');
  });
  bus.on('bookings', () => { if (active && mode === 'success') render(); });
  bus.on('notif', () => { if (active && mode === 'success') render(); });
}

export function onShow() { active = true; render(); }
export function onHide() { active = false; hideCTA(); }
export function handleBack() {
  if (!active || mode !== 'flow' || state.step === 0) return false;
  depth = Math.max(0, depth - 1);
  state.step -= 1;
  render('back');
  return true;
}

/* ---------- navigare între pași ---------- */
function go(step, dir = 'fwd') {
  if (step > state.step) { pushStep(); depth += step - state.step > 0 ? 1 : 0; }
  state.step = step;
  render(dir);
  window.scrollTo({ top: 0 });
}
function back() {
  if (depth > 0) history.back();
  else if (state.step > 0) { state.step -= 1; render('back'); }
}
function exitFlow() {
  if (depth) { unwind(depth); depth = 0; }
  state = fresh();
  mode = 'flow';
  render('back');
  window.scrollTo({ top: 0 });
}

/* ---------- randare ---------- */
function render(dir) {
  if (mode === 'success') return renderSuccess();
  const s = STEPS[state.step];
  const svc = serviceById(state.serviceId);
  const barber = state.barberId && state.barberId !== 'any' ? barberById(state.barberId) : null;
  let sub = s.sub;
  if (state.step === 2 && svc) sub = `${svc.name} · ${fmt.duration(svc.duration)} · ${barber ? `cu ${barber.short}` : 'primul frizer liber'}`;

  el.innerHTML = `
    <header class="topbar topbar--flow">
      ${state.step > 0 ? `<button class="icon-btn" type="button" data-act="back" aria-label="Înapoi">${icon('chevL', 'i--sm')}</button>` : '<span class="spacer"></span>'}
      <div class="steps" aria-hidden="true">${STEPS.map((_, i) => `<i class="${i <= state.step ? 'is-on' : ''}"></i>`).join('')}</div>
      ${state.step > 0 || state.serviceId ? `<button class="icon-btn icon-btn--plain" type="button" data-act="exit" aria-label="Renunță la programare">${icon('x', 'i--sm')}</button>` : '<span class="spacer"></span>'}
    </header>
    <p class="flow__eyebrow">Pasul ${state.step + 1} din ${STEPS.length} · ${s.label}</p>
    <h1 class="flow__title">${s.title}</h1>
    ${sub ? `<p class="flow__sub">${esc(sub)}</p>` : ''}
    <div class="flow__body ${dir ? `slide-${dir}` : ''}">${[stepService, stepBarber, stepTime, stepDetails][state.step]()}</div>`;

  setNavHidden(state.step > 0);
  if (state.step === 2) afterTimeRender();
  fadeImages(el);
  updateCTA();
}

function stepService() {
  const lock = state.barberId && state.barberId !== 'any' ? barberById(state.barberId) : null;
  return `
    ${lock ? `<div class="optlist" style="margin-bottom:22px"><div class="opt" aria-checked="true" style="min-height:62px">${avatar(lock, 'avatar--sm')}<span class="opt__main"><span class="opt__name">Cu ${esc(lock.short)}</span><span class="opt__meta">Frizer ales</span></span><button class="link-btn" type="button" data-act="unlock">Schimbă</button></div></div>` : ''}
    ${SERVICE_GROUPS.map((g) => `
      <div class="group-label">${g.label}</div>
      <div class="optlist" role="radiogroup" aria-label="${g.label}">
        ${SERVICES.filter((x) => x.group === g.id).map((x) => `
          <button class="opt" type="button" role="radio" aria-checked="${state.serviceId === x.id}" data-pick-service="${x.id}">
            <span class="opt__icon">${icon(x.icon)}</span>
            <span class="opt__main">
              <span class="opt__name">${esc(x.name)}</span>
              <span class="opt__meta">${fmt.duration(x.duration)}<i class="sep"></i>${esc(x.note)}</span>
            </span>
            <span class="opt__side"><span class="opt__price">${fmt.price(x.price)}</span></span>
          </button>`).join('')}
      </div>`).join('')}
    <button class="course-card press" type="button" data-act="academy">
      <span class="opt__icon">${icon('cap')}</span>
      <span class="grow"><b>${ACADEMY.name}</b><small>${ACADEMY.length} · ${ACADEMY.modules} module · ${fmt.price(ACADEMY.price)}</small></span>
      ${icon('chevR', 'i--sm')}
    </button>`;
}

function freeLabel(barberId, duration) {
  const n = nextAvailable(barberId, duration);
  if (!n) return '<span>Fără locuri în următoarele săptămâni</span>';
  return `<span class="ok">Liber ${fmt.relDay(n.date).toLowerCase()} la ${n.slot.time}</span>`;
}

function stepBarber() {
  const svc = serviceById(state.serviceId);
  const dur = svc?.duration || 30;
  return `
    <div class="optlist" role="radiogroup" aria-label="Frizer">
      <button class="opt opt--any" type="button" role="radio" aria-checked="${state.barberId === 'any'}" data-pick-barber="any">
        <span class="any-av">${icon('users')}</span>
        <span class="opt__main">
          <span class="opt__name">Primul disponibil <span class="opt__tag">RAPID</span></span>
          <span class="opt__meta">${freeLabel('any', dur)}</span>
        </span>
        <span class="opt__check">${icon('check')}</span>
      </button>
      ${BARBERS.map((b) => `
        <button class="opt" type="button" role="radio" aria-checked="${state.barberId === b.id}" data-pick-barber="${b.id}">
          ${avatar(b)}
          <span class="opt__main">
            <span class="opt__name">${esc(b.name)}</span>
            <span class="opt__meta">${b.rating ? `${icon('star', 'i--xs')} ${String(b.rating).replace('.', ',')}<i class="sep"></i>` : ''}${esc(b.role.split(' · ')[0])}</span>
            <span class="opt__meta">${freeLabel(b.id, dur)}</span>
          </span>
          <span class="opt__check">${icon('check')}</span>
        </button>`).join('')}
    </div>`;
}

function dayInfo(d, dur) {
  if (!hoursFor(d)) return { closed: true, n: 0 };
  return { closed: false, n: freeSlots(d, state.barberId, dur, { ignoreId: state.rescheduleId }).length };
}

function stepTime() {
  const svc = serviceById(state.serviceId);
  const days = bookingDays();
  if (!state.date) {
    const first = days.find((d) => dayInfo(d, svc.duration).n > 0) || days[0];
    state.date = fmt.iso(first);
  }
  const sel = fmt.date(state.date);
  return `
    <div class="month">
      <span class="month__name" data-month>${fmt.month(sel)} ${sel.getFullYear()}</span>
      <span class="month__legend"><span><i style="background:var(--green)"></i>Liber</span><span><i style="background:var(--amber)"></i>Puține locuri</span></span>
    </div>
    <div class="dates" role="tablist" aria-label="Alege ziua" data-dates>
      ${days.map((d) => {
        const iso = fmt.iso(d);
        const info = dayInfo(d, svc.duration);
        const rel = fmt.relDay(d);
        const dow = rel === 'Azi' || rel === 'Mâine' ? rel : fmt.dowShort(d);
        const cls = info.closed ? 'is-closed' : info.n === 0 ? 'is-full' : '';
        const tag = info.closed ? 'ÎNCHIS' : info.n === 0 ? '' : `<i class="${info.n <= 5 ? 'few' : ''}"></i>`;
        return `<button class="date ${cls}" type="button" role="tab" aria-selected="${iso === state.date}" data-pick-date="${iso}" data-month-label="${fmt.month(d)} ${d.getFullYear()}" ${info.closed ? 'aria-disabled="true"' : ''} aria-label="${fmt.dayLong(d)}${info.closed ? ', închis' : ''}">
          <span class="date__dow">${dow}</span><span class="date__num">${d.getDate()}</span><span class="date__tag">${tag}</span>
        </button>`;
      }).join('')}
    </div>
    <div data-slots>${slotsHTML()}</div>`;
}

function slotsHTML() {
  const svc = serviceById(state.serviceId);
  const d = fmt.date(state.date);
  if (!hoursFor(d)) {
    return emptyHTML('Salonul e închis în această zi', 'Lunea și duminica nu lucrăm. Alege altă zi din calendar.');
  }
  if (!remoteReady(state.date)) {
    return `<div class="slot-group"><div class="slots is-loading">${'<span class="slot">00:00</span>'.repeat(8)}</div></div>`;
  }
  const slots = freeSlots(d, state.barberId, svc.duration, { ignoreId: state.rescheduleId });
  if (!slots.length) {
    const days = bookingDays();
    const next = days.find((x) => x > d && dayInfo(x, svc.duration).n > 0);
    return emptyHTML('Nicio oră liberă în această zi', next ? `Prima zi cu locuri libere: ${fmt.dayLong(next).toLowerCase()}.` : 'Încearcă alt frizer.', next ? fmt.iso(next) : null);
  }
  const groups = [
    { label: 'Dimineața', ic: 'clock', items: slots.filter((s) => s.min < 720) },
    { label: 'După-amiaza', ic: 'clock', items: slots.filter((s) => s.min >= 720 && s.min < 1020) },
    { label: 'Seara', ic: 'clock', items: slots.filter((s) => s.min >= 1020) },
  ].filter((g) => g.items.length);
  return groups.map((g) => `
    <div class="slot-group">
      <div class="slot-group__label">${g.label}<small>${g.items.length === 1 ? 'o oră liberă' : `${g.items.length} ore libere`}</small></div>
      <div class="slots">${g.items.map((s) => `<button class="slot" type="button" aria-pressed="${s.time === state.time}" data-pick-time="${s.time}">${s.time}</button>`).join('')}</div>
    </div>`).join('');
}

function emptyHTML(title, text, jumpIso) {
  return `<div class="empty"><div class="empty__icon">${icon('calendar')}</div><b>${title}</b><p>${text}</p>${jumpIso ? `<button class="btn btn--secondary btn--sm" type="button" data-pick-date="${jumpIso}">Mergi la ziua liberă ${icon('arrowR')}</button>` : ''}</div>`;
}

function afterTimeRender() {
  const strip = el.querySelector('[data-dates]');
  const sel = strip?.querySelector('[aria-selected="true"]');
  if (sel) strip.scrollLeft = Math.max(0, sel.offsetLeft - strip.offsetLeft - 20 - 68);
  const month = el.querySelector('[data-month]');
  let raf = 0;
  strip?.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const b = [...strip.children].find((c) => c.offsetLeft + c.offsetWidth - strip.offsetLeft > strip.scrollLeft + 24);
      if (b && month.textContent !== b.dataset.monthLabel) month.textContent = b.dataset.monthLabel;
    });
  }, { passive: true });
  if (!remoteReady(state.date)) loadRemote(state.date).then(() => refreshSlots());
}

function refreshSlots() {
  const box = el.querySelector('[data-slots]');
  if (!box) return;
  box.innerHTML = slotsHTML();
  box.firstElementChild?.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' });
}

function stepDetails() {
  const svc = serviceById(state.serviceId);
  const d = fmt.date(state.date, state.time);
  const end = toTime(toMin(state.time) + svc.duration);
  const barber = state.barberId === 'any' ? null : barberById(state.barberId);
  return `
    <div class="summary">
      <button class="summary__row" type="button" data-jump="0"><span class="ico">${icon(svc.icon)}</span><span class="grow"><small>Serviciu</small><b>${esc(svc.name)}</b></span><span class="edit">Modifică</span></button>
      <button class="summary__row" type="button" data-jump="1">${barber ? avatar(barber, 'avatar--sm') : `<span class="ico">${icon('users')}</span>`}<span class="grow"><small>Frizer</small><b>${barber ? esc(barber.name) : 'Primul disponibil'}</b></span><span class="edit">Modifică</span></button>
      <button class="summary__row" type="button" data-jump="2"><span class="ico">${icon('calendar')}</span><span class="grow"><small>Data și ora · până la ${end}</small><b>${fmt.dayTiny(d)} · ${state.time}</b></span><span class="edit">Modifică</span></button>
      <div class="summary__total"><span>Total, plătit la salon</span><b>${fmt.price(svc.price)}</b></div>
    </div>

    <div class="form">
      <div class="field" data-field="name">
        <label class="field__label" for="f-name">Nume</label>
        <input class="input" id="f-name" name="name" autocomplete="name" autocapitalize="words" enterkeyhint="next" placeholder="Numele tău" value="${esc(state.name)}">
        <div class="field__err">Spune-ne cum te cheamă.</div>
      </div>
      <div class="field" data-field="phone">
        <label class="field__label" for="f-phone">Telefon</label>
        <input class="input tnum" id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" enterkeyhint="next" placeholder="07xx xxx xxx" value="${esc(state.phone)}">
        <div class="field__err">Verifică numărul: 10 cifre, începe cu 07.</div>
      </div>
      <div class="field" data-field="email">
        <label class="field__label" for="f-email">Email <small>${hasServer() ? 'opțional, pentru confirmare și reamintire' : 'opțional'}</small></label>
        <input class="input" id="f-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" enterkeyhint="next" placeholder="nume@exemplu.ro" value="${esc(state.email)}">
        <div class="field__err">Adresa de email nu pare corectă.</div>
      </div>
      <div class="field" data-field="notes">
        <label class="field__label" for="f-notes">Mesaj pentru frizer <small>opțional</small></label>
        <textarea class="input" id="f-notes" name="notes" rows="3" enterkeyhint="done" placeholder="De exemplu: fade mai sus pe lateral">${esc(state.notes)}</textarea>
      </div>
    </div>

    <button class="toggle-card" type="button" role="switch" aria-checked="${state.remind}" data-act="remind">
      <span class="ico">${icon('bell')}</span>
      <span class="grow"><b>Reamintire cu o zi înainte</b><small>Notificare pe telefon, plus alarmă în calendar dacă vrei.</small></span>
      <span class="switch" aria-hidden="true"></span>
    </button>
    <p class="fineprint">${icon('wallet')}<span>Plata se face la salon. Dacă nu mai poți ajunge, anulezi din Agenda cu un tap.</span></p>
    <p class="fineprint">${icon('shield')}<span>Datele tale sunt folosite doar pentru această programare. <button type="button" data-act="privacy">Confidențialitate</button></span></p>`;
}

/* ---------- CTA ---------- */
function updateCTA() {
  if (!active) return;
  const svc = serviceById(state.serviceId);
  if (state.step === 0 && svc) {
    showCTA({ title: svc.name, sub: `${fmt.price(svc.price)} · ${fmt.duration(svc.duration)}`, label: `Continuă ${icon('arrowR')}`, onClick: () => go(state.barberId ? 2 : 1) });
  } else if (state.step === 1 && state.barberId) {
    const b = state.barberId === 'any' ? null : barberById(state.barberId);
    showCTA({ title: b ? b.name : 'Primul disponibil', sub: svc ? `${svc.name} · ${fmt.price(svc.price)}` : '', label: `Continuă ${icon('arrowR')}`, onClick: () => go(2) });
  } else if (state.step === 2 && state.time) {
    const d = fmt.date(state.date, state.time);
    showCTA({ title: `${fmt.relDay(d)} · ${state.time}`, sub: `${svc.name} · ${fmt.price(svc.price)}`, label: `Continuă ${icon('arrowR')}`, onClick: () => go(3) });
  } else if (state.step === 3) {
    showCTA({ title: fmt.price(svc.price), sub: 'Plătești la salon', label: 'Confirmă', onClick: confirm });
  } else {
    hideCTA();
  }
}

/* ---------- interacțiuni ---------- */
function onClick(e) {
  const t = e.target.closest('[data-act],[data-pick-service],[data-pick-barber],[data-pick-date],[data-pick-time],[data-jump]');
  if (!t) return;

  if (t.dataset.pickService) {
    haptic('select');
    state.serviceId = t.dataset.pickService;
    state.time = null;
    el.querySelectorAll('[data-pick-service]').forEach((b) => b.setAttribute('aria-checked', String(b === t)));
    setTimeout(() => { if (state.step === 0) go(state.barberId ? 2 : 1); }, 280);
    return;
  }
  if (t.dataset.pickBarber) {
    haptic('select');
    state.barberId = t.dataset.pickBarber;
    state.time = null;
    state.date = null;
    el.querySelectorAll('[data-pick-barber]').forEach((b) => b.setAttribute('aria-checked', String(b === t)));
    setTimeout(() => { if (state.step === 1) go(2); }, 280);
    return;
  }
  if (t.dataset.pickDate) {
    if (t.getAttribute('aria-disabled') === 'true') { haptic(); toast('Salonul e închis în această zi', { ic: 'info' }); return; }
    haptic('select');
    state.date = t.dataset.pickDate;
    state.time = null;
    el.querySelectorAll('[data-dates] [data-pick-date]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pickDate === state.date)));
    const selBtn = el.querySelector(`[data-dates] [data-pick-date="${state.date}"]`);
    selBtn?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    if (!remoteReady(state.date)) loadRemote(state.date).then(() => refreshSlots());
    refreshSlots();
    updateCTA();
    return;
  }
  if (t.dataset.pickTime) {
    haptic('select');
    state.time = t.dataset.pickTime;
    el.querySelectorAll('[data-pick-time]').forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
    updateCTA();
    return;
  }
  if (t.dataset.jump) { haptic(); state.step = Number(t.dataset.jump); render('back'); window.scrollTo({ top: 0 }); return; }

  const act = t.dataset.act;
  if (act === 'back') { haptic(); back(); }
  else if (act === 'exit') { haptic(); exitFlow(); }
  else if (act === 'academy') { haptic(); academySheet(); }
  else if (act === 'privacy') { privacySheet(); }
  else if (act === 'unlock') { haptic(); state.barberId = null; render(); }
  else if (act === 'remind') {
    haptic('select');
    state.remind = !state.remind;
    t.setAttribute('aria-checked', String(state.remind));
  }
  else if (act === 'done') { haptic(); finishSuccess(); }
  else if (act === 'calendar' && last) { haptic(); calendarSheet(Bookings.get(last.id) || last); }
  else if (act === 'notif') { haptic(); notifState() === 'default' ? enableNotifications() : notifSheet(); }
}

function onInput(e) {
  const f = e.target.closest('[data-field]');
  if (!f) return;
  state[f.dataset.field] = e.target.value;
  if (f.classList.contains('is-invalid') && validField(f.dataset.field)) f.classList.remove('is-invalid');
}
function onBlur(e) {
  const f = e.target.closest('[data-field]');
  if (!f) return;
  if (f.dataset.field === 'phone' && state.phone) { state.phone = fmt.phone(state.phone.trim()); e.target.value = state.phone; }
  if (state[f.dataset.field] && !validField(f.dataset.field)) f.classList.add('is-invalid');
}

function validField(k) {
  const v = (state[k] || '').trim();
  if (k === 'name') return v.length >= 2;
  if (k === 'phone') {
    const d = v.replace(/\D/g, '');
    return (d.length === 10 && d.startsWith('07')) || (d.length === 11 && d.startsWith('407')) || (v.startsWith('+') && d.length >= 10 && d.length <= 15);
  }
  if (k === 'email') return !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  return true;
}

/* ---------- confirmare ---------- */
async function confirm() {
  const bad = ['name', 'phone', 'email'].filter((k) => !validField(k));
  if (bad.length) {
    haptic('heavy');
    bad.forEach((k) => {
      const f = el.querySelector(`[data-field="${k}"]`);
      f.classList.add('is-invalid', 'shake');
      setTimeout(() => f.classList.remove('shake'), 450);
    });
    el.querySelector(`[data-field="${bad[0]}"] input`)?.focus();
    return;
  }

  // permisiunea pentru notificări se cere chiar în momentul confirmării (gest al utilizatorului)
  const notifAsk = state.remind && notifState() === 'default' ? enableNotifications() : null;

  const svc = serviceById(state.serviceId);
  const slots = freeSlots(fmt.date(state.date), state.barberId, svc.duration, { ignoreId: state.rescheduleId });
  const slot = slots.find((s) => s.time === state.time);
  if (!slot) {
    toast('Ora aleasă tocmai s-a ocupat. Alege alta.', { ic: 'clock', tone: 'red' });
    state.time = null;
    state.step = 2;
    render('back');
    return;
  }
  const barberId = state.barberId === 'any' ? slot.barbers[0] : state.barberId;
  const barber = barberById(barberId);
  const start = fmt.date(state.date, state.time);
  const startMs = start.getTime();
  const plan = state.remind ? planReminder(startMs) : null;
  const b = {
    id: newCode(),
    status: 'confirmed',
    serviceId: svc.id, serviceName: svc.name, price: svc.price, duration: svc.duration,
    barberId, barberName: barber.name, barberShort: barber.short, anyBarber: state.barberId === 'any',
    date: state.date, time: state.time, startMs, endMs: startMs + svc.duration * 6e4,
    name: state.name.trim(), phone: state.phone.trim(), email: state.email.trim(), notes: state.notes.trim(),
    remind: state.remind, reminder: plan ? { ...plan, notified: false } : null,
    createdAt: Date.now(),
  };

  const btn = $('#cta-btn');
  btn.disabled = true;
  btn.innerHTML = 'Se trimite';

  Profile.set({ name: b.name, phone: b.phone, email: b.email });
  if (state.rescheduleId) {
    const old = Bookings.update(state.rescheduleId, { status: 'rescheduled', replacedBy: b.id });
    if (old) { api('cancel', { id: old.id, reason: 'reprogramare' }); onCancelled(old); }
  }
  Bookings.add(b);
  api('book', { booking: b });
  if (notifAsk) await notifAsk;
  await onBooked(b);

  haptic('success');
  last = b;
  mode = 'success';
  if (depth) { unwind(depth); depth = 0; }
  hideCTA();
  render();
  window.scrollTo({ top: 0 });
}

function renderSuccess() {
  const b = Bookings.get(last.id) || last;
  const d = fmt.date(b.date, b.time);
  const barber = barberById(b.barberId);
  const rem = reminderText(b);
  const ns = notifState();
  setNavHidden(false);
  hideCTA();
  el.innerHTML = `
    <header class="topbar">
      <span class="spacer"></span>
      <div class="topbar__title">Confirmare</div>
      <button class="icon-btn icon-btn--plain" type="button" data-act="done" aria-label="Închide">${icon('x', 'i--sm')}</button>
    </header>
    <div class="success">
      <div class="success__check" aria-hidden="true">
        <svg viewBox="0 0 92 92"><circle class="ring" pathLength="1" cx="46" cy="46" r="43" fill="none" stroke="#F6F6F3" stroke-width="3"/><path class="tick" pathLength="1" d="M29 47.5l11 11 23-25" fill="none" stroke="#F6F6F3" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <h1 class="success__title">Ești programat</h1>
      <p class="success__sub">Te așteptăm ${fmt.relDayLong(d).toLowerCase()}, la ${b.time}. ${b.anyBarber ? `Te preia ${esc(b.barberShort)}.` : ''}</p>
    </div>

    <div class="ticket" style="--cut:106px">
      <div class="ticket__stripe"></div>
      <div class="ticket__main">
        ${avatar(barber)}
        <div class="grow"><b>${esc(b.serviceName)}</b><small>cu ${esc(b.barberName)}</small></div>
        <span class="ticket__price">${fmt.price(b.price)}</span>
      </div>
      <div class="ticket__cut"></div>
      <div class="ticket__grid">
        <div><small>Data</small><b>${fmt.dayMed(d)}</b></div>
        <div><small>Ora</small><b class="big">${b.time}</b></div>
        <div><small>Durată</small><b>${fmt.duration(b.duration)}</b></div>
        <div><small>Cod</small><b class="ticket__code">${b.id}</b></div>
      </div>
    </div>

    <div class="remcard">
      <div class="remcard__head">
        <span class="ico">${icon('bell')}</span>
        <div>${rem
          ? `<b>Reamintire ${rem.charAt(0).toLowerCase() + rem.slice(1)}</b><small>${b.reminder.kind === 'day' ? 'Cu o zi înainte de programare' : 'Cu 2 ore înainte de programare'}</small>`
          : `<b>${b.remind ? 'Programarea e foarte aproape' : 'Reamintirea e oprită'}</b><small>${b.remind ? 'Nu mai e nevoie de reamintire' : 'O poți adăuga oricând în calendar'}</small>`}</div>
      </div>
      <ul class="remcard__list">
        ${b.remind && b.reminder ? `<li class="${ns === 'granted' ? 'on' : ''}">${icon(ns === 'granted' ? 'check' : 'smartphone')}<span>Notificare pe telefon</span>${ns === 'granted' ? '' : `<button class="btn btn--xs btn--secondary act" type="button" data-act="notif">Activează</button>`}</li>` : ''}
        <li class="${b.calendar ? 'on' : ''}">${icon(b.calendar ? 'check' : 'calendar')}<span>Alarmă în calendar</span>${b.calendar ? '' : `<button class="btn btn--xs btn--secondary act" type="button" data-act="calendar">Adaugă</button>`}</li>
        ${hasServer() && b.email ? `<li class="on">${icon('check')}<span>Email la ${esc(b.email)}</span></li>` : ''}
      </ul>
    </div>

    <div class="success__actions">
      <a class="btn btn--secondary btn--block" href="${whatsappUrl(b)}" target="_blank" rel="noopener">${icon('whatsapp')} Trimite confirmarea pe WhatsApp</a>
      <button class="btn btn--ghost btn--block" type="button" data-act="done">Vezi în Agenda</button>
    </div>`;
}

function finishSuccess() {
  mode = 'flow';
  state = fresh();
  bus.emit('nav', 'agenda');
}
