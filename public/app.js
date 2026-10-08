'use strict';

// ---------- Yardımcılar ----------
const $ = (s, kok = document) => kok.querySelector(s);
const icerik = $('#icerik');

const kacir = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const DURUM_ADI = { depoda: 'Depoda', zimmetli: 'Zimmetli', arizali: 'Arızalı', hurda: 'Hurda' };
const rozet = (d) => `<span class="rozet ${kacir(d)}">${kacir(DURUM_ADI[d] || d)}</span>`;
const tarih = (t) => (t ? new Date(t + 'T00:00:00').toLocaleDateString('tr-TR') : '—');
const bugun = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const kucult = (s) => String(s ?? '').toLocaleLowerCase('tr');

async function api(yol, secenek = {}) {
  const res = await fetch('/api' + yol, {
    method: secenek.method || 'GET',
    headers: secenek.govde ? { 'Content-Type': 'application/json' } : undefined,
    body: secenek.govde ? JSON.stringify(secenek.govde) : undefined,
  });
  const veri = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(veri.hata || 'Bir hata oluştu.');
  return veri;
}

let bildirimZaman;
function bildir(mesaj) {
  const el = $('#bildirim');
  el.textContent = mesaj;
  el.classList.add('goster');
  clearTimeout(bildirimZaman);
  bildirimZaman = setTimeout(() => el.classList.remove('goster'), 2500);
}

function malzemeEtiketi(m) {
  if (!m) return '(silinmiş malzeme)';
  const ek = [m.marka, m.model].filter(Boolean).join(' ');
  return m.ad + (ek ? ` – ${ek}` : '');
}

// ---------- Form penceresi ----------
// alanlar: [{ ad, etiket, tip?, secenekler?, tam?, zorunlu? }]
function formAc({ baslik, alanlar, degerler = {}, kaydetYazi = 'Kaydet', kaydet }) {
  const pencere = $('#pencere');
  $('#pencereBaslik').textContent = baslik;
  $('#pencereKaydet').textContent = kaydetYazi;
  $('#pencereHata').textContent = '';
  $('#pencereGovde').innerHTML =
    '<div class="form-izgara">' +
    alanlar
      .map((a) => {
        const d = degerler[a.ad] ?? a.varsayilan ?? '';
        const ortak = `name="${a.ad}" ${a.zorunlu ? 'required' : ''}`;
        let giris;
        if (a.tip === 'select') {
          giris = `<select ${ortak}>${a.secenekler
            .map((s) => `<option value="${kacir(s.deger)}" ${String(s.deger) === String(d) ? 'selected' : ''}>${kacir(s.etiket)}</option>`)
            .join('')}</select>`;
        } else if (a.tip === 'textarea') {
          giris = `<textarea ${ortak}>${kacir(d)}</textarea>`;
        } else {
          giris = `<input type="${a.tip || 'text'}" ${ortak} value="${kacir(d)}" ${a.liste ? `list="${a.ad}-liste"` : ''}>` +
            (a.liste ? `<datalist id="${a.ad}-liste">${a.liste.map((x) => `<option value="${kacir(x)}">`).join('')}</datalist>` : '');
        }
        return `<label class="${a.tam ? 'tam' : ''}">${kacir(a.etiket)}${a.zorunlu ? ' *' : ''}${giris}</label>`;
      })
      .join('') +
    '</div>';

  const form = $('#pencereForm');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const veri = Object.fromEntries(new FormData(form));
    try {
      $('#pencereKaydet').disabled = true;
      await kaydet(veri);
      pencere.close();
      yonlendir();
    } catch (err) {
      $('#pencereHata').textContent = err.message;
    } finally {
      $('#pencereKaydet').disabled = false;
    }
  };
  $('#pencereIptal').onclick = () => pencere.close();
  pencere.showModal();
  const ilk = form.querySelector('input, select, textarea');
  if (ilk) ilk.focus();
}

