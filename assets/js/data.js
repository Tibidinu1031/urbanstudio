/* Conținutul salonului. Tot ce ține de business se editează aici. */

export const CONFIG = {
  // URL-ul aplicației web Google Apps Script (vezi backend/README.md).
  // Gol = aplicația funcționează local: disponibilitate simulată, reamintiri pe telefon.
  apiUrl: '',
  slotStep: 15,            // pasul orelor afișate, în minute
  minLeadMinutes: 30,      // cât de devreme se poate face o programare pentru azi
  bookingDays: 28,         // câte zile în avans se poate rezerva
  reminderHours: 24,       // reamintirea principală: cu o zi înainte
};

export const SALON = {
  name: 'Urban Studio',
  fullName: 'Urban Studio Barbering & Academy',
  city: 'Ploiești',
  address: 'Str. Panduri nr. 2, Bl. 3A, Ap. 3',
  addressHint: 'Parter, interfon 3 · Ploiești',
  phone: '0736 570 863',
  phoneIntl: '+40736570863',
  whatsapp: '40736570863',
  email: 'urbanstudio115@gmail.com',
  geo: { lat: 44.9385124, lng: 26.0075579 },
  rating: { score: 4.99, count: 3286, source: 'mero.ro' },
  links: {
    instagram: 'https://www.instagram.com/urban.studio115/',
    facebook: 'https://www.facebook.com/urbanstudioploiesti/',
    mero: 'https://mero.ro/p/urban-studio-barbering-academy',
  },
  // index = Date.getDay() (0 = duminică). null = închis.
  hours: {
    0: null,
    1: null,
    2: ['08:30', '16:45'],
    3: ['08:30', '16:45'],
    4: ['08:30', '18:30'],
    5: ['08:30', '19:00'],
    6: ['10:00', '15:00'],
  },
};

export const SERVICE_GROUPS = [
  { id: 'tuns', label: 'Tunsori' },
  { id: 'combo', label: 'Tuns și barbă' },
  { id: 'barba', label: 'Barbă' },
];

// Prețuri și durate preluate de pe profilul mero al salonului.
export const SERVICES = [
  { id: 'tuns', group: 'tuns', name: 'Tuns', note: 'Mașină și foarfecă', duration: 30, price: 70, icon: 'scissors', popular: 1 },
  { id: 'tuns-masina', group: 'tuns', name: 'Tuns doar mașină', note: 'Doar cu mașina', duration: 30, price: 60, icon: 'clipper' },
  { id: 'tuns-spalat', group: 'tuns', name: 'Tuns și spălat', note: 'Cu spălat inclus', duration: 45, price: 85, icon: 'drop' },
  { id: 'copii', group: 'tuns', name: 'Tuns copii', note: 'Între 1 și 7 ani', duration: 30, price: 65, icon: 'child', popular: 4 },
  { id: 'tuns-barba', group: 'combo', name: 'Tuns și barbă', note: 'Tuns complet și barbă', duration: 45, price: 95, icon: 'beard', popular: 2 },
  { id: 'masina-barba', group: 'combo', name: 'Tuns mașină și barbă', note: 'Mașină și barbă', duration: 45, price: 90, icon: 'clipper' },
  { id: 'zero-barba', group: 'combo', name: 'Tuns 0 și barbă', note: 'Zero la mașină și barbă', duration: 30, price: 65, icon: 'clipper' },
  { id: 'complet', group: 'combo', name: 'Tuns, barbă și spălat', note: 'Pachetul complet', duration: 60, price: 115, icon: 'drop' },
  { id: 'barba', group: 'barba', name: 'Tuns barbă', note: 'Contur și aranjat', duration: 15, price: 35, icon: 'beard', popular: 3 },
];

export const ACADEMY = {
  name: 'Curs de barbering',
  price: 1500,
  length: '1 lună',
  modules: 8,
  text: 'Curs intensiv de frizerie de o lună, împărțit în 8 module, câte 2 pe săptămână. Echipamentul și produsele sunt asigurate pe toată durata cursului.',
};

// Echipa. Pe mero apare doar Adiță; Radu și Ștefan sunt profiluri exemplu,
// marcate cu `placeholder: true`. Înlocuiește-le cu frizerii reali (nume, poză, descriere).
export const BARBERS = [
  {
    id: 'adita',
    name: 'Adiță Seceanu',
    short: 'Adiță',
    role: 'Master hairstylist · Fondator',
    photo: 'assets/img/team/adita.jpg',
    rating: 4.99,
    reviews: 3142,
    bio: '9 ani de experiență în tuns și 5 ani ca trainer acreditat. Formează frizeri noi la Urban Studio Academy.',
    tags: ['Fade', 'Foarfecă', 'Barbă', 'Trainer'],
  },
  {
    id: 'radu',
    name: 'Radu',
    short: 'Radu',
    role: 'Barber',
    photo: null,
    bio: 'Fade-uri curate, texturi și tunsori moderne.',
    tags: ['Fade', 'Texturi'],
    placeholder: true,
  },
  {
    id: 'stefan',
    name: 'Ștefan',
    short: 'Ștefan',
    role: 'Barber',
    photo: null,
    bio: 'Barbă, contururi precise și tunsori clasice.',
    tags: ['Barbă', 'Clasic'],
    placeholder: true,
  },
];

// Recenzii reale de pe mero.ro (fără emoji).
export const REVIEWS = [
  { name: 'Simona C.', text: 'Profesionalism, mâini de aur. Recomand cu toată dragostea! O să vedeți că vă veți întoarce de fiecare dată.' },
  { name: 'Cristian V.', text: 'Personal amabil și servicii de calitate.' },
  { name: 'Dj A.', text: 'Frizerul meu de suflet și povești.' },
  { name: 'Edward D.', text: 'Tunde foarte bine.' },
];

// 20 de fotografii de pe Instagram, Facebook și mero ale salonului.
const G = (n, w, h, alt, pos = '50% 50%') => ({
  src: `assets/img/gallery/${n}.jpg`,
  thumb: `assets/img/gallery/thumbs/${n}.jpg`,
  w, h, alt, pos,
});
export const PHOTOS = [
  G('01', 1080, 810, 'Salonul, cu toate posturile ocupate'),
  G('02', 472, 1024, 'Skin fade cu barbă conturată', '50% 35%'),
  G('03', 1080, 750, 'Fade lucrat cu mașina', '60% 50%'),
  G('04', 768, 1024, 'Fade cu volum texturat', '50% 40%'),
  G('05', 640, 335, 'Posturile de lucru'),
  G('06', 640, 640, 'Pompadour platinat'),
  G('07', 900, 1200, 'Tuns la oglindă', '50% 40%'),
  G('08', 768, 1024, 'Low fade la ceafă', '50% 45%'),
  G('09', 640, 640, 'Fade și barbă, două unghiuri'),
  G('10', 640, 640, 'Crop texturat'),
  G('11', 1080, 732, 'O zi obișnuită în salon'),
  G('12', 472, 1024, 'Fade pentru cei mici', '50% 35%'),
  G('13', 640, 640, 'Detalii cu trimmerul'),
  G('14', 472, 1024, 'Platinat, stil texturat', '50% 30%'),
  G('15', 640, 640, 'Păr creț, tuns cu foarfeca'),
  G('16', 1080, 750, 'Styling final', '45% 50%'),
  G('17', 500, 500, 'Adiță, în studio'),
  G('18', 1080, 750, 'Cursant la lucru', '40% 50%'),
  G('19', 640, 640, 'Diplomele Academy'),
  G('20', 640, 640, 'Absolvenți Urban Studio Academy'),
];
