/* Echipa: frizerii sunt și conturile de acces în panou. Adăugare, editare, dezactivare. */
import { Admin } from '../api.js';
import { icon } from '../icons.js';
import { esc, fmt, haptic, bus, toast, openSheet } from '../lib.js';
import { avatar } from '../components.js';
import { state, topbar, loadTeam, errText } from './shared.js';

let el;

export function initTeam(root) {
  el = root;
  el.addEventListener('click', onClick);
  bus.on('admin:data', () => { if (!el.hidden) render(); });
}

export function showTeam() { render(); }

function render() {
  const active = state.team.filter((b) => b.active !== false);
  const inactive = state.team.filter((b) => b.active === false);
  const upcoming = (id) => state.bookings.filter((b) => b.barberId === id && b.status === 'confirmed' && b.startMs > Date.now()).length;
  const rowHTML = (b) => `
    <button class="team-row press ${b.active === false ? 'is-inactive' : ''}" type="button" data-edit="${b.id}">
      ${avatar(b, 'avatar--lg')}
      <span class="grow">
        <b>${esc(b.name)}${b.id === state.user.id ? '<span class="tag-you">TU</span>' : ''}</b>
        <small>${esc(b.role || 'Barber')} · @${esc(b.username || '')}</small>
        <small>${icon('phone', 'i--xs')} ${esc(fmt.phone(b.phone || ''))}${b.active !== false ? ` · ${upcoming(b.id)} programări viitoare` : ''}</small>
      </span>
      <span class="list__chev">${icon('chevR')}</span>
    </button>`;

  el.innerHTML = `
    ${topbar({ title: 'Echipa' })}
    <div class="page">
      <div class="hello"><div class="eyebrow">Frizeri și conturi</div><h1 class="display">Echipa</h1></div>
      <section class="sec" style="margin-top:22px">
        <div class="sec__head"><div><h2 class="sec__title">Activi</h2><p class="sec__sub">Apar în aplicație și se pot loga în panou</p></div></div>
        <div class="team-list">${active.map(rowHTML).join('')}</div>
        <div style="margin:12px var(--gutter) 0"><button class="btn btn--secondary btn--block" type="button" data-add>${icon('userPlus')} Adaugă frizer</button></div>
      </section>
      ${inactive.length ? `
        <section class="sec">
          <div class="sec__head"><div><h2 class="sec__title">Inactivi</h2><p class="sec__sub">Ascunși din aplicație, istoricul rămâne</p></div></div>
          <div class="team-list">${inactive.map(rowHTML).join('')}</div>
        </section>` : ''}
      <p class="fineprint">${icon('info')}<span>SMS-urile către clienți pleacă în numele frizerului, de pe numărul lui de telefon setat aici.</span></p>
    </div>`;
}

function onClick(e) {
  const t = e.target.closest('[data-edit],[data-add]');
  if (!t) return;
  haptic();
  if (t.hasAttribute('data-add')) editSheet(null);
  else editSheet(state.team.find((b) => b.id === t.dataset.edit));
}

