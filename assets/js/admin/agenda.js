/* Agenda zilei: programările pe frizer, SMS-urile de trimis, programare nouă. */
import { icon } from '../icons.js';
import { esc, fmt, haptic, bus } from '../lib.js';
import { smsStatusLabel } from '../sms.js';
import { state, topbar, modeChip, barberChips, bookingStatus, bookingSheet, newBookingSheet, dueList, sendSms, barberOf } from './shared.js';

let el;
let day = fmt.iso(new Date());
let barberFilter = null;
let stripScrolled = false;

export function initAgenda(root) {
  el = root;
  barberFilter = state.user.id;
  el.addEventListener('click', onClick);
  bus.on('admin:data', () => { if (!el.hidden) render(); });
}

export function showAgenda() { render(); }

function dates() {
  const out = [];
  for (let i = -14; i <= 35; i++) out.push(fmt.addDays(new Date(), i));
  return out;
}

function render() {
  const scrollLeft = el.querySelector('[data-strip]')?.scrollLeft;
  const mine = state.bookings.filter((b) => !barberFilter || b.barberId === barberFilter);
  const list = mine.filter((b) => b.date === day && b.status !== 'rescheduled').sort((a, b) => a.startMs - b.startMs);
  const active = list.filter((b) => b.status === 'confirmed');
  const revenue = active.reduce((s, b) => s + b.price, 0);
  const due = dueList(barberFilter);
  const counts = {};
  for (const b of mine) if (b.status === 'confirmed') counts[b.date] = (counts[b.date] || 0) + 1;
  const sel = fmt.date(day);
  const todayIso = fmt.iso(new Date());

  el.innerHTML = `
    ${topbar({ title: 'Agenda', plus: true })}
    <div class="page">
      <div class="hello">
        <div class="eyebrow">Bună, ${esc(state.user.short || state.user.name)}</div>
        <h1 class="display">Agenda</h1>
        ${modeChip()}
      </div>
      ${barberChips(barberFilter)}

      ${due.length ? `
        <section class="sms-queue">
          <div class="sms-queue__head"><span class="ico">${icon('message')}</span><div>
            <b>${due.length === 1 ? 'Un SMS de trimis' : `${due.length} SMS-uri de trimis`}</b>
            <p>Apasă Trimite: se deschide Mesaje cu textul gata scris, de pe telefonul tău.</p></div></div>
          ${due.slice(0, 6).map(({ b, kind }) => `
            <div class="sms-item">
              <span class="grow"><b>${esc(b.name)}</b><small>${kind === 'confirm' ? 'Confirmare' : 'Reminder'} · ${fmt.relDay(fmt.date(b.date))}, ${b.time}${!barberFilter ? ` · ${esc(b.barberShort)}` : ''}</small></span>
              <button class="btn btn--xs btn--primary" type="button" data-send="${b.id}" data-kind="${kind}">${icon('send')} Trimite</button>
            </div>`).join('')}
        </section>` : ''}

      <div class="month" style="margin-top:20px">
        <span class="month__name">${fmt.month(sel)} ${sel.getFullYear()}</span>
        ${day !== todayIso ? `<button class="link-btn" type="button" data-today>Azi ${icon('chevR')}</button>` : ''}
      </div>
      <div class="dates adm-dates" data-strip>
        ${dates().map((d) => {
          const iso = fmt.iso(d);
          const n = counts[iso] || 0;
          const rel = fmt.relDay(d);
          return `<button class="date ${iso === todayIso ? 'is-today' : ''}" type="button" data-day="${iso}" aria-selected="${iso === day}" aria-label="${fmt.dayLong(d)}, ${n} programări">
            <span class="date__dow">${rel === 'Azi' || rel === 'Mâine' ? rel : fmt.dowShort(d)}</span><span class="date__num">${d.getDate()}</span><span class="date__tag">${n ? `<b>${n}</b>` : ''}</span></button>`;
        }).join('')}
      </div>

      <div class="day-sum"><b>${fmt.relDayLong(sel)}</b><span>${active.length === 1 ? 'o programare' : `${active.length} programări`}${revenue ? ` · ${fmt.price(revenue)}` : ''}</span></div>

      ${list.length ? `<div class="timeline">${list.map(card).join('')}</div>` : `
        <div class="empty">
          <div class="empty__icon">${icon('calendar')}</div>
          <b>Nicio programare</b>
          <p>Când un client se programează, apare aici. Poți adăuga și programări primite la telefon.</p>
          <button class="btn btn--secondary btn--sm" type="button" data-act="new">${icon('plus')} Programare nouă</button>
        </div>`}
    </div>`;

  const strip = el.querySelector('[data-strip]');
  if (scrollLeft != null && stripScrolled) strip.scrollLeft = scrollLeft;
  else {
    const s = strip.querySelector('[aria-selected="true"]');
    if (s) strip.scrollLeft = Math.max(0, s.offsetLeft - strip.offsetLeft - 20 - 68);
    stripScrolled = true;
  }
}

