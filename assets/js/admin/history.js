/* Istoricul complet al programărilor, pe frizer, cu filtre pe zile, ore, status și căutare. */
import { icon } from '../icons.js';
import { esc, fmt, haptic, bus, toast } from '../lib.js';
import { toMin } from '../slots.js';
import { state, topbar, barberChips, bookingStatus, bookingSheet } from './shared.js';

let el;
const DOWS = [[1, 'Lu'], [2, 'Ma'], [3, 'Mi'], [4, 'Jo'], [5, 'Vi'], [6, 'Sâ'], [0, 'Du']];
const STATUS = [['all', 'Toate'], ['confirmed', 'Viitoare'], ['done', 'Finalizate'], ['cancelled', 'Anulate']];
let f;
const reset = () => ({ barber: state.user.id, from: '', to: '', tFrom: '', tTo: '', days: [], status: 'all', q: '' });

export function initHistory(root) {
  el = root;
  f = reset();
  el.addEventListener('click', onClick);
  el.addEventListener('input', onInput);
  el.addEventListener('change', onInput);
  bus.on('admin:data', () => { if (!el.hidden) renderResults(); });
}

export function showHistory() { render(); }

function filtered() {
  const q = f.q.trim().toLowerCase();
  const qd = q.replace(/\D/g, '');
  const tf = f.tFrom ? toMin(f.tFrom) : null;
  const tt = f.tTo ? toMin(f.tTo) : null;
  return state.bookings.filter((b) => {
    if (f.barber && b.barberId !== f.barber) return false;
    if (f.from && b.date < f.from) return false;
    if (f.to && b.date > f.to) return false;
    const m = toMin(b.time);
    if (tf != null && m < tf) return false;
    if (tt != null && m > tt) return false;
    if (f.days.length && !f.days.includes(fmt.date(b.date).getDay())) return false;
    if (f.status !== 'all') {
      const k = bookingStatus(b).key;
      if (f.status === 'confirmed' && !(k === 'confirmed' || k === 'now')) return false;
      if (f.status === 'done' && k !== 'done') return false;
      if (f.status === 'cancelled' && !(k === 'cancelled' || k === 'rescheduled')) return false;
    }
    if (q) {
      const hay = `${b.name} ${b.id} ${b.serviceName}`.toLowerCase();
      if (!hay.includes(q) && !(qd.length >= 3 && String(b.phone).replace(/\D/g, '').includes(qd))) return false;
    }
    return true;
  }).sort((a, b) => b.startMs - a.startMs);
}

function render() {
  el.innerHTML = `
    ${topbar({ title: 'Istoric' })}
    <div class="page">
      <div class="hello"><div class="eyebrow">Toate programările</div><h1 class="display">Istoric</h1></div>
      <div data-chips>${barberChips(f.barber)}</div>

      <section class="filters" aria-label="Filtre">
        <span class="f-label">Perioadă</span>
        <div class="f-row">
          <input class="input" type="date" data-k="from" value="${f.from}" aria-label="De la data">
          <input class="input" type="date" data-k="to" value="${f.to}" aria-label="Până la data">
        </div>
        <span class="f-label">Interval orar</span>
        <div class="f-row">
          <input class="input" type="time" step="900" data-k="tFrom" value="${f.tFrom}" aria-label="De la ora">
          <input class="input" type="time" step="900" data-k="tTo" value="${f.tTo}" aria-label="Până la ora">
        </div>
        <span class="f-label">Zilele săptămânii</span>
        <div class="dow-row">${DOWS.map(([d, l]) => `<button class="chip-btn" type="button" data-dow="${d}" aria-pressed="${f.days.includes(d)}">${l}</button>`).join('')}</div>
        <span class="f-label">Status</span>
        <div class="chip-row" style="margin:0 -16px;padding:0 16px">${STATUS.map(([k, l]) => `<button class="chip-btn chip-btn--sm" type="button" data-status="${k}" aria-pressed="${f.status === k}">${l}</button>`).join('')}</div>
        <label class="search">${icon('search', 'i--sm')}<input class="input" type="search" data-k="q" value="${esc(f.q)}" placeholder="Caută nume, telefon sau cod" enterkeyhint="search"></label>
        <div class="f-actions">
          <button class="btn btn--secondary btn--sm" type="button" data-reset>${icon('refresh')} Resetează</button>
          <button class="btn btn--secondary btn--sm" type="button" data-csv>${icon('export')} Exportă CSV</button>
        </div>
      </section>

      <div data-results></div>
    </div>`;
  renderResults();
}

