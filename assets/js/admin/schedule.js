/* Program: calendarul lunii. Tap pe o zi → intervalele de 45 de minute, bifate de frizer pentru programări. */
import { Admin, defaultSchedule } from '../api.js';
import { CONFIG } from '../data.js';
import { icon } from '../icons.js';
import { esc, fmt, haptic, bus, toast, openSheet, cap } from '../lib.js';
import { toMin, toTime, gridSlots, mergeSlots } from '../slots.js';
import { state, topbar, barberChips, barberOf, loadTeam, errText } from './shared.js';

const STEP = CONFIG.slotStep;
const DOW_HEAD = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];
const WEEK = [[1, 'Luni'], [2, 'Marți'], [3, 'Miercuri'], [4, 'Joi'], [5, 'Vineri'], [6, 'Sâmbătă'], [0, 'Duminică']];
const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];

let el;
let barberId;
let month; // prima zi a lunii afișate

export function initSchedule(root) {
  el = root;
  barberId = state.user.id;
  const now = new Date();
  month = new Date(now.getFullYear(), now.getMonth(), 1);
  el.addEventListener('click', onClick);
  bus.on('admin:data', () => { if (!el.hidden) render(); });
}

export function showSchedule() { render(); }

/* ---------- date ---------- */
const todayIso = () => fmt.iso(new Date());
const sched = () => barberOf(barberId)?.schedule || defaultSchedule();
const isCustom = (iso) => Object.prototype.hasOwnProperty.call(sched().days || {}, iso);

function templateIntervals(dow) {
  return (sched().week?.[dow] || []).map(([a, b]) => [toMin(a), toMin(b)]);
}
function dayIntervals(iso) {
  const s = sched();
  const list = isCustom(iso) ? s.days[iso] : (s.week?.[fmt.date(iso).getDay()] || []);
  return list.map(([a, b]) => [toMin(a), toMin(b)]);
}
const fits = (iv, t) => iv.some(([a, b]) => t >= a && t + STEP <= b);
const slotsFrom = (iv) => gridSlots().filter((t) => fits(iv, t));
const openSlots = (iso) => slotsFrom(dayIntervals(iso));
const bookingsOn = (iso) => state.bookings.filter((b) => b.barberId === barberId && b.date === iso && b.status === 'confirmed');

async function save(schedule, msg) {
  const r = await Admin.saveSchedule(barberId, schedule);
  if (!r.ok) { toast(errText(r.error), { ic: 'info', tone: 'red' }); return false; }
  await loadTeam();
  haptic('success');
  toast(msg, { ic: 'check' });
  render();
  return true;
}
const clone = (s) => JSON.parse(JSON.stringify({ week: s.week || {}, days: s.days || {} }));

/* ---------- calendar ---------- */
function render() {
  const b = barberOf(barberId);
  const y = month.getFullYear(), m = month.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // luni = prima coloană
  const today = todayIso();
  const now = new Date();
  const canPrev = y > now.getFullYear() || m > now.getMonth();

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<span class="cal__blank" aria-hidden="true"></span>');
  for (let d = 1; d <= days; d++) {
    const iso = fmt.iso(new Date(y, m, d));
    const past = iso < today;
    const n = openSlots(iso).length;
    const bk = bookingsOn(iso).length;
    const cls = ['cal__day', past ? 'is-past' : '', n ? 'is-open' : 'is-off', isCustom(iso) ? 'is-custom' : '', iso === today ? 'is-today' : ''].join(' ');
    cells.push(`<button class="${cls}" type="button" data-iso="${iso}" ${past ? 'aria-disabled="true"' : ''} aria-label="${fmt.dayLong(fmt.date(iso))}: ${n ? `${n} locuri` : 'liber'}${bk ? `, ${bk} programări` : ''}">
      <b>${d}</b><small>${n || 'liber'}</small>${bk ? `<i class="cal__bk">${bk}</i>` : ''}
    </button>`);
  }

  el.innerHTML = `
    ${topbar({ title: 'Program' })}
    <div class="page">
      <div class="hello"><div class="eyebrow">Disponibilitate pentru clienți</div><h1 class="display">Program</h1></div>
      <div data-chips>${barberChips(barberId, { allowAll: false })}</div>

      <section class="cal" aria-label="Calendar">
        <div class="cal__head">
          <button class="icon-btn" type="button" data-mon="-1" aria-label="Luna anterioară" ${canPrev ? '' : 'disabled'}>${icon('chevL', 'i--sm')}</button>
          <b>${MONTHS[m]} ${y}</b>
          <button class="icon-btn" type="button" data-mon="1" aria-label="Luna următoare">${icon('chevR', 'i--sm')}</button>
        </div>
        <div class="cal__dow">${DOW_HEAD.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="cal__grid">${cells.join('')}</div>
        <div class="cal__legend">
          <span><i class="lg-open"></i>Cifra = locuri pentru clienți</span>
          <span><i class="lg-off"></i>Liber</span>
          <span><i class="lg-custom"></i>Setat manual</span>
          <span><i class="lg-bk"></i>Programări</span>
        </div>
      </section>
      <p class="fineprint">${icon('info')}<span>Atinge o zi ca să alegi intervalele de ${STEP} de minute în care te pot programa clienții${b ? ` la ${esc(b.short)}` : ''}.</span></p>

      <section class="sec">
        <div class="sec__head"><div><h2 class="sec__title">Program obișnuit</h2><p class="sec__sub">Se aplică automat zilelor pe care nu le setezi manual</p></div></div>
        <div class="list">
          ${WEEK.map(([d, name]) => {
            const n = slotsFrom(templateIntervals(d)).length;
            const iv = sched().week?.[d] || [];
            return `<div class="list__item"><span class="list__main"><b>${name}</b><small>${iv.length ? iv.map(([a, c]) => `${a} - ${c}`).join(', ') : 'Liber'}</small></span><span class="chip">${n ? `${n} locuri` : 'liber'}</span></div>`;
          }).join('')}
        </div>
        <div style="margin:12px var(--gutter) 0"><button class="btn btn--secondary btn--block" type="button" data-week>${icon('clock')} Modifică programul obișnuit</button></div>
      </section>
    </div>`;
}

