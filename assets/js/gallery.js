/* Carusel cu parallax și lightbox pe tot ecranul (swipe stânga/dreapta, swipe în jos pentru închidere). */
import { icon } from './icons.js';
import { esc, haptic, pushOverlay, popOverlay, reduceMotion, fadeImages } from './lib.js';

/* ---------- carusel ---------- */
export function carouselHTML(photos) {
  return `
  <div class="car">
    <div class="car__track" data-car>
      ${photos.map((p, i) => `
        <button class="car__item" type="button" data-photo="${i}" aria-label="Deschide fotografia ${i + 1}: ${esc(p.alt)}">
          <img src="${p.src}" alt="${esc(p.alt)}" ${i > 2 ? 'loading="lazy"' : ''} decoding="async" style="object-position:${p.pos}">
          <span class="car__cap"><small>${String(i + 1).padStart(2, '0')}</small>${esc(p.alt)}</span>
        </button>`).join('')}
    </div>
    <div class="car__meta">
      <span class="car__count tnum" data-count><b>01</b> / ${String(photos.length).padStart(2, '0')}</span>
      <span class="car__bar"><i data-bar style="width:${100 / photos.length}%"></i></span>
      <span class="car__nav">
        <button class="icon-btn" type="button" data-prev aria-label="Fotografia anterioară">${icon('chevL', 'i--sm')}</button>
        <button class="icon-btn" type="button" data-next aria-label="Fotografia următoare">${icon('chevR', 'i--sm')}</button>
      </span>
    </div>
  </div>`;
}

export function initCarousel(root, photos) {
  const track = root.querySelector('[data-car]');
  if (!track) return;
  const items = [...track.children];
  const count = root.querySelector('[data-count]');
  const bar = root.querySelector('[data-bar]');
  let raf = 0, current = -1;

  const update = () => {
    raf = 0;
    const center = track.scrollLeft + track.clientWidth / 2;
    let best = 0, bestD = Infinity;
    items.forEach((it, i) => {
      const c = it.offsetLeft + it.offsetWidth / 2;
      const x = Math.max(-1, Math.min(1, (center - c) / (it.offsetWidth + 12)));
      it.style.setProperty('--x', x.toFixed(4));
      it.style.setProperty('--ax', Math.abs(x).toFixed(4));
      const d = Math.abs(center - c);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best !== current) {
      if (current !== -1) haptic('select');
      current = best;
      count.innerHTML = `<b>${String(best + 1).padStart(2, '0')}</b> / ${String(photos.length).padStart(2, '0')}`;
      bar.style.transform = `translateX(${best * 100}%)`;
    }
  };
  track.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  addEventListener('resize', () => requestAnimationFrame(update));
  requestAnimationFrame(update);

  const go = (dir) => {
    const it = items[Math.max(0, Math.min(items.length - 1, current + dir))];
    track.scrollTo({ left: it.offsetLeft - (track.clientWidth - it.offsetWidth) / 2, behavior: 'smooth' });
  };
  root.querySelector('[data-prev]')?.addEventListener('click', () => go(-1));
  root.querySelector('[data-next]')?.addEventListener('click', () => go(1));

  // drag cu mouse-ul pe desktop
  let down = false, sx = 0, sl = 0, moved = false;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    down = true; moved = false; sx = e.clientX; sl = track.scrollLeft;
  });
  addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - sx;
    if (Math.abs(dx) > 4) { moved = true; track.classList.add('is-dragging'); }
    track.scrollLeft = sl - dx;
  });
  addEventListener('pointerup', () => {
    if (!down) return;
    down = false;
    track.classList.remove('is-dragging');
    if (moved) go(0);
  });
  track.addEventListener('click', (e) => {
    if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
    const b = e.target.closest('[data-photo]');
    if (!b) return;
    const idx = Number(b.dataset.photo);
    if (idx !== current) { go(idx - current); return; }
    openLightbox(photos, idx, b.querySelector('img'));
  }, true);
}

/* ---------- lightbox ---------- */
function fitRect(w, h) {
  const vw = innerWidth, vh = innerHeight;
  const s = Math.min(vw / w, vh / h);
  const W = w * s, H = h * s;
  return { left: (vw - W) / 2, top: (vh - H) / 2, width: W, height: H };
}

