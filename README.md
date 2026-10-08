# Zimmet Takip

Personele zimmetlenen malzemelerin (demirbaş) kaydını tutan basit web uygulaması.
Ek paket gerektirmez; yalnızca Node.js (18+) yeterlidir.

## Özellikler

- **Malzemeler**: ad, kategori, marka, model, demirbaş no (benzersiz), seri no, açıklama.
  Durumlar: Depoda, Zimmetli, Arızalı, Hurda.
- **Personel**: ad soyad, sicil no, birim, unvan, telefon.
- **Zimmet ver**: depodaki bir malzemeyi tarih, teslim eden ve not ile personele zimmetle.
- **İade al**: iade tarihi, iadeyi alan kişi ve malzemenin iade sonrası durumu (sağlam / arızalı / hurda).
- Her malzemenin ve her personelin **zimmet geçmişi**.
- Yazdırılabilir **zimmet teslim tutanağı** (imza alanlı).
- Arama, durum filtresi ve Excel'de açılabilen **CSV dışa aktarma**.
- Geçmişi olan kayıtlar yanlışlıkla silinemez.

## Çalıştırma

```bash
npm start
```

Tarayıcıda <http://localhost:3000> adresini açın.

| Ortam değişkeni | Varsayılan       | Açıklama                  |
|-----------------|------------------|---------------------------|
| `PORT`          | `3000`           | Sunucu portu              |
| `DATA_FILE`     | `data/veri.json` | Verilerin tutulduğu dosya |

## Veriler ve yedek

Tüm kayıtlar `data/veri.json` dosyasında saklanır. Yedek almak için bu dosyayı kopyalamanız
yeterlidir (ya da <http://localhost:3000/api/yedek> adresinden indirin).

## Test

```bash
npm test
```