/* ---------- ziua: intervale de 45 de minute ---------- */
function daySheet(iso) {
  const d = fmt.date(iso);
  const custom = isCustom(iso);
  const booked = bookingsOn(iso);
  const bookedAt = (t) => booked.find((x) => toMin(x.time) < t + STEP && t < toMin(x.time) + x.duration);
  const sel = new Set(openSlots(iso));
  booked.forEach((x) => gridSlots().forEach((t) => { if (bookedAt(t) === x) sel.add(t); }));
  let revert = false;

  const slotBtn = (t) => {
    const bk = bookedAt(t);
    const on = sel.has(t);
    return `<button class="tslot ${bk ? 'is-booked' : ''}" type="button" data-t="${t}" aria-pressed="${on}">
      <b>${toTime(t)}</b><small>${bk ? esc(bk.name.split(' ')[0]) : `până la ${toTime(t + STEP)}`}</small>
    </button>`;
  };
  const count = () => sel.size;

  const s = openSheet({
    title: cap(fmt.dayLong(d)),
    body: `
      <p class="lead" data-note>${custom ? 'Program setat manual pentru această zi.' : `Programul obișnuit de ${fmt.dow(d)}. Atinge intervalele ca să le schimbi doar pentru ziua asta.`}</p>
      <div class="day-tools">
        <button class="chip-btn chip-btn--sm" type="button" data-all>Toată ziua</button>
        <button class="chip-btn chip-btn--sm" type="button" data-none>Zi liberă</button>
        ${custom ? '<button class="chip-btn chip-btn--sm" type="button" data-usual>Ca de obicei</button>' : ''}
      </div>
      <div class="tslots" data-grid>${gridSlots().map(slotBtn).join('')}</div>
      <p class="fineprint">${icon('info')}<span>Alb = clienții se pot programa. Intervalele cu nume au deja programare și nu se pot închide de aici.</span></p>`,
    foot: `<button class="btn btn--primary btn--block" type="button" data-save>Salvează · <span data-count>${count()}</span> locuri</button>`,
  });

  const grid = s.el.querySelector('[data-grid]');
  const refresh = () => {
    grid.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-pressed', String(sel.has(Number(b.dataset.t)))));
    s.el.querySelector('[data-count]').textContent = count();
  };

  s.el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-t],[data-all],[data-none],[data-usual],[data-save]');
    if (!t) return;
    if (t.dataset.t) {
      const v = Number(t.dataset.t);
      const bk = bookedAt(v);
      if (bk) { haptic('heavy'); toast(`${bk.name} are programare la ${bk.time}. Anuleaz-o din Agenda.`, { ic: 'info' }); return; }
      haptic('select');
      if (sel.has(v)) sel.delete(v); else sel.add(v);
      revert = false;
      refresh();
      return;
    }
    if (t.hasAttribute('data-all')) { haptic(); gridSlots().forEach((v) => sel.add(v)); revert = false; refresh(); return; }
    if (t.hasAttribute('data-none')) {
      haptic();
      sel.clear();
      booked.forEach((x) => gridSlots().forEach((v) => { if (bookedAt(v) === x) sel.add(v); }));
      revert = false;
      refresh();
      return;
    }
    if (t.hasAttribute('data-usual')) {
      haptic();
      sel.clear();
      slotsFrom(templateIntervals(d.getDay())).forEach((v) => sel.add(v));
      booked.forEach((x) => gridSlots().forEach((v) => { if (bookedAt(v) === x) sel.add(v); }));
      revert = true;
      s.el.querySelector('[data-note]').textContent = `Revine la programul obișnuit de ${fmt.dow(d)}.`;
      refresh();
      return;
    }
    if (t.hasAttribute('data-save')) {
      t.disabled = true;
      const next = clone(sched());
      if (revert) delete next.days[iso];
      else next.days[iso] = mergeSlots([...sel]);
      // zilele trecute nu mai contează
      for (const k of Object.keys(next.days)) if (k < todayIso()) delete next.days[k];
      const ok = await save(next, `Program salvat pentru ${fmt.dayLong(d).toLowerCase()}`);
      t.disabled = false;
      if (ok) s.close();
    }
  });
}

