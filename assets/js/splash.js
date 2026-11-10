/* Splash: logo-ul se desenează, foarfeca face „snip”, bara în culorile stâlpului de frizerie urmărește încărcarea reală. */
import { snip } from './logo.js';
import { reduceMotion, haptic, store } from './lib.js';

export function runSplash(urls = []) {
  return new Promise((resolve) => {
    const splash = document.getElementById('splash');
    if (!splash) return resolve();
    const fill = document.getElementById('pole-fill');
    const bar = splash.querySelector('.pole');
    const wrap = document.getElementById('splash-logo');
    const svg = wrap.querySelector('svg');
    const rm = reduceMotion();

    const seen = store.get('seen', false);
    store.set('seen', true);
    const minDur = rm ? 600 : seen ? 2100 : 2700;   // ms de la începutul navigării
    const maxDur = 7000;

    // încărcare reală: imagini critice + fonturi
    let done = 0;
    const total = urls.length + 1;
    const tick = () => { done += 1; };
    urls.forEach((u) => { const im = new Image(); im.onload = im.onerror = tick; im.decoding = 'async'; im.src = u; });
    (document.fonts?.ready || Promise.resolve()).then(tick, tick);

    // foarfeca taie după ce s-a desenat logo-ul
    const snipAt = Math.max(0, 1520 - performance.now());
    const snipTimer = setTimeout(() => { if (!rm) snip(svg, 2); }, snipAt);

    // interacțiune: tilt 3D după deget/mouse, tap pe logo = snip
    let tx = 0, ty = 0, cx = 0, cy = 0, alive = true;
    const onMove = (e) => {
      const r = wrap.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * .9)));
      ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 1.4)));
    };
    const onLeave = () => { tx = 0; ty = 0; };
    const onTap = () => { haptic(); snip(svg, 1); wrap.animate([{ scale: 1 }, { scale: .95 }, { scale: 1 }], { duration: 380, easing: 'cubic-bezier(.34,1.45,.64,1)' }); };
    if (!rm) {
      splash.addEventListener('pointermove', onMove);
      splash.addEventListener('pointerleave', onLeave);
      splash.addEventListener('pointerup', onLeave);
    }
    wrap.addEventListener('click', onTap);

    let shown = 0;
    const loop = () => {
      if (!alive) return;
      const now = performance.now();
      const loadFrac = done / total;
      const timeFrac = Math.min(1, now / minDur);
      const target = Math.min(loadFrac * .9 + .1, timeFrac);
      shown += (target - shown) * .12;
      if (target >= 1 && shown > .995) shown = 1;
      fill.style.setProperty('--p', shown.toFixed(4));
      bar.setAttribute('aria-valuenow', String(Math.round(shown * 100)));

      cx += (tx - cx) * .08;
      cy += (ty - cy) * .08;
      wrap.style.transform = `rotateY(${(cx * 14).toFixed(2)}deg) rotateX(${(-cy * 12).toFixed(2)}deg)`;

      if ((shown >= 1 && done >= total) || now > maxDur) return finish();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    function finish() {
      alive = false;
      clearTimeout(snipTimer);
      fill.style.setProperty('--p', '1');
      setTimeout(() => {
        splash.classList.add('is-out');
        splash.removeEventListener('pointermove', onMove);
        setTimeout(resolve, 260);
        setTimeout(() => splash.remove(), 800);
      }, 240);
    }
  });
}
