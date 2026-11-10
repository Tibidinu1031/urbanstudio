/* Logo-ul Urban Studio vectorizat (litere geometrice + „A” din foarfecă). */
import { tweenChain, ease } from './lib.js';

let uid = 0;

export function logoSVG({ cls = '' } = {}) {
  const id = `lg${++uid}`;
  return `<svg class="logo ${cls}" viewBox="40 84 416 296" role="img" aria-label="Urban Studio">
  <defs>
    <clipPath id="${id}a"><rect x="0" y="137.5" width="500" height="101.5"/></clipPath>
    <clipPath id="${id}b"><rect x="0" y="281.25" width="500" height="92.75"/></clipPath>
  </defs>
  <g fill="none" stroke="currentColor">
    <g clip-path="url(#${id}a)" stroke-width="13">
      <path d="M52.1 130V205.3A27.2 27.2 0 0 0 106.5 205.3V130"/>
      <path d="M135 246V148A4 4 0 0 1 139 144H163.25A21.75 21.75 0 0 1 163.25 187.5H135"/>
      <path d="M156.8 187.5L186.5 246"/>
      <path d="M205 144H238.75A21.95 21.95 0 0 1 238.75 187.9"/>
      <path d="M238 187.9H215A4 4 0 0 0 211 191.9V229.35A4 4 0 0 0 215 233.35H238A22.725 22.725 0 0 0 238 187.9"/>
      <path d="M383.75 246V140L444.4 236V130"/>
    </g>
    <g class="lg-blade lg-blade-l">
      <path stroke-width="11" stroke-linecap="round" d="M300.5 104.5L360 233"/>
      <circle cx="300.5" cy="104.5" r="15.5" fill="currentColor" stroke="none"/>
    </g>
    <g class="lg-blade lg-blade-r">
      <path stroke-width="11" stroke-linecap="round" d="M345.6 104.5L283.5 233"/>
      <circle cx="345.6" cy="104.5" r="15.5" fill="currentColor" stroke="none"/>
    </g>
    <g clip-path="url(#${id}b)" stroke-width="12">
      <path d="M107.5 287.5H77.5A20.5 20.5 0 0 0 77.5 328.5H81.1A19.5 19.5 0 0 1 81.1 367.5H50"/>
      <path d="M115 287.5H178.75M146.25 282V380"/>
      <path d="M190.6 275V343.8A23.95 23.95 0 0 0 238.5 343.8V275"/>
      <path d="M259.5 287.5H280A40 40 0 0 1 280 367.5H259.5"/>
      <path stroke-linecap="round" d="M342.4 308.5V380"/>
      <circle cx="405.6" cy="327.9" r="39.7"/>
    </g>
    <circle cx="343.1" cy="286.25" r="6.9" fill="currentColor" stroke="none"/>
  </g>
</svg>`;
}

/* Doar foarfeca din „A” (pentru pin-ul de pe hartă). */
export function scissorsMark() {
  return `<svg viewBox="270 84 106 160" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round">
    <path d="M300.5 104.5L360 233"/><path d="M345.6 104.5L283.5 233"/>
  </g>
  <circle cx="300.5" cy="104.5" r="17" fill="currentColor"/><circle cx="345.6" cy="104.5" r="17" fill="currentColor"/>
</svg>`;
}

/* „Snip”: foarfeca se deschide și se închide în jurul pivotului (322.5, 152). */
const busy = new WeakSet();
export function snip(svg, times = 2) {
  if (!svg || busy.has(svg)) return Promise.resolve();
  const L = svg.querySelector('.lg-blade-l');
  const R = svg.querySelector('.lg-blade-r');
  if (!L || !R) return Promise.resolve();
  busy.add(svg);
  const apply = (a) => {
    L.setAttribute('transform', `rotate(${a} 322.5 152)`);
    R.setAttribute('transform', `rotate(${-a} 322.5 152)`);
  };
  const one = [
    { from: 0, to: -11, d: 150, e: ease.out },
    { from: -11, to: 2.2, d: 95, e: ease.in },
    { from: 2.2, to: 0, d: 160, e: ease.out },
  ];
  const segs = [];
  for (let i = 0; i < times; i++) segs.push(...one);
  return tweenChain(segs, apply).then(() => { apply(0); busy.delete(svg); });
}
