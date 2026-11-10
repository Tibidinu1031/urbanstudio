/* Agenda: programări viitoare (cu reamintire), istoric, anulare și reprogramare. */
import { SALON } from '../data.js';
import { icon } from '../icons.js';
import { esc, fmt, bus, haptic, toast, openSheet, isIOS, isStandalone } from '../lib.js';
import { Bookings } from '../store.js';
import { reminderText, notifState, enableNotifications, onCancelled, api } from '../reminders.js';
import { avatar, barberById, calendarSheet, directionsSheet, notifSheet } from '../components.js';

let el;
let tab = 0;
let installEvt = null;

export function initAgenda(root) {
  el = root;
  el.addEventListener('click', onClick);
  bus.on('bookings', () => { if (!el.hidden) render(); });
  bus.on('notif', () => { if (!el.hidden) render(); });
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (!el.hidden) render(); });
  setInterval(() => { if (!el.hidden) el.querySelectorAll('[data-cd]').forEach((c) => { c.textContent = fmt.countdown(Number(c.dataset.cd) - Date.now()); }); }, 30000);
}

export function onShow() { render(); }

function card(b, past = false) {
  const d = fmt.date(b.date, b.time);
  const barber = barberById(b.barberId);
  const rem = reminderText(b);
  let chips = '';
  if (!past) {
    chips += `<span class="chip chip--green" data-cd="${b.startMs}">${fmt.countdown(b.startMs - Date.now())}</span>`;
    if (rem) chips += `<span class="chip chip--blue">${icon('bell')} ${b.reminder.notified ? 'Reamintire trimisă' : `Reamintire ${rem.charAt(0).toLowerCase() + rem.slice(1)}`}</span>`;
    if (b.calendar) chips += `<span class="chip">${icon('calCheck')} În calendar</span>`;
  } else {
    const st = b.status === 'cancelled' ? ['chip--red', 'Anulată'] : b.status === 'rescheduled' ? ['', 'Reprogramată'] : ['', 'Finalizată'];
    chips = `<span class="chip ${st[0]}">${st[1]}</span>`;
  }
  return `
  <article class="bk ${past ? 'bk--past' : ''}">
    <div class="bk__top">
      <div class="bk__date"><span class="bk__day">${d.getDate()}</span><span class="bk__mon">${fmt.monthXS(d)}</span></div>
      <div class="bk__main">
        <div class="bk__time">${b.time}<span>${fmt.relDay(d)}</span></div>
        <div class="bk__title">${esc(b.serviceName)}</div>
        <div class="bk__meta">cu ${esc(b.barberShort)} · ${fmt.duration(b.duration)} · ${fmt.price(b.price)}</div>
      </div>
      ${avatar(barber, 'avatar--sm')}
    </div>
    <div class="bk__chips">${chips}</div>
    <div class="bk__actions">
      ${past
        ? `<button class="btn btn--secondary btn--sm" type="button" data-again="${b.id}">${icon('refresh')} Programează din nou</button>`
        : `<button class="btn btn--secondary btn--sm" type="button" data-cal="${b.id}">${icon('calendar')} Calendar</button>
           <button class="btn btn--secondary btn--sm" type="button" data-move="${b.id}">${icon('clock')} Mută</button>
           <button class="btn btn--secondary btn--sm icon-only" type="button" data-more="${b.id}" aria-label="Mai multe opțiuni">${icon('trash')}</button>`}
    </div>
  </article>`;
}

function notifCard() {
  const st = notifState();
  if (st === 'granted') return '';
  const copy = {
    default: ['Primește reamintirea pe telefon', 'Îți trimitem o notificare cu o zi înainte de fiecare programare.', `<button class="btn btn--primary btn--sm btn--block" type="button" data-act="enable">${icon('bell')} Activează notificările</button>`],
    'ios-install': ['Adaugă aplicația pe ecranul principal', 'Pe iPhone, notificările merg din aplicația instalată. Până atunci, folosește „Calendar”.', `<button class="btn btn--secondary btn--sm btn--block" type="button" data-act="notif-help">Vezi cum ${icon('chevR')}</button>`],
    denied: ['Notificările sunt blocate', 'Reactivează-le din setările browserului sau adaugă programarea în calendar.', ''],
    unsupported: ['Reamintire prin calendar', 'Browserul nu suportă notificări. Butonul „Calendar” setează alarma cu o zi înainte.', ''],
  }[st];
  if (!copy) return '';
  return `<div class="notif-card"><div class="notif-card__head"><span class="ico">${icon('bell')}</span><div><b>${copy[0]}</b><p>${copy[1]}</p></div></div>${copy[2]}</div>`;
}

function installCard() {
  if (isStandalone() || !installEvt) return '';
  return `<div class="notif-card"><div class="notif-card__head"><span class="ico">${icon('smartphone')}</span><div><b>Instalează aplicația</b><p>O ai pe ecranul principal, se deschide instant și primești reamintirile mai sigur.</p></div></div><button class="btn btn--secondary btn--sm btn--block" type="button" data-act="install">Instalează</button></div>`;
}

