/* Starea panoului și piese comune: foaia unei programări, SMS manual, programare nouă din panou. */
import { Api, Admin, isRemote, withSms } from '../api.js';
import { SERVICES, CONFIG } from '../data.js';
import { icon } from '../icons.js';
import { esc, fmt, haptic, toast, openSheet, bus } from '../lib.js';
import { avatar } from '../components.js';
import { smsText, smsLink, smsDue, smsStatusLabel, toIntl } from '../sms.js';
import { freeSlots, toMin, toTime } from '../slots.js';
import { planReminder } from '../reminders.js';
import { newCode } from '../store.js';
import { logoSVG } from '../logo.js';

export const state = { user: null, team: [], bookings: [], autoSms: false };

export async function loadTeam() {
  const r = await Admin.team();
  if (r.ok) state.team = r.team;
  return r;
}
export async function loadBookings() {
  const r = await Admin.bookings({});
  if (r.ok) state.bookings = r.bookings.map((b) => withSms(b));
  return r;
}
export async function reloadAll() {
  await Promise.all([loadTeam(), loadBookings()]);
  bus.emit('admin:data');
}

export const teamActive = () => state.team.filter((b) => b.active !== false);
export const barberOf = (id) => state.team.find((b) => b.id === id) || Api.barber(id);

export function bookingStatus(b, now = Date.now()) {
  if (b.status === 'cancelled') return { key: 'cancelled', text: 'Anulată', tone: 'red' };
  if (b.status === 'rescheduled') return { key: 'rescheduled', text: 'Mutată', tone: '' };
  if (b.endMs < now) return { key: 'done', text: 'Finalizată', tone: '' };
  if (b.startMs <= now) return { key: 'now', text: 'În desfășurare', tone: 'green' };
  return { key: 'confirmed', text: 'Confirmată', tone: 'blue' };
}

export function errText(e) {
  return ({
    network: 'Fără conexiune la server. Încearcă din nou.',
    taken: 'Ora e deja ocupată la acest frizer.',
    'username-taken': 'Numele de utilizator e deja folosit.',
    username: 'Completează numele de utilizator.',
    password: 'Setează o parolă pentru contul nou.',
    self: 'Nu îți poți dezactiva propriul cont.',
    last: 'Trebuie să rămână cel puțin un frizer activ.',
    credentials: 'Parola curentă nu e corectă.',
    manual: 'Fără gateway SMS: trimite manual.',
    live: 'Programarea e încă activă. Anuleaz-o mai întâi.',
    op: 'Serverul nu are încă această funcție. Actualizează scriptul Google.',
  })[e] || 'Ceva n-a mers. Încearcă din nou.';
}

export function barberChips(selected, { allowAll = true, attr = 'barber' } = {}) {
  const me = state.user?.id;
  return `<div class="chip-row" role="tablist">
    ${allowAll ? `<button class="chip-btn" type="button" data-${attr}="" aria-pressed="${!selected}">Toți</button>` : ''}
    ${teamActive().map((b) => `<button class="chip-btn" type="button" data-${attr}="${b.id}" aria-pressed="${selected === b.id}">${avatar(b, 'avatar--sm')}${esc(b.short)}${b.id === me ? ' <small>tu</small>' : ''}</button>`).join('')}
  </div>`;
}

export function topbar({ title, plus = false }) {
  const me = barberOf(state.user.id) || state.user;
  return `<header class="topbar">
    <div class="topbar__brand">${logoSVG()}<span class="adm-tag">Frizeri</span></div>
    <div class="topbar__title">${esc(title)}</div>
    <div class="topbar__actions">
      ${plus ? `<button class="icon-btn" type="button" data-act="new" aria-label="Programare nouă">${icon('plus', 'i--sm')}</button>` : ''}
      <button class="me-btn" type="button" data-act="account" aria-label="Contul meu">${avatar(me)}</button>
    </div>
  </header>`;
}

export function modeChip() {
  if (!isRemote()) return `<span class="chip mode-chip">${icon('smartphone')} Demo · date doar pe acest dispozitiv</span>`;
  return state.autoSms
    ? `<span class="chip chip--green mode-chip">${icon('check')} Online · SMS automat</span>`
    : `<span class="chip chip--blue mode-chip">${icon('globe')} Online · SMS cu un tap</span>`;
}

/* ---------- SMS ---------- */
export function smsFor(b, kind) {
  const barber = barberOf(b.barberId);
  return smsText(b, kind, barber?.phone || CONFIG.smsPhone);
}

