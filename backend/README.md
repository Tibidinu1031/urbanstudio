# Serverul Urban Studio (Google Apps Script) + SMS prin httpSMS

GitHub Pages găzduiește doar pagini statice. Fără server, aplicația și panoul merg în **mod demo**: programările stau pe telefonul pe care au fost făcute, iar SMS-urile se trimit cu un tap din panou.

Serverul de aici e gratuit și transformă totul într-un sistem comun:

- toți frizerii văd aceleași programări, în timp real;
- conturile de acces (user0, user1, user2) sunt verificate pe server, cu sesiune semnată;
- clienții văd doar orele libere din programul fiecărui frizer, fără suprapuneri;
- SMS automat în numele frizerului: **confirmare** imediat și **reminder cu o zi înainte**.

## 1. Instalare server (circa 5 minute)

1. Creează un Google Sheet nou în contul salonului, de exemplu „Urban Studio · Programări”.
2. **Extensii → Apps Script**. Șterge codul din editor, lipește tot fișierul `google-apps-script.gs`, salvează.
3. Alege funcția `setup` și apasă **Run**. Acceptă permisiunile. Se creează foile `Programari`, `Frizeri`, `SMS`, conturile de test și verificarea automată a reminderelor (la 10 minute).
4. **Deploy → New deployment → Web app**. Execute as: **Me**. Who has access: **Anyone**. Copiază URL-ul care se termină în `/exec`.
5. În `assets/js/data.js`, pune URL-ul la `CONFIG.apiUrl`, apoi commit și push.

Dacă scriptul nu e creat din meniul tabelului (Extensii → Apps Script), completează `CFG.sheetId` cu ID-ul tabelului din URL (`/spreadsheets/d/ID/edit`). Altfel scriptul își creează singur tabelul la prima rulare.

După orice modificare a codului din Apps Script: **Deploy → Manage deployments → creion → Version: New version → Deploy**. URL-ul rămâne același.

Conturi create la instalare (schimbă parolele din panou, la Contul meu):

| Utilizator | Parolă | Frizer |
|---|---|---|
| user0 | ParolaTest0 | Adiță |
| user1 | ParolaTest1 | Radu |
| user2 | ParolaTest2 | Ștefan |

## 2. SMS automat de pe numărul frizerului (httpSMS)

SMS-urile pleacă din telefonul frizerului, de pe cartela lui, prin aplicația gratuită **httpSMS**.

> Funcționează doar pe **Android**. Pe iPhone, Apple nu permite aplicațiilor să trimită SMS-uri singure; acolo SMS-urile se trimit cu un tap din panou (se deschide Mesaje cu textul gata scris).

1. Pe telefonul Android cu cartela **0728 933 035**, instalează **httpSMS** din Google Play și loghează-te.
2. Pe [httpsms.com/settings](https://httpsms.com/settings) copiază **API key**.
3. În Apps Script, la funcția `setHttpSmsKey`, înlocuiește `LIPESTE_AICI_CHEIA_HTTPSMS` cu cheia, alege funcția și apasă **Run**.
4. Gata: confirmarea pleacă imediat după programare, reminderul cu 24 de ore înainte (sau cu 2 ore, dacă programarea a fost făcută cu mai puțin de o zi înainte).

Fiecare SMS pleacă de pe numărul frizerului setat în panou, la Echipa. Acum toți trei au 0728 933 035. Când fiecare frizer își instalează httpSMS pe telefonul lui, îi schimbi numărul din panou și mesajele pleacă de pe telefonul lui.

Toate SMS-urile trimise apar în foaia `SMS`, cu statusul de la httpSMS.

## Texte SMS (fără diacritice, ca să încapă într-un singur SMS)

- Confirmare: `Salut, Andrei! Programare confirmata la Urban Studio: joi, 20 nov., ora 12:30, Tuns si barba cu Adita. Str. Panduri 2, Ploiesti. Modificari: 0728 933 035`
- Reminder: `Salut, Andrei! Iti amintim: maine, joi, 20 nov., la ora 12:30 ai programare la Urban Studio (Tuns si barba, cu Adita). Nu poti ajunge? Suna la 0728 933 035.`

Textele se schimbă în `smsText_` (server) și `assets/js/sms.js` (panou).
