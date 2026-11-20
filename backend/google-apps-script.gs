/**
 * Urban Studio · server pentru aplicație și panoul frizerilor (Google Apps Script, gratuit)
 *
 *  - programările clienților, cu verificare că ora e liberă în programul frizerului
 *  - panoul frizerilor: conturi (user0/1/2), echipă, program, istoric, anulări
 *  - SMS în numele frizerului prin httpSMS (aplicația httpSMS pe telefonul Android cu acel număr):
 *      1) confirmare imediat după programare
 *      2) reminder cu o zi înainte (sau cu 2 ore, dacă programarea e făcută cu mai puțin de o zi înainte)
 *  - fără cheie httpSMS, SMS-urile apar în panou la „SMS-uri de trimis” și se trimit cu un tap
 *
 * Instalare: backend/README.md
 */

const CFG = {
  salonName: 'Urban Studio',
  // Gol = emailurile despre programări merg doar la proprietarul acestui script (contul Google în care rulează).
  // Pune aici adresa salonului (urbanstudio115@gmail.com) când predai aplicația.
  salonEmail: '',
  smsPhoneDefault: '0728933035',
  tz: 'Europe/Bucharest',
  slotStep: 45,
  bookingDays: 35,
  notifySalonByEmail: true,
  // ID-ul tabelului Google (din URL: /spreadsheets/d/ID/edit). Gol = tabelul de care e legat scriptul sau unul creat automat.
  sheetId: '',
};
const SH = { bookings: 'Programari', team: 'Frizeri', sms: 'SMS' };
const B_HEAD = ['id', 'status', 'source', 'createdAt', 'date', 'time', 'startMs', 'endMs', 'serviceId', 'serviceName', 'price', 'duration',
  'barberId', 'barberName', 'barberShort', 'anyBarber', 'name', 'phone', 'email', 'notes', 'remind', 'remindAt', 'remindKind',
  'smsConfirm', 'smsConfirmAt', 'smsRemind', 'smsRemindAt', 'cancelledAt'];
const T_HEAD = ['id', 'username', 'passHash', 'name', 'short', 'role', 'phone', 'bio', 'tags', 'photo', 'rating', 'reviews', 'active', 'schedule', 'createdAt'];
const TEXT_COLS = { [SH.bookings]: ['date', 'time', 'phone'], [SH.team]: ['phone', 'username'] };
const SALON_HOURS = { 0: [], 1: [], 2: [['08:30', '16:45']], 3: [['08:30', '16:45']], 4: [['08:30', '18:30']], 5: [['08:30', '19:00']], 6: [['10:00', '15:00']] };

/* ======================= instalare ======================= */
// Rulează o singură dată din editor (butonul Run): creează foile, conturile de test și declanșatorul pentru remindere.
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  sheet_(SH.bookings, B_HEAD);
  sheet_(SH.sms, ['at', 'bookingId', 'kind', 'from', 'to', 'status', 'response']);
  const team = sheet_(SH.team, T_HEAD);
  if (team.getLastRow() < 2) seedTeam_();
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'sendReminders').forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendReminders').timeBased().everyMinutes(10).create();
}

// Pune cheia httpSMS (din httpsms.com/settings) rulând această funcție după ce o completezi.
function setHttpSmsKey() {
  const KEY = 'LIPESTE_AICI_CHEIA_HTTPSMS';
  PropertiesService.getScriptProperties().setProperty('HTTPSMS_KEY', KEY);
}

function seedTeam_() {
  const sched = JSON.stringify({ week: SALON_HOURS, days: {} });
  const phone = CFG.smsPhoneDefault;
  const rows = [
    ['adita', 'user0', 'e1039ce07ba7aa63f6ce29ef01cbf95b826637f175b52379af133a77cf026c10', 'Adiță Seceanu', 'Adiță', 'Master hairstylist · Fondator', phone,
      '9 ani de experiență în tuns și 5 ani ca trainer acreditat. Formează frizeri noi la Urban Studio Academy.', 'Fade,Foarfecă,Barbă,Trainer', 'assets/img/team/adita.jpg', 4.99, 3142, true, sched, new Date()],
    ['radu', 'user1', 'b1a24ee7b31c601ee2fca709774c28f3ea29a2a9e324c31e2d3c8ed7223d6439', 'Radu', 'Radu', 'Barber', phone,
      'Fade-uri curate, texturi și tunsori moderne.', 'Fade,Texturi', '', '', '', true, sched, new Date()],
    ['stefan', 'user2', 'cf34e64cf414618620b7aaa97358cf307a05e0786952922c455cd728816d0f4f', 'Ștefan', 'Ștefan', 'Barber', phone,
      'Barbă, contururi precise și tunsori clasice.', 'Barbă,Clasic', '', '', '', true, sched, new Date()],
  ];
  const sh = sheet_(SH.team, T_HEAD);
  sh.getRange(2, 1, rows.length, T_HEAD.length).setValues(rows);
}

