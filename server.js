// Zimmet Takip - bağımlılıksız Node.js sunucusu
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'veri.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- Veri katmanı ----------
function bosVeri() {
  return { personeller: [], malzemeler: [], zimmetler: [] };
}

function yukle() {
  try {
    return { ...bosVeri(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch (err) {
    if (err.code === 'ENOENT') return bosVeri();
    throw err;
  }
}

let db = yukle();

function kaydet() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

const yeniId = () => crypto.randomUUID();
const simdi = () => new Date().toISOString();
const bugun = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const metin = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

class HttpHata extends Error {
  constructor(status, mesaj) {
    super(mesaj);
    this.status = status;
  }
}

const MALZEME_DURUMLARI = ['depoda', 'zimmetli', 'arizali', 'hurda'];

function aktifZimmet(malzemeId) {
  return db.zimmetler.find((z) => z.malzemeId === malzemeId && !z.iadeTarihi);
}

function personelAlanlari(g) {
  const p = {
    adSoyad: metin(g.adSoyad),
    sicilNo: metin(g.sicilNo),
    birim: metin(g.birim),
    unvan: metin(g.unvan),
    telefon: metin(g.telefon),
  };
  if (!p.adSoyad) throw new HttpHata(400, 'Ad Soyad zorunludur.');
  return p;
}

function malzemeAlanlari(g) {
  const m = {
    ad: metin(g.ad),
    kategori: metin(g.kategori),
    marka: metin(g.marka),
    model: metin(g.model),
    seriNo: metin(g.seriNo),
    demirbasNo: metin(g.demirbasNo),
    aciklama: metin(g.aciklama),
  };
  if (!m.ad) throw new HttpHata(400, 'Malzeme adı zorunludur.');
  return m;
}

function demirbasBenzersiz(demirbasNo, haricId) {
  if (!demirbasNo) return;
  const cakisan = db.malzemeler.find(
    (m) => m.id !== haricId && m.demirbasNo.toLowerCase() === demirbasNo.toLowerCase()
  );
  if (cakisan) throw new HttpHata(409, `"${demirbasNo}" demirbaş numarası başka bir malzemede kayıtlı.`);
}

function zimmetDetay(z) {
  const m = db.malzemeler.find((x) => x.id === z.malzemeId);
  const p = db.personeller.find((x) => x.id === z.personelId);
  return {
    ...z,
    malzeme: m ? { id: m.id, ad: m.ad, kategori: m.kategori, marka: m.marka, model: m.model, seriNo: m.seriNo, demirbasNo: m.demirbasNo } : null,
    personel: p ? { id: p.id, adSoyad: p.adSoyad, sicilNo: p.sicilNo, birim: p.birim, unvan: p.unvan } : null,
  };
}

function malzemeDetay(m) {
  const z = aktifZimmet(m.id);
  const p = z && db.personeller.find((x) => x.id === z.personelId);
  return { ...m, aktifZimmet: z ? { id: z.id, verilisTarihi: z.verilisTarihi, personelId: z.personelId, personelAd: p ? p.adSoyad : '?' } : null };
}

// ---------- API ----------
const rotalar = [];
const rota = (method, desen, fn) => {
  const anahtarlar = [];
  const re = new RegExp('^' + desen.replace(/:(\w+)/g, (_, k) => (anahtarlar.push(k), '([^/]+)')) + '$');
  rotalar.push({ method, re, anahtarlar, fn });
};

function bul(liste, id, ad) {
  const kayit = liste.find((x) => x.id === id);
  if (!kayit) throw new HttpHata(404, `${ad} bulunamadı.`);
  return kayit;
}

// Özet
rota('GET', '/api/ozet', () => {
  const durumSay = (d) => db.malzemeler.filter((m) => m.durum === d).length;
  const son = [...db.zimmetler]
    .sort((a, b) => (b.guncelleme || b.olusturma).localeCompare(a.guncelleme || a.olusturma))
    .slice(0, 8)
    .map(zimmetDetay);
  return {
    personelSayisi: db.personeller.length,
    malzemeSayisi: db.malzemeler.length,
    depoda: durumSay('depoda'),
    zimmetli: durumSay('zimmetli'),
    arizali: durumSay('arizali'),
    hurda: durumSay('hurda'),
    sonHareketler: son,
  };
});

// Personel
rota('GET', '/api/personeller', () =>
  db.personeller
    .map((p) => ({ ...p, zimmetSayisi: db.zimmetler.filter((z) => z.personelId === p.id && !z.iadeTarihi).length }))
    .sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'))
);

rota('GET', '/api/personeller/:id', ({ id }) => {
  const p = bul(db.personeller, id, 'Personel');
  const zimmetler = db.zimmetler
    .filter((z) => z.personelId === id)
    .sort((a, b) => b.verilisTarihi.localeCompare(a.verilisTarihi))
    .map(zimmetDetay);
  return { ...p, zimmetler };
});

rota('POST', '/api/personeller', (_, g) => {
  const p = { id: yeniId(), ...personelAlanlari(g), olusturma: simdi() };
  db.personeller.push(p);
  kaydet();
  return p;
});

rota('PUT', '/api/personeller/:id', ({ id }, g) => {
  const p = bul(db.personeller, id, 'Personel');
  Object.assign(p, personelAlanlari(g), { guncelleme: simdi() });
  kaydet();
  return p;
});

rota('DELETE', '/api/personeller/:id', ({ id }) => {
  bul(db.personeller, id, 'Personel');
  if (db.zimmetler.some((z) => z.personelId === id)) {
    throw new HttpHata(409, 'Bu personele ait zimmet kaydı (geçmiş dahil) olduğu için silinemez.');
  }
  db.personeller = db.personeller.filter((p) => p.id !== id);
  kaydet();
  return { ok: true };
});

// Malzeme
rota('GET', '/api/malzemeler', () =>
  db.malzemeler.map(malzemeDetay).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
);

rota('GET', '/api/malzemeler/:id', ({ id }) => {
  const m = bul(db.malzemeler, id, 'Malzeme');
  const gecmis = db.zimmetler
    .filter((z) => z.malzemeId === id)
    .sort((a, b) => b.verilisTarihi.localeCompare(a.verilisTarihi))
    .map(zimmetDetay);
  return { ...malzemeDetay(m), gecmis };
});

rota('POST', '/api/malzemeler', (_, g) => {
  const alanlar = malzemeAlanlari(g);
  demirbasBenzersiz(alanlar.demirbasNo);
  const durum = g.durum === 'arizali' || g.durum === 'hurda' ? g.durum : 'depoda';
  const m = { id: yeniId(), ...alanlar, durum, olusturma: simdi() };
  db.malzemeler.push(m);
  kaydet();
  return m;
});

rota('PUT', '/api/malzemeler/:id', ({ id }, g) => {
  const m = bul(db.malzemeler, id, 'Malzeme');
  const alanlar = malzemeAlanlari(g);
  demirbasBenzersiz(alanlar.demirbasNo, id);
  if (g.durum !== undefined) {
    if (!MALZEME_DURUMLARI.includes(g.durum)) throw new HttpHata(400, 'Geçersiz durum.');
    const zimmetteMi = !!aktifZimmet(id);
    if (zimmetteMi && g.durum !== 'zimmetli') throw new HttpHata(409, 'Zimmetli malzemenin durumunu değiştirmek için önce iade alın.');
    if (!zimmetteMi && g.durum === 'zimmetli') throw new HttpHata(400, 'Malzemeyi zimmetlemek için "Zimmet Ver" ekranını kullanın.');
    alanlar.durum = g.durum;
  }
  Object.assign(m, alanlar, { guncelleme: simdi() });
  kaydet();
  return m;
});

rota('DELETE', '/api/malzemeler/:id', ({ id }) => {
  bul(db.malzemeler, id, 'Malzeme');
  if (db.zimmetler.some((z) => z.malzemeId === id)) {
    throw new HttpHata(409, 'Bu malzemenin zimmet geçmişi olduğu için silinemez. Durumunu "hurda" yapabilirsiniz.');
  }
  db.malzemeler = db.malzemeler.filter((m) => m.id !== id);
  kaydet();
  return { ok: true };
});

// Zimmet
rota('GET', '/api/zimmetler', (_, __, q) => {
  let liste = db.zimmetler;
  if (q.get('durum') === 'aktif') liste = liste.filter((z) => !z.iadeTarihi);
  if (q.get('durum') === 'iade') liste = liste.filter((z) => z.iadeTarihi);
  return liste
    .sort((a, b) => b.verilisTarihi.localeCompare(a.verilisTarihi) || b.olusturma.localeCompare(a.olusturma))
    .map(zimmetDetay);
});

rota('GET', '/api/zimmetler/:id', ({ id }) => zimmetDetay(bul(db.zimmetler, id, 'Zimmet kaydı')));

rota('POST', '/api/zimmetler', (_, g) => {
  const m = bul(db.malzemeler, metin(g.malzemeId), 'Malzeme');
  const p = bul(db.personeller, metin(g.personelId), 'Personel');
  if (m.durum !== 'depoda') throw new HttpHata(409, `"${m.ad}" şu an zimmetlenebilir değil (durum: ${m.durum}).`);
  const verilisTarihi = metin(g.verilisTarihi) || bugun();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(verilisTarihi)) throw new HttpHata(400, 'Geçersiz veriliş tarihi.');
  const z = {
    id: yeniId(),
    malzemeId: m.id,
    personelId: p.id,
    verilisTarihi,
    teslimEden: metin(g.teslimEden),
    aciklama: metin(g.aciklama),
    iadeTarihi: null,
    iadeAlan: '',
    iadeAciklama: '',
    olusturma: simdi(),
  };
  db.zimmetler.push(z);
  m.durum = 'zimmetli';
  kaydet();
  return zimmetDetay(z);
});

rota('POST', '/api/zimmetler/:id/iade', ({ id }, g) => {
  const z = bul(db.zimmetler, id, 'Zimmet kaydı');
  if (z.iadeTarihi) throw new HttpHata(409, 'Bu zimmet zaten iade alınmış.');
  const iadeTarihi = metin(g.iadeTarihi) || bugun();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iadeTarihi)) throw new HttpHata(400, 'Geçersiz iade tarihi.');
  if (iadeTarihi < z.verilisTarihi) throw new HttpHata(400, 'İade tarihi veriliş tarihinden önce olamaz.');
  const yeniDurum = ['depoda', 'arizali', 'hurda'].includes(g.malzemeDurumu) ? g.malzemeDurumu : 'depoda';
  Object.assign(z, { iadeTarihi, iadeAlan: metin(g.iadeAlan), iadeAciklama: metin(g.iadeAciklama), guncelleme: simdi() });
  const m = db.malzemeler.find((x) => x.id === z.malzemeId);
  if (m) m.durum = yeniDurum;
  kaydet();
  return zimmetDetay(z);
});

