const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zimmet-')), 'veri.json');
const { sunucu } = require('../server');

let taban;
before(() => new Promise((r) => sunucu.listen(0, () => { taban = `http://localhost:${sunucu.address().port}/api`; r(); })));
after(() => sunucu.close());

async function istek(yol, method = 'GET', govde) {
  const res = await fetch(taban + yol, {
    method,
    headers: govde ? { 'Content-Type': 'application/json' } : undefined,
    body: govde ? JSON.stringify(govde) : undefined,
  });
  return { status: res.status, veri: await res.json() };
}

test('zimmet verme ve iade akışı', async () => {
  const p = (await istek('/personeller', 'POST', { adSoyad: 'Ayşe Yılmaz', birim: 'Bilgi İşlem' })).veri;
  const m = (await istek('/malzemeler', 'POST', { ad: 'Dizüstü Bilgisayar', demirbasNo: 'DB-001' })).veri;
  assert.equal(m.durum, 'depoda');

  const z = await istek('/zimmetler', 'POST', { malzemeId: m.id, personelId: p.id, verilisTarihi: '2026-01-10' });
  assert.equal(z.status, 201);
  assert.equal((await istek(`/malzemeler/${m.id}`)).veri.durum, 'zimmetli');

  // Zimmetli malzeme ikinci kez verilemez
  assert.equal((await istek('/zimmetler', 'POST', { malzemeId: m.id, personelId: p.id })).status, 409);
  // Zimmet geçmişi olan kayıtlar silinemez
  assert.equal((await istek(`/personeller/${p.id}`, 'DELETE')).status, 409);

  // İade tarihi verilişten önce olamaz
  assert.equal((await istek(`/zimmetler/${z.veri.id}/iade`, 'POST', { iadeTarihi: '2026-01-01' })).status, 400);
  const iade = await istek(`/zimmetler/${z.veri.id}/iade`, 'POST', { iadeTarihi: '2026-02-01', malzemeDurumu: 'arizali' });
  assert.equal(iade.status, 201);
  assert.equal((await istek(`/malzemeler/${m.id}`)).veri.durum, 'arizali');

  const ozet = (await istek('/ozet')).veri;
  assert.equal(ozet.arizali, 1);
  assert.equal(ozet.zimmetli, 0);
});

test('doğrulamalar', async () => {
  assert.equal((await istek('/personeller', 'POST', { adSoyad: '  ' })).status, 400);
  await istek('/malzemeler', 'POST', { ad: 'Telefon', demirbasNo: 'TEL-1' });
  assert.equal((await istek('/malzemeler', 'POST', { ad: 'Telefon 2', demirbasNo: 'tel-1' })).status, 409);
});

test('veriler dosyaya kaydedilir', () => {
  const veri = JSON.parse(fs.readFileSync(process.env.DATA_FILE, 'utf8'));
  assert.ok(veri.malzemeler.length >= 2);
});
