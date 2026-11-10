/**
 * Urban Studio · server pentru programări și reamintiri pe email
 * Rulează gratuit în Google Apps Script, legat de un Google Sheet.
 *
 * Ce face:
 *  - primește programările din aplicație și le scrie în foaia „Programari”
 *  - trimite confirmare pe email clientului și o notificare salonului
 *  - verifică la 15 minute și trimite reamintirea cu o zi înainte
 *  - îi spune aplicației ce ore sunt ocupate (ca să nu existe suprapuneri)
 *
 * Instalare: vezi backend/README.md
 */

const SHEET_NAME = 'Programari';
const SALON = {
  name: 'Urban Studio',
  email: 'urbanstudio115@gmail.com',
  phone: '0736 570 863',
  address: 'Str. Panduri nr. 2, Bl. 3A, Ap. 3, Parter, interfon 3, Ploiești',
  maps: 'https://www.google.com/maps/dir/?api=1&destination=44.9385124,26.0075579',
};
const TZ = 'Europe/Bucharest';
const REMIND_HOURS = 24;
const HEAD = [
  'id', 'status', 'createdAt', 'date', 'time', 'startMs', 'endMs',
  'serviceId', 'serviceName', 'price', 'duration', 'barberId', 'barberName',
  'name', 'phone', 'email', 'notes', 'remind', 'reminderSentAt',
];

/* Rulează o singură dată din editor: creează foaia și declanșatorul pentru reamintiri. */
function setup() {
  sheet_();
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sendReminders')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendReminders').timeBased().everyMinutes(15).create();
}

/* ---------- API ---------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'busy' && p.date) {
    const busy = rows_()
      .filter((r) => r.status === 'confirmed' && r.date === p.date)
      .map((r) => ({ barberId: r.barberId, from: r.time, to: addMinutes_(r.time, Number(r.duration)) }));
    return json_({ ok: true, busy: busy });
  }
  return json_({ ok: true, service: 'urbanstudio' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'book') return json_(book_(data.booking));
    if (data.action === 'cancel') return json_(cancel_(data.id));
    return json_({ ok: false, error: 'actiune necunoscuta' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- logică ---------- */
function book_(b) {
  if (!b || !b.id) return { ok: false, error: 'date lipsa' };
  const all = rows_();
  if (all.some((r) => r.id === b.id)) return { ok: true, duplicate: true };

  const clash = all.some((r) => r.status === 'confirmed' && r.date === b.date && r.barberId === b.barberId &&
    overlaps_(r.time, Number(r.duration), b.time, Number(b.duration)));

  sheet_().appendRow(HEAD.map((k) => {
    if (k === 'status') return clash ? 'conflict' : 'confirmed';
    if (k === 'createdAt') return new Date();
    if (k === 'reminderSentAt') return '';
    return b[k] === undefined ? '' : b[k];
  }));

  if (clash) {
    MailApp.sendEmail(SALON.email, `Suprapunere programare ${b.id}`,
      `Ora ${b.time} din ${b.date} la ${b.barberName} era deja ocupată. Sună clientul: ${b.name}, ${b.phone}.`);
    return { ok: false, error: 'ocupat' };
  }

  if (b.email) {
    MailApp.sendEmail({
      to: b.email,
      name: SALON.name,
      replyTo: SALON.email,
      subject: `Programare confirmată · ${niceDate_(b)} la ${b.time}`,
      htmlBody: emailHtml_('Ești programat', `Te așteptăm <b>${niceDate_(b)}</b>, la ora <b>${b.time}</b>.`, b),
    });
  }
  MailApp.sendEmail({
    to: SALON.email,
    name: 'Aplicația Urban Studio',
    subject: `Programare nouă: ${b.name} · ${b.date} ${b.time}`,
    htmlBody: `<p><b>${esc_(b.serviceName)}</b> cu ${esc_(b.barberName)}<br>${niceDate_(b)}, ${b.time} (${b.duration} min)</p>
      <p>${esc_(b.name)} · ${esc_(b.phone)}${b.email ? ' · ' + esc_(b.email) : ''}</p>
      ${b.notes ? `<p>Mesaj: ${esc_(b.notes)}</p>` : ''}<p>Cod: ${b.id}</p>`,
  });
  return { ok: true };
}

