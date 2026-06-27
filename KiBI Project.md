# KiBI — Ürün ve Arayüz Yapısı

> Bu doküman, KiBI'nin mevcut özellik setini ve bilgi mimarisini bir arayüz/deneyim
> tasarımı çalışmasına temel oluşturması için özetler. Teknik uygulama detayları (API,
> veritabanı) kasıtlı olarak dışarıda tutuldu — odak; kullanıcı kimdir, hangi ekranlarla
> karşılaşır, her ekranda ne görür ve ne yapabilir.

---

## 1. Ürün Nedir

**KiBI (Ki Business Intelligence)**, küçük/orta ölçekli işletmeler için **AI-native, çok
kiracılı (multi-tenant)** bir iş yönetim platformu. Zoho / Salesforce / SAP / Odoo gibi
büyük, parçalı ve karmaşık rakiplerin aksine; **tek bir bağlı sistemde** CRM + ERP +
Muhasebe sunar, çekirdeğinde yapay zeka asistanı barındırır ve sektörel ihtiyaçları
tek-tık aktive edilebilen ek modüllerle çözer.

### Konumlandırma katmanları
1. **Base (ücretsiz, her hesapta dahil):** CRM + ERP + Muhasebe & Faturalama — birbirine
   bağlı, tek bir veri modeli üzerinde. KiBI AI tamamen kapalı olsa bile Base'in tamamı
   eksiksiz çalışır.
2. **KiBI AI (Premium yükseltme):** Şirketin kendi CRM/ERP/Muhasebe verisini okuyan,
   karar-destek sunan yapay zeka asistanı (sohbet arayüzü).
3. **Native Ek Modüller (ayrı ücretli, tek tık aktivasyon):** Müşteri Hizmetleri, Sevkiyat,
   E-Ticaret, Marketing, Etkinlik Yönetimi, Personel Yönetimi.
4. **Agentic Platform Katmanı (yeni):** Şirketlerin platformu kod yazmadan kendi
   ihtiyaçlarına göre **uyarlayabildiği** bir alt katman — özel alanlar, otomasyon kuralları,
   onay akışları, özel fonksiyonlar, sektörel şablonlar.

### Hedef kullanıcı
- **Şirket sahibi / genel müdür ("entity_main"):** Tüm sisteme erişir, ek modülleri aktive
  eder, şablon uygular, ekip davet eder, faturalandırmayı yönetir.
- **Departman çalışanı (satış temsilcisi, destek temsilcisi, depo personeli vb.):**
  Kendi sorumluluğundaki CRM/ERP/Destek kayıtlarıyla çalışır; rol kısıtlı görünürlüğe sahip
  olabilir (yalnızca kendi oluşturduğu kayıtları görür/düzenler).
  Bu, ileride gerçek bir takım/yönetici hiyerarşisi eklenebilecek iki kademeli bir
  görünürlük modelidir ("kendi kayıtların" / "hepsi").
