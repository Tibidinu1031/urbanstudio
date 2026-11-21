/* Program: calendarul lunii. Tap pe o zi → orele în care frizerul primește clienți.
   Program adaptiv: sloturi de durata aleasă (15, 30, 45...) care se reașază după fiecare programare,
   plus intervale personalizate (oră de start + durată). */
import { Admin, defaultSchedule } from '../api.js';
import { CONFIG } from '../data.js';
import { icon } from '../icons.js';
import { esc, fmt, haptic, bus, toast, openSheet, cap } from '../lib.js';
import { toMin, toTime, normalize, union, subtract, totalMinutes, toTimes, adaptiveBlocks, dayWindow } from '../slots.js';
import { state, topbar, barberChips, barberOf, loadTeam, errText } from './shared.js';

const STEPS = [15, 30, 45, 60, 75, 90];
const DOW_HEAD = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];
const WEEK = [[1, 'Luni'], [2, 'Marți'], [3, 'Miercuri'], [4, 'Joi'], [5, 'Vineri'], [6, 'Sâmbătă'], [0, 'Duminică']];
const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
const DURATIONS = [15, 30, 45, 60, 75, 90];
// ore de start la sfert de oră, între 07:00 și 22:00
const QUARTERS = Array.from({ length: (22 - 7) * 4 + 1 }, (_, i) => 7 * 60 + i * 15);

let el;
let barberId;
let month;

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
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const isCustom = (iso) => has(sched().days, iso);
const defaultStep = () => Number(sched().step) || CONFIG.slotStep;
const dayStep = (iso) => Number(sched().steps?.[iso]) || defaultStep();
const parse = (list) => normalize((list || []).map(([a, b]) => [toMin(a), toMin(b)]));
const templateIv = (dow) => parse(sched().week?.[dow]);
const dayIv = (iso) => (isCustom(iso) ? parse(sched().days[iso]) : templateIv(fmt.date(iso).getDay()));
const bookingsOn = (iso) => state.bookings
  .filter((b) => b.barberId === barberId && b.date === iso && b.status === 'confirmed')
  .sort((a, b) => toMin(a.time) - toMin(b.time));
const bookedIv = (list) => normalize(list.map((b) => [toMin(b.time), toMin(b.time) + b.duration]));