function editSheet(b) {
  const isNew = !b;
  const self = b && b.id === state.user.id;
  const v = b || { name: '', short: '', role: 'Barber', phone: '0728933035', username: '', bio: '' };
  const field = (k, label, attrs = '', hint = '') => `
    <div class="field" data-f="${k}">
      <label class="field__label" for="tm-${k}">${label}${hint ? ` <small>${hint}</small>` : ''}</label>
      <input class="input" id="tm-${k}" ${attrs} value="${esc(v[k] || '')}">
      <div class="field__err"></div>
    </div>`;
  const s = openSheet({
    title: isNew ? 'Frizer nou' : esc(v.name),
    body: `
      <form class="form-grid" novalidate>
        ${field('name', 'Nume complet', 'autocapitalize="words" placeholder="Ex.: Andrei Popescu"')}
        ${field('short', 'Nume afișat clienților', 'autocapitalize="words" placeholder="Ex.: Andrei"')}
        ${field('role', 'Rol', 'placeholder="Barber"')}
        ${field('phone', 'Telefon pentru SMS', 'type="tel" inputmode="tel" placeholder="07xx xxx xxx"', 'de aici pleacă SMS-urile')}
        ${field('username', 'Utilizator pentru panou', 'autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="ex.: andrei"')}
        <div class="field" data-f="password">
          <label class="field__label" for="tm-password">${isNew ? 'Parolă' : 'Parolă nouă'} <small>${isNew ? 'minim 6 caractere' : 'lasă gol ca să rămână'}</small></label>
          <input class="input" id="tm-password" type="password" autocomplete="new-password" placeholder="${isNew ? 'Parola contului' : '••••••'}">
          <div class="field__err"></div>
        </div>
        <div class="field"><label class="field__label" for="tm-bio">Descriere <small>opțional</small></label><textarea class="input" id="tm-bio" rows="2" placeholder="Ce îi place să lucreze">${esc(v.bio || '')}</textarea></div>
      </form>`,
    foot: `
      <button class="btn btn--primary btn--block" type="button" data-save>${isNew ? 'Adaugă frizerul' : 'Salvează'}</button>
      ${!isNew && !self ? (b.active === false
        ? '<button class="btn btn--secondary btn--block" type="button" data-active="1">Reactivează frizerul</button>'
        : `<button class="btn btn--ghost btn--block" type="button" data-active="0">${icon('trash')} Șterge din echipă</button>`) : ''}`,
  });

  const val = (k) => s.el.querySelector(`#tm-${k}`).value.trim();
  const setErr = (k, msg) => {
    const f = s.el.querySelector(`[data-f="${k}"]`);
    f.classList.toggle('is-invalid', !!msg);
    f.querySelector('.field__err').textContent = msg || '';
  };

  s.el.querySelector('[data-save]').addEventListener('click', async (e) => {
    const data = { id: b?.id, name: val('name'), short: val('short'), role: val('role') || 'Barber', phone: val('phone'), username: val('username').toLowerCase(), bio: s.el.querySelector('#tm-bio').value.trim() };
    const pw = s.el.querySelector('#tm-password').value;
    const digits = data.phone.replace(/\D/g, '');
    let bad = false;
    setErr('name', data.name.length < 2 ? 'Completează numele.' : ''); bad ||= data.name.length < 2;
    const phoneOk = (digits.length === 10 && digits.startsWith('07')) || (data.phone.startsWith('+') && digits.length >= 10);
    setErr('phone', phoneOk ? '' : 'Număr invalid (10 cifre, începe cu 07).'); bad ||= !phoneOk;
    const userOk = /^[a-z0-9._-]{3,}$/.test(data.username);
    setErr('username', userOk ? '' : 'Minim 3 caractere: litere mici, cifre, punct.'); bad ||= !userOk;
    const pwOk = isNew ? pw.length >= 6 : (!pw || pw.length >= 6);
    setErr('password', pwOk ? '' : 'Minim 6 caractere.'); bad ||= !pwOk;
    if (bad) { haptic('heavy'); return; }
    if (!data.short) data.short = data.name.split(' ')[0];
    data.phone = fmt.phone(data.phone);

    const btn = e.currentTarget;
    btn.disabled = true;
    const r = await Admin.saveBarber(data, pw || undefined);
    btn.disabled = false;
    if (!r.ok) {
      if (r.error === 'username-taken') setErr('username', errText(r.error));
      toast(errText(r.error), { ic: 'info', tone: 'red' });
      return;
    }
    await loadTeam();
    s.close();
    haptic('success');
    toast(isNew ? `${data.short} a fost adăugat în echipă` : 'Modificări salvate', { ic: 'check' });
    bus.emit('admin:data');
    bus.emit('admin:team');
  });

  const act = s.el.querySelector('[data-active]');
  let armed = false;
  act?.addEventListener('click', async () => {
    const activate = act.dataset.active === '1';
    if (!activate && !armed) {
      haptic('heavy');
      armed = true;
      const n = state.bookings.filter((x) => x.barberId === b.id && x.status === 'confirmed' && x.startMs > Date.now()).length;
      act.classList.replace('btn--ghost', 'btn--danger');
      act.textContent = n ? `Are ${n} programări viitoare. Apasă din nou` : 'Apasă din nou pentru a confirma';
      setTimeout(() => { if (armed && document.body.contains(act)) { armed = false; act.classList.replace('btn--danger', 'btn--ghost'); act.innerHTML = `${icon('trash')} Șterge din echipă`; } }, 4000);
      return;
    }
    const r = await Admin.setActive(b.id, activate);
    if (!r.ok) { toast(errText(r.error), { ic: 'info', tone: 'red' }); return; }
    await loadTeam();
    s.close();
    toast(activate ? `${b.short} e din nou activ` : `${b.short} a fost scos din echipă. Istoricul rămâne.`, { ic: 'check' });
    bus.emit('admin:data');
    bus.emit('admin:team');
  });
}