/* ======================= API ======================= */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'public') return json_(publicData_());
  if (p.action === 'mine') return json_(mine_(p.ids));
  return json_({ ok: true, service: 'urbanstudio' });
}

// Starea programărilor de pe telefonul unui client (după codurile lor), ca anulările făcute de frizer să ajungă și la client.
function mine_(ids) {
  const want = String(ids || '').split(',').map((s) => s.trim()).filter(String).slice(0, 50);
  if (!want.length) return { ok: true, bookings: [] };
  const all = bookings_();
  return { ok: true, bookings: want.map((id) => {
    const b = all.find((x) => x.id === id);
    return b ? { id: id, status: b.status, cancelledAt: Number(b.cancelledAt) || null } : { id: id, status: 'deleted' };
  }) };
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents || '{}');
    switch (d.action) {
      case 'book': return json_(publicBook_(d.booking));
      case 'cancel': return json_(publicCancel_(d.id, d.phone));
      case 'login': return json_(login_(d.username, d.password));
      case 'admin': {
        const userId = verify_(d.token);
        if (!userId) return json_({ ok: false, error: 'auth' });
        const me = team_().find((b) => b.id === userId && b.active);
        if (!me) return json_({ ok: false, error: 'auth' });
        return json_(admin_(me, d.op, d));
      }
      default: return json_({ ok: false, error: 'action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- public ---------- */
function publicData_() {
  const today = Utilities.formatDate(new Date(), CFG.tz, 'yyyy-MM-dd');
  const last = Utilities.formatDate(new Date(Date.now() + CFG.bookingDays * 864e5), CFG.tz, 'yyyy-MM-dd');
  const busy = bookings_()
    .filter((b) => b.status === 'confirmed' && b.date >= today && b.date <= last)
    .map((b) => ({ barberId: b.barberId, date: b.date, from: b.time, to: addMin_(b.time, b.duration) }));
  return { ok: true, barbers: team_().filter((b) => b.active).map(publicBarber_), busy: busy, sms: !!smsKey_() };
}

function publicBook_(b) {
  if (!b || !b.id || !b.barberId || !b.date || !b.time) return { ok: false, error: 'data' };
  const all = bookings_();
  if (all.some((x) => x.id === b.id)) return { ok: true, booking: toClient_(all.find((x) => x.id === b.id)) };
  const barber = team_().find((x) => x.id === b.barberId && x.active);
  if (!barber) return { ok: false, error: 'taken' };
  // reprogramare: ora veche a aceluiași client nu blochează noua oră și se închide odată cu noua programare
  const old = b.replaces ? all.find((x) => x.id === b.replaces && x.status === 'confirmed' && digits_(x.phone).slice(-9) === digits_(b.phone).slice(-9)) : null;
  const others = old ? all.filter((x) => x.id !== old.id) : all;
  if (!inSchedule_(barber, b) || clash_(others, b)) return { ok: false, error: 'taken' };
  const row = insertBooking_(b, 'app', barber);
  if (old) cancelRow_(old, 'rescheduled');
  return { ok: true, booking: toClient_(row) };
}

function publicCancel_(id, phone) {
  const b = bookings_().find((x) => x.id === id);
  if (!b) return { ok: false, error: 'notfound' };
  if (digits_(b.phone).slice(-9) !== digits_(phone).slice(-9)) return { ok: false, error: 'auth' };
  if (b.status !== 'confirmed') return { ok: true }; // deja anulată sau mutată
  cancelRow_(b);
  if (CFG.notifySalonByEmail) MailApp.sendEmail(notifyTo_(), `Programare anulată: ${b.name} · ${b.date} ${b.time}`, `Clientul a anulat din aplicație. Cod: ${b.id}, frizer: ${b.barberName}.`);
  return { ok: true };
}

/* ---------- autentificare ---------- */
function login_(username, password) {
  const u = String(username || '').trim().toLowerCase();
  const b = team_().find((x) => String(x.username).toLowerCase() === u && x.active);
  if (!b || b.passHash !== sha256_('urbanstudio:' + password)) return { ok: false, error: 'credentials' };
  const exp = Date.now() + 30 * 864e5;
  const payload = `${b.id}|${exp}`;
  return { ok: true, token: `${Utilities.base64EncodeWebSafe(payload)}.${sign_(payload)}`, exp: exp, user: adminBarber_(b) };
}
function verify_(token) {
  try {
    const parts = String(token || '').split('.');
    const payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
    if (sign_(payload) !== parts[1]) return null;
    const bits = payload.split('|');
    return Number(bits[1]) > Date.now() ? bits[0] : null;
  } catch (e) { return null; }
}
function sign_(s) {
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, secret));
}
function sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

/* ---------- panou ---------- */
function admin_(me, op, d) {
  const team = team_();
  switch (op) {
    case 'me': return { ok: true, user: adminBarber_(me) };
    case 'team': return { ok: true, team: team.map(adminBarber_) };

    case 'bookings': {
      let list = bookings_();
      if (d.barberId) list = list.filter((b) => b.barberId === d.barberId);
      if (d.from) list = list.filter((b) => b.date >= d.from);
      if (d.to) list = list.filter((b) => b.date <= d.to);
      return { ok: true, bookings: list.map(toClient_) };
    }

    case 'saveSchedule': {
      const b = team.find((x) => x.id === d.id);
      if (!b) return { ok: false, error: 'notfound' };
      updateRow_(SH.team, T_HEAD, b._row, { schedule: JSON.stringify(d.schedule) });
      return { ok: true };
    }

    case 'saveBarber': {
      const src = d.barber || {};
      const uname = String(src.username || '').trim().toLowerCase();
      if (!uname) return { ok: false, error: 'username' };
      if (team.some((x) => String(x.username).toLowerCase() === uname && x.id !== src.id)) return { ok: false, error: 'username-taken' };
      const patch = {
        name: String(src.name || '').trim(), short: String(src.short || '').trim(), role: String(src.role || 'Barber').trim(),
        phone: String(src.phone || '').trim(), username: uname, bio: String(src.bio || '').trim(),
      };
      if (d.password) patch.passHash = sha256_('urbanstudio:' + d.password);
      const existing = src.id && team.find((x) => x.id === src.id);
      if (existing) {
        updateRow_(SH.team, T_HEAD, existing._row, patch);
        return { ok: true, barber: adminBarber_(Object.assign(existing, patch)) };
      }
      if (!d.password) return { ok: false, error: 'password' };
      const id = slug_(patch.short || patch.name) + '-' + Utilities.getUuid().slice(0, 4);
      const row = Object.assign({ id: id, tags: '', photo: '', rating: '', reviews: '', active: true, schedule: JSON.stringify({ week: SALON_HOURS, days: {} }), createdAt: new Date() }, patch);
      sheet_(SH.team, T_HEAD).appendRow(rowValues_(SH.team, T_HEAD, row));
      return { ok: true, barber: adminBarber_(normTeam_(row)) };
    }

    case 'setActive': {
      if (d.id === me.id && !d.active) return { ok: false, error: 'self' };
      const b = team.find((x) => x.id === d.id);
      if (!b) return { ok: false, error: 'notfound' };
      if (!d.active && team.filter((x) => x.active).length <= 1) return { ok: false, error: 'last' };
      updateRow_(SH.team, T_HEAD, b._row, { active: !!d.active });
      return { ok: true };
    }

    case 'book': {
      const b = d.booking || {};
      const barber = team.find((x) => x.id === b.barberId);
      if (!barber) return { ok: false, error: 'notfound' };
      if (clash_(bookings_(), b)) return { ok: false, error: 'taken' };
      const row = insertBooking_(b, 'admin', barber);
      return { ok: true, booking: toClient_(row) };
    }

    case 'cancel': {
      const b = bookings_().find((x) => x.id === d.id);
      if (!b) return { ok: false, error: 'notfound' };
      cancelRow_(b);
      return { ok: true };
    }

    case 'deleteBooking': {
      const b = bookings_().find((x) => x.id === d.id);
      if (!b) return { ok: true };
      if (b.status === 'confirmed' && Number(b.endMs) > Date.now()) return { ok: false, error: 'live' };
      deleteBookingRows_([b._row]);
      return { ok: true };
    }

    case 'markSms': {
      const b = bookings_().find((x) => x.id === d.id);
      if (!b) return { ok: false, error: 'notfound' };
      const k = d.kind === 'confirm' ? 'Confirm' : 'Remind';
      updateRow_(SH.bookings, B_HEAD, b._row, { ['sms' + k]: d.status, ['sms' + k + 'At']: Date.now() });
      return { ok: true };
    }

    case 'resendSms': {
      const b = bookings_().find((x) => x.id === d.id);
      if (!b) return { ok: false, error: 'notfound' };
      const status = sendSms_(b, d.kind);
      if (status === 'manual') return { ok: false, error: 'manual' };
      const k = d.kind === 'confirm' ? 'Confirm' : 'Remind';
      updateRow_(SH.bookings, B_HEAD, b._row, { ['sms' + k]: status, ['sms' + k + 'At']: Date.now() });
      return status === 'sent' ? { ok: true } : { ok: false, error: 'gateway' };
    }

    case 'password': {
      if (me.passHash !== sha256_('urbanstudio:' + d.old)) return { ok: false, error: 'credentials' };
      updateRow_(SH.team, T_HEAD, me._row, { passHash: sha256_('urbanstudio:' + d.next) });
      return { ok: true };
    }

    default: return { ok: false, error: 'op' };
  }
}

/* ======================= programări ======================= */
function insertBooking_(b, source, barber) {
  const now = Date.now();
  const startMs = Number(b.startMs);
  let remindAt = '', remindKind = '';
  if (b.remind !== false) {
    if (startMs - now > 24 * 36e5 + 5 * 6e4) { remindAt = startMs - 24 * 36e5; remindKind = 'day'; }
    else if (startMs - now > 2 * 36e5 + 5 * 6e4) { remindAt = startMs - 2 * 36e5; remindKind = 'hours'; }
  }
  const row = {
    id: b.id, status: 'confirmed', source: source, createdAt: new Date(), date: b.date, time: b.time,
    startMs: startMs, endMs: Number(b.endMs), serviceId: b.serviceId, serviceName: b.serviceName, price: Number(b.price), duration: Number(b.duration),
    barberId: barber.id, barberName: barber.name, barberShort: barber.short, anyBarber: !!b.anyBarber,
    name: b.name, phone: b.phone, email: b.email || '', notes: b.notes || '',
    remind: b.remind !== false, remindAt: remindAt, remindKind: remindKind,
    smsConfirm: b.sendConfirm === false ? 'skipped' : 'queued', smsConfirmAt: '',
    smsRemind: remindAt ? 'scheduled' : 'skipped', smsRemindAt: '', cancelledAt: '',
  };
  sheet_(SH.bookings, B_HEAD).appendRow(rowValues_(SH.bookings, B_HEAD, row));
  row._row = sheet_(SH.bookings, B_HEAD).getLastRow();

  if (row.smsConfirm === 'queued') {
    row.smsConfirm = sendSms_(row, 'confirm');
    row.smsConfirmAt = Date.now();
    updateRow_(SH.bookings, B_HEAD, row._row, { smsConfirm: row.smsConfirm, smsConfirmAt: row.smsConfirmAt });
  }
  if (CFG.notifySalonByEmail && source === 'app') {
    MailApp.sendEmail(notifyTo_(), `Programare nouă: ${row.name} · ${row.date} ${row.time}`,
      `${row.serviceName} cu ${row.barberName}\n${row.date}, ora ${row.time} (${row.duration} min)\nClient: ${row.name}, ${row.phone}\n${row.notes ? 'Mesaj: ' + row.notes + '\n' : ''}Cod: ${row.id}`);
  }
  return row;
}

// Șterge definitiv rânduri din foaia Programari (de jos în sus, ca numerele rândurilor să rămână valabile).
function deleteBookingRows_(rows) {
  const sh = sheet_(SH.bookings, B_HEAD);
  rows.slice().sort((a, b) => b - a).forEach((r) => sh.deleteRow(r));
}

// Întreținere: rulează din editor ca să ștergi programările de test (numele începe cu „TEST Claude”).
function stergeProgramariTest() {
  const test = bookings_().filter((b) => /^test\s*claude/i.test(String(b.name || '').trim()));
  deleteBookingRows_(test.map((b) => b._row));
  console.log(`Șterse ${test.length} programări de test.`);
  return test.length;
}

function cancelRow_(b, status) {
  const patch = { status: status || 'cancelled', cancelledAt: Date.now() };
  if (b.smsRemind === 'scheduled') patch.smsRemind = 'skipped';
  updateRow_(SH.bookings, B_HEAD, b._row, patch);
}

// Rulat automat la 10 minute (vezi setup): trimite reminderele ajunse la termen.
function sendReminders() {
  const now = Date.now();
  bookings_().forEach((b) => {
    if (b.status !== 'confirmed' || b.smsRemind !== 'scheduled') return;
    if (!b.remindAt || now < Number(b.remindAt) || Number(b.startMs) <= now) return;
    const status = sendSms_(b, 'remind');
    updateRow_(SH.bookings, B_HEAD, b._row, { smsRemind: status, smsRemindAt: now });
  });
}

function inSchedule_(barber, b) {
  const s = barber.schedule || { week: SALON_HOURS, days: {} };
  const p = String(b.date).split('-').map(Number);
  const dow = new Date(p[0], p[1] - 1, p[2]).getDay();
  const list = s.days && Object.prototype.hasOwnProperty.call(s.days, b.date) ? s.days[b.date] : ((s.week || {})[dow] || []);
  const start = toMin_(b.time), end = start + Number(b.duration);
  // intervalele lipite (10:00-10:45 și 10:45-11:30) contează ca unul singur
  const merged = [];
  (list || []).map((iv) => [toMin_(iv[0]), toMin_(iv[1])]).filter((iv) => iv[1] > iv[0]).sort((x, y) => x[0] - y[0]).forEach((iv) => {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push(iv);
  });
  return merged.some((iv) => start >= iv[0] && end <= iv[1]);
}
function clash_(all, b) {
  const s = toMin_(b.time), e = s + Number(b.duration);
  return all.some((x) => x.status === 'confirmed' && x.barberId === b.barberId && x.date === b.date && x.id !== b.id &&
    s < toMin_(x.time) + Number(x.duration) && toMin_(x.time) < e);
}

/* ======================= SMS (httpSMS) ======================= */
function smsKey_() { return PropertiesService.getScriptProperties().getProperty('HTTPSMS_KEY') || ''; }

function sendSms_(b, kind) {
  const key = smsKey_();
  if (!key || key === 'LIPESTE_AICI_CHEIA_HTTPSMS') return 'manual';
  const barber = team_().find((x) => x.id === b.barberId);
  const fromPhone = (barber && barber.phone) || CFG.smsPhoneDefault;
  const content = smsText_(b, kind, fromPhone);
  const res = UrlFetchApp.fetch('https://api.httpsms.com/v1/messages/send', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key },
    payload: JSON.stringify({ from: intl_(fromPhone), to: intl_(b.phone), content: content }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  const status = code >= 200 && code < 300 ? 'sent' : 'failed';
  sheet_(SH.sms, ['at', 'bookingId', 'kind', 'from', 'to', 'status', 'response'])
    .appendRow([new Date(), b.id, kind, intl_(fromPhone), intl_(b.phone), status, String(res.getContentText()).slice(0, 300)]);
  return status;
}

function smsText_(b, kind, barberPhone) {
  const zile = ['duminica', 'luni', 'marti', 'miercuri', 'joi', 'vineri', 'sambata'];
  const luni = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
  const p = String(b.date).split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  const day = `${zile[d.getDay()]}, ${d.getDate()} ${luni[d.getMonth()]}`;
  const first = String(b.name || '').trim().split(/\s+/)[0];
  const hi = first ? `Salut, ${first}!` : 'Salut!';
  const phone = prettyPhone_(barberPhone);
  let t;
  if (kind === 'confirm') t = `${hi} Programare confirmata la Urban Studio: ${day}, ora ${b.time}, ${b.serviceName} cu ${b.barberShort}. Str. Panduri 2, Ploiesti. Modificari: ${phone}`;
  else if (b.remindKind === 'hours') t = `${hi} Iti amintim: azi la ora ${b.time} ai programare la Urban Studio (${b.serviceName}, cu ${b.barberShort}). Te asteptam!`;
  else t = `${hi} Iti amintim: maine, ${day}, la ora ${b.time} ai programare la Urban Studio (${b.serviceName}, cu ${b.barberShort}). Nu poti ajunge? Suna la ${phone}.`;
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/* ======================= foi de calcul ======================= */
function ss_() {
  const active = SpreadsheetApp.getActive();
  if (active) return active;
  const props = PropertiesService.getScriptProperties();
  let id = CFG.sheetId || props.getProperty('SHEET_ID');
  if (!id) { id = SpreadsheetApp.create('Urban Studio · Programări').getId(); props.setProperty('SHEET_ID', id); }
  return SpreadsheetApp.openById(id);
}
// Valorile ca „10:00” sau „0728...” se scriu ca text (cu apostrof), altfel Sheets le transformă în oră sau număr.
function rowValues_(name, head, row) {
  const text = TEXT_COLS[name] || [];
  return head.map((k) => {
    const v = row[k] === undefined ? '' : row[k];
    return text.includes(k) && v !== '' ? "'" + v : v;
  });
}
function sheetTz_() { return ss_().getSpreadsheetTimeZone() || CFG.tz; }
function sheet_(name, head) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(head);
    sh.setFrozenRows(1);
    (TEXT_COLS[name] || []).forEach((k) => sh.getRange(1, head.indexOf(k) + 1, sh.getMaxRows(), 1).setNumberFormat('@'));
  }
  return sh;
}
function read_(name, head) {
  const values = sheet_(name, head).getDataRange().getValues();
  return values.slice(1).map((r, i) => {
    const o = { _row: i + 2 };
    head.forEach((k, j) => { o[k] = r[j]; });
    return o;
  });
}
function updateRow_(name, head, rowIndex, patch) {
  const sh = sheet_(name, head);
  Object.keys(patch).forEach((k) => {
    const c = head.indexOf(k);
    if (c >= 0) sh.getRange(rowIndex, c + 1).setValue(patch[k]);
  });
}

function bookings_() {
  const tz = sheetTz_();
  return read_(SH.bookings, B_HEAD).map((b) => {
    if (b.date instanceof Date) b.date = Utilities.formatDate(b.date, tz, 'yyyy-MM-dd');
    if (b.time instanceof Date) b.time = Utilities.formatDate(b.time, tz, 'HH:mm');
    b.phone = String(b.phone);
    b.duration = Number(b.duration);
    return b;
  }).filter((b) => b.id);
}
function team_() { return read_(SH.team, T_HEAD).filter((b) => b.id).map(normTeam_); }
function normTeam_(b) {
  b.active = b.active === true || String(b.active).toUpperCase() === 'TRUE';
  b.phone = String(b.phone || '');
  if (typeof b.schedule === 'string') { try { b.schedule = JSON.parse(b.schedule); } catch (e) { b.schedule = null; } }
  if (!b.schedule) b.schedule = { week: SALON_HOURS, days: {} };
  b.tags = typeof b.tags === 'string' ? b.tags.split(',').map((t) => t.trim()).filter(String) : (b.tags || []);
  return b;
}
function publicBarber_(b) {
  return { id: b.id, name: b.name, short: b.short, role: b.role, phone: b.phone, bio: b.bio, tags: b.tags, photo: b.photo || null,
    rating: b.rating || undefined, reviews: b.reviews || undefined, active: b.active, schedule: b.schedule };
}
function adminBarber_(b) { return Object.assign(publicBarber_(b), { username: b.username }); }

function toClient_(r) {
  return {
    id: r.id, status: r.status, source: r.source, createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt) || null,
    date: r.date, time: r.time, startMs: Number(r.startMs), endMs: Number(r.endMs),
    serviceId: r.serviceId, serviceName: r.serviceName, price: Number(r.price), duration: Number(r.duration),
    barberId: r.barberId, barberName: r.barberName, barberShort: r.barberShort, anyBarber: r.anyBarber === true || r.anyBarber === 'TRUE',
    name: r.name, phone: String(r.phone), email: r.email, notes: r.notes,
    remind: r.remind === true || r.remind === 'TRUE',
    reminder: r.remindAt ? { at: Number(r.remindAt), kind: r.remindKind } : null,
    sms: {
      confirm: { status: r.smsConfirm || 'manual', at: Number(r.smsConfirmAt) || null },
      remind: { status: r.smsRemind || 'skipped', at: Number(r.smsRemindAt) || Number(r.remindAt) || null, kind: r.remindKind },
    },
  };
}

/* ======================= utilitare ======================= */
function notifyTo_() { return CFG.salonEmail || Session.getEffectiveUser().getEmail(); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function toMin_(t) { const p = String(t).split(':'); return Number(p[0]) * 60 + Number(p[1]); }
function addMin_(t, m) { const x = toMin_(t) + Number(m); return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; }
function digits_(s) { return String(s || '').replace(/\D/g, ''); }
function intl_(p) { const d = digits_(p); return d.startsWith('40') ? '+' + d : d.startsWith('0') ? '+4' + d : '+' + d; }
function prettyPhone_(p) { const d = digits_(p); return d.length === 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : p; }
function slug_(s) { return String(s || 'frizer').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'frizer'; }