export function hoursLabel(min, short = false) {
  if (!min) return short ? 'liber' : 'Liber';
  const h = Math.floor(min / 60), m = min % 60;
  if (short) return m ? (h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`) : `${h}h`;
  return m ? (h ? `${h} h ${m} min` : `${m} min`) : `${h} h`;
}

function clone(s) {
  const out = { week: s.week || {}, days: s.days || {}, steps: s.steps || {} };
  if (s.step) out.step = Number(s.step);
  return JSON.parse(JSON.stringify(out));
}

async function save(schedule, msg) {
  const r = await Admin.saveSchedule(barberId, schedule);
  if (!r.ok) { haptic('heavy'); toast(errText(r.error), { ic: 'info', tone: 'red' }); return false; }
  await loadTeam();
  const back = barberOf(barberId)?.schedule;
  // verificare: ce a rămas salvat pe server trebuie să fie exact ce am trimis
  if (JSON.stringify(clone(back || {})) !== JSON.stringify(clone(schedule))) {
    toast('Serverul nu a păstrat modificarea. Reîncearcă.', { ic: 'info', tone: 'red' });
    render();
    return false;
  }
  haptic('success');
  toast(msg, { ic: 'check' });
  render();
  return true;
}

const stepChips = (cur, attr) => STEPS.map((m) => `<button class="chip-btn chip-btn--sm" type="button" data-${attr}="${m}" aria-pressed="${m === cur}">${m}</button>`).join('');

/* ---------- calendar ---------- */
function render() {
  const b = barberOf(barberId);
  const y = month.getFullYear(), m = month.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const today = todayIso();
  const now = new Date();
  const canPrev = y > now.getFullYear() || m > now.getMonth();

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<span class="cal__blank" aria-hidden="true"></span>');
  for (let d = 1; d <= days; d++) {
    const iso = fmt.iso(new Date(y, m, d));
    const past = iso < today;
    const min = totalMinutes(dayIv(iso));
    const bk = bookingsOn(iso).length;
    const cls = ['cal__day', past ? 'is-past' : '', min ? 'is-open' : 'is-off', isCustom(iso) || has(sched().steps, iso) ? 'is-custom' : '', iso === today ? 'is-today' : ''].join(' ');
    cells.push(`<button class="${cls}" type="button" data-iso="${iso}" ${past ? 'aria-disabled="true"' : ''} aria-label="${fmt.dayLong(fmt.date(iso))}: ${hoursLabel(min)}${bk ? `, ${bk === 1 ? 'o programare' : `${bk} programări`}` : ''}">
      <b>${d}</b><small>${hoursLabel(min, true)}</small>${bk ? `<i class="cal__bk">${bk}</i>` : ''}
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
          <b>${MONTHS[m]} ${y}${b ? ` · ${esc(b.short)}` : ''}</b>
          <button class="icon-btn" type="button" data-mon="1" aria-label="Luna următoare">${icon('chevR', 'i--sm')}</button>
        </div>
        <div class="cal__dow">${DOW_HEAD.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="cal__grid">${cells.join('')}</div>
        <div class="cal__legend">
          <span><i class="lg-open"></i>Ore deschise pentru clienți</span>
          <span><i class="lg-custom"></i>Setat manual</span>
          <span><i class="lg-bk"></i>Nr. programări</span>
        </div>
      </section>
      <p class="fineprint">${icon('info')}<span>Atinge o zi ca să alegi orele deschise și durata sloturilor. Sloturile se reașază singure: după un tuns de barbă de 15 minute, următorul slot începe imediat.</span></p>

      <section class="sec">
        <div class="sec__head"><div><h2 class="sec__title">Program obișnuit</h2><p class="sec__sub">Se aplică zilelor pe care nu le setezi manual · sloturi de ${defaultStep()} min</p></div></div>
        <div class="list">
          ${WEEK.map(([d, name]) => {
            const iv = templateIv(d);
            return `<div class="list__item"><span class="list__main"><b>${name}</b><small>${iv.length ? toTimes(iv).map(([a, c]) => `${a} - ${c}`).join(', ') : 'Liber'}</small></span><span class="chip">${hoursLabel(totalMinutes(iv))}</span></div>`;
          }).join('')}
        </div>
        <div style="margin:12px var(--gutter) 0"><button class="btn btn--secondary btn--block" type="button" data-week>${icon('clock')} Modifică programul obișnuit</button></div>
      </section>
    </div>`;
}

/* ---------- ziua ---------- */
function daySheet(iso) {
  const d = fmt.date(iso);
  const custom = isCustom(iso);
  const booked = bookingsOn(iso);
  const bIv = bookedIv(booked);
  const busy = booked.map((b) => [toMin(b.time), toMin(b.time) + b.duration, b]);
  let iv = normalize([...dayIv(iso), ...bIv]); // o programare existentă rămâne mereu în interval
  let step = dayStep(iso);
  let revert = false;
  let blocks = [];
  const add = { start: iv.length ? iv[iv.length - 1][1] : toMin('10:00'), dur: 45 };
  if (!QUARTERS.includes(add.start)) add.start = toMin('10:00');

  // grila adaptivă pe toată fereastra zilei (08:30 - 21:15, lărgită dacă programul iese din ea)
  const layout = () => {
    const [w0, w1] = dayWindow();
    const from = Math.min(w0, iv[0]?.[0] ?? w0, busy[0]?.[0] ?? w0);
    const to = Math.max(w1, iv[iv.length - 1]?.[1] ?? w1, ...busy.map((x) => x[1]));
    return adaptiveBlocks({ from, to, step, open: iv, busy });
  };
  const blockHTML = (k, i) => {
    if (k.booked) {
      return `<button class="tslot is-booked" type="button" data-i="${i}" aria-pressed="true" aria-label="${toTime(k.a)} - ${toTime(k.b)}, ${esc(k.ref.name)}"><b>${toTime(k.a)}</b><small>${esc(k.ref.name.split(' ')[0])} · ${k.b - k.a} min</small></button>`;
    }
    return `<button class="tslot ${k.b - k.a < step ? 'is-short' : ''}" type="button" data-i="${i}" aria-pressed="${k.open}"><b>${toTime(k.a)}</b><small>până la ${toTime(k.b)}</small></button>`;
  };

  const s = openSheet({
    title: cap(fmt.dayLong(d)),
    body: `
      ${booked.length ? `
        <p class="sheet-sub" style="margin-top:0">${booked.length === 1 ? 'O programare' : `${booked.length} programări`}</p>
        <div class="list bk-list">${booked.map((x) => `
          <div class="list__item"><span class="list__icon">${icon('user')}</span><span class="list__main"><b>${x.time} - ${toTime(toMin(x.time) + x.duration)} · ${esc(x.name)}</b><small>${esc(x.serviceName)} · ${x.duration} min</small></span></div>`).join('')}
        </div>` : ''}

      <p class="sheet-sub">Sloturi pentru clienți</p>
      <p class="lead" data-note style="font-size:14px">${custom ? 'Program setat manual pentru această zi.' : `Programul obișnuit de ${fmt.dow(d)}. Ce schimbi aici se aplică doar acestei zile.`}</p>
      <div class="step-pick">
        <span class="step-pick__label">Durata sloturilor <small data-stepnote></small></span>
        <div class="dur-row" data-steps>${stepChips(step, 'step')}</div>
      </div>
      <div class="day-tools">
        <button class="chip-btn chip-btn--sm" type="button" data-all>Toată ziua</button>
        <button class="chip-btn chip-btn--sm" type="button" data-none>Zi liberă</button>
        <button class="chip-btn chip-btn--sm" type="button" data-usual>Ca de obicei</button>
      </div>
      <div class="tslots" data-grid></div>
      <div class="tslot-legend">
        <span><i class="lg-slot-open"></i>Deschis</span>
        <span><i class="lg-slot-off"></i>Închis</span>
        <span><i class="lg-bk"></i>Programare</span>
      </div>

      <p class="sheet-sub">Intervale exacte</p>
      <div class="iv-chips" data-ivs></div>
      <div class="iv-add">
        <span class="f-label" style="margin-top:0">Interval personalizat</span>
        <div class="iv-add__row">
          <label class="t-field"><span>Începe la</span><select class="input select" data-addstart>${QUARTERS.map((q) => `<option value="${q}" ${q === add.start ? 'selected' : ''}>${toTime(q)}</option>`).join('')}</select></label>
          <div class="t-field"><span>Durată</span><div class="dur-row">${DURATIONS.map((m) => `<button class="chip-btn chip-btn--sm" type="button" data-dur="${m}" aria-pressed="${m === add.dur}">${m}</button>`).join('')}</div></div>
        </div>
        <button class="btn btn--secondary btn--sm btn--block" type="button" data-addiv>${icon('plus')} <span data-addlabel></span></button>
      </div>
      <p class="fineprint">${icon('info')}<span>Clienții se pot programa la începutul oricărui slot deschis. Un serviciu mai lung decât slotul (pachetul complet, 75 min) ocupă și slotul următor. După fiecare programare, sloturile se reașază de la ora la care se termină. Orele cu programare nu se pot închide de aici.</span></p>`,
    foot: '<button class="btn btn--primary btn--block" type="button" data-save>Salvează · <span data-total></span></button>',
  });

  const $ = (sel) => s.el.querySelector(sel);
  const refresh = () => {
    blocks = layout();
    $('[data-grid]').innerHTML = blocks.map(blockHTML).join('');
    $('[data-steps]').innerHTML = stepChips(step, 'step');
    $('[data-stepnote]').textContent = step === defaultStep() ? '· ca de obicei' : `· doar în această zi (de obicei ${defaultStep()})`;
    $('[data-ivs]').innerHTML = iv.length
      ? toTimes(iv).map(([a, c], i) => `<span class="iv-chip">${a} - ${c}<button type="button" data-rmiv="${i}" aria-label="Șterge intervalul ${a} - ${c}">${icon('x', 'i--xs')}</button></span>`).join('')
      : '<span class="faint" style="font-size:13.5px;font-weight:700">Nicio oră deschisă. Ziua apare liberă pentru clienți.</span>';
    $('[data-total]').textContent = `${hoursLabel(totalMinutes(iv))} deschise`;
    $('[data-addlabel]').textContent = `Adaugă ${toTime(add.start)} - ${toTime(add.start + add.dur)}`;
  };
  const keepBooked = () => { iv = normalize([...iv, ...bIv]); };
  refresh();

  s.el.addEventListener('change', (e) => {
    if (e.target.matches('[data-addstart]')) { add.start = Number(e.target.value); refresh(); }
  });

  s.el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-i],[data-step],[data-all],[data-none],[data-usual],[data-dur],[data-addiv],[data-rmiv],[data-save]');
    if (!t) return;
    if (t.dataset.i != null) {
      const k = blocks[Number(t.dataset.i)];
      if (!k) return;
      if (k.booked) {
        haptic('heavy');
        toast(`${k.ref.name} are programare la ${k.ref.time}. Anuleaz-o din Agenda.`, { ic: 'info' });
        return;
      }
      haptic('select');
      iv = k.open ? subtract(iv, k.a, k.b) : union(iv, k.a, k.b);
      keepBooked();
      revert = false;
      refresh();
      return;
    }
    if (t.dataset.step) {
      haptic('select');
      step = Number(t.dataset.step);
      revert = false;
      refresh();
      return;
    }
    if (t.hasAttribute('data-all')) { haptic(); const [w0, w1] = dayWindow(); iv = union(iv, w0, w1); revert = false; refresh(); return; }
    if (t.hasAttribute('data-none')) { haptic(); iv = []; keepBooked(); revert = false; refresh(); return; }
    if (t.hasAttribute('data-usual')) {
      haptic();
      iv = templateIv(d.getDay());
      keepBooked();
      step = defaultStep();
      revert = true;
      $('[data-note]').textContent = `Revine la programul obișnuit de ${fmt.dow(d)}.`;
      refresh();
      return;
    }
    if (t.dataset.dur) {
      haptic('select');
      add.dur = Number(t.dataset.dur);
      s.el.querySelectorAll('[data-dur]').forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
      refresh();
      return;
    }
    if (t.hasAttribute('data-addiv')) {
      haptic();
      iv = union(iv, add.start, add.start + add.dur);
      revert = false;
      add.start = Math.min(QUARTERS[QUARTERS.length - 1], add.start + add.dur);
      const sel = $('[data-addstart]');
      if (sel) sel.value = String(add.start);
      refresh();
      toast('Interval adăugat. Apasă Salvează.', { ic: 'plus' });
      return;
    }
    if (t.dataset.rmiv != null) {
      const [a, b] = iv[Number(t.dataset.rmiv)];
      const hit = bIv.some(([x, y]) => x < b && a < y);
      if (hit) {
        haptic('heavy');
        // păstrează doar bucățile cu programări
        iv = normalize([...subtract(iv, a, b), ...bIv]);
        toast('Am păstrat orele care au programări.', { ic: 'info' });
      } else {
        haptic();
        iv = subtract(iv, a, b);
      }
      revert = false;
      refresh();
      return;
    }
    if (t.hasAttribute('data-save')) {
      t.disabled = true;
      const next = clone(sched());
      // orele egale cu programul obișnuit nu se salvează ca excepție (de ex. când schimbi doar durata sloturilor)
      const same = JSON.stringify(normalize(templateIv(d.getDay()))) === JSON.stringify(iv);
      if (same && (revert || !custom)) delete next.days[iso];
      else next.days[iso] = toTimes(iv);
      if (step === defaultStep()) delete next.steps[iso];
      else next.steps[iso] = step;
      for (const k of Object.keys(next.days)) if (k < todayIso()) delete next.days[k];
      for (const k of Object.keys(next.steps)) if (k < todayIso()) delete next.steps[k];
      const ok = await save(next, `Program salvat: ${fmt.dayLong(d).toLowerCase()}`);
      t.disabled = false;
      if (ok) s.close();
    }
  });
}

/* ---------- programul obișnuit ---------- */
function weekSheet() {
  const model = {};
  let step = defaultStep();
  for (const [d] of WEEK) {
    const iv = templateIv(d);
    model[d] = iv.length ? { on: true, start: iv[0][0], end: iv[iv.length - 1][1] } : { on: false, start: toMin('08:30'), end: toMin('16:45') };
    if (iv.length > 1) model[d].note = 'Are pauză; la salvare devine un interval continuu.';
  }
  const opts = (v) => QUARTERS.map((q) => `<option value="${q}" ${q === v ? 'selected' : ''}>${toTime(q)}</option>`).join('');
  const rowHTML = (d, name) => {
    const w = model[d];
    return `<div class="wk-row ${w.on ? '' : 'is-off'}" data-day="${d}">
      <div class="wk-row__head">
        <div><b>${name}</b>${w.note && w.on ? `<small>${w.note}</small>` : ''}</div>
        <button class="switch-btn" type="button" role="switch" aria-checked="${w.on}" aria-label="${name}: lucrez" data-toggle="${d}"><span class="switch"></span></button>
      </div>
      ${w.on ? `<div class="wk-row__times">
        <label class="t-field"><span>De la</span><select class="input select" data-d="${d}" data-k="start">${opts(w.start)}</select></label>
        <label class="t-field"><span>Până la</span><select class="input select" data-d="${d}" data-k="end">${opts(w.end)}</select></label>
      </div>` : ''}
    </div>`;
  };
  const s = openSheet({
    title: 'Program obișnuit',
    body: `<p class="lead">Orele și sloturile implicite pentru fiecare zi a săptămânii. Zilele setate manual în calendar rămân cum le-ai setat.</p>
      <div class="step-pick" style="margin-top:16px">
        <span class="step-pick__label">Durata sloturilor <small>· minute</small></span>
        <div class="dur-row" data-wsteps>${stepChips(step, 'wstep')}</div>
      </div>
      <div class="wk" style="margin:16px 0 0" data-week>${WEEK.map(([d, n]) => rowHTML(d, n)).join('')}</div>`,
    foot: '<button class="btn btn--primary btn--block" type="button" data-save>Salvează programul obișnuit</button>',
  });
  const box = s.el.querySelector('[data-week]');
  const rerender = () => { box.innerHTML = WEEK.map(([d, n]) => rowHTML(d, n)).join(''); };
  s.el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.d == null) return;
    model[t.dataset.d][t.dataset.k] = Number(t.value);
  });
  s.el.addEventListener('click', async (e) => {
    const ws = e.target.closest('[data-wstep]');
    if (ws) { haptic('select'); step = Number(ws.dataset.wstep); s.el.querySelector('[data-wsteps]').innerHTML = stepChips(step, 'wstep'); return; }
    const tg = e.target.closest('[data-toggle]');
    if (tg) { haptic('select'); const w = model[tg.dataset.toggle]; w.on = !w.on; rerender(); return; }
    const sv = e.target.closest('[data-save]');
    if (!sv) return;
    const bad = WEEK.filter(([d]) => model[d].on && model[d].end <= model[d].start);
    if (bad.length) { haptic('heavy'); toast(`Verifică orele pentru ${bad.map(([, n]) => n.toLowerCase()).join(', ')}`, { ic: 'clock', tone: 'red' }); return; }
    const next = clone(sched());
    for (const [d] of WEEK) next.week[d] = model[d].on ? [[toTime(model[d].start), toTime(model[d].end)]] : [];
    next.step = step;
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