function renderResults() {
  const box = el.querySelector('[data-results]');
  if (!box) return;
  const list = filtered();
  const ok = list.filter((b) => b.status === 'confirmed');
  const revenue = ok.reduce((s, b) => s + b.price, 0);
  const cancelled = list.filter((b) => b.status === 'cancelled').length;
  const groups = [];
  for (const b of list) {
    const g = groups[groups.length - 1];
    if (g && g.date === b.date) g.items.push(b);
    else groups.push({ date: b.date, items: [b] });
  }
  box.innerHTML = `
    <div class="h-stats">
      <div class="stat"><b>${list.length}</b><small>${list.length === 1 ? 'programare' : 'programări'}</small></div>
      <div class="stat"><b>${revenue.toLocaleString('ro-RO')}</b><small>lei, fără anulări</small></div>
      <div class="stat"><b>${cancelled}</b><small>anulate</small></div>
    </div>
    ${groups.length ? groups.map((g) => `
      <section class="h-group">
        <div class="h-group__date">${fmt.dayLong(fmt.date(g.date))}<span>${g.items.length}</span></div>
        <div class="timeline">${g.items.map(row).join('')}</div>
      </section>`).join('') : `
      <div class="empty" style="margin-top:16px">
        <div class="empty__icon">${icon('search')}</div>
        <b>Nicio programare găsită</b>
        <p>Schimbă filtrele sau caută după alt nume.</p>
      </div>`}`;
}

function row(b) {
  const st = bookingStatus(b);
  const muted = st.key === 'cancelled' || st.key === 'rescheduled';
  return `<button class="adm-bk ${muted ? 'is-muted' : ''}" type="button" data-bk="${b.id}">
    <span class="adm-bk__time"><b>${b.time}</b><small>${b.duration} min</small></span>
    <span class="adm-bk__main">
      <b>${esc(b.name)}</b>
      <small>${esc(b.serviceName)}${!f.barber ? ` · ${esc(b.barberShort)}` : ''} · ${esc(fmt.phone(b.phone))}</small>
      <span class="adm-bk__chips"><span class="chip ${st.tone ? `chip--${st.tone}` : ''}">${st.text}</span>${b.source === 'admin' ? `<span class="chip">${icon('phone')} Din panou</span>` : ''}</span>
    </span>
    <span class="adm-bk__price">${b.price}</span>
  </button>`;
}

function onInput(e) {
  const k = e.target.dataset?.k;
  if (!k) return;
  f[k] = e.target.value;
  renderResults();
}

function onClick(e) {
  const t = e.target.closest('[data-barber],[data-dow],[data-status],[data-reset],[data-csv],[data-bk]');
  if (!t) return;
  if (t.hasAttribute('data-barber')) {
    haptic('select');
    f.barber = t.dataset.barber || '';
    el.querySelector('[data-chips]').innerHTML = barberChips(f.barber);
    renderResults();
    return;
  }
  if (t.dataset.dow) {
    haptic('select');
    const d = Number(t.dataset.dow);
    f.days = f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d];
    t.setAttribute('aria-pressed', String(f.days.includes(d)));
    renderResults();
    return;
  }
  if (t.dataset.status) {
    haptic('select');
    f.status = t.dataset.status;
    el.querySelectorAll('[data-status]').forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
    renderResults();
    return;
  }
  if (t.hasAttribute('data-reset')) { haptic(); f = reset(); render(); return; }
  if (t.hasAttribute('data-csv')) { haptic(); exportCSV(); return; }
  if (t.dataset.bk) { haptic(); const b = state.bookings.find((x) => x.id === t.dataset.bk); if (b) bookingSheet(b); }
}

function exportCSV() {
  const list = filtered();
  if (!list.length) { toast('Nimic de exportat cu filtrele curente', { ic: 'info' }); return; }
  const head = ['Data', 'Ora', 'Durata (min)', 'Client', 'Telefon', 'Serviciu', 'Frizer', 'Pret (lei)', 'Status', 'Cod', 'Sursa'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = list.map((b) => [b.date, b.time, b.duration, b.name, b.phone, b.serviceName, b.barberName, b.price, bookingStatus(b).text, b.id, b.source === 'admin' ? 'Panou' : 'Aplicatie'].map(q).join(';'));
  const csv = '﻿' + [head.map(q).join(';'), ...rows].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `urban-studio-programari-${fmt.iso(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
  toast(`${list.length} programări exportate`, { ic: 'check' });
}
