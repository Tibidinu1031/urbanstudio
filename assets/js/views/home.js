/* Acasă: salut, căutare rapidă, următoarea programare, sugestii, echipă, recenzii, galerie, locație. */
import { SALON, SERVICES, BARBERS, REVIEWS, PHOTOS, ACADEMY } from '../data.js';
import { icon } from '../icons.js';
import { esc, fmt, bus, haptic, fadeImages } from '../lib.js';
import { Bookings, Profile } from '../store.js';
import { openStatus, nextAvailable } from '../slots.js';
import { reminderText } from '../reminders.js';
import { logoSVG, scissorsMark } from '../logo.js';
import { avatar, stars, barberById, barberSheet, hoursSheet, directionsSheet, academySheet, mapHTML } from '../components.js';
import { openLightbox } from '../gallery.js';

let el;

export function initHome(root) {
  el = root;
  render();
  bus.on('bookings', () => render());
  setInterval(() => { if (!el.hidden) refreshLive(); }, 30000);
  el.addEventListener('click', onClick);
}

function nextCard(b) {
  const d = fmt.date(b.date, b.time);
  const barber = barberById(b.barberId);
  const rem = reminderText(b);
  return `
  <article class="next rise" style="--d:2">
    <div class="next__head">
      <span class="eyebrow">Următoarea programare</span>
      <span class="chip chip--green" data-live-countdown="${b.startMs}">${fmt.countdown(b.startMs - Date.now())}</span>
    </div>
    <div class="next__time">${b.time}</div>
    <div class="next__date">${fmt.relDayLong(d)}</div>
    <div class="next__who">
      ${avatar(barber)}
      <div class="grow"><b>${esc(b.serviceName)}</b><small>cu ${esc(b.barberShort)} · ${fmt.duration(b.duration)}</small></div>
      <span class="next__price">${fmt.price(b.price)}</span>
    </div>
    ${rem ? `<div class="next__rem">${icon('bell')} Reamintire ${rem.charAt(0).toLowerCase() + rem.slice(1)}</div>` : ''}
    <div class="next__act">
      <button class="btn btn--secondary btn--sm" type="button" data-act="directions">${icon('nav')} Indicații</button>
      <button class="btn btn--secondary btn--sm" type="button" data-act="agenda">Detalii ${icon('chevR')}</button>
    </div>
  </article>`;
}

