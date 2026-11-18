/* Textele SMS (confirmare + reamintire) și linkuri „sms:” pentru trimiterea cu un tap de pe telefonul frizerului.
   Fără diacritice: mesajul rămâne în setul GSM, adică 160 de caractere pe SMS în loc de 70. */
import { CONFIG } from './data.js';
import { fmt, isIOS } from './lib.js';

const DOW = ['duminica', 'luni', 'marti', 'miercuri', 'joi', 'vineri', 'sambata'];
const MON = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];

export const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

export function toIntl(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('40')) return `+${d}`;
  if (d.startsWith('0')) return `+4${d}`;
  return d ? `+${d}` : '';
}

export function smsText(b, kind, barberPhone = CONFIG.smsPhone) {
  const d = fmt.date(b.date, b.time);
  const day = `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`;
  const first = (b.name || '').trim().split(/\s+/)[0] || '';
  const hi = first ? `Salut, ${first}!` : 'Salut!';
  const phone = fmt.phone(barberPhone);
  let t;
  if (kind === 'confirm') {
    t = `${hi} Programare confirmata la Urban Studio: ${day}, ora ${b.time}, ${b.serviceName} cu ${b.barberShort}. Str. Panduri 2, Ploiesti. Modificari: ${phone}`;
  } else if (b.sms?.remind?.kind === 'hours' || b.reminder?.kind === 'hours') {
    t = `${hi} Iti amintim: azi la ora ${b.time} ai programare la Urban Studio (${b.serviceName}, cu ${b.barberShort}). Te asteptam!`;
  } else {
    t = `${hi} Iti amintim: maine, ${day}, la ora ${b.time} ai programare la Urban Studio (${b.serviceName}, cu ${b.barberShort}). Nu poti ajunge? Suna la ${phone}.`;
  }
  return plain(t);
}

export function smsLink(to, text) {
  const sep = isIOS() ? '&' : '?';
  return `sms:${toIntl(to)}${sep}body=${encodeURIComponent(text)}`;
}

/* Ce mesaje trebuie trimise manual acum (fără gateway automat sau când acesta a eșuat). */
export function smsDue(b, autoSms, now = Date.now()) {
  if (b.status !== 'confirmed' || b.endMs < now) return [];
  const out = [];
  const c = b.sms?.confirm?.status;
  if (c === 'pending' || c === 'failed' || c === 'manual') out.push('confirm');
  const r = b.sms?.remind;
  if (r && b.startMs > now) {
    if (r.status === 'failed' || r.status === 'manual') out.push('remind');
    else if (r.status === 'scheduled' && !autoSms && now >= r.at) out.push('remind');
  }
  return out;
}

export function smsStatusLabel(b, kind, autoSms) {
  const s = b.sms?.[kind];
  if (!s) return { text: 'Fără SMS', tone: '' };
  const at = s.at ? new Date(s.at) : null;
  const when = at ? `${fmt.relDay(at).toLowerCase()}, ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` : '';
  switch (s.status) {
    case 'sent': return { text: `Trimis ${when}`.trim(), tone: 'green' };
    case 'queued': return { text: 'Se trimite automat', tone: 'blue' };
    case 'failed': return { text: 'Netrimis, eroare la gateway', tone: 'red' };
    case 'skipped': return { text: kind === 'remind' ? 'Fără reminder (programare apropiată)' : 'Fără SMS', tone: '' };
    case 'scheduled': {
      const due = s.at && Date.now() >= s.at;
      if (due && !autoSms) return { text: 'De trimis acum', tone: 'red' };
      return { text: `${autoSms ? 'Automat' : 'De trimis'} ${when}`, tone: 'blue' };
    }
    default: return { text: 'De trimis', tone: 'red' };
  }
}