- **Platform yöneticisi (KiBI'nin kendi ekibi, "admin"/"supervisor"):** Tüm tenant'ları,
  faturalandırmayı, model/AI yapılandırmasını yönetir — ayrı bir admin paneli üzerinden.

---

## 2. Mevcut Görsel Kimlik (referans, değiştirilebilir)

- **Tema adı:** "Aurora Glass" — yarı saydam (glassmorphism) kart yüzeyleri, yumuşak
  gradyanlar, koyu/açık mod desteği (kullanıcı tercihiyle anlık geçiş).
- **Ana renkler:** Teal `#26A69A` (ana vurgu), Mint `#7DD3C0` (ikincil vurgu),
  Forest `#2D8A6B` (koyu vurgu). Gradyanlar genelde `teal → forest` 135° açıyla.
- **Yazı tipi rengi katmanları:** başlık (koyu/yüksek kontrast), gövde (orta), yardımcı
  metin (düşük kontrast) — üç kademeli bir hiyerarşi.
- **Yüzeyler:** `blur(20–30px)` arka plan bulanıklığıyla yarı saydam paneller; modal/diyalog
  içerikleri okunabilirlik için OPAK yüzey kullanır (saydam yüzeyler koyu modda neredeyse
  görünmez hale geliyor — bilinen bir tuzak).
- **Bileşen dili:** Yuvarlatılmış köşeler (büyük radius — kart/buton/inputlarda 2xl-3xl),
  sol kenarlıklı aktif-link vurgusu, rozet/etiket (badge) kullanımı durum göstermek için
  (örn. anlaşma aşaması, kayıt eşleşme tipi, fonksiyon çalıştırma durumu).
- **Mevcut sınırlama:** Bazı yeni eklenen sayfalar (aşağıda işaretli) sabit koyu renk
  paleti kullanıyor, tema değişkenlerine henüz tam taşınmadı — bu bir tasarım fırsatı.

---

## 3. Bilgi Mimarisi (Sol Menü / Navigasyon)

Uygulama girişten sonra (`/app/...`) sol tarafta sabit bir navigasyon ile çalışır.
Üstte bildirim çanı + kullanıcı menüsü, koyu/açık mod anahtarı yer alır.

```
Dashboard
CRM                          ← Base: kişiler, firmalar, fırsatlar, aktiviteler
ERP                          ← Base: ürün, stok, tedarikçi, sipariş
Blueprint                    ← Otomasyon: durum geçiş kuralları + onay kuyruğu
Fonksiyonlar                 ← Otomasyon: özel kod parçacıkları (kural motorundan tetiklenir)
Alan Yöneticisi              ← Özelleştirme: modüllere özel alan ekleme
İçe Aktarma                  ← Veri: CSV/Excel'den kişi aktarımı (eşleşme tespitli)
Sektörel Şablonlar            ← Onboarding: sektöre özel hazır paket uygulama
CRM Bağlantıları (alt menü)   ← Harici sistemlerden veri çekme (eski CRM/ERP entegrasyonu)
Muhasebe (alt menü)            ← Base: özet, faturalar, ödemeler, kişiler, giderler, raporlar
── Ek Modüller ──
Müşteri Hizmetleri            ← Ticket/destek, SLA takibi
Sevkiyat                      ← Kurye, depo çıkış, teslimat
E-Ticaret                     ← Pazaryeri entegrasyonu, sipariş senkronu
Marketing                     ← E-posta kampanyası, sosyal medya takvimi
Etkinlikler                   ← Etkinlik/bilet/mekan yönetimi
Personel                      ← Personel, bordro, devam takibi
──
Dosyalar                      ← Dosya/doküman yönetimi
KIBI AI                       ← Premium: genel AI sohbet asistanı
Entity AI                     ← Premium: şirkete özel AI talimatları/asistan
Destek                        ← KiBI platformuyla ilgili destek talepleri
Ki Wallet                     ← Bakiye, kullanım/fatura geçmişi
Ayarlar                       ← Hesap, ekip, entegrasyon, e-posta ayarları
── (yalnızca platform admini) ──
Platform Management / Platform Settings / KIBI Chat
```

---

## 4. Modül Detayları

### 4.1 Dashboard
İlk giriş ekranı. İçerik:
- **Onboarding kontrol listesi** (yeni hesaplar için): CRM bağlantısı ekle, e-posta kanalı
  kur, ekip üyesi davet et, Entity AI'ı yapılandır — her biri tamamlanma durumuna göre
  işaretli, tıklanınca ilgili ekrana yönlendirir.
- **KPI kartları:** CRM bağlantı sayısı, açık destek talebi sayısı, aylık AI konuşma sayısı,
  depolama kullanımı (X/Y MB).
- **AI aktivite grafiği:** Kategoriye göre (destek/satış/bilgi/genel) konuşma dağılımı.
- **AI günlük özet:** bugünkü konuşma sayısı, insana yönlendirilen sayısı, bilgi
  bankasına eklenen içerik sayısı.

### 4.2 CRM (Base)
Sekmeli yapı: **Kişiler / Firmalar / Fırsatlar / Aktiviteler**.
- Her sekme: arama/filtre + tablo listesi + "Yeni Ekle" modalı + satır başı düzenle/sil.
- **Kişiler:** ad, e-posta, firma, kişi tipi (lead/müşteri/partner/tedarikçi) rozetiyle.
- **Fırsatlar:** başlık, aşama (rozet renkli: yeni/nitelikli/teklif/pazarlık/kazanıldı/
  kaybedildi), değer, beklenen kapanış tarihi. Aşama değişimleri **Blueprint** kurallarına
  tabi olabilir (bkz. 4.4) — bazı geçişler engellenebilir veya yönetici onayı isteyebilir.
- **Aktiviteler:** tip (arama/e-posta/toplantı/görev/not/demo), ilişkili fırsat, vade tarihi.
- Formlar **alan setine göre dinamik** üretilir — bir şirket özel alan eklediğinde (bkz.
  4.6) o alan otomatik olarak ilgili formda belirir; bazı alanlar başka bir alanın değerine
  göre **koşullu görünür/zorunlu** olabilir (örn. "Kişi Tipi = Müşteri" ise "Firma Adı"
  zorunlu hale gelir).
- Bazı alanlar **AI tarafından otomatik doldurulur** (örn. kayıt özeti) — bu alanlar formda
  salt-okunur/"AI tarafından dolduruluyor" ifadesiyle gösterilir.

### 4.3 ERP (Base)
Ürün, stok hareketi, depo, tedarikçi, sipariş yönetimi — CRM ile aynı liste+modal deseni.

### 4.4 Blueprint (Otomasyon — durum makinesi)
Bir alanın (örn. fırsat aşaması) hangi değerden hangi değere geçebileceğini tanımlar.
İki bölüm:
- **Tanımlı Geçişler tablosu:** modül, alan, başlangıç→hedef durum, opsiyonel koşul
  (örn. "anlaşma değeri > 0"), opsiyonel onay rolü. Yeni geçiş ekleme formu.
- **Onay Bekleyenler kutusu:** onay gerektiren bir geçiş denendiğinde burada "beklemede"
  olarak görünür; onayla/reddet aksiyonları.
- Önemli davranış: bir alan için **herhangi bir geçiş** tanımlandığı anda, o alan üzerinde
  tanımlanmamış HER geçiş engellenir (örn. sadece "Yeni→Nitelikli" tanımlıysa,
  "Nitelikli→Kazanıldı" da reddedilir, ta ki o da tanımlanana kadar). Bu, kullanıcıya
  net şekilde anlatılması gereken bir davranış.

### 4.5 Fonksiyonlar (Otomasyon — özel kod)
İleri seviye kullanıcılar için: kısa JavaScript kod parçacıkları yazıp kaydetme.
- **Fonksiyon listesi** + yeni fonksiyon formu (ad + kod editörü).
- **Test Çalıştır paneli:** seçili fonksiyona örnek girdi (JSON) verip anında sonuç/log
  görme.
- **Çalıştırma geçmişi:** her çalıştırmanın başarı/hata durumu, süresi, tetikleyen olay.
- Fonksiyonlar otomasyon kurallarından (Blueprint'e benzer ama kayıt değişikliklerinde
  tetiklenen arka plan kuralları) çağrılabilir — yani bir kayıt oluşturulduğunda/
  güncellendiğinde otomatik çalışabilir.

### 4.6 Alan Yöneticisi (Özelleştirme)
Bir CRM modülüne (kişiler/firmalar/fırsatlar/aktiviteler) özel alan ekleme arayüzü:
- Modül seçici + "anahtar / etiket / tip (metin, sayı, tarih, evet-hayır, seçim listesi,
  ilişki, AI) / zorunlu mu" formu.