export function openLightbox(photos, index, originImg) {
  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Galerie foto');
  lb.innerHTML = `
    <div class="lb__bg"></div>
    <div class="lb__track">
      ${photos.map((p, i) => `<div class="lb__slide"><img class="lb__img" src="${Math.abs(i - index) <= 1 ? p.src : ''}" data-src="${p.src}" alt="${esc(p.alt)}" decoding="async"></div>`).join('')}
    </div>
    <div class="lb__top lb__ui">
      <span class="lb__count tnum"></span>
      <button class="icon-btn lb__close" type="button" aria-label="Închide galeria">${icon('x', 'i--sm')}</button>
    </div>
    <div class="lb__bottom lb__ui">
      <p class="lb__cap"></p>
      <div class="lb__thumbs">${photos.map((p, i) => `<button class="lb__thumb" type="button" data-i="${i}" aria-label="Fotografia ${i + 1}"><img src="${p.thumb}" alt="" loading="lazy"></button>`).join('')}</div>
    </div>`;
  document.body.appendChild(lb);
  document.body.classList.add('lock');
  const scope = originImg?.closest('.car__track, .grid, .hscroll') || document;

  const track = lb.querySelector('.lb__track');
  const bg = lb.querySelector('.lb__bg');
  const countEl = lb.querySelector('.lb__count');
  const capEl = lb.querySelector('.lb__cap');
  const thumbs = [...lb.querySelectorAll('.lb__thumb')];
  const slides = [...lb.querySelectorAll('.lb__slide')];
  let cur = index;

  const loadAround = (i) => {
    for (let k = i - 1; k <= i + 1; k++) {
      const img = slides[k]?.querySelector('img');
      if (img && !img.getAttribute('src')) img.src = img.dataset.src;
    }
  };
  const setCurrent = (i, fromScroll) => {
    if (i === cur && fromScroll !== 'init') return;
    if (fromScroll !== 'init') haptic('select');
    cur = i;
    countEl.innerHTML = `${i + 1} <span>/ ${photos.length}</span>`;
    capEl.textContent = photos[i].alt;
    thumbs.forEach((t, k) => t.classList.toggle('is-active', k === i));
    const t = thumbs[i];
    const strip = t.parentElement;
    strip.scrollTo({ left: t.offsetLeft - strip.clientWidth / 2 + t.offsetWidth / 2, behavior: fromScroll === 'init' ? 'auto' : 'smooth' });
    loadAround(i);
  };

  track.scrollLeft = index * track.clientWidth;
  setCurrent(index, 'init');

  let sraf = 0;
  track.addEventListener('scroll', () => {
    if (sraf) return;
    sraf = requestAnimationFrame(() => {
      sraf = 0;
      setCurrent(Math.round(track.scrollLeft / track.clientWidth));
    });
  }, { passive: true });

  thumbs.forEach((t) => t.addEventListener('click', () => {
    const i = Number(t.dataset.i);
    track.scrollTo({ left: i * track.clientWidth, behavior: reduceMotion() ? 'auto' : 'smooth' });
  }));

  // intrare: imaginea „zboară” din miniatură în poziția finală (FLIP)
  const p0 = photos[index];
  const finishOpen = () => { lb.classList.add('is-ready'); };
  requestAnimationFrame(() => lb.classList.add('is-open'));
  if (originImg && !reduceMotion()) {
    const r = originImg.getBoundingClientRect();
    const target = fitRect(p0.w, p0.h);
    const fly = document.createElement('img');
    fly.className = 'lb-fly';
    fly.src = originImg.currentSrc || originImg.src;
    Object.assign(fly.style, { left: `${target.left}px`, top: `${target.top}px`, width: `${target.width}px`, height: `${target.height}px`, borderRadius: '0px' });
    document.body.appendChild(fly);
    const sx = r.width / target.width, sy = r.height / target.height;
    const anim = fly.animate([
      { transform: `translate(${r.left - target.left}px, ${r.top - target.top}px) scale(${sx}, ${sy})`, borderRadius: '24px' },
      { transform: 'none', borderRadius: '0px' },
    ], { duration: 460, easing: 'cubic-bezier(.22,1,.36,1)' });
    anim.onfinish = () => { finishOpen(); requestAnimationFrame(() => fly.remove()); };
  } else {
    finishOpen();
  }

  // închidere
  let closing = false;
  const finish = () => {
    if (closing) return;
    closing = true;
    lb.classList.remove('is-ready');
    const img = slides[cur].querySelector('img');
    const curImg = img.getBoundingClientRect();
    // caruselul rămâne pe fotografia la care s-a ajuns în lightbox
    const item = scope.querySelector?.(`[data-photo="${cur}"]`);
    if (item && scope.classList?.contains('car__track')) {
      scope.scrollLeft = item.offsetLeft - (scope.clientWidth - item.offsetWidth) / 2;
    }
    const origin = item?.querySelector('img');
    const r = origin?.getBoundingClientRect();
    const visible = r && r.bottom > 0 && r.top < innerHeight && r.width > 0;
    if (visible && !reduceMotion() && img.naturalWidth) {
      const tx = r.left - curImg.left, ty = r.top - curImg.top;
      img.animate([
        { transform: img.style.transform || 'none', borderRadius: '0px' },
        { transform: `translate(${tx}px, ${ty}px) scale(${r.width / curImg.width}, ${r.height / curImg.height})`, borderRadius: '24px', opacity: .9 },
      ], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
    } else {
      img.animate([{ opacity: 1 }, { opacity: 0, transform: `${img.style.transform || ''} scale(.92)` }], { duration: 260, fill: 'forwards' });
    }
    bg.style.transition = 'opacity .35s ease';
    bg.style.opacity = '0';
    setTimeout(() => {
      lb.remove();
      if (!document.querySelector('.sheet, .lb')) document.body.classList.remove('lock');
    }, 390);
  };
  pushOverlay(finish);
  const close = () => { if (!closing) popOverlay(); };
  lb.querySelector('.lb__close').addEventListener('click', close);

  const onKey = (e) => {
    if (!document.body.contains(lb)) return removeEventListener('keydown', onKey);
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') track.scrollTo({ left: (cur + 1) * track.clientWidth, behavior: 'smooth' });
    if (e.key === 'ArrowLeft') track.scrollTo({ left: (cur - 1) * track.clientWidth, behavior: 'smooth' });
  };
  addEventListener('keydown', onKey);

  // swipe în jos pentru închidere
  let sy = 0, sx = 0, dy = 0, lastY = 0, lastT = 0, vel = 0, mode = null, pid = null;
  track.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    sy = lastY = e.clientY; sx = e.clientX; dy = 0; vel = 0; mode = null; pid = e.pointerId; lastT = performance.now();
  });
  track.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid || mode === 'x') return;
    const ddx = e.clientX - sx, ddy = e.clientY - sy;
    if (!mode) {
      if (Math.abs(ddy) > 8 && Math.abs(ddy) > Math.abs(ddx) * 1.2) { mode = 'y'; lb.classList.add('is-dragging'); track.setPointerCapture(e.pointerId); }
      else if (Math.abs(ddx) > 8) { mode = 'x'; return; }
      else return;
    }
    const now = performance.now();
    vel = (e.clientY - lastY) / Math.max(1, now - lastT);
    lastY = e.clientY; lastT = now;
    dy = ddy;
    const img = slides[cur].querySelector('img');
    const s = Math.max(.75, 1 - Math.abs(dy) / 1400);
    img.style.transform = `translate(${ddx * .6}px, ${dy}px) scale(${s})`;
    bg.style.transition = 'none';
    bg.style.opacity = String(Math.max(0, 1 - Math.abs(dy) / 420));
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    if (mode !== 'y') { mode = null; return; }
    mode = null;
    lb.classList.remove('is-dragging');
    if (Math.abs(dy) > 110 || Math.abs(vel) > .6) { close(); return; }
    const img = slides[cur].querySelector('img');
    img.animate([{ transform: img.style.transform }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.34,1.45,.64,1)' });
    img.style.transform = '';
    bg.style.transition = 'opacity .3s ease';
    bg.style.opacity = '1';
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);

  // tap pe imagine: ascunde/arată interfața
  let tapT = 0;
  track.addEventListener('click', (e) => {
    if (Math.abs(dy) > 4) return;
    const now = Date.now();
    if (now - tapT < 280) return;
    tapT = now;
    if (e.target.closest('.lb__img')) lb.querySelectorAll('.lb__ui').forEach((u) => { u.style.opacity = u.style.opacity === '0' ? '' : '0'; });
    else if (e.target === track || e.target.classList.contains('lb__slide')) close();
  });

  fadeImages(lb);
  setTimeout(() => lb.querySelector('.lb__close').focus({ preventScroll: true }), 50);
}

/* ---------- grilă ---------- */
export function gridHTML(photos) {
  return `<div class="grid">${photos.map((p, i) => `
    <button class="grid__item" type="button" data-photo="${i}" aria-label="${esc(p.alt)}">
      <img class="fade-img" src="${i % 10 === 0 || i % 10 === 6 ? p.src : p.thumb}" alt="${esc(p.alt)}" loading="lazy" decoding="async" style="object-position:${p.pos}">
    </button>`).join('')}</div>`;
}
