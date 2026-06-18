// Static ülke / il listesi + telefon kodu + vergi no etiketi verileri.
// Harici API/servis bağımlılığı yok (Google Places yerine statik arama kutusu).

export interface CountryDef {
  code:     string  // ISO 3166-1 alpha-2
  name:     string
  dialCode: string  // e.g. '+90'
}

export const COUNTRIES: CountryDef[] = [
  { code: 'TR', name: 'Türkiye',                dialCode: '+90' },
  { code: 'US', name: 'Amerika Birleşik Devletleri', dialCode: '+1' },
  { code: 'GB', name: 'Birleşik Krallık',        dialCode: '+44' },
  { code: 'DE', name: 'Almanya',                 dialCode: '+49' },
  { code: 'FR', name: 'Fransa',                  dialCode: '+33' },
  { code: 'NL', name: 'Hollanda',                dialCode: '+31' },
  { code: 'BE', name: 'Belçika',                  dialCode: '+32' },
  { code: 'CH', name: 'İsviçre',                  dialCode: '+41' },
  { code: 'AT', name: 'Avusturya',                dialCode: '+43' },
  { code: 'IT', name: 'İtalya',                   dialCode: '+39' },
  { code: 'ES', name: 'İspanya',                  dialCode: '+34' },
  { code: 'PT', name: 'Portekiz',                 dialCode: '+351' },
  { code: 'GR', name: 'Yunanistan',               dialCode: '+30' },
  { code: 'BG', name: 'Bulgaristan',              dialCode: '+359' },
  { code: 'RO', name: 'Romanya',                  dialCode: '+40' },
  { code: 'PL', name: 'Polonya',                  dialCode: '+48' },
  { code: 'CZ', name: 'Çekya',                    dialCode: '+420' },
  { code: 'SE', name: 'İsveç',                    dialCode: '+46' },
  { code: 'NO', name: 'Norveç',                   dialCode: '+47' },
  { code: 'DK', name: 'Danimarka',                dialCode: '+45' },
  { code: 'FI', name: 'Finlandiya',               dialCode: '+358' },
  { code: 'IE', name: 'İrlanda',                  dialCode: '+353' },
  { code: 'RU', name: 'Rusya',                    dialCode: '+7' },
  { code: 'UA', name: 'Ukrayna',                  dialCode: '+380' },
  { code: 'AZ', name: 'Azerbaycan',               dialCode: '+994' },
  { code: 'GE', name: 'Gürcistan',                dialCode: '+995' },
  { code: 'AE', name: 'Birleşik Arap Emirlikleri', dialCode: '+971' },
  { code: 'SA', name: 'Suudi Arabistan',          dialCode: '+966' },
  { code: 'QA', name: 'Katar',                    dialCode: '+974' },
  { code: 'KW', name: 'Kuveyt',                   dialCode: '+965' },
  { code: 'IL', name: 'İsrail',                   dialCode: '+972' },
  { code: 'EG', name: 'Mısır',                    dialCode: '+20' },
  { code: 'ZA', name: 'Güney Afrika',              dialCode: '+27' },
  { code: 'NG', name: 'Nijerya',                  dialCode: '+234' },
  { code: 'IN', name: 'Hindistan',                dialCode: '+91' },
  { code: 'PK', name: 'Pakistan',                 dialCode: '+92' },
  { code: 'CN', name: 'Çin',                      dialCode: '+86' },
  { code: 'JP', name: 'Japonya',                  dialCode: '+81' },
  { code: 'KR', name: 'Güney Kore',                dialCode: '+82' },
  { code: 'SG', name: 'Singapur',                 dialCode: '+65' },
  { code: 'AU', name: 'Avustralya',                dialCode: '+61' },
  { code: 'NZ', name: 'Yeni Zelanda',             dialCode: '+64' },
  { code: 'CA', name: 'Kanada',                   dialCode: '+1' },
  { code: 'MX', name: 'Meksika',                  dialCode: '+52' },
  { code: 'BR', name: 'Brezilya',                 dialCode: '+55' },
  { code: 'AR', name: 'Arjantin',                 dialCode: '+54' },
  { code: 'CL', name: 'Şili',                     dialCode: '+56' },
  { code: 'CO', name: 'Kolombiya',                dialCode: '+57' },
  { code: 'KZ', name: 'Kazakistan',                dialCode: '+7' },
  { code: 'UZ', name: 'Özbekistan',                dialCode: '+998' },
  { code: 'TM', name: 'Türkmenistan',             dialCode: '+993' },
  { code: 'IQ', name: 'Irak',                     dialCode: '+964' },
  { code: 'IR', name: 'İran',                     dialCode: '+98' },
  { code: 'SY', name: 'Suriye',                   dialCode: '+963' },
  { code: 'JO', name: 'Ürdün',                    dialCode: '+962' },
  { code: 'LB', name: 'Lübnan',                   dialCode: '+961' },
  { code: 'OM', name: 'Oman',                     dialCode: '+968' },
  { code: 'BH', name: 'Bahreyn',                  dialCode: '+973' },
  { code: 'MA', name: 'Fas',                      dialCode: '+212' },
  { code: 'TN', name: 'Tunus',                    dialCode: '+216' },
  { code: 'DZ', name: 'Cezayir',                  dialCode: '+213' },
  { code: 'TH', name: 'Tayland',                  dialCode: '+66' },
  { code: 'VN', name: 'Vietnam',                  dialCode: '+84' },
  { code: 'MY', name: 'Malezya',                  dialCode: '+60' },
  { code: 'ID', name: 'Endonezya',                dialCode: '+62' },
  { code: 'PH', name: 'Filipinler',               dialCode: '+63' },
]