- Sıralanabilir liste (yukarı/aşağı oklarla alan sırası değiştirme).
- Sistem alanları (firma adına gelen hazır alanlar) silinemez, sadece kullanıcı eklediği
  özel alanlar silinebilir — listede "Sistem / Özel" rozetiyle ayrışır.

### 4.7 İçe Aktarma (Onboarding/Veri)
CSV/Excel dosyasından kişi aktarma:
1. Dosya yükle → önizleme tablosu: her satır için **Birebir Eşleşme / Olası Eşleşme / Yeni
   Kayıt** rozeti (e-posta birebir eşleşirse veya ad+firma benzerse otomatik tespit).
2. Her satır için aksiyon seçimi: Yeni Oluştur / Mevcutla Birleştir / Atla (varsayılan,
   eşleşme tipine göre otomatik öneriliyor).
3. "İçe Aktar" → sonuç özeti (oluşturulan/birleştirilen/atlanan sayısı).

### 4.8 Sektörel Şablonlar (Onboarding)
Hazır sektör paketleri (örn. E-Ticaret, Danışmanlık/Ajans, B2B Hizmet) — her biri "Uygula"
butonuyla tek tıkla ilgili özel alanları, durum geçiş kurallarını ve otomasyon kurallarını
hesaba ekler. Uygulama sonrası "X alan, Y geçiş kuralı, Z otomasyon eklendi" özeti gösterir.