/* ---------- programul obișnuit ---------- */
function weekSheet() {
  const grid = gridSlots();
  const starts = grid.map(toTime);
  const ends = grid.map((t) => toTime(t + STEP));
  const model = {};
  for (const [d] of WEEK) {
    const iv = sched().week?.[d] || [];
    const sl = slotsFrom(iv.map(([a, b]) => [toMin(a), toMin(b)]));
    model[d] = sl.length ? { on: true, start: toTime(sl[0]), end: toTime(sl[sl.length - 1] + STEP) } : { on: false, start: starts[0], end: ends[11] || ends[ends.length - 1] };
  }
  const opts = (list, v) => list.map((x) => `<option value="${x}" ${x === v ? 'selected' : ''}>${x}</option>`).join('');
  const rowHTML = (d, name) => {
    const w = model[d];
    return `<div class="wk-row ${w.on ? '' : 'is-off'}" data-day="${d}">
      <div class="wk-row__head">
        <div><b>${name}</b></div>
        <button class="switch-btn" type="button" role="switch" aria-checked="${w.on}" aria-label="${name}: lucrez" data-toggle="${d}"><span class="switch"></span></button>
      </div>
      ${w.on ? `<div class="wk-row__times">
        <label class="t-field"><span>De la</span><select class="input select" data-d="${d}" data-k="start">${opts(starts, w.start)}</select></label>
        <label class="t-field"><span>Până la</span><select class="input select" data-d="${d}" data-k="end">${opts(ends, w.end)}</select></label>
      </div>` : ''}
    </div>`;
  };
  const s = openSheet({
    title: 'Program obișnuit',
    body: `<p class="lead">Orele implicite pentru fiecare zi a săptămânii. Zilele setate manual în calendar rămân cum le-ai setat.</p>
      <div class="wk" style="margin:16px 0 0" data-week>${WEEK.map(([d, n]) => rowHTML(d, n)).join('')}</div>`,
    foot: '<button class="btn btn--primary btn--block" type="button" data-save>Salvează programul obișnuit</button>',
  });
  const box = s.el.querySelector('[data-week]');
  const rerender = () => { box.innerHTML = WEEK.map(([d, n]) => rowHTML(d, n)).join(''); };
  s.el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.d == null) return;
    model[t.dataset.d][t.dataset.k] = t.value;
  });
  s.el.addEventListener('click', async (e) => {
    const tg = e.target.closest('[data-toggle]');
    if (tg) { haptic('select'); const w = model[tg.dataset.toggle]; w.on = !w.on; rerender(); return; }
    const sv = e.target.closest('[data-save]');
    if (!sv) return;
    const bad = WEEK.filter(([d]) => model[d].on && toMin(model[d].end) <= toMin(model[d].start));
    if (bad.length) { haptic('heavy'); toast(`Verifică orele pentru ${bad.map(([, n]) => n.toLowerCase()).join(', ')}`, { ic: 'clock', tone: 'red' }); return; }
    const next = clone(sched());
    for (const [d] of WEEK) next.week[d] = model[d].on ? [[model[d].start, model[d].end]] : [];
    sv.disabled = true;
    const ok = await save(next, 'Programul obișnuit a fost salvat');
    sv.disabled = false;
    if (ok) s.close();
  });
}

/* ---------- interacțiuni ---------- */
function onClick(e) {
  const t = e.target.closest('[data-barber],[data-mon],[data-iso],[data-week]');
  if (!t) return;
  if (t.hasAttribute('data-barber')) {
    if (!t.dataset.barber) return;
    haptic('select');
    barberId = t.dataset.barber;
    render();
    return;
  }
  if (t.dataset.mon) {
    haptic('select');
    month = new Date(month.getFullYear(), month.getMonth() + Number(t.dataset.mon), 1);
    render();
    return;
  }
  if (t.dataset.iso) {
    if (t.getAttribute('aria-disabled') === 'true') { toast('Zilele trecute nu se mai pot modifica', { ic: 'info' }); return; }
    haptic();
    daySheet(t.dataset.iso);
    return;
  }
  if (t.hasAttribute('data-week')) { haptic(); weekSheet(); }
}
