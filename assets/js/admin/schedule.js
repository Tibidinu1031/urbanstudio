/* Programul frizerului: orele pe zilele săptămânii, pauză, zile libere și program special. */
import { Admin, defaultSchedule } from '../api.js';
import { icon } from '../icons.js';
import { esc, fmt, haptic, bus, toast } from '../lib.js';
import { toMin } from '../slots.js';
import { state, topbar, barberChips, barberOf, loadTeam, errText } from './shared.js';

let el;
let barberId;
let model;       // { week: {d: {on, start, end, pause: null|{start,end}}}, days: {iso: [] | [[a,b]]} }
let dirty = false;
let add = { date: '', type: 'off', start: '10:00', end: '14:00' };
const DAYS = [[1, 'Luni'], [2, 'Marți'], [3, 'Miercuri'], [4, 'Joi'], [5, 'Vineri'], [6, 'Sâmbătă'], [0, 'Duminică']];

export function initSchedule(root) {
  el = root;
  barberId = state.user.id;
  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  bus.on('admin:team', () => { if (!el.hidden && !dirty) { load(); render(); } });
}

export function showSchedule() {
  if (!model || !dirty) load();
  render();
}

function load() {
  const b = barberOf(barberId);
  const s = b?.schedule || defaultSchedule();
  const week = {};
  for (let d = 0; d < 7; d++) {
    const iv = s.week?.[d] || [];
    if (!iv.length) week[d] = { on: false, start: '09:00', end: '17:00', pause: null };
    else if (iv.length === 1) week[d] = { on: true, start: iv[0][0], end: iv[0][1], pause: null };
    else week[d] = { on: true, start: iv[0][0], end: iv[iv.length - 1][1], pause: { start: iv[0][1], end: iv[1][0] } };
  }
  const today = fmt.iso(new Date());
  const days = Object.fromEntries(Object.entries(s.days || {}).filter(([iso]) => iso >= today));
  model = { week, days };
  dirty = false;
}

function toSchedule() {
  const week = {};
  for (let d = 0; d < 7; d++) {
    const w = model.week[d];
    if (!w.on) week[d] = [];
    else if (w.pause) week[d] = [[w.start, w.pause.start], [w.pause.end, w.end]];
    else week[d] = [[w.start, w.end]];
  }
  return { week, days: model.days };
}

function invalidDay(w) {
  if (!w.on) return false;
  if (!w.start || !w.end || toMin(w.end) <= toMin(w.start)) return true;
  if (w.pause) {
    const ps = toMin(w.pause.start), pe = toMin(w.pause.end);
    if (!(toMin(w.start) < ps && ps < pe && pe < toMin(w.end))) return true;
  }
  return false;
}

function summary(w) {
  if (!w.on) return 'Liber';
  return `${w.start} - ${w.end}${w.pause ? ` · pauză ${w.pause.start} - ${w.pause.end}` : ''}`;
}