### 4.9 Muhasebe (Base)
Sekmeler: Özet, Faturalar, Ödemeler, Kişiler, Giderler, Raporlar, Entegrasyonlar.

### 4.10 Ek Modüller (entitlement'a bağlı, tek tık aktivasyon)
Her biri nav'da her zaman görünür (keşfedilebilir olması için), ama satın alınmadıysa
ekran içinde "Etkinleştir" çağrısı (CTA) gösterir:
- **Müşteri Hizmetleri:** Ticket listesi, SLA politikaları, müşteri mesajlaşması.
- **Sevkiyat:** Kurye atama, sevkiyat takibi, depo çıkış süreci.
- **E-Ticaret:** Pazaryeri bağlantıları, ürün listeleme, sipariş senkronu.
- **Marketing:** E-posta kampanyası oluşturma, sosyal medya gönderi takvimi.
- **Etkinlikler:** Etkinlik/mekan/bilet/katılımcı yönetimi.
- **Personel:** Personel kayıtları, devam takibi, bordro.

### 4.11 Dosyalar
Genel dosya/doküman yükleme ve yönetimi (sürükle-bırak yükleme, ilerleme göstergesi).

### 4.12 KIBI AI / Entity AI (Premium)
- **KIBI AI:** Genel amaçlı sohbet arayüzü — platformla ilgili sorular, genel yardım.
- **Entity AI:** Şirkete özel yapay zeka — şirketin kendi CRM/ERP/Muhasebe verisini
  okuyarak soruları yanıtlar, öneride bulunur. Şirkete özel "talimat" tanımlanabilir.
- Bu modüller satın alınmadıysa (entitlement yoksa) nav'dan görsel olarak gizlenir/soluk
  gösterilir (asıl erişim kısıtı arka planda uygulanır, bu sadece kozmetik bir ipucu).

### 4.13 Destek
KiBI platformuyla ilgili (müşterinin kendi müşterileriyle ilgili değil) destek taleplerini
oluşturma/takip etme.

### 4.14 Ki Wallet
Bakiye görüntüleme, kullanım geçmişi, fatura/ödeme geçmişi.

### 4.15 Ayarlar
Hesap bilgileri, ekip üyesi davet/yönetim, e-posta (SMTP/IMAP) yapılandırması, entegrasyon
ayarları.

### 4.16 Platform Yönetimi (yalnızca KiBI admini görür)
Tüm tenant'ların listesi/yönetimi, platform geneli ayarlar, AI model yapılandırması,
KIBI Chat (platform içi sohbet/destek aracı).

---

## 5. Kritik Kullanıcı Akışları

### 5.1 Yeni şirket kaydı → operasyonel olma
1. Kayıt → Dashboard'daki onboarding kontrol listesi.
2. **Sektörel Şablonlar**'dan sektör seçip uygula (özel alanlar + kurallar otomatik gelir).
3. **İçe Aktarma**'dan mevcut müşteri listesini CSV ile yükle (eşleşme kontrolüyle).
4. Gerekirse **Alan Yöneticisi**'nden ek özel alanlar ekle.
5. CRM'e geç, çalışmaya başla.
→ Tasarım notu: bu üç adım şu an birbirinden bağımsız sayfalarda; tek bir yönlendirmeli
sihirbaz (wizard) akışına dönüştürülmesi güçlü bir UX iyileştirme fırsatı.

