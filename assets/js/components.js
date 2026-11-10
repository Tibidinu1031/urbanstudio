/* Piese de UI reutilizate și sheet-urile aplicației. */
import { SALON, BARBERS, SERVICES, ACADEMY } from './data.js';
import { icon } from './icons.js';
import { esc, fmt, openSheet, bus, haptic, isIOS } from './lib.js';
import { hoursFor, toTime } from './slots.js';
import { mapsLinks, downloadICS, googleCalUrl, notifState, enableNotifications, hasServer } from './reminders.js';

export const barberById = (id) => BARBERS.find((b) => b.id === id);
export const serviceById = (id) => SERVICES.find((s) => s.id === id);

export function avatar(b, cls = '') {
  if (!b) return `<span class="avatar any-av ${cls}">${icon('users', 'i--sm')}</span>`;
  if (b.photo) return `<img class="avatar ${cls}" src="${b.photo}" alt="" loading="lazy" decoding="async">`;
  const initials = b.name.split(' ').map((p) => p[0]).join('').slice(0, 2);
  return `<span class="avatar monogram ${cls}" aria-hidden="true">${esc(initials)}</span>`;
}

export function stars(n = 5) {
  return `<span class="stars" aria-hidden="true">${Array.from({ length: n }, () => icon('star')).join('')}</span>`;
}

const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
export function hoursTable(flat = false) {
  const today = new Date().getDay();
  return `<div class="hours ${flat ? 'hours--flat' : ''}">${DAYS_ORDER.map((d) => {
    const h = SALON.hours[d];
    return `<div class="hours__row ${h ? '' : 'is-closed'} ${d === today ? 'is-today' : ''}"><span>${DAY_NAMES[d]}</span><span>${h ? `${h[0]} - ${h[1]}` : 'Închis'}</span></div>`;
  }).join('')}</div>`;
}

/* ---------- sheet-uri ---------- */
export function barberSheet(id) {
  const b = barberById(id);
  if (!b) return;
  const s = openSheet({
    label: b.name,
    body: `
      <div class="profile-hero">
        ${avatar(b)}
        <h3>${esc(b.name)}</h3>
        <p>${esc(b.role)}</p>
        ${b.rating ? `<div class="profile-tags"><span class="chip">${icon('star')} ${String(b.rating).replace('.', ',')} · ${b.reviews.toLocaleString('ro-RO')} recenzii</span></div>` : ''}
        <p class="profile-bio">${esc(b.bio)}</p>
        <div class="profile-tags">${b.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
      </div>`,
    foot: `<button class="btn btn--primary btn--block" type="button" data-go>Programează-te la ${esc(b.short)}</button>`,
  });
  s.el.querySelector('[data-go]').addEventListener('click', () => {
    haptic();
    s.close();
    setTimeout(() => bus.emit('book:start', { barberId: b.id }), 260);
  });
}

export function hoursSheet() {
  openSheet({
    title: 'Program',
    body: `${hoursTable()}<p class="fineprint">${icon('info')}<span>Programările se fac pe intervale de 15 minute. Pentru ziua curentă, cu cel puțin 30 de minute înainte.</span></p>`,
    foot: `<a class="btn btn--secondary btn--block" href="tel:${SALON.phoneIntl}">${icon('phone')} Sună la salon</a>`,
  });
}

export function directionsSheet() {
  const l = mapsLinks();
  openSheet({
    title: 'Indicații',
    body: `
      <p class="lead">${esc(SALON.address)}<br><span class="faint">${esc(SALON.addressHint)}</span></p>
      <div class="list" style="margin-top:16px">
        <a class="list__item" href="${l.google}" target="_blank" rel="noopener"><span class="list__icon">${icon('pin')}</span><span class="list__main"><b>Google Maps</b><small>Traseu până la salon</small></span><span class="list__chev">${icon('arrowUR')}</span></a>
        <a class="list__item" href="${l.waze}" target="_blank" rel="noopener"><span class="list__icon">${icon('nav')}</span><span class="list__main"><b>Waze</b><small>Navigare cu mașina</small></span><span class="list__chev">${icon('arrowUR')}</span></a>
        ${isIOS() ? `<a class="list__item" href="${l.apple}" target="_blank" rel="noopener"><span class="list__icon">${icon('globe')}</span><span class="list__main"><b>Apple Maps</b><small>Hărți pe iPhone</small></span><span class="list__chev">${icon('arrowUR')}</span></a>` : ''}
      </div>`,
  });
}

export function academySheet() {
  const msg = encodeURIComponent('Bună! Aș vrea mai multe detalii despre cursul de barbering.');
  openSheet({
    title: 'Urban Studio Academy',
    body: `
      <p class="lead">${esc(ACADEMY.text)}</p>
      <div class="stats" style="margin:18px 0 0">
        <div class="stat"><b>${ACADEMY.modules}</b><small>module</small></div>
        <div class="stat"><b>4</b><small>săptămâni</small></div>
        <div class="stat"><b>${(ACADEMY.price / 1000).toLocaleString('ro-RO')}k</b><small>lei, tot cursul</small></div>
      </div>
      <p class="fineprint">${icon('cap')}<span>Cursurile sunt ținute de Adiță, trainer acreditat cu 5 ani de experiență în formare.</span></p>`,
    foot: `
      <a class="btn btn--primary btn--block" href="https://wa.me/${SALON.whatsapp}?text=${msg}" target="_blank" rel="noopener">${icon('whatsapp')} Întreabă pe WhatsApp</a>
      <a class="btn btn--secondary btn--block" href="tel:${SALON.phoneIntl}">${icon('phone')} Sună: ${SALON.phone}</a>`,
  });
}