function cancel_(id) {
  const sh = sheet_();
  const values = sh.getDataRange().getValues();
  const col = HEAD.indexOf('status') + 1;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sh.getRange(i + 1, col).setValue('cancelled');
      const r = toObj_(values[i]);
      MailApp.sendEmail(SALON.email, `Programare anulată: ${r.name} · ${r.date} ${r.time}`, `Codul ${id} a fost anulat din aplicație.`);
      return { ok: true };
    }
  }
  return { ok: false, error: 'negasit' };
}

/* Rulat automat la 15 minute (vezi setup). */
function sendReminders() {
  const sh = sheet_();
  const values = sh.getDataRange().getValues();
  const now = Date.now();
  const sentCol = HEAD.indexOf('reminderSentAt') + 1;
  for (let i = 1; i < values.length; i++) {
    const r = toObj_(values[i]);
    if (r.status !== 'confirmed' || r.reminderSentAt || !r.email || String(r.remind) === 'false') continue;
    const start = Number(r.startMs);
    if (start > now && start - now <= REMIND_HOURS * 3600e3) {
      MailApp.sendEmail({
        to: r.email,
        name: SALON.name,
        replyTo: SALON.email,
        subject: `Reamintire: mâine la ${r.time} ai programare la ${SALON.name}`,
        htmlBody: emailHtml_('Ne vedem mâine', `Îți amintim de programarea de <b>${niceDate_(r)}</b>, ora <b>${r.time}</b>.`, r),
      });
      sh.getRange(i + 1, sentCol).setValue(new Date());
    }
  }
}

/* ---------- utilitare ---------- */
function sheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
    sh.getRange('D:E').setNumberFormat('@');
  }
  return sh;
}
function rows_() {
  const values = sheet_().getDataRange().getValues();
  return values.slice(1).map(toObj_);
}
function toObj_(row) {
  const o = {};
  HEAD.forEach((k, i) => {
    let v = row[i];
    if (v instanceof Date && (k === 'date')) v = Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
    if (v instanceof Date && (k === 'time')) v = Utilities.formatDate(v, TZ, 'HH:mm');
    o[k] = v;
  });
  return o;
}
function toMin_(t) { const p = String(t).split(':'); return Number(p[0]) * 60 + Number(p[1]); }
function addMinutes_(t, m) { const x = toMin_(t) + m; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; }
function overlaps_(t1, d1, t2, d2) { const a = toMin_(t1), b = toMin_(t2); return a < b + d2 && b < a + d1; }
function niceDate_(b) {
  const zile = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  const luni = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const p = String(b.date).split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  return `${zile[d.getDay()]}, ${d.getDate()} ${luni[d.getMonth()]}`;
}
function esc_(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function emailHtml_(title, line, b) {
  return `<div style="background:#0E0F11;padding:28px 16px;font-family:Helvetica,Arial,sans-serif;color:#F6F6F3">
  <div style="max-width:460px;margin:0 auto;background:#1D1E22;border-radius:20px;overflow:hidden">
    <div style="height:6px;background:repeating-linear-gradient(-45deg,#E5252A 0 7px,#F4F4F2 7px 14px,#2F62F5 14px 21px,#F4F4F2 21px 28px)"></div>
    <div style="padding:26px 24px">
      <div style="font-size:13px;letter-spacing:.2em;color:#8a8a8a;font-weight:700">URBAN STUDIO</div>
      <h1 style="margin:10px 0 8px;font-size:26px;line-height:1.1">${title}</h1>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#cfcfcb">${line}</p>
      <table style="width:100%;font-size:14px;color:#F6F6F3;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#8a8a8a">Serviciu</td><td style="text-align:right;font-weight:700">${esc_(b.serviceName)}</td></tr>
        <tr><td style="padding:6px 0;color:#8a8a8a">Frizer</td><td style="text-align:right;font-weight:700">${esc_(b.barberName)}</td></tr>
        <tr><td style="padding:6px 0;color:#8a8a8a">Preț</td><td style="text-align:right;font-weight:700">${b.price} lei, la salon</td></tr>
        <tr><td style="padding:6px 0;color:#8a8a8a">Cod</td><td style="text-align:right;font-weight:700">${b.id}</td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:14px;color:#cfcfcb">${SALON.address}</p>
      <a href="${SALON.maps}" style="display:inline-block;margin-top:16px;background:#F6F6F3;color:#0B0B0C;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:12px">Indicații</a>
      <p style="margin:22px 0 0;font-size:13px;color:#8a8a8a">Nu mai poți ajunge? Anulează din aplicație sau sună la ${SALON.phone}.</p>
    </div>
  </div>
</div>`;
}