async function onayla(mesaj, islem) {
  if (!confirm(mesaj)) return;
  try {
    await islem();
    yonlendir();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- Formlar ----------
const PERSONEL_ALANLARI = [
  { ad: 'adSoyad', etiket: 'Ad Soyad', zorunlu: true },
  { ad: 'sicilNo', etiket: 'Sicil No' },
  { ad: 'birim', etiket: 'Birim / Departman' },
  { ad: 'unvan', etiket: 'Unvan' },
  { ad: 'telefon', etiket: 'Telefon', tip: 'tel' },
];

function personelFormu(p) {
  formAc({
    baslik: p ? 'Personeli Düzenle' : 'Yeni Personel',
    alanlar: PERSONEL_ALANLARI,
    degerler: p,
    kaydet: async (v) => {
      await api(p ? `/personeller/${p.id}` : '/personeller', { method: p ? 'PUT' : 'POST', govde: v });
      bildir(p ? 'Personel güncellendi.' : 'Personel eklendi.');
    },
  });
}

async function malzemeFormu(m) {
  const tumu = await api('/malzemeler');
  const kategoriler = [...new Set(tumu.map((x) => x.kategori).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const alanlar = [
    { ad: 'ad', etiket: 'Malzeme Adı', zorunlu: true, tam: true },
    { ad: 'kategori', etiket: 'Kategori', liste: kategoriler.length ? kategoriler : ['Bilgisayar', 'Telefon', 'Mobilya', 'El Aleti', 'Araç'] },
    { ad: 'demirbasNo', etiket: 'Demirbaş No' },
    { ad: 'marka', etiket: 'Marka' },
    { ad: 'model', etiket: 'Model' },
    { ad: 'seriNo', etiket: 'Seri No', tam: true },
  ];
  if (!m || m.durum !== 'zimmetli') {
    alanlar.push({
      ad: 'durum',
      etiket: 'Durum',
      tip: 'select',
      tam: true,
      secenekler: ['depoda', 'arizali', 'hurda'].map((d) => ({ deger: d, etiket: DURUM_ADI[d] })),
    });
  }
  alanlar.push({ ad: 'aciklama', etiket: 'Açıklama', tip: 'textarea', tam: true });
  formAc({
    baslik: m ? 'Malzemeyi Düzenle' : 'Yeni Malzeme',
    alanlar,
    degerler: m,
    kaydet: async (v) => {
      await api(m ? `/malzemeler/${m.id}` : '/malzemeler', { method: m ? 'PUT' : 'POST', govde: v });
      bildir(m ? 'Malzeme güncellendi.' : 'Malzeme eklendi.');
    },
  });
}

async function zimmetFormu({ malzemeId, personelId } = {}) {
  const [malzemeler, personeller] = await Promise.all([api('/malzemeler'), api('/personeller')]);
  const uygun = malzemeler.filter((m) => m.durum === 'depoda');
  if (!uygun.length) return alert('Depoda zimmetlenebilecek malzeme yok. Önce malzeme ekleyin.');
  if (!personeller.length) return alert('Kayıtlı personel yok. Önce personel ekleyin.');
  formAc({
    baslik: 'Zimmet Ver',
    kaydetYazi: 'Zimmetle',
    alanlar: [
      {
        ad: 'malzemeId', etiket: 'Malzeme', tip: 'select', zorunlu: true, tam: true,
        secenekler: uygun.map((m) => ({ deger: m.id, etiket: malzemeEtiketi(m) + (m.demirbasNo ? ` [${m.demirbasNo}]` : '') })),
      },
      {
        ad: 'personelId', etiket: 'Teslim Alan Personel', tip: 'select', zorunlu: true, tam: true,
        secenekler: personeller.map((p) => ({ deger: p.id, etiket: p.adSoyad + (p.birim ? ` (${p.birim})` : '') })),
      },
      { ad: 'verilisTarihi', etiket: 'Veriliş Tarihi', tip: 'date', zorunlu: true, varsayilan: bugun() },
      { ad: 'teslimEden', etiket: 'Teslim Eden' },
      { ad: 'aciklama', etiket: 'Açıklama / Teslim Notu', tip: 'textarea', tam: true },
    ],
    degerler: { malzemeId, personelId },
    kaydet: async (v) => {
      await api('/zimmetler', { method: 'POST', govde: v });
      bildir('Zimmet kaydedildi.');
    },
  });
}

function iadeFormu(zimmetId, baslik) {
  formAc({
    baslik: 'İade Al' + (baslik ? ` – ${baslik}` : ''),
    kaydetYazi: 'İade Al',
    alanlar: [
      { ad: 'iadeTarihi', etiket: 'İade Tarihi', tip: 'date', zorunlu: true, varsayilan: bugun() },
      { ad: 'iadeAlan', etiket: 'İadeyi Teslim Alan' },
      {
        ad: 'malzemeDurumu', etiket: 'Malzemenin İade Sonrası Durumu', tip: 'select', tam: true,
        secenekler: [
          { deger: 'depoda', etiket: 'Sağlam – depoya alındı' },
          { deger: 'arizali', etiket: 'Arızalı' },
          { deger: 'hurda', etiket: 'Hurda' },
        ],
      },
      { ad: 'iadeAciklama', etiket: 'Açıklama', tip: 'textarea', tam: true },
    ],
    kaydet: async (v) => {
      await api(`/zimmetler/${zimmetId}/iade`, { method: 'POST', govde: v });
      bildir('İade alındı.');
    },
  });
}

// ---------- Zimmet tutanağı ----------
function tutanakYazdir(personel, zimmetler) {
  const satirlar = zimmetler
    .map(
      (z, i) => `<tr>
        <td>${i + 1}</td>
        <td>${kacir(malzemeEtiketi(z.malzeme))}</td>
        <td>${kacir(z.malzeme?.demirbasNo || '')}</td>
        <td>${kacir(z.malzeme?.seriNo || '')}</td>
        <td>${tarih(z.verilisTarihi)}</td>
        <td>${kacir(z.aciklama)}</td>
      </tr>`
    )
    .join('');
  const teslimEden = [...new Set(zimmetler.map((z) => z.teslimEden).filter(Boolean))].join(', ');
  $('#yazdirAlani').innerHTML = `
    <div class="tutanak">
      <h1>ZİMMET TESLİM TUTANAĞI</h1>
      <div class="tarih">Düzenlenme Tarihi: ${new Date().toLocaleDateString('tr-TR')}</div>
      <p><b>Teslim Alan:</b> ${kacir(personel.adSoyad)}
        ${personel.sicilNo ? ` &nbsp; <b>Sicil No:</b> ${kacir(personel.sicilNo)}` : ''}
        ${personel.unvan ? ` &nbsp; <b>Unvan:</b> ${kacir(personel.unvan)}` : ''}
        ${personel.birim ? ` &nbsp; <b>Birim:</b> ${kacir(personel.birim)}` : ''}</p>
      <table>
        <thead><tr><th>#</th><th>Malzeme</th><th>Demirbaş No</th><th>Seri No</th><th>Veriliş Tarihi</th><th>Açıklama</th></tr></thead>
        <tbody>${satirlar}</tbody>
      </table>
      <p>Yukarıda belirtilen malzemeleri sağlam ve çalışır durumda teslim aldım. Malzemelerin korunmasından ve
      görev sonunda eksiksiz iadesinden sorumlu olduğumu kabul ederim.</p>
      <div class="imzalar">
        <div>Teslim Eden<br>${kacir(teslimEden)}<br><br>İmza</div>
        <div>Teslim Alan<br>${kacir(personel.adSoyad)}<br><br>İmza</div>
      </div>
    </div>`;
  window.print();
}

async function tutanakAc(personelId, zimmetId) {
  const p = await api(`/personeller/${personelId}`);
  const liste = p.zimmetler.filter((z) => (zimmetId ? z.id === zimmetId : !z.iadeTarihi));
  if (!liste.length) return alert('Bu personelin üzerinde aktif zimmet yok.');
  tutanakYazdir(p, liste);
}

// ---------- CSV ----------
function csvIndir(dosyaAdi, basliklar, satirlar) {
  const hucre = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [basliklar, ...satirlar].map((s) => s.map(hucre).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = dosyaAdi;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- Ekranlar ----------
function zimmetSatirlari(liste, { personelGoster = true, malzemeGoster = true } = {}) {
  if (!liste.length) return `<tr><td colspan="7" class="bos">Kayıt yok.</td></tr>`;
  return liste
    .map(
      (z) => `<tr>
      ${malzemeGoster ? `<td><a class="bag" href="#/malzemeler/${z.malzemeId}">${kacir(malzemeEtiketi(z.malzeme))}</a>
        <div class="alt">${kacir(z.malzeme?.demirbasNo || '')}</div></td>` : ''}
      ${personelGoster ? `<td><a class="bag" href="#/personeller/${z.personelId}">${kacir(z.personel?.adSoyad || '(silinmiş)')}</a>
        <div class="alt">${kacir(z.personel?.birim || '')}</div></td>` : ''}
      <td>${tarih(z.verilisTarihi)}${z.teslimEden ? `<div class="alt">Veren: ${kacir(z.teslimEden)}</div>` : ''}</td>
      <td>${z.iadeTarihi ? tarih(z.iadeTarihi) + (z.iadeAlan ? `<div class="alt">Alan: ${kacir(z.iadeAlan)}</div>` : '') : rozet('zimmetli')}</td>
      <td class="alt">${kacir([z.aciklama, z.iadeAciklama].filter(Boolean).join(' / '))}</td>
      <td class="islemler">
        ${!z.iadeTarihi ? `<button class="kucuk" data-iade="${z.id}" data-ad="${kacir(z.malzeme?.ad || '')}">İade Al</button>` : ''}
        <button class="kucuk ikincil" data-tutanak="${z.id}" data-personel="${z.personelId}">Tutanak</button>
      </td>
    </tr>`
    )
    .join('');
}

function zimmetBaslik({ personelGoster = true, malzemeGoster = true } = {}) {
  return `<tr>${malzemeGoster ? '<th>Malzeme</th>' : ''}${personelGoster ? '<th>Personel</th>' : ''}
    <th>Veriliş</th><th>İade</th><th>Not</th><th></th></tr>`;
}

function zimmetIslemleriniBagla(kok) {
  kok.querySelectorAll('[data-iade]').forEach((b) => (b.onclick = () => iadeFormu(b.dataset.iade, b.dataset.ad)));
  kok.querySelectorAll('[data-tutanak]').forEach((b) => (b.onclick = () => tutanakAc(b.dataset.personel, b.dataset.tutanak)));
}

async function ozetEkrani() {
  const o = await api('/ozet');
  icerik.innerHTML = `
    <div class="baslik-satiri">
      <h1>Özet</h1>
      <div class="arac-cubugu">
        <button id="hizliZimmet">+ Zimmet Ver</button>
        <button class="ikincil" id="hizliMalzeme">+ Malzeme</button>
        <button class="ikincil" id="hizliPersonel">+ Personel</button>
      </div>
    </div>
    <div class="istatistikler">
      <div class="istatistik"><div class="deger">${o.malzemeSayisi}</div><div class="etiket">Toplam Malzeme</div></div>
      <div class="istatistik"><div class="deger">${o.zimmetli}</div><div class="etiket">Zimmetli</div></div>
      <div class="istatistik"><div class="deger">${o.depoda}</div><div class="etiket">Depoda</div></div>
      <div class="istatistik"><div class="deger">${o.arizali}</div><div class="etiket">Arızalı</div></div>
      <div class="istatistik"><div class="deger">${o.hurda}</div><div class="etiket">Hurda</div></div>
      <div class="istatistik"><div class="deger">${o.personelSayisi}</div><div class="etiket">Personel</div></div>
    </div>
    <div class="kart">
      <h2>Son Hareketler</h2>
      <div class="tablo-kap"><table><thead>${zimmetBaslik()}</thead><tbody>${zimmetSatirlari(o.sonHareketler)}</tbody></table></div>
    </div>`;
  $('#hizliZimmet').onclick = () => zimmetFormu();
  $('#hizliMalzeme').onclick = () => malzemeFormu();
  $('#hizliPersonel').onclick = () => personelFormu();
  zimmetIslemleriniBagla(icerik);
}

async function malzemelerEkrani() {
  const liste = await api('/malzemeler');
  icerik.innerHTML = `
    <div class="baslik-satiri">
      <h1>Malzemeler</h1>
      <div class="arac-cubugu">
        <input class="arama" id="ara" placeholder="Ad, demirbaş, seri no, kişi ara…">
        <select id="durumFiltre">
          <option value="">Tüm durumlar</option>
          ${Object.entries(DURUM_ADI).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
        <button class="ikincil" id="csv">CSV</button>
        <button id="yeni">+ Yeni Malzeme</button>
      </div>
    </div>
    <div class="kart tablo-kap">
      <table>
        <thead><tr><th>Malzeme</th><th>Kategori</th><th>Demirbaş / Seri No</th><th>Durum</th><th>Kimde</th><th></th></tr></thead>
        <tbody id="satirlar"></tbody>
      </table>
    </div>`;

  const filtrele = () => {
    const q = kucult($('#ara').value);
    const d = $('#durumFiltre').value;
    return liste.filter(
      (m) =>
        (!d || m.durum === d) &&
        (!q || kucult([m.ad, m.kategori, m.marka, m.model, m.seriNo, m.demirbasNo, m.aktifZimmet?.personelAd].join(' ')).includes(q))
    );
  };

  const ciz = () => {
    const f = filtrele();
    $('#satirlar').innerHTML = f.length
      ? f
          .map(
            (m) => `<tr>
          <td><a class="bag" href="#/malzemeler/${m.id}">${kacir(m.ad)}</a>
            <div class="alt">${kacir([m.marka, m.model].filter(Boolean).join(' '))}</div></td>
          <td>${kacir(m.kategori)}</td>
          <td>${kacir(m.demirbasNo)}<div class="alt">${kacir(m.seriNo)}</div></td>
          <td>${rozet(m.durum)}</td>
          <td>${m.aktifZimmet ? `<a class="bag" href="#/personeller/${m.aktifZimmet.personelId}">${kacir(m.aktifZimmet.personelAd)}</a>
            <div class="alt">${tarih(m.aktifZimmet.verilisTarihi)}</div>` : '—'}</td>
          <td class="islemler">
            ${m.durum === 'depoda' ? `<button class="kucuk" data-zimmet="${m.id}">Zimmet Ver</button>` : ''}
            ${m.aktifZimmet ? `<button class="kucuk" data-iade="${m.aktifZimmet.id}" data-ad="${kacir(m.ad)}">İade Al</button>` : ''}
            <button class="kucuk ikincil" data-duzenle="${m.id}">Düzenle</button>
            <button class="kucuk tehlike" data-sil="${m.id}">Sil</button>
          </td>
        </tr>`
          )
          .join('')
      : `<tr><td colspan="6" class="bos">${liste.length ? 'Eşleşen malzeme yok.' : 'Henüz malzeme eklenmedi.'}</td></tr>`;
    icerik.querySelectorAll('[data-zimmet]').forEach((b) => (b.onclick = () => zimmetFormu({ malzemeId: b.dataset.zimmet })));
    icerik.querySelectorAll('[data-duzenle]').forEach((b) => (b.onclick = () => malzemeFormu(liste.find((m) => m.id === b.dataset.duzenle))));
    icerik.querySelectorAll('[data-sil]').forEach(
      (b) => (b.onclick = () => onayla('Bu malzeme silinsin mi?', () => api(`/malzemeler/${b.dataset.sil}`, { method: 'DELETE' })))
    );
    zimmetIslemleriniBagla(icerik);
  };

  $('#ara').oninput = ciz;
  $('#durumFiltre').onchange = ciz;
  $('#yeni').onclick = () => malzemeFormu();
  $('#csv').onclick = () =>
    csvIndir(
      `malzemeler-${bugun()}.csv`,
      ['Malzeme', 'Kategori', 'Marka', 'Model', 'Demirbaş No', 'Seri No', 'Durum', 'Kimde', 'Veriliş Tarihi', 'Açıklama'],
      filtrele().map((m) => [m.ad, m.kategori, m.marka, m.model, m.demirbasNo, m.seriNo, DURUM_ADI[m.durum], m.aktifZimmet?.personelAd || '', m.aktifZimmet ? tarih(m.aktifZimmet.verilisTarihi) : '', m.aciklama])
    );
  ciz();
}

async function malzemeDetayEkrani(id) {
  const m = await api(`/malzemeler/${id}`);
  icerik.innerHTML = `
    <div class="baslik-satiri">
      <h1><a class="bag" href="#/malzemeler">Malzemeler</a> / ${kacir(m.ad)} ${rozet(m.durum)}</h1>
      <div class="arac-cubugu">
        ${m.durum === 'depoda' ? '<button id="zimmetVer">Zimmet Ver</button>' : ''}
        ${m.aktifZimmet ? '<button id="iadeAl">İade Al</button>' : ''}
        <button class="ikincil" id="duzenle">Düzenle</button>
      </div>
    </div>
    <div class="kart detay-bilgi">
      <div><span>Kategori</span>${kacir(m.kategori || '—')}</div>
      <div><span>Marka / Model</span>${kacir([m.marka, m.model].filter(Boolean).join(' ') || '—')}</div>
      <div><span>Demirbaş No</span>${kacir(m.demirbasNo || '—')}</div>
      <div><span>Seri No</span>${kacir(m.seriNo || '—')}</div>
      <div><span>Şu an kimde</span>${m.aktifZimmet ? kacir(m.aktifZimmet.personelAd) : '—'}</div>
      <div><span>Açıklama</span>${kacir(m.aciklama || '—')}</div>
    </div>
    <div class="kart">
      <h2>Zimmet Geçmişi</h2>
      <div class="tablo-kap"><table><thead>${zimmetBaslik({ malzemeGoster: false })}</thead>
      <tbody>${zimmetSatirlari(m.gecmis, { malzemeGoster: false })}</tbody></table></div>
    </div>`;
  if ($('#zimmetVer')) $('#zimmetVer').onclick = () => zimmetFormu({ malzemeId: m.id });
  if ($('#iadeAl')) $('#iadeAl').onclick = () => iadeFormu(m.aktifZimmet.id, m.ad);
  $('#duzenle').onclick = () => malzemeFormu(m);
  zimmetIslemleriniBagla(icerik);
}

async function personellerEkrani() {
  const liste = await api('/personeller');
  icerik.innerHTML = `
    <div class="baslik-satiri">
      <h1>Personel</h1>
      <div class="arac-cubugu">
        <input class="arama" id="ara" placeholder="Ad, sicil, birim ara…">
        <button id="yeni">+ Yeni Personel</button>
      </div>
    </div>
    <div class="kart tablo-kap">
      <table>
        <thead><tr><th>Ad Soyad</th><th>Sicil No</th><th>Birim</th><th>Unvan</th><th>Telefon</th><th>Aktif Zimmet</th><th></th></tr></thead>
        <tbody id="satirlar"></tbody>
      </table>
    </div>`;

  const ciz = () => {
    const q = kucult($('#ara').value);
    const f = liste.filter((p) => !q || kucult([p.adSoyad, p.sicilNo, p.birim, p.unvan, p.telefon].join(' ')).includes(q));
    $('#satirlar').innerHTML = f.length
      ? f
          .map(
            (p) => `<tr>
          <td><a class="bag" href="#/personeller/${p.id}">${kacir(p.adSoyad)}</a></td>
          <td>${kacir(p.sicilNo)}</td><td>${kacir(p.birim)}</td><td>${kacir(p.unvan)}</td><td>${kacir(p.telefon)}</td>
          <td>${p.zimmetSayisi}</td>
          <td class="islemler">
            <button class="kucuk" data-zimmet="${p.id}">Zimmet Ver</button>
            <button class="kucuk ikincil" data-duzenle="${p.id}">Düzenle</button>
            <button class="kucuk tehlike" data-sil="${p.id}">Sil</button>
          </td>
        </tr>`
          )
          .join('')
      : `<tr><td colspan="7" class="bos">${liste.length ? 'Eşleşen personel yok.' : 'Henüz personel eklenmedi.'}</td></tr>`;
    icerik.querySelectorAll('[data-zimmet]').forEach((b) => (b.onclick = () => zimmetFormu({ personelId: b.dataset.zimmet })));
    icerik.querySelectorAll('[data-duzenle]').forEach((b) => (b.onclick = () => personelFormu(liste.find((p) => p.id === b.dataset.duzenle))));
    icerik.querySelectorAll('[data-sil]').forEach(
      (b) => (b.onclick = () => onayla('Bu personel silinsin mi?', () => api(`/personeller/${b.dataset.sil}`, { method: 'DELETE' })))
    );
  };
  $('#ara').oninput = ciz;
  $('#yeni').onclick = () => personelFormu();
  ciz();
}

async function personelDetayEkrani(id) {
  const p = await api(`/personeller/${id}`);
  const aktif = p.zimmetler.filter((z) => !z.iadeTarihi);
  const gecmis = p.zimmetler.filter((z) => z.iadeTarihi);
  icerik.innerHTML = `
    <div class="baslik-satiri">
      <h1><a class="bag" href="#/personeller">Personel</a> / ${kacir(p.adSoyad)}</h1>
      <div class="arac-cubugu">
        <button id="zimmetVer">Zimmet Ver</button>
        ${aktif.length ? '<button class="ikincil" id="tutanak">Tüm Zimmetler İçin Tutanak</button>' : ''}
        <button class="ikincil" id="duzenle">Düzenle</button>
      </div>
    </div>
    <div class="kart detay-bilgi">
      <div><span>Sicil No</span>${kacir(p.sicilNo || '—')}</div>
      <div><span>Birim</span>${kacir(p.birim || '—')}</div>
      <div><span>Unvan</span>${kacir(p.unvan || '—')}</div>
      <div><span>Telefon</span>${kacir(p.telefon || '—')}</div>
    </div>
    <div class="kart">
      <h2>Üzerindeki Malzemeler (${aktif.length})</h2>
      <div class="tablo-kap"><table><thead>${zimmetBaslik({ personelGoster: false })}</thead>
      <tbody>${zimmetSatirlari(aktif, { personelGoster: false })}</tbody></table></div>
    </div>
    <div class="kart">
      <h2>İade Edilenler (${gecmis.length})</h2>
      <div class="tablo-kap"><table><thead>${zimmetBaslik({ personelGoster: false })}</thead>
      <tbody>${zimmetSatirlari(gecmis, { personelGoster: false })}</tbody></table></div>
    </div>`;
  $('#zimmetVer').onclick = () => zimmetFormu({ personelId: p.id });
  if ($('#tutanak')) $('#tutanak').onclick = () => tutanakYazdir(p, aktif);
  $('#duzenle').onclick = () => personelFormu(p);
  zimmetIslemleriniBagla(icerik);
}

async function zimmetlerEkrani() {
  const liste = await api('/zimmetler');
  icerik.innerHTML = `
    <div class="baslik-satiri">
      <h1>Zimmetler</h1>
      <div class="arac-cubugu">
        <input class="arama" id="ara" placeholder="Malzeme, kişi, demirbaş ara…">
        <select id="durumFiltre">
          <option value="aktif">Aktif zimmetler</option>
          <option value="iade">İade edilenler</option>
          <option value="">Tümü</option>
        </select>
        <button class="ikincil" id="csv">CSV</button>
        <button id="yeni">+ Zimmet Ver</button>
      </div>
    </div>
    <div class="kart tablo-kap">
      <table><thead>${zimmetBaslik()}</thead><tbody id="satirlar"></tbody></table>
    </div>`;

  const filtrele = () => {
    const q = kucult($('#ara').value);
    const d = $('#durumFiltre').value;
    return liste.filter(
      (z) =>
        (!d || (d === 'aktif' ? !z.iadeTarihi : !!z.iadeTarihi)) &&
        (!q ||
          kucult([z.malzeme?.ad, z.malzeme?.marka, z.malzeme?.model, z.malzeme?.demirbasNo, z.malzeme?.seriNo, z.personel?.adSoyad, z.personel?.birim, z.aciklama].join(' ')).includes(q))
    );
  };
  const ciz = () => {
    $('#satirlar').innerHTML = zimmetSatirlari(filtrele());
    zimmetIslemleriniBagla(icerik);
  };
  $('#ara').oninput = ciz;
  $('#durumFiltre').onchange = ciz;
  $('#yeni').onclick = () => zimmetFormu();
  $('#csv').onclick = () =>
    csvIndir(
      `zimmetler-${bugun()}.csv`,
      ['Malzeme', 'Demirbaş No', 'Seri No', 'Personel', 'Sicil No', 'Birim', 'Veriliş Tarihi', 'Teslim Eden', 'İade Tarihi', 'İade Alan', 'Açıklama', 'İade Açıklaması'],
      filtrele().map((z) => [
        malzemeEtiketi(z.malzeme), z.malzeme?.demirbasNo, z.malzeme?.seriNo, z.personel?.adSoyad, z.personel?.sicilNo, z.personel?.birim,
        tarih(z.verilisTarihi), z.teslimEden, z.iadeTarihi ? tarih(z.iadeTarihi) : '', z.iadeAlan, z.aciklama, z.iadeAciklama,
      ])
    );
  ciz();
}

// ---------- Yönlendirme ----------
async function yonlendir() {
  const parcalar = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [sekme = 'ozet', id] = parcalar;
  document.querySelectorAll('.ust nav a').forEach((a) => a.classList.toggle('aktif', a.dataset.sekme === sekme));
  try {
    if (sekme === 'malzemeler') await (id ? malzemeDetayEkrani(id) : malzemelerEkrani());
    else if (sekme === 'personeller') await (id ? personelDetayEkrani(id) : personellerEkrani());
    else if (sekme === 'zimmetler') await zimmetlerEkrani();
    else await ozetEkrani();
  } catch (err) {
    icerik.innerHTML = `<div class="kart bos">${kacir(err.message)}</div>`;
  }
}

window.addEventListener('hashchange', yonlendir);
yonlendir();