// Yedek
rota('GET', '/api/yedek', () => db);

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function json(res, status, veri) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(veri));
}

function govdeOku(req) {
  return new Promise((resolve, reject) => {
    let ham = '';
    req.on('data', (c) => {
      ham += c;
      if (ham.length > 1e6) reject(new HttpHata(413, 'İstek çok büyük.'));
    });
    req.on('end', () => {
      if (!ham) return resolve({});
      try {
        resolve(JSON.parse(ham));
      } catch {
        reject(new HttpHata(400, 'Geçersiz JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function statikSun(req, res, yol) {
  const dosya = path.normalize(path.join(PUBLIC_DIR, yol === '/' ? 'index.html' : yol));
  if (!dosya.startsWith(PUBLIC_DIR)) return json(res, 403, { hata: 'Yasak' });
  fs.readFile(dosya, (err, icerik) => {
    if (err) {
      // Bilinmeyen yollar tek sayfalık uygulamaya düşer
      return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
        if (e2) return json(res, 404, { hata: 'Bulunamadı' });
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(dosya)] || 'application/octet-stream' });
    res.end(icerik);
  });
}

const sunucu = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return statikSun(req, res, decodeURIComponent(url.pathname));
  try {
    for (const r of rotalar) {
      if (r.method !== req.method) continue;
      const eslesme = url.pathname.match(r.re);
      if (!eslesme) continue;
      const params = Object.fromEntries(r.anahtarlar.map((k, i) => [k, decodeURIComponent(eslesme[i + 1])]));
      const govde = ['POST', 'PUT'].includes(req.method) ? await govdeOku(req) : {};
      return json(res, req.method === 'POST' ? 201 : 200, await r.fn(params, govde, url.searchParams));
    }
    throw new HttpHata(404, 'API yolu bulunamadı.');
  } catch (err) {
    if (!(err instanceof HttpHata)) console.error(err);
    json(res, err.status || 500, { hata: err instanceof HttpHata ? err.message : 'Sunucu hatası.' });
  }
});

if (require.main === module) {
  sunucu.listen(PORT, () => console.log(`Zimmet Takip çalışıyor: http://localhost:${PORT}`));
}

module.exports = { sunucu };