function render() {
  const b = barberOf(barberId);
  const exc = Object.entries(model.days).sort(([a], [c]) => a.localeCompare(c));
  el.innerHTML = `
    ${topbar({ title: 'Program' })}
    <div class="page">
      <div class="hello"><div class="eyebrow">Disponibilitate pentru clienți</div><h1 class="display">Program</h1></div>
      <div data-chips>${barberChips(barberId, { allowAll: false })}</div>

      <section class="sec" style="margin-top:22px">
        <div class="sec__head"><div><h2 class="sec__title">Săptămâna${b ? ` lui ${esc(b.short)}` : ''}</h2><p class="sec__sub">Clienții văd doar orele din acest program</p></div></div>
        <div class="wk">
          ${DAYS.map(([d, name]) => {
            const w = model.week[d];
            return `<div class="wk-row ${w.on ? '' : 'is-off'} ${invalidDay(w) ? 'is-bad' : ''}" data-day="${d}">
              <div class="wk-row__head">
                <div><b>${name}</b><small>${summary(w)}</small></div>
                <button class="switch-btn" type="button" role="switch" aria-checked="${w.on}" aria-label="${name}: lucrez" data-toggle="${d}"><span class="switch"></span></button>
              </div>
              ${w.on ? `
                <div class="wk-row__times">
                  <label class="t-field"><span>De la</span><input class="input" type="time" step="900" value="${w.start}" data-d="${d}" data-k="start"></label>
                  <label class="t-field"><span>Până la</span><input class="input" type="time" step="900" value="${w.end}" data-d="${d}" data-k="end"></label>
                </div>
                <div class="wk-row__pause">
                  ${w.pause ? `
                    <div class="pause-box">
                      <label class="t-field"><span>Pauză de la</span><input class="input" type="time" step="900" value="${w.pause.start}" data-d="${d}" data-k="pstart"></label>
                      <label class="t-field"><span>Până la</span><input class="input" type="time" step="900" value="${w.pause.end}" data-d="${d}" data-k="pend"></label>
                      <button class="icon-btn" type="button" data-nopause="${d}" aria-label="Șterge pauza">${icon('x', 'i--sm')}</button>
                    </div>` : `<button class="link-btn" type="button" data-pause="${d}">${icon('coffee', 'i--sm')}&nbsp;Adaugă pauză</button>`}
                </div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </section>

      <section class="sec">
        <div class="sec__head"><div><h2 class="sec__title">Zile libere și excepții</h2><p class="sec__sub">Concediu, o zi liberă sau un program special</p></div></div>
        ${exc.length ? `<div class="list">${exc.map(([iso, iv]) => `
          <div class="list__item">
            <span class="list__icon">${icon(iv.length ? 'clock' : 'calendar')}</span>
            <span class="list__main"><b>${fmt.dayLong(fmt.date(iso))}</b><small>${iv.length ? iv.map(([a, c]) => `${a} - ${c}`).join(', ') : 'Liber toată ziua'}</small></span>
            <button class="icon-btn" type="button" data-rmexc="${iso}" aria-label="Șterge excepția">${icon('trash', 'i--sm')}</button>
          </div>`).join('')}</div>` : ''}
        <div class="exc-add">
          <label class="t-field"><span>Data</span><input class="input" type="date" value="${add.date}" min="${fmt.iso(new Date())}" data-add="date"></label>
          <div class="seg-mini">
            <button class="chip-btn chip-btn--sm" type="button" data-addtype="off" aria-pressed="${add.type === 'off'}" style="justify-content:center">Liber</button>
            <button class="chip-btn chip-btn--sm" type="button" data-addtype="custom" aria-pressed="${add.type === 'custom'}" style="justify-content:center">Program special</button>
          </div>
          ${add.type === 'custom' ? `<div class="f-row" style="margin-top:10px">
            <label class="t-field"><span>De la</span><input class="input" type="time" step="900" value="${add.start}" data-add="start"></label>
            <label class="t-field"><span>Până la</span><input class="input" type="time" step="900" value="${add.end}" data-add="end"></label>
          </div>` : ''}
          <button class="btn btn--secondary btn--sm btn--block" type="button" data-addexc>${icon('plus')} Adaugă excepția</button>
        </div>
      </section>

      <p class="dirty-note ${dirty ? 'is-on' : ''}">Ai modificări nesalvate.</p>
      <div class="save-row"><button class="btn btn--primary btn--block" type="button" data-save ${dirty ? '' : 'disabled'}>Salvează programul</button></div>
    </div>`;
}

function markDirty() {
  dirty = true;
  el.querySelector('.dirty-note')?.classList.add('is-on');
  const s = el.querySelector('[data-save]');
  if (s) s.disabled = false;
}

function onChange(e) {
  const t = e.target;
  if (t.dataset.add) { add[t.dataset.add] = t.value; return; }
  const d = t.dataset.d;
  if (d == null) return;
  const w = model.week[d];
  if (t.dataset.k === 'start') w.start = t.value;
  if (t.dataset.k === 'end') w.end = t.value;
  if (t.dataset.k === 'pstart') w.pause.start = t.value;
  if (t.dataset.k === 'pend') w.pause.end = t.value;
  const row = el.querySelector(`[data-day="${d}"]`);
  row.classList.toggle('is-bad', invalidDay(w));
  row.querySelector('small').textContent = summary(w);
  markDirty();
}

async function onClick(e) {
  const t = e.target.closest('[data-barber],[data-toggle],[data-pause],[data-nopause],[data-rmexc],[data-addtype],[data-addexc],[data-save]');
  if (!t) return;
  if (t.hasAttribute('data-barber')) {
    if (!t.dataset.barber) return;
    if (dirty && !confirm('Ai modificări nesalvate. Le renunți?')) return;
    haptic('select');
    barberId = t.dataset.barber;
    load();
    render();
    return;
  }
  if (t.dataset.toggle != null) {
    haptic('select');
    const w = model.week[t.dataset.toggle];
    w.on = !w.on;
    dirty = true;
    render();
    return;
  }
  if (t.dataset.pause != null) {
    haptic();
    const w = model.week[t.dataset.pause];
    const mid = Math.round((toMin(w.start) + toMin(w.end)) / 2 / 15) * 15;
    const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    w.pause = { start: hh(mid), end: hh(mid + 30) };
    dirty = true;
    render();
    return;
  }
  if (t.dataset.nopause != null) { haptic(); model.week[t.dataset.nopause].pause = null; dirty = true; render(); return; }
  if (t.dataset.rmexc) { haptic(); delete model.days[t.dataset.rmexc]; dirty = true; render(); return; }
  if (t.dataset.addtype) { haptic('select'); add.type = t.dataset.addtype; render(); return; }
  if (t.hasAttribute('data-addexc')) {
    if (!add.date) { toast('Alege data', { ic: 'calendar' }); return; }
    if (add.type === 'custom' && toMin(add.end) <= toMin(add.start)) { toast('Ora de final trebuie să fie după ora de început', { ic: 'clock', tone: 'red' }); return; }
    haptic();
    model.days[add.date] = add.type === 'off' ? [] : [[add.start, add.end]];
    add = { date: '', type: 'off', start: '10:00', end: '14:00' };
    dirty = true;
    render();
    return;
  }
  if (t.hasAttribute('data-save')) {
    const bad = DAYS.filter(([d]) => invalidDay(model.week[d]));
    if (bad.length) {
      haptic('heavy');
      toast(`Verifică orele pentru ${bad.map(([, n]) => n.toLowerCase()).join(', ')}`, { ic: 'clock', tone: 'red' });
      return;
    }
    t.disabled = true;
    const r = await Admin.saveSchedule(barberId, toSchedule());
    if (!r.ok) { t.disabled = false; toast(errText(r.error), { ic: 'info', tone: 'red' }); return; }
    await loadTeam();
    dirty = false;
    haptic('success');
    toast('Programul a fost salvat', { ic: 'check' });
    render();
    bus.emit('admin:data');
  }
}
