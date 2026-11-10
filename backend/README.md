# Reamintiri pe email cu Google Apps Script

GitHub Pages găzduiește doar fișiere statice, deci nu poate trimite singur emailuri. Acest script gratuit, legat de un Google Sheet, preia programările din aplicație, le păstrează într-un tabel pe care salonul îl vede și trimite reamintirea pe email cu o zi înainte.

## Instalare (circa 5 minute)

1. Intră pe contul Google al salonului și creează un Google Sheet nou, de exemplu „Urban Studio · Programări”.
2. Din meniul Sheet-ului: **Extensii → Apps Script**.
3. Șterge codul din editor și lipește tot conținutul din `google-apps-script.gs`. Salvează.
4. În bara de sus alege funcția `setup` și apasă **Rulează**. Acceptă permisiunile (Sheet + trimitere email). Se creează foaia `Programari` și verificarea automată la 15 minute.
5. **Implementează → Implementare nouă → Tip: Aplicație web**
   - Execută ca: **Eu**
   - Cine are acces: **Oricine**
6. Copiază URL-ul care se termină în `/exec`.
7. În `assets/js/data.js` pune URL-ul la `CONFIG.apiUrl`:

   ```js
   apiUrl: 'https://script.google.com/macros/s/XXXXXXXX/exec',
   ```

8. Commit și push. Gata.

## Ce se schimbă după activare

- Orele ocupate vin din tabel, nu mai sunt simulate, deci nu pot exista două programări la aceeași oră.
- Clientul primește confirmare pe email imediat și reamintire cu 24 de ore înainte.
- Salonul primește un email la fiecare programare nouă sau anulată.
- Câmpul de email din aplicație afișează „pentru confirmare și reamintire”.

## SMS (opțional)

Pentru reamintiri prin SMS se poate adăuga în `sendReminders()` un apel `UrlFetchApp.fetch(...)` către un furnizor de SMS (de exemplu SMSLink, Twilio). Necesită cont și credit la furnizor.