export function calendarSheet(b) {
  const s = openSheet({
    title: 'Adaugă în calendar',
    body: `
      <p class="lead">Telefonul îți va aminti singur de programare: cu o zi înainte și cu 2 ore înainte.</p>
      <div class="list" style="margin-top:16px">
        <button class="list__item" type="button" data-ics><span class="list__icon">${icon('calendar')}</span><span class="list__main"><b>${isIOS() ? 'Calendar iPhone' : 'Calendarul telefonului'}</b><small>Fișier .ics cu alarme incluse</small></span><span class="list__chev">${icon('download')}</span></button>
        <a class="list__item" href="${googleCalUrl(b)}" target="_blank" rel="noopener" data-gcal><span class="list__icon">${icon('calCheck')}</span><span class="list__main"><b>Google Calendar</b><small>Se deschide în browser sau aplicație</small></span><span class="list__chev">${icon('arrowUR')}</span></a>
      </div>`,
  });
  s.el.querySelector('[data-ics]').addEventListener('click', () => { haptic(); downloadICS(b); bus.emit('bookings'); setTimeout(() => s.close(), 300); });
  s.el.querySelector('[data-gcal]').addEventListener('click', () => setTimeout(() => s.close(), 300));
}

export function notifSheet() {
  const st = notifState();
  let body, foot = '';
  if (st === 'ios-install') {
    body = `<p class="lead">Pe iPhone, notificările web funcționează după ce adaugi aplicația pe ecranul principal.</p>
      <div class="list" style="margin-top:16px">
        <div class="list__item"><span class="list__icon">1</span><span class="list__main"><b>Apasă butonul Partajează</b><small>Pictograma cu săgeată din bara Safari</small></span></div>
        <div class="list__item"><span class="list__icon">2</span><span class="list__main"><b>Adaugă pe ecranul principal</b><small>Aplicația apare lângă celelalte</small></span></div>
        <div class="list__item"><span class="list__icon">3</span><span class="list__main"><b>Deschide-o și activează notificările</b><small>Din Agenda</small></span></div>
      </div>
      <p class="fineprint">${icon('info')}<span>Până atunci, „Adaugă în calendar” îți setează reamintirea direct în telefon.</span></p>`;
  } else if (st === 'denied') {
    body = `<p class="lead">Notificările sunt blocate pentru acest site. Le poți reactiva din setările browserului, la permisiunile site-ului.</p>
      <p class="fineprint">${icon('info')}<span>Alternativ, adaugă programarea în calendar: alarma se declanșează cu o zi înainte.</span></p>`;
  } else if (st === 'unsupported') {
    body = `<p class="lead">Browserul acesta nu suportă notificări web. Adaugă programarea în calendar și primești alarma cu o zi înainte.</p>`;
  } else {
    body = `<p class="lead">Îți trimitem o notificare cu o zi înainte de fiecare programare, la aceeași oră.</p>`;
    foot = `<button class="btn btn--primary btn--block" type="button" data-enable>${icon('bell')} Activează notificările</button>`;
  }
  const s = openSheet({ title: 'Notificări', body, foot });
  s.el.querySelector('[data-enable]')?.addEventListener('click', async () => {
    haptic();
    await enableNotifications();
    s.close();
  });
}

export function privacySheet() {
  openSheet({
    title: 'Confidențialitate',
    body: `
      <p class="lead">Numele, telefonul și emailul tău sunt folosite doar pentru programare și pentru reamintirea ei.</p>
      <div class="list" style="margin-top:16px">
        ${hasServer()
          ? `<div class="list__item"><span class="list__icon">${icon('smartphone')}</span><span class="list__main"><b>Ajung doar la salon</b><small>Într-un registru privat, folosit pentru agendă</small></span></div>`
          : `<div class="list__item"><span class="list__icon">${icon('smartphone')}</span><span class="list__main"><b>Rămân pe telefonul tău</b><small>Programările se salvează în acest browser</small></span></div>`}
        <div class="list__item"><span class="list__icon">${icon('shield')}</span><span class="list__main"><b>Fără reclame, fără terți</b><small>Nu vindem și nu partajăm date</small></span></div>
        <div class="list__item"><span class="list__icon">${icon('mail')}</span><span class="list__main"><b>Ștergere la cerere</b><small>${esc(SALON.email)}</small></span></div>
      </div>`,
  });
}

/* ---------- hartă statică (dale OpenStreetMap, întunecate prin CSS, fără bibliotecă) ---------- */
// Zoom 17 afișat la 128px pe dală: claritate de ecran retina cu aceeași încadrare ca zoom 16.
export function mapHTML(markHTML) {
  const { lat, lng } = SALON.geo;
  const z = 17, n = 2 ** z, S = 128;
  const x = ((lng + 180) / 360) * n;
  const latR = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  const tiles = [];
  for (let tx = Math.floor(x - 250 / S); tx <= Math.floor(x + 250 / S); tx++) {
    for (let ty = Math.floor(y - 100 / S); ty <= Math.floor(y + 100 / S); ty++) {
      const left = (tx - x) * S, top = (ty - y) * S;
      tiles.push(`<img src="https://tile.openstreetmap.org/${z}/${tx}/${ty}.png" style="left:calc(50% + ${left.toFixed(1)}px);top:calc(50% + ${top.toFixed(1)}px)" alt="" loading="lazy" decoding="async">`);
    }
  }
  return `
    <button class="map press" type="button" data-directions aria-label="Indicații către salon">
      <span class="map__tiles">${tiles.join('')}</span>
      <span class="map__pulse"></span>
      <span class="map__pin"><span class="map__pin-head">${markHTML}</span></span>
      <span class="map__label">Urban Studio<small>Str. Panduri 2</small></span>
      <span class="map__attr">© OpenStreetMap</span>
    </button>`;
}

export { toTime, hoursFor };