// Deschide aplicația Mesaje cu destinatarul și textul completate, apoi marchează SMS-ul ca trimis.
export function sendSmsManual(b, kind) {
  haptic();
  window.location.href = smsLink(b.phone, smsFor(b, kind));
  setTimeout(async () => {
    await Admin.markSms(b.id, kind, 'sent');
    const x = state.bookings.find((y) => y.id === b.id);
    if (x) x.sms = { ...x.sms, [kind]: { ...x.sms[kind], status: 'sent', at: Date.now() } };
    toast(kind === 'confirm' ? 'Confirmare marcată ca trimisă' : 'Reminder marcat ca trimis', { ic: 'check' });
    bus.emit('admin:data');
  }, 400);
}

export async function sendSms(b, kind) {
  if (state.autoSms) {
    const r = await Admin.resendSms(b.id, kind);
    if (r.ok) { toast('SMS trimis', { ic: 'send' }); await loadBookings(); bus.emit('admin:data'); return; }
    toast(errText(r.error), { ic: 'info', tone: 'red' });
  }
  sendSmsManual(b, kind);
}

export function dueList(barberId) {
  const out = [];
  for (const b of state.bookings) {
    if (barberId && b.barberId !== barberId) continue;
    for (const kind of smsDue(b, state.autoSms)) out.push({ b, kind });
  }
  return out.sort((x, y) => x.b.startMs - y.b.startMs);
}

/* ---------- foaia unei programări ---------- */
export function bookingSheet(b) {
  const d = fmt.date(b.date, b.time);
  const st = bookingStatus(b);
  const barber = barberOf(b.barberId);
  const live = b.status === 'confirmed' && b.endMs > Date.now();
  const row = (kind, ic, label) => {
    const s = smsStatusLabel(b, kind, state.autoSms);
    const due = smsDue(b, state.autoSms).includes(kind);
    const canSend = live && b.sms?.[kind]?.status !== 'skipped';
    return `<div class="list__item">
      <span class="list__icon">${icon(ic)}</span>
      <span class="list__main"><b>${label}</b><small class="${s.tone ? `tone-${s.tone}` : ''}">${esc(s.text)}</small>
        <span class="sms-preview">${esc(smsFor(b, kind))}</span></span>
      ${canSend ? `<button class="btn btn--xs ${due ? 'btn--primary' : 'btn--secondary'}" type="button" data-sms="${kind}">${due ? 'Trimite' : 'Retrimite'}</button>` : ''}
    </div>`;
  };
  const s = openSheet({
    label: `Programare ${b.name}`,
    body: `
      <div class="bk-head">
        <div class="bk-head__time">${b.time}</div>
        <div class="bk-head__date">${fmt.dayLong(d)} · ${fmt.duration(b.duration)}</div>
        <span class="chip ${st.tone ? `chip--${st.tone}` : ''}">${st.text}</span>
      </div>
      <div class="list">
        <div class="list__item">
          <span class="list__icon">${icon('user')}</span>
          <span class="list__main"><b>${esc(b.name)}</b><small>${esc(fmt.phone(b.phone))}${b.email ? ` · ${esc(b.email)}` : ''}</small></span>
          <span class="row-actions">
            <a class="icon-btn" href="tel:${toIntl(b.phone)}" aria-label="Sună clientul">${icon('phone', 'i--sm')}</a>
            <a class="icon-btn" href="${smsLink(b.phone, '')}" aria-label="Scrie un SMS">${icon('message', 'i--sm')}</a>
          </span>
        </div>
        <div class="list__item"><span class="list__icon">${icon('scissors')}</span><span class="list__main"><b>${esc(b.serviceName)}</b><small>${fmt.price(b.price)} · ${fmt.duration(b.duration)}</small></span></div>
        <div class="list__item">${avatar(barber, 'avatar--sm')}<span class="list__main"><b>${esc(b.barberName)}</b><small>${b.anyBarber ? 'Ales automat (primul disponibil)' : 'Ales de client'}</small></span></div>
        ${b.notes ? `<div class="list__item"><span class="list__icon">${icon('note')}</span><span class="list__main"><b>Mesaj de la client</b><small style="white-space:normal">${esc(b.notes)}</small></span></div>` : ''}
        <div class="list__item"><span class="list__icon">${icon('info')}</span><span class="list__main"><b class="ticket__code">${esc(b.id)}</b><small>${b.source === 'admin' ? 'Adăugată din panou' : 'Din aplicație'} · ${fmt.dayShort(new Date(b.createdAt || b.startMs))}</small></span></div>
      </div>
      <p class="sheet-sub">SMS către client</p>
      <div class="list">
        ${row('confirm', 'message', 'Confirmare')}
        ${row('remind', 'bell', 'Reminder cu o zi înainte')}
      </div>`,
    foot: live
      ? `<button class="btn btn--ghost btn--block" type="button" data-cancel>${icon('trash')} Anulează programarea</button>`
      : `<button class="btn btn--ghost btn--block" type="button" data-delete>${icon('trash')} Șterge din istoric</button>`,
  });

  const del = s.el.querySelector('[data-delete]');
  let delArmed = false;
  del?.addEventListener('click', async () => {
    haptic('heavy');
    if (!delArmed) {
      delArmed = true;
      del.classList.replace('btn--ghost', 'btn--danger');
      del.textContent = 'Apasă din nou: se șterge definitiv';
      setTimeout(() => { if (delArmed && document.body.contains(del)) { delArmed = false; del.classList.replace('btn--danger', 'btn--ghost'); del.innerHTML = `${icon('trash')} Șterge din istoric`; } }, 3500);
      return;
    }
    del.disabled = true;
    const r = await Admin.deleteBooking(b.id);
    del.disabled = false;
    if (!r.ok) { toast(errText(r.error), { ic: 'info', tone: 'red' }); return; }
    state.bookings = state.bookings.filter((y) => y.id !== b.id);
    s.close();
    toast('Programarea a fost ștearsă din istoric', { ic: 'check' });
    bus.emit('admin:data');
  });

  s.el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-sms]');
    if (t) { const fresh = state.bookings.find((x) => x.id === b.id) || b; sendSms(fresh, t.dataset.sms); setTimeout(() => s.close(), 500); }
  });
  const cancel = s.el.querySelector('[data-cancel]');
  let armed = false;
  cancel?.addEventListener('click', async () => {
    haptic('heavy');
    if (!armed) {
      armed = true;
      cancel.classList.replace('btn--ghost', 'btn--danger');
      cancel.textContent = 'Apasă din nou pentru a anula';
      setTimeout(() => { if (armed && document.body.contains(cancel)) { armed = false; cancel.classList.replace('btn--danger', 'btn--ghost'); cancel.innerHTML = `${icon('trash')} Anulează programarea`; } }, 3500);
      return;
    }
    const r = await Admin.cancel(b.id);
    if (!r.ok) { toast(errText(r.error), { ic: 'info', tone: 'red' }); return; }
    const x = state.bookings.find((y) => y.id === b.id);
    if (x) x.status = 'cancelled';
    s.close();
    toast('Programare anulată. Anunță clientul dacă e nevoie.', { ic: 'check' });
    bus.emit('admin:data');
  });
}

