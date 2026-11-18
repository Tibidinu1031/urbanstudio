# Urban Studio · Programări online + panou frizeri

Aplicație web (PWA) pentru **Urban Studio Barbering & Academy**, Ploiești. Clienții aleg serviciul, frizerul, ziua și ora. Frizerii își gestionează agenda, programul și echipa din panou, iar clienții primesc SMS de confirmare și reminder cu o zi înainte.

- Aplicația clienților: `https://tibidinu1031.github.io/urbanstudio/`
- Panoul frizerilor: `https://tibidinu1031.github.io/urbanstudio/admin/`

Fără build, fără dependențe: HTML, CSS și JavaScript modular. `index.html` e în rădăcină, deci merge direct pe GitHub Pages.

## Aplicația clienților

- Splash animat cu logo-ul vectorizat și bara de încărcare în roșu, alb și albastru.
- Bara de jos cu 4 taburi: Acasă, Programează, Agenda, Despre salon.
- Programare în 4 pași: serviciu, frizer (sau primul disponibil), dată și oră, detalii. Orele libere vin din programul setat de fiecare frizer în panou.
- Reamintiri: calendar (.ics), notificare pe telefon și SMS de la frizer.
- Despre salon: carusel și galerie cu 20 de fotografii din social media.

## Panoul frizerilor (`/admin/`)

Conturi de test (schimbă parolele din panou, la Contul meu):

| Utilizator | Parolă | Frizer |
|---|---|---|
| user0 | ParolaTest0 | Adiță |
| user1 | ParolaTest1 | Radu |
| user2 | ParolaTest2 | Ștefan |

- **Agenda**: programările pe zi și pe frizer, încasarea zilei, programare nouă (primită la telefon), anulare.
- **SMS-uri de trimis**: confirmările și reminderele care trebuie trimise. Un tap deschide Mesaje cu textul gata scris, de pe telefonul frizerului.
- **Istoric**: toate programările, pe frizer, cu filtre pe perioadă, interval orar, zilele săptămânii, status și căutare după nume, telefon sau cod. Export CSV.
- **Program**: orele de lucru pe fiecare zi, pauză, zile libere și program special pe date. Clienții văd doar aceste ore.
- **Echipa**: adaugă, editează sau scoate frizeri. Fiecare frizer e și cont de acces, cu numărul lui de telefon pentru SMS.

### Mod demo și mod server

- **Demo**: cu `CONFIG.apiUrl` gol, datele stau în browserul telefonului. Panoul vede programările făcute din aplicație pe același telefon.
- **Server (activ)**: Google Apps Script gratuit, comun pentru toți frizerii, cu autentificare pe server. Programările se salvează în tabelul Google „Urban Studio · Programări”. SMS automat după ce adaugi cheia httpSMS (telefon Android). Detalii în [backend/README.md](backend/README.md).

## Structură

```
index.html              aplicația clienților
admin/index.html        panoul frizerilor
sw.js                   offline + reamintiri în fundal
assets/css/app.css      design system
assets/css/admin.css    completări pentru panou
assets/js/data.js       conținutul salonului: servicii, prețuri, program, echipă, poze, CONFIG
assets/js/api.js        stratul de date: mod local (demo) sau server
assets/js/slots.js      orele libere din programul frizerilor
assets/js/sms.js        textele SMS și trimiterea cu un tap
assets/js/views/        ecranele aplicației
assets/js/admin/        ecranele panoului
backend/                serverul (Google Apps Script) + SMS prin httpSMS
```

După modificări, crește `VERSION` din `sw.js`, ca telefoanele să descarce varianta nouă.

## Rulare locală

```bash
npx serve .
```

## Publicare

Repository public pe GitHub → **Settings → Pages → Deploy from a branch → main / (root)**.
