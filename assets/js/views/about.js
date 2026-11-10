/* Despre salon: carusel cu 20 de fotografii, poveste, cifre, galerie, echipă, program, contact. */
import { SALON, PHOTOS, BARBERS, ACADEMY } from '../data.js';
import { icon } from '../icons.js';
import { esc, haptic, fadeImages } from '../lib.js';
import { scissorsMark } from '../logo.js';
import { avatar, barberSheet, hoursTable, directionsSheet, academySheet, mapHTML } from '../components.js';
import { carouselHTML, initCarousel, gridHTML, openLightbox } from '../gallery.js';

let el;
let built = false;

export function initAbout(root) {
  el = root;
  el.addEventListener('click', onClick);
}

export function onShow() {
  if (built) return;
  built = true;
  render();
}

function render() {
  el.innerHTML = `
    <header class="topbar">
      <span class="spacer"></span>
      <div class="topbar__title">Despre salon</div>
      <a class="icon-btn" href="${SALON.links.instagram}" target="_blank" rel="noopener" aria-label="Instagram Urban Studio">${icon('instagram', 'i--sm')}</a>
    </header>
    <div class="page">
      <div class="hello">
        <div class="eyebrow">${esc(SALON.fullName)}</div>
        <h1 class="display">Despre salon</h1>
      </div>

      ${carouselHTML(PHOTOS)}

      <section class="about-intro">
        <p><strong>Urban Studio</strong> e barbershopul din Ploiești unde tunsoarea se face cu răbdare: fade-uri curate, foarfecă, barbă, totul la timp și fără grabă.</p>
        <p>Salonul e și <strong>academie de barbering</strong>. Adiță, fondatorul, e trainer acreditat și formează frizeri noi prin cursuri intensive de o lună.</p>
      </section>

      <div class="stats">
        <div class="stat"><b>${String(SALON.rating.score).replace('.', ',')}</b><small>nota pe mero</small></div>
        <div class="stat"><b>${(SALON.rating.count / 1000).toLocaleString('ro-RO', { maximumFractionDigits: 1 })}k</b><small>recenzii de la clienți</small></div>
        <div class="stat"><b>9</b><small>ani de experiență</small></div>
      </div>

      <section class="sec">
        <div class="sec__head"><div><h2 class="sec__title">Galerie</h2><p class="sec__sub">${PHOTOS.length} fotografii din salon</p></div></div>
        ${gridHTML(PHOTOS)}
      </section>

      <section class="sec">
        <div class="sec__head"><h2 class="sec__title">Echipa</h2></div>
        <div class="team-list">
          ${BARBERS.map((b) => `
            <button class="team-row press" type="button" data-barber="${b.id}">
              ${avatar(b, 'avatar--lg')}
              <span class="grow"><b>${esc(b.name)}</b><small>${esc(b.role)}</small></span>
              ${b.rating ? `<span class="chip">${icon('star')} ${String(b.rating).replace('.', ',')}</span>` : ''}
              <span class="list__chev">${icon('chevR')}</span>
            </button>`).join('')}
        </div>
      </section>

      <section class="sec">
        <div class="sec__head"><h2 class="sec__title">Program</h2></div>
        ${hoursTable()}
      </section>

      <section class="sec">
        <div class="sec__head"><h2 class="sec__title">Locație și contact</h2></div>
        ${mapHTML(scissorsMark())}
        <div class="place">
          <div class="place__addr">${esc(SALON.address)}</div>
          <div class="place__hint">${esc(SALON.addressHint)}</div>
        </div>
        <div class="list" style="margin-top:12px">
          <a class="list__item" href="tel:${SALON.phoneIntl}"><span class="list__icon">${icon('phone')}</span><span class="list__main"><b>${SALON.phone}</b><small>Telefon</small></span><span class="list__chev">${icon('chevR')}</span></a>
          <a class="list__item" href="https://wa.me/${SALON.whatsapp}" target="_blank" rel="noopener"><span class="list__icon">${icon('whatsapp')}</span><span class="list__main"><b>WhatsApp</b><small>Scrie-ne direct</small></span><span class="list__chev">${icon('arrowUR')}</span></a>
          <a class="list__item" href="mailto:${SALON.email}"><span class="list__icon">${icon('mail')}</span><span class="list__main"><b>${SALON.email}</b><small>Email</small></span><span class="list__chev">${icon('chevR')}</span></a>
        </div>
      </section>

      <section class="sec">
        <div class="sec__head"><h2 class="sec__title">Urmărește-ne</h2></div>
        <div class="socials">
          <a class="social press" href="${SALON.links.instagram}" target="_blank" rel="noopener"><span class="ico">${icon('instagram')}</span>Instagram</a>
          <a class="social press" href="${SALON.links.facebook}" target="_blank" rel="noopener"><span class="ico">${icon('facebook')}</span>Facebook</a>
          <a class="social press" href="${SALON.links.mero}" target="_blank" rel="noopener"><span class="ico">${icon('star')}</span>mero</a>
        </div>
      </section>

      <section class="sec">
        <div class="academy">
          <span class="academy__pole" aria-hidden="true"></span>
          <span class="chip chip--blue">${icon('cap')} Academy</span>
          <h2 class="academy__title">Vrei să devii frizer?</h2>
          <p class="academy__text">${esc(ACADEMY.text)}</p>
          <button class="btn btn--secondary btn--sm" type="button" data-act="academy">Detalii despre curs ${icon('chevR')}</button>
        </div>
      </section>

      <footer class="footer"><span>© ${new Date().getFullYear()} ${esc(SALON.fullName)}</span><span>Fotografii: Instagram, Facebook, mero</span></footer>
    </div>`;
  initCarousel(el, PHOTOS);
  fadeImages(el);
}

function onClick(e) {
  const t = e.target.closest('[data-barber],[data-act],[data-directions],.grid [data-photo]');
  if (!t) return;
  haptic();
  if (t.dataset.barber) return barberSheet(t.dataset.barber);
  if (t.matches('.grid [data-photo]')) return openLightbox(PHOTOS, Number(t.dataset.photo), t.querySelector('img'));
  if (t.hasAttribute('data-directions')) return directionsSheet();
  if (t.dataset.act === 'academy') return academySheet();
}