/* ---------- programare nouă (telefonică / la salon) ---------- */
const DURS = [15, 30, 45, 60, 75, 90, 105, 120];
export function newBookingSheet({ date, barberId } = {}) {
  const f = {
    name: '', phone: '', serviceId: SERVICES[0].id, duration: SERVICES[0].duration,
    barberId: barberId || state.user.id,
    date: date || fmt.iso(new Date()),
    time: null, notes: '', sms: true,
  };
  const busyFn = (iso, id) => state.bookings
    .filter((x) => x.status === 'confirmed' && x.date === iso && x.barberId === id)
    .map((x) => [toMin(x.time), toMin(x.time) + x.duration]);

  const durHTML = () => DURS.map((m) => `<button class="chip-btn chip-btn--sm" type="button" data-dur="${m}" aria-pressed="${m === f.duration}">${m}</button>`).join('');
  const slotsHTML = () => {
    const slots = freeSlots(fmt.date(f.date), f.barberId, f.duration, { ignoreLead: true, barbers: state.team, busyFn });
    if (!slots.length) return `<div class="empty-mini">Nicio oră liberă de ${f.duration} de minute în programul frizerului pentru această zi.</div>`;
    if (!slots.some((x) => x.time === f.time)) f.time = null;
    return `<div class="slots">${slots.map((x) => `<button class="slot" type="button" data-time="${x.time}" aria-pressed="${x.time === f.time}">${x.time}</button>`).join('')}</div>`;
  };

  const s = openSheet({
    title: 'Programare nouă',
    body: `
      <form class="nb" novalidate>
        <div class="field" data-f="name"><label class="field__label" for="nb-name">Nume client</label><input class="input" id="nb-name" autocomplete="off" autocapitalize="words" placeholder="Nume și prenume"><div class="field__err">Completează numele.</div></div>
        <div class="field" data-f="phone"><label class="field__label" for="nb-phone">Telefon client</label><input class="input tnum" id="nb-phone" type="tel" inputmode="tel" placeholder="07xx xxx xxx"><div class="field__err">Număr invalid (10 cifre, începe cu 07).</div></div>
        <div class="field"><label class="field__label" for="nb-svc">Serviciu</label><select class="input select" id="nb-svc">${SERVICES.map((x) => `<option value="${x.id}">${esc(x.name)} · ${x.price} lei · ${x.duration} min</option>`).join('')}</select></div>
        <div class="field"><span class="field__label">Durată <small>minute</small></span><div class="dur-row dur-row--4" data-durs>${durHTML()}</div></div>
        <div class="field"><label class="field__label" for="nb-barber">Frizer</label><select class="input select" id="nb-barber">${teamActive().map((b) => `<option value="${b.id}" ${b.id === f.barberId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
        <div class="field"><label class="field__label" for="nb-date">Data</label><input class="input" id="nb-date" type="date" value="${f.date}" min="${fmt.iso(new Date())}"></div>
        <div class="field" data-f="time"><label class="field__label">Ora</label><div data-slots>${slotsHTML()}</div><div class="field__err">Alege o oră.</div></div>
        <div class="field"><label class="field__label" for="nb-notes">Notă <small>opțional</small></label><input class="input" id="nb-notes" placeholder="De exemplu: client nou"></div>
        <button class="toggle-card" type="button" role="switch" aria-checked="true" data-smsflag style="width:100%;margin:4px 0 0">
          <span class="ico">${icon('message')}</span>
          <span class="grow"><b>SMS de confirmare către client</b><small>${state.autoSms ? 'Pleacă automat de pe numărul frizerului.' : 'Se deschide Mesaje cu textul gata scris.'}</small></span>
          <span class="switch" aria-hidden="true"></span>
        </button>
      </form>`,
    foot: '<button class="btn btn--primary btn--block" type="button" data-save>Salvează programarea</button>',
  });

  const $f = (sel) => s.el.querySelector(sel);
  const refresh = () => { $f('[data-slots]').innerHTML = slotsHTML(); };
  $f('#nb-svc').addEventListener('change', (e) => {
    f.serviceId = e.target.value;
    f.duration = SERVICES.find((x) => x.id === f.serviceId).duration;
    $f('[data-durs]').innerHTML = durHTML();
    refresh();
  });
  $f('#nb-barber').addEventListener('change', (e) => { f.barberId = e.target.value; refresh(); });
  $f('#nb-date').addEventListener('change', (e) => { f.date = e.target.value || fmt.iso(new Date()); refresh(); });
  s.el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-time]');
    if (t) {
      haptic('select');
      f.time = t.dataset.time;
      s.el.querySelectorAll('[data-time]').forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
      $f('[data-f="time"]').classList.remove('is-invalid');
    }
    const du = e.target.closest('[data-dur]');
    if (du) {
      haptic('select');
      f.duration = Number(du.dataset.dur);
      $f('[data-durs]').innerHTML = durHTML();
      refresh();
    }
    const sw = e.target.closest('[data-smsflag]');
    if (sw) { haptic('select'); f.sms = !f.sms; sw.setAttribute('aria-checked', String(f.sms)); }
  });

  $f('[data-save]').addEventListener('click', async () => {
    f.name = $f('#nb-name').value.trim();
    f.phone = $f('#nb-phone').value.trim();
    f.notes = $f('#nb-notes').value.trim();
    const digits = f.phone.replace(/\D/g, '');
    const bad = [];
    if (f.name.length < 2) bad.push('name');
    if (!((digits.length === 10 && digits.startsWith('07')) || (f.phone.startsWith('+') && digits.length >= 10))) bad.push('phone');
    if (!f.time) bad.push('time');
    s.el.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('is-invalid', bad.includes(x.dataset.f)));
    if (bad.length) { haptic('heavy'); return; }

    const svc = SERVICES.find((x) => x.id === f.serviceId);
    const barber = barberOf(f.barberId);
    const startMs = fmt.date(f.date, f.time).getTime();
    const plan = planReminder(startMs);
    const booking = {
      id: newCode(), status: 'confirmed',
      serviceId: svc.id, serviceName: svc.name, price: svc.price, duration: f.duration,
      barberId: barber.id, barberName: barber.name, barberShort: barber.short, anyBarber: false,
      date: f.date, time: f.time, startMs, endMs: startMs + f.duration * 6e4,
      name: f.name, phone: fmt.phone(f.phone), email: '', notes: f.notes,
      remind: true, reminder: plan ? { ...plan, notified: false } : null,
      createdAt: Date.now(), createdBy: state.user.id,
      sendConfirm: f.sms,
    };
    if (!f.sms) booking.sms = { confirm: { status: 'skipped' }, remind: plan ? { status: 'scheduled', at: plan.at, kind: plan.kind } : { status: 'skipped' } };

    const btn = $f('[data-save]');
    btn.disabled = true;
    const r = await Admin.book(booking);
    btn.disabled = false;
    if (!r.ok) { toast(errText(r.error), { ic: 'info', tone: 'red' }); return; }
    const saved = withSms(r.booking || booking);
    state.bookings.push(saved);
    s.close();
    bus.emit('admin:data');
    if (f.sms && !state.autoSms) setTimeout(() => sendSmsManual(saved, 'confirm'), 350);
    else toast(f.sms ? 'Programare salvată, SMS trimis' : 'Programare salvată', { ic: 'check' });
  });
}