export const TR_PROVINCES: string[] = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin',
  'Aydın', 'Balıkesir', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale',
  'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum',
  'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Isparta', 'Mersin',
  'İstanbul', 'İzmir', 'Kars', 'Kastamonu', 'Kayseri', 'Kırklareli', 'Kırşehir', 'Kocaeli',
  'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Kahramanmaraş', 'Mardin', 'Muğla', 'Muş',
  'Nevşehir', 'Niğde', 'Ordu', 'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas',
  'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Şanlıurfa', 'Uşak', 'Van', 'Yozgat', 'Zonguldak',
  'Aksaray', 'Bayburt', 'Karaman', 'Kırıkkale', 'Batman', 'Şırnak', 'Bartın', 'Ardahan',
  'Iğdır', 'Yalova', 'Karabük', 'Kilis', 'Osmaniye', 'Düzce',
].sort((a, b) => a.localeCompare(b, 'tr'))

export interface TaxLabelDef { label: string; placeholder: string }

export const TAX_LABELS: Record<string, TaxLabelDef> = {
  TR: { label: 'Vergi No / Vergi Dairesi',        placeholder: '1234567890 / Kadıköy V.D.' },
  US: { label: 'EIN (Employer ID Number)',         placeholder: '12-3456789' },
  GB: { label: 'Company Registration Number',      placeholder: '01234567' },
  DE: { label: 'USt-IdNr. (Steuernummer)',         placeholder: 'DE123456789' },
  FR: { label: 'SIREN / SIRET',                    placeholder: '123456789' },
  NL: { label: 'KvK-nummer / BTW-nummer',          placeholder: '12345678' },
  AE: { label: 'Trade License Number',             placeholder: '123456' },
  SA: { label: 'Commercial Registration No.',      placeholder: '1010123456' },
}
export const DEFAULT_TAX_LABEL: TaxLabelDef = { label: 'Vergi No / Şirket Kayıt No', placeholder: '1234567890' }

export function getTaxLabel(countryCode: string | undefined): TaxLabelDef {
  return (countryCode && TAX_LABELS[countryCode]) || DEFAULT_TAX_LABEL
}

export function findCountry(codeOrName: string | undefined): CountryDef | undefined {
  if (!codeOrName) return undefined
  return COUNTRIES.find(c => c.code === codeOrName || c.name === codeOrName)
}