### 5.2 Satış temsilcisinin günlük kullanımı
Kendi fırsatlarını/kişilerini görür (rol kısıtlıysa sadece kendi oluşturduklarını), bir
fırsatı ilerletmeye çalışır → Blueprint kuralı bazı geçişleri engelleyebilir veya yönetici
onayına gönderebilir ("beklemede" durumu kullanıcıya net gösterilmeli).

### 5.3 Yöneticinin otomasyon kurması
Blueprint'te bir geçiş kuralı tanımlar (örn. "Pazarlık→Kazanıldı" değer>0 koşuluyla +
yönetici onayı) → Fonksiyonlar'da basit bir özel kod yazıp test eder → bu fonksiyonu bir
otomasyon kuralına bağlar (örn. "yeni fırsat oluşunca çalıştır").

### 5.4 Yöneticinin onay vermesi
Blueprint sayfasındaki "Onay Bekleyenler" listesinden bir geçişi onaylar/reddeder —
bu genelde bildirim/rozet ile dikkat çekmesi gereken bir akış (şu an ayrı bir bildirim
entegrasyonu yok, sayfaya gidip görmek gerekiyor — tasarım fırsatı: bildirim çanına
entegre etmek).

---

## 6. Roller ve Görünürlük

- **Platform admini / supervisor:** Her şeyi görür, kısıt yok.
- **Şirket sahibi (entity_main / entity_supervisor):** Kendi şirketinde her şeyi görür.
- **Diğer tüm roller (örn. çalışan):** CRM kayıtlarında sadece **kendi oluşturduğu**
  kayıtları görür/düzenler/siler — başka birinin kaydını id ile bilse bile değiştiremez.
  *(Not: şu an "takım" kavramı yok — yönetici kendi ekibinin kayıtlarını ayrıca görme
  yetkisine henüz sahip değil, sadece kendisi veya hepsi. Gelecekte eklenebilecek bir
  ekip/yönetici hiyerarşisi, arayüzde "Benim / Ekibim / Hepsi" gibi bir filtre olarak
  tasarlanabilir.)*

---

## 7. Tasarım İçin Genel Notlar

- **Veri yoğunluğu yüksek:** Çoğu ekran tablo + modal deseni kullanıyor; büyük veri
  setlerinde (yüzlerce kayıt) arama/filtre/sayfalama deneyimi güçlendirilebilir.
  Bazı listeler şu an istemci tarafında sayfalama yapmıyor (özellikle yeni eklenen
  Fonksiyonlar/Blueprint sayfaları) — tasarımda bu skaler ekran düzenleri planlanmalı.
- **Boş durumlar (empty states):** Şu an çoğunlukla tek satır metin ("Kayıt bulunamadı").
  Onboarding'e yakın ekranlarda (CRM, İçe Aktarma, Sektörel Şablonlar) daha yönlendirici
  boş durum tasarımları güçlü bir kazanç olur.
- **Durum/rozet dili tutarlı olmalı:** Fırsat aşaması, kayıt eşleşme tipi, fonksiyon
  çalıştırma durumu, onay durumu gibi pek çok yerde renkli rozetler kullanılıyor — bunlar
  için tek bir tutarlı renk/anlam sistemi (başarı/uyarı/bekleme/hata) faydalı olur.
- **Mobil/dar ekran:** Sol menü genişliği ve tablo-ağırlıklı ekranlar mobilde zorlanıyor
  olabilir — responsive davranış tasarımda öncelikli ele alınmalı.
- **Yeni özellikler henüz "keşfedilebilir" değil:** Blueprint, Fonksiyonlar, Alan
  Yöneticisi gibi güçlü ama teknik hissettiren özellikler için kullanıcıyı yönlendiren
  (örn. örnek şablonlar, ilk kullanım turu) bir deneyim tasarımı önemli bir fırsat alanı.
