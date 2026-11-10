# Urban Studio · Programări online

Aplicație web (PWA) pentru **Urban Studio Barbering & Academy**, Ploiești. Clienții aleg serviciul, frizerul, ziua și ora, apoi primesc reamintire cu o zi înainte.

Fără build, fără dependențe: HTML, CSS și JavaScript modular. `index.html` e în rădăcină, deci merge direct pe GitHub Pages.

## Ce conține

- **Splash animat**: logo-ul vectorizat se desenează linie cu linie, foarfeca din „A” taie (tap pe logo repetă gestul), iar bara de încărcare în roșu, alb și albastru urmărește încărcarea reală.
- **Bara de jos flotantă**, cu pastilă care alunecă între taburi (se poate și glisa cu degetul): Acasă, Programează, Agenda, Despre salon.
- **Programare în 4 pași**: serviciu, frizer (sau primul disponibil), dată și oră, detalii. Bilet de confirmare cu cod.
- **Reamintiri cu o zi înainte**:
  1. eveniment în calendarul telefonului (.ics) cu alarmă cu o zi și cu 2 ore înainte, sau Google Calendar;
  2. notificare pe telefon prin service worker (Android, desktop, iPhone cu aplicația adăugată pe ecranul principal);
  3. email automat, după activarea serverului gratuit din `backend/` (Google Apps Script).
- **Agenda**: programări viitoare cu numărătoare inversă, mutare, anulare, istoric și „programează din nou”.
- **Despre salon**: carusel cu 20 de fotografii din social media (swipe cu parallax), lightbox pe tot ecranul (swipe stânga/dreapta, swipe în jos pentru închidere), galerie, echipă, program, hartă, contact.
- Funcționează offline după prima vizită și se poate instala pe ecranul principal.

## Structură

```
index.html              punctul de intrare
manifest.webmanifest    instalare ca aplicație
sw.js                   offline + reamintiri în fundal
assets/css/app.css      design system
assets/js/data.js       TOT conținutul salonului: servicii, prețuri, program, echipă, poze
assets/js/app.js        tab bar, rute, pornire
assets/js/views/        ecranele: home, booking, agenda, about
assets/js/reminders.js  calendar, notificări, server
assets/img/             fotografii, echipă, imagine pentru share
backend/                server opțional pentru emailuri (Google Apps Script)
```

## Editare rapidă

Totul se schimbă din `assets/js/data.js`:

- **Servicii și prețuri**: lista `SERVICES` (preluate de pe profilul mero al salonului).
- **Program**: `SALON.hours`.
- **Echipa**: `BARBERS`. Pe mero apare doar Adiță; **Radu și Ștefan sunt profiluri exemplu** (`placeholder: true`) și trebuie înlocuite cu frizerii reali. Pentru poză, pune fișierul în `assets/img/team/` și completează `photo`.
- **Galerie**: `PHOTOS` și fișierele din `assets/img/gallery/`.

După modificări, crește `VERSION` din `sw.js`, ca telefoanele să descarce varianta nouă.

## Rulare locală

Orice server static, din rădăcina proiectului:

```bash
npx serve .
```

## Publicare

Repository public pe GitHub → **Settings → Pages → Deploy from a branch → main / (root)**.