function card(b) {
  const st = bookingStatus(b);
  const conf = smsStatusLabel(b, 'confirm', state.autoSms);
  const rem = smsStatusLabel(b, 'remind', state.autoSms);
  const muted = st.key === 'cancelled' || st.key === 'done';
  return `<button class="adm-bk ${muted ? 'is-muted' : ''} ${st.key === 'now' ? 'is-now' : ''}" type="button" data-bk="${b.id}">
    <span class="adm-bk__time"><b>${b.time}</b><small>${b.duration} min</small></span>
    <span class="adm-bk__main">
      <b>${esc(b.name)}</b>
      <small>${esc(b.serviceName)}${!barberFilter ? ` · ${esc(b.barberShort)}` : ''} · ${esc(fmt.phone(b.phone))}</small>
      <span class="adm-bk__chips">
        ${st.key !== 'confirmed' ? `<span class="chip ${st.tone ? `chip--${st.tone}` : ''}">${st.text}</span>` : ''}
        ${b.status === 'confirmed' ? `<span class="chip ${conf.tone ? `chip--${conf.tone}` : ''}">${icon('message')} ${conf.tone === 'green' ? 'Confirmare trimisă' : conf.tone === 'red' ? 'Confirmare de trimis' : esc(conf.text)}</span>` : ''}
        ${b.status === 'confirmed' && b.sms?.remind?.status !== 'skipped' ? `<span class="chip ${rem.tone ? `chip--${rem.tone}` : ''}">${icon('bell')} ${rem.tone === 'green' ? 'Reminder trimis' : rem.tone === 'red' ? 'Reminder de trimis' : esc(rem.text.replace(/^(De trimis|Automat) /, 'Reminder '))}</span>` : ''}
      </span>
    </span>
    <span class="adm-bk__price">${b.price}</span>
  </button>`;
}

function onClick(e) {
  const t = e.target.closest('[data-day],[data-barber],[data-bk],[data-send],[data-today],[data-act]');
  if (!t) return;
  if (t.dataset.day) { haptic('select'); day = t.dataset.day; render(); return; }
  if (t.hasAttribute('data-today')) { haptic(); day = fmt.iso(new Date()); stripScrolled = false; render(); return; }
  if (t.hasAttribute('data-barber')) { haptic('select'); barberFilter = t.dataset.barber || null; render(); return; }
  if (t.dataset.bk) { haptic(); const b = state.bookings.find((x) => x.id === t.dataset.bk); if (b) bookingSheet(b); return; }
  if (t.dataset.send) { const b = state.bookings.find((x) => x.id === t.dataset.send); if (b) sendSms(b, t.dataset.kind); return; }
  if (t.dataset.act === 'new') { haptic(); newBookingSheet({ date: day < fmt.iso(new Date()) ? fmt.iso(new Date()) : day, barberId: barberFilter || state.user.id }); }
}

export { barberOf };