function render() {
  const now = new Date();
  const prof = Profile.get();
  const first = (prof.name || '').trim().split(/\s+/)[0];
  const st = openStatus(now);
  const next = Bookings.upcoming()[0];
  const na = nextAvailable('any', 30, now);
  const naText = na ? `${fmt.relDay(na.date)}, ${na.slot.time}` : 'Vezi orele';
  const popular = SERVICES.filter((s) => s.popular).sort((a, b) => a.popular - b.popular);
  const strip = PHOTOS.slice(0, 7);

  el.innerHTML = `
  <header class="topbar">
    <div class="topbar__brand">${logoSVG()}</div>
    <div class="topbar__actions">
      <a class="icon-btn" href="tel:${SALON.phoneIntl}" aria-label="Sună la salon">${icon('phone', 'i--sm')}</a>
    </div>
  </header>

  <div class="page">
    <section class="hello rise" style="--d:0">
      <div class="eyebrow">${fmt.dayLong(now)}</div>
      <h1 class="display">${fmt.greeting(now)}${first ? `,<br><span>${esc(first)}</span>` : ''}</h1>
      <button class="status ${st.open ? '' : 'status--closed'}" type="button" data-act="hours">
        <i class="live-dot"></i>${st.text}<span>· ${st.sub}</span>${icon('chevR')}
      </button>
    </section>

    <button class="finder press rise" style="--d:1" type="button" data-act="book">
      <span class="finder__icon">${icon('scissors')}</span>
      <span class="finder__text">Programează-te</span>
      <span class="finder__when">${icon('clock')} <span data-next-free>${naText}</span></span>
    </button>

    ${next ? nextCard(next) : ''}

    <section class="sec rise" style="--d:3">
      <div class="sec__head">
        <div><h2 class="sec__title">Rezervare rapidă</h2><p class="sec__sub">Alege serviciul și treci direct la frizer</p></div>
        <button class="link-btn" type="button" data-act="book">Toate ${icon('chevR')}</button>
      </div>
      <div class="tiles">
        ${popular.map((s) => `
          <button class="tile press" type="button" data-service="${s.id}">
            <span class="tile__icon">${icon(s.icon)}</span>
            <span><span class="tile__name">${esc(s.name)}</span><span class="tile__meta">${fmt.price(s.price)} · ${fmt.duration(s.duration)}</span></span>
          </button>`).join('')}
      </div>
    </section>

    <section class="sec rise" style="--d:4">
      <a class="promo" href="#/despre" data-act="about">
        <img src="${PHOTOS[0].src}" alt="" loading="lazy" decoding="async">
        <div class="promo__top"><span class="chip chip--glass">Ploiești · Str. Panduri 2</span></div>
        <div class="promo__body">
          <div class="promo__title">Barbershop<br>și academie</div>
          <div class="promo__sub">${icon('star')} ${String(SALON.rating.score).replace('.', ',')} · ${SALON.rating.count.toLocaleString('ro-RO')} recenzii pe mero</div>
        </div>
      </a>
    </section>

    <section class="sec">
      <div class="sec__head"><div><h2 class="sec__title">Echipa</h2><p class="sec__sub">Alege-ți frizerul preferat</p></div></div>
      <div class="hscroll">
        ${BARBERS.map((b) => `
          <button class="barber-card press" type="button" data-barber="${b.id}">
            <span class="barber-card__media">${avatar(b)}${b.rating ? `<span class="barber-card__badge chip chip--glass">${icon('star')} ${String(b.rating).replace('.', ',')}</span>` : ''}</span>
            <span class="barber-card__name">${esc(b.short)}</span>
            <span class="barber-card__role">${esc(b.role.split(' · ')[0])}</span>
          </button>`).join('')}
      </div>
    </section>

    <section class="sec">
      <div class="sec__head"><h2 class="sec__title">Ce spun clienții</h2></div>
      <div class="rating">
        <div class="rating__score">${String(SALON.rating.score).replace('.', ',')}</div>
        <div>${stars()}<div class="rating__meta"><b>${SALON.rating.count.toLocaleString('ro-RO')}</b> recenzii verificate pe ${SALON.rating.source}</div></div>
      </div>
      <div class="hscroll">
        ${REVIEWS.map((r) => `
          <figure class="review" style="margin:0">
            <blockquote class="review__text" style="margin:0">„${esc(r.text)}”</blockquote>
            <figcaption class="review__who"><span class="avatar avatar--sm monogram">${esc(r.name[0])}</span><span>${esc(r.name)}<small>Client Urban Studio</small></span></figcaption>
          </figure>`).join('')}
      </div>
    </section>

    <section class="sec">
      <div class="sec__head">
        <div><h2 class="sec__title">Din salon</h2><p class="sec__sub">Lucrări recente, de pe Instagram</p></div>
        <button class="link-btn" type="button" data-act="about">Galerie ${icon('chevR')}</button>
      </div>
      <div class="hscroll">
        ${strip.map((p, i) => `<button class="strip__item press" type="button" data-photo="${i}" aria-label="${esc(p.alt)}"><img class="fade-img" src="${p.thumb}" alt="${esc(p.alt)}" loading="lazy" decoding="async" style="object-position:${p.pos}"></button>`).join('')}
        <button class="strip__item strip__more press" type="button" data-act="about"><span>${icon('grid')}Toate cele<br>${PHOTOS.length} fotografii</span></button>
      </div>
    </section>

    <section class="sec">
      <div class="sec__head"><div><h2 class="sec__title">Unde ne găsești</h2><p class="sec__sub">Aproape de centrul Ploieștiului</p></div></div>
      ${mapHTML(scissorsMark())}
      <div class="place">
        <div class="place__addr">${esc(SALON.address)}</div>
        <div class="place__hint">${esc(SALON.addressHint)}</div>
        <div class="btn-row">
          <button class="btn btn--primary btn--sm" type="button" data-act="directions">${icon('nav')} Indicații</button>
          <a class="btn btn--secondary btn--sm" href="tel:${SALON.phoneIntl}">${icon('phone')} Sună</a>
        </div>
      </div>
    </section>

    <section class="sec">
      <div class="academy">
        <span class="academy__pole" aria-hidden="true"></span>
        <span class="chip chip--blue">${icon('cap')} Academy</span>
        <h2 class="academy__title">Învață meseria de la un trainer acreditat</h2>
        <p class="academy__text">${ACADEMY.modules} module în ${ACADEMY.length}, cu echipament și produse incluse.</p>
        <div class="academy__meta"><span class="chip">${fmt.price(ACADEMY.price)}</span><span class="chip">2 module pe săptămână</span></div>
        <button class="btn btn--secondary btn--sm" type="button" data-act="academy">Detalii despre curs ${icon('chevR')}</button>
      </div>
    </section>

    <footer class="footer"><span>© ${now.getFullYear()} ${esc(SALON.fullName)}</span><span>Ploiești</span></footer>
  </div>`;
  fadeImages(el);
}

function refreshLive() {
  el.querySelectorAll('[data-live-countdown]').forEach((c) => {
    c.textContent = fmt.countdown(Number(c.dataset.liveCountdown) - Date.now());
  });
  const na = nextAvailable('any', 30, new Date());
  const t = el.querySelector('[data-next-free]');
  if (t && na) t.textContent = `${fmt.relDay(na.date)}, ${na.slot.time}`;
}

function onClick(e) {
  const t = e.target.closest('[data-act], [data-service], [data-barber], [data-photo], [data-directions]');
  if (!t) return;
  const act = t.dataset.act;
  if (t.dataset.service) { haptic(); bus.emit('book:start', { serviceId: t.dataset.service }); return; }
  if (t.dataset.barber) { haptic(); barberSheet(t.dataset.barber); return; }
  if (t.dataset.photo) { haptic(); openLightbox(PHOTOS, Number(t.dataset.photo), t.querySelector('img')); return; }
  if (t.hasAttribute('data-directions') || act === 'directions') { haptic(); directionsSheet(); return; }
  if (act === 'book') { haptic(); bus.emit('book:start', {}); }
  else if (act === 'hours') { haptic(); hoursSheet(); }
  else if (act === 'agenda') { haptic(); bus.emit('nav', 'agenda'); }
  else if (act === 'about') { e.preventDefault(); haptic(); bus.emit('nav', 'about'); }
  else if (act === 'academy') { haptic(); academySheet(); }
}

export const homeTitle = 'Acasă';