function render() {
  const up = Bookings.upcoming();
  const past = Bookings.past();
  const list = tab === 0 ? up : past;
  el.innerHTML = `
    <header class="topbar">
      <span class="spacer"></span>
      <div class="topbar__title">Agenda</div>
      <span class="spacer"></span>
    </header>
    <div class="page">
      <div class="hello">
        <div class="eyebrow">Programările tale</div>
        <h1 class="display">Agenda</h1>
      </div>
      <div class="seg" role="tablist" data-i="${tab}">
        <span class="seg__pill"></span>
        <button class="seg__btn" type="button" role="tab" aria-selected="${tab === 0}" data-tab-i="0">Următoare${up.length ? `<span>${up.length}</span>` : ''}</button>
        <button class="seg__btn" type="button" role="tab" aria-selected="${tab === 1}" data-tab-i="1">Istoric${past.length ? `<span>${past.length}</span>` : ''}</button>
      </div>
      ${tab === 0 && up.length ? notifCard() : ''}
      ${list.length
        ? `<div class="agenda-list">${list.map((b) => card(b, tab === 1)).join('')}</div>`
        : emptyState()}
      ${tab === 0 ? installCard() : ''}
    </div>`;
}

function emptyState() {
  const art = `<svg class="empty-state__art" viewBox="0 0 132 132" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="22" y="30" width="88" height="80" rx="18" stroke-opacity=".5"/><path d="M22 52h88M46 20v18M86 20v18" stroke-opacity=".5"/>
    <circle cx="50" cy="72" r="7"/><circle cx="50" cy="96" r="7"/><path d="M56.5 75.5 92 97M56.5 92.5 92 71"/>
  </svg>`;
  const hasPast = Bookings.past().length > 0;
  return tab === 0
    ? `<div class="empty-state">${art}<b>${hasPast ? 'Nicio programare viitoare' : 'Nicio programare încă'}</b><p>Alege serviciul și ora care ți se potrivesc. Îți amintim cu o zi înainte.</p><button class="btn btn--primary" type="button" data-act="book">Programează-te ${icon('arrowR')}</button></div>`
    : `<div class="empty-state">${art}<b>Istoricul e gol</b><p>Aici apar programările trecute, ca să le poți repeta cu un tap.</p></div>`;
}

function onClick(e) {
  const t = e.target.closest('[data-act],[data-tab-i],[data-cal],[data-move],[data-more],[data-again]');
  if (!t) return;
  haptic();
  if (t.dataset.tabI) { tab = Number(t.dataset.tabI); render(); return; }
  if (t.dataset.cal) { calendarSheet(Bookings.get(t.dataset.cal)); return; }
  if (t.dataset.move) {
    const b = Bookings.get(t.dataset.move);
    bus.emit('book:start', { serviceId: b.serviceId, barberId: b.anyBarber ? 'any' : b.barberId, rescheduleId: b.id });
    toast('Alege noua oră. Programarea veche se anulează automat.', { ic: 'clock' });
    return;
  }
  if (t.dataset.more) { manage(Bookings.get(t.dataset.more)); return; }
  if (t.dataset.again) {
    const b = Bookings.get(t.dataset.again);
    bus.emit('book:start', { serviceId: b.serviceId, barberId: b.barberId });
    return;
  }
  const act = t.dataset.act;
  if (act === 'book') bus.emit('book:start', {});
  else if (act === 'enable') enableNotifications().then((r) => { if (r === 'granted') toast('Notificările sunt active', { ic: 'bell', tone: 'blue' }); render(); });
  else if (act === 'notif-help') notifSheet();
  else if (act === 'install' && installEvt) { installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; render(); }); }
}

function manage(b) {
  const d = fmt.date(b.date, b.time);
  const s = openSheet({
    title: 'Programarea ta',
    body: `
      <div class="list">
        <div class="list__item"><span class="list__icon">${icon('calendar')}</span><span class="list__main"><b>${fmt.dayLong(d)}, ${b.time}</b><small>${esc(b.serviceName)} cu ${esc(b.barberName)}</small></span></div>
        <button class="list__item" type="button" data-dir><span class="list__icon">${icon('nav')}</span><span class="list__main"><b>Indicații</b><small>${esc(SALON.address)}</small></span><span class="list__chev">${icon('chevR')}</span></button>
        <a class="list__item" href="tel:${SALON.phoneIntl}"><span class="list__icon">${icon('phone')}</span><span class="list__main"><b>Sună la salon</b><small>${SALON.phone}</small></span><span class="list__chev">${icon('chevR')}</span></a>
      </div>
      <p class="fineprint">${icon('info')}<span>Cod programare: <b class="ticket__code" style="color:var(--fg)">${b.id}</b></span></p>`,
    foot: `<button class="btn btn--danger btn--block" type="button" data-cancel>${icon('trash')} Anulează programarea</button>`,
  });
  s.el.querySelector('[data-dir]').addEventListener('click', () => { s.close(); setTimeout(directionsSheet, 300); });
  const cancelBtn = s.el.querySelector('[data-cancel]');
  let armed = false;
  cancelBtn.addEventListener('click', () => {
    haptic('heavy');
    if (!armed) {
      armed = true;
      cancelBtn.innerHTML = 'Apasă din nou pentru a confirma';
      setTimeout(() => { if (armed && document.body.contains(cancelBtn)) { armed = false; cancelBtn.innerHTML = `${icon('trash')} Anulează programarea`; } }, 3500);
      return;
    }
    const upd = Bookings.update(b.id, { status: 'cancelled', cancelledAt: Date.now() });
    api('cancel', { id: b.id });
    onCancelled(upd);
    s.close();
    toast('Programarea a fost anulată', { ic: 'check' });
  });
}
