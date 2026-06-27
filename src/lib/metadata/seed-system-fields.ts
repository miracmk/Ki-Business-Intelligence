// FAZ 4.1: seeds kibi_modules/kibi_fields with is_system=true rows derived from
// src/api/routes/crm-native.ts's COLUMN_MAP + Zod schemas (contactSchema, companySchema,
// dealSchema, activitySchema), for every already-provisioned entity. Idempotent — safe
// to re-run (upserts on the (entity_id,key) / (module_id,key) unique indexes). This makes
// COLUMN_MAP the de-facto source these definitions were derived from; keep both in sync
// if crm-native.ts changes. See KIBI-PLATFORM-ROADMAP.md FAZ 4.1.
import { db } from '../db.js'
import { kibiModules, kibiFields } from '../../../db/schema.js'

type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'relation' | 'ai'

interface FieldDef {
  key: string
  columnName: string
  label: string
  type: FieldType
  isRequired?: boolean
  config?: Record<string, unknown>
}

interface ModuleDef {
  label: string
  physicalTable: string
  hasDeletedAt?: boolean // most ERP/Accounting tables don't have this column — default false
  fields: FieldDef[]
}

const MODULE_DEFS: Record<string, ModuleDef> = {
  crm_contacts: {
    label: 'Kişiler',
    physicalTable: 'crm_contacts',
    hasDeletedAt: true,
    fields: [
      { key: 'firstName', columnName: 'first_name', label: 'Ad', type: 'text' },
      { key: 'lastName', columnName: 'last_name', label: 'Soyad', type: 'text' },
      { key: 'fullName', columnName: 'full_name', label: 'Tam Ad', type: 'text' },
      { key: 'email', columnName: 'email', label: 'E-posta', type: 'text' },
      { key: 'emailSecondary', columnName: 'email_secondary', label: 'İkincil E-posta', type: 'text' },
      { key: 'phone', columnName: 'phone', label: 'Telefon', type: 'text' },
      { key: 'mobile', columnName: 'mobile', label: 'Cep Telefonu', type: 'text' },
      { key: 'companyName', columnName: 'company_name', label: 'Şirket Adı', type: 'text' },
      { key: 'jobTitle', columnName: 'job_title', label: 'Unvan', type: 'text' },
      { key: 'department', columnName: 'department', label: 'Departman', type: 'text' },
      { key: 'website', columnName: 'website', label: 'Web Sitesi', type: 'text' },
      { key: 'addressLine1', columnName: 'address_line1', label: 'Adres 1', type: 'text' },
      { key: 'addressLine2', columnName: 'address_line2', label: 'Adres 2', type: 'text' },
      { key: 'city', columnName: 'city', label: 'Şehir', type: 'text' },
      { key: 'state', columnName: 'state', label: 'Eyalet/İl', type: 'text' },
      { key: 'country', columnName: 'country', label: 'Ülke', type: 'text' },
      { key: 'postalCode', columnName: 'postal_code', label: 'Posta Kodu', type: 'text' },
      { key: 'contactType', columnName: 'contact_type', label: 'Kişi Tipi', type: 'select', config: { options: ['lead', 'contact', 'customer', 'partner', 'vendor'] } },
      { key: 'leadSource', columnName: 'lead_source', label: 'Lead Kaynağı', type: 'text' },
      { key: 'leadStatus', columnName: 'lead_status', label: 'Lead Durumu', type: 'text' },
      { key: 'status', columnName: 'status', label: 'Durum', type: 'text' },
      { key: 'leadScore', columnName: 'lead_score', label: 'Lead Skoru', type: 'number' },
      { key: 'opportunityScore', columnName: 'opportunity_score', label: 'Fırsat Skoru', type: 'number' },
      { key: 'companyId', columnName: 'company_id', label: 'Şirket', type: 'relation', config: { targetModule: 'crm_companies' } },
      { key: 'assignedToUserId', columnName: 'assigned_to_user_id', label: 'Atanan Kullanıcı', type: 'relation', config: { targetModule: 'users' } },
      { key: 'tags', columnName: 'tags', label: 'Etiketler', type: 'text', config: { array: true } },
      { key: 'doNotContact', columnName: 'do_not_contact', label: 'İletişim Kurulmasın', type: 'boolean' },
      { key: 'customFields', columnName: 'custom_fields', label: 'Özel Alanlar', type: 'text', config: { json: true } },
      // FAZ 10.4: registered so recordsCreate (AI approval path) can set it — previously
      // only crm-native.ts's own injectOwnerId set this column, bypassing the registry.
      { key: 'ownerId', columnName: 'owner_id', label: 'Sahip', type: 'relation', config: { targetModule: 'users' } },
    ],
  },
  crm_companies: {
    label: 'Şirketler',
    physicalTable: 'crm_companies',
    hasDeletedAt: true,
    fields: [
      { key: 'name', columnName: 'name', label: 'Şirket Adı', type: 'text', isRequired: true },
      { key: 'legalName', columnName: 'legal_name', label: 'Yasal Unvan', type: 'text' },
      { key: 'industry', columnName: 'industry', label: 'Sektör', type: 'text' },
      { key: 'subIndustry', columnName: 'sub_industry', label: 'Alt Sektör', type: 'text' },
      { key: 'companyType', columnName: 'company_type', label: 'Şirket Tipi', type: 'select', config: { options: ['prospect', 'customer', 'partner', 'vendor', 'competitor'] } },
      { key: 'employeeCount', columnName: 'employee_count', label: 'Çalışan Sayısı', type: 'number' },
      { key: 'annualRevenue', columnName: 'annual_revenue', label: 'Yıllık Ciro', type: 'number' },
      { key: 'currency', columnName: 'currency', label: 'Para Birimi', type: 'text' },
      { key: 'website', columnName: 'website', label: 'Web Sitesi', type: 'text' },
      { key: 'email', columnName: 'email', label: 'E-posta', type: 'text' },
      { key: 'phone', columnName: 'phone', label: 'Telefon', type: 'text' },
      { key: 'linkedinUrl', columnName: 'linkedin_url', label: 'LinkedIn', type: 'text' },
      { key: 'taxNumber', columnName: 'tax_number', label: 'Vergi No', type: 'text' },
      { key: 'taxOffice', columnName: 'tax_office', label: 'Vergi Dairesi', type: 'text' },
      { key: 'mersisNumber', columnName: 'mersis_number', label: 'Mersis No', type: 'text' },
      { key: 'addressLine1', columnName: 'address_line1', label: 'Adres 1', type: 'text' },
      { key: 'addressLine2', columnName: 'address_line2', label: 'Adres 2', type: 'text' },
      { key: 'city', columnName: 'city', label: 'Şehir', type: 'text' },
      { key: 'state', columnName: 'state', label: 'Eyalet/İl', type: 'text' },
      { key: 'country', columnName: 'country', label: 'Ülke', type: 'text' },
      { key: 'postalCode', columnName: 'postal_code', label: 'Posta Kodu', type: 'text' },
      { key: 'accountScore', columnName: 'account_score', label: 'Hesap Skoru', type: 'number' },
      { key: 'assignedToUserId', columnName: 'assigned_to_user_id', label: 'Atanan Kullanıcı', type: 'relation', config: { targetModule: 'users' } },
      { key: 'parentCompanyId', columnName: 'parent_company_id', label: 'Ana Şirket', type: 'relation', config: { targetModule: 'crm_companies' } },
      { key: 'tags', columnName: 'tags', label: 'Etiketler', type: 'text', config: { array: true } },
      { key: 'customFields', columnName: 'custom_fields', label: 'Özel Alanlar', type: 'text', config: { json: true } },
      { key: 'ownerId', columnName: 'owner_id', label: 'Sahip', type: 'relation', config: { targetModule: 'users' } },
    ],
  },
  crm_deals: {
    label: 'Anlaşmalar',
    physicalTable: 'crm_deals',
    hasDeletedAt: true,
    fields: [
      { key: 'title', columnName: 'title', label: 'Başlık', type: 'text', isRequired: true },
      { key: 'contactId', columnName: 'contact_id', label: 'Kişi', type: 'relation', config: { targetModule: 'crm_contacts' } },
      { key: 'companyId', columnName: 'company_id', label: 'Şirket', type: 'relation', config: { targetModule: 'crm_companies' } },
      { key: 'pipelineName', columnName: 'pipeline_name', label: 'Pipeline', type: 'text' },
      { key: 'stage', columnName: 'stage', label: 'Aşama', type: 'select', config: { options: ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] } },
      { key: 'probability', columnName: 'probability', label: 'Olasılık', type: 'number' },
      { key: 'dealValue', columnName: 'deal_value', label: 'Anlaşma Değeri', type: 'number' },
      { key: 'currency', columnName: 'currency', label: 'Para Birimi', type: 'text' },
      { key: 'recurringRevenue', columnName: 'recurring_revenue', label: 'Tekrarlayan Gelir', type: 'number' },
      { key: 'expectedCloseDate', columnName: 'expected_close_date', label: 'Beklenen Kapanış', type: 'date' },
      { key: 'actualCloseDate', columnName: 'actual_close_date', label: 'Gerçek Kapanış', type: 'date' },
      { key: 'leadSource', columnName: 'lead_source', label: 'Lead Kaynağı', type: 'text' },
      { key: 'lostReason', columnName: 'lost_reason', label: 'Kaybetme Sebebi', type: 'text' },
      { key: 'wonReason', columnName: 'won_reason', label: 'Kazanma Sebebi', type: 'text' },
      { key: 'assignedToUserId', columnName: 'assigned_to_user_id', label: 'Atanan Kullanıcı', type: 'relation', config: { targetModule: 'users' } },
      { key: 'tags', columnName: 'tags', label: 'Etiketler', type: 'text', config: { array: true } },
      { key: 'customFields', columnName: 'custom_fields', label: 'Özel Alanlar', type: 'text', config: { json: true } },
      { key: 'ownerId', columnName: 'owner_id', label: 'Sahip', type: 'relation', config: { targetModule: 'users' } },
    ],
  },
  crm_activities: {
    label: 'Aktiviteler',
    physicalTable: 'crm_activities',
    fields: [
      { key: 'type', columnName: 'type', label: 'Tip', type: 'select', isRequired: true, config: { options: ['call', 'email', 'meeting', 'task', 'note', 'demo'] } },
      { key: 'subject', columnName: 'subject', label: 'Konu', type: 'text' },
      { key: 'description', columnName: 'description', label: 'Açıklama', type: 'text' },
      { key: 'contactId', columnName: 'contact_id', label: 'Kişi', type: 'relation', config: { targetModule: 'crm_contacts' } },
      { key: 'companyId', columnName: 'company_id', label: 'Şirket', type: 'relation', config: { targetModule: 'crm_companies' } },
      { key: 'dealId', columnName: 'deal_id', label: 'Anlaşma', type: 'relation', config: { targetModule: 'crm_deals' } },
      { key: 'assignedToUserId', columnName: 'assigned_to_user_id', label: 'Atanan Kullanıcı', type: 'relation', config: { targetModule: 'users' } },
      { key: 'status', columnName: 'status', label: 'Durum', type: 'select', config: { options: ['planned', 'in_progress', 'completed', 'cancelled'] } },
      { key: 'priority', columnName: 'priority', label: 'Öncelik', type: 'select', config: { options: ['low', 'medium', 'high'] } },
      { key: 'dueDate', columnName: 'due_date', label: 'Termin', type: 'date' },
      { key: 'startDate', columnName: 'start_date', label: 'Başlangıç', type: 'date' },
      { key: 'location', columnName: 'location', label: 'Konum', type: 'text' },
      { key: 'outcome', columnName: 'outcome', label: 'Sonuç', type: 'text' },
      { key: 'followUpRequired', columnName: 'follow_up_required', label: 'Takip Gerekli', type: 'boolean' },
      { key: 'followUpDate', columnName: 'follow_up_date', label: 'Takip Tarihi', type: 'date' },
      { key: 'createdByUserId', columnName: 'created_by_user_id', label: 'Oluşturan', type: 'relation', config: { targetModule: 'users' } },
    ],
  },
  // FAZ 10.2: derived from src/api/routes/erp-native.ts's COLUMN_MAP + Zod schemas.
  erp_products: {
    label: 'Ürünler',
    physicalTable: 'erp_products',
    hasDeletedAt: true,
    fields: [
      { key: 'sku', columnName: 'sku', label: 'SKU', type: 'text' },
      { key: 'barcode', columnName: 'barcode', label: 'Barkod', type: 'text' },
      { key: 'name', columnName: 'name', label: 'Ürün Adı', type: 'text', isRequired: true },
      { key: 'shortName', columnName: 'short_name', label: 'Kısa Ad', type: 'text' },
      { key: 'description', columnName: 'description', label: 'Açıklama', type: 'text' },
      { key: 'category', columnName: 'category', label: 'Kategori', type: 'text' },
      { key: 'subcategory', columnName: 'subcategory', label: 'Alt Kategori', type: 'text' },
      { key: 'brand', columnName: 'brand', label: 'Marka', type: 'text' },
      { key: 'supplierId', columnName: 'supplier_id', label: 'Tedarikçi', type: 'relation', config: { targetModule: 'erp_suppliers' } },
      { key: 'unit', columnName: 'unit', label: 'Birim', type: 'text' },
      { key: 'costPrice', columnName: 'cost_price', label: 'Maliyet Fiyatı', type: 'number' },
      { key: 'salePrice', columnName: 'sale_price', label: 'Satış Fiyatı', type: 'number' },
      { key: 'minSalePrice', columnName: 'min_sale_price', label: 'Min. Satış Fiyatı', type: 'number' },
      { key: 'currency', columnName: 'currency', label: 'Para Birimi', type: 'text' },
      { key: 'taxRate', columnName: 'tax_rate', label: 'KDV Oranı', type: 'number' },
      { key: 'discountRate', columnName: 'discount_rate', label: 'İskonto Oranı', type: 'number' },
      { key: 'stockQuantity', columnName: 'stock_quantity', label: 'Stok Miktarı', type: 'number' },
      { key: 'reservedQuantity', columnName: 'reserved_quantity', label: 'Rezerve Miktar', type: 'number' },
      { key: 'reorderPoint', columnName: 'reorder_point', label: 'Yeniden Sipariş Noktası', type: 'number' },
      { key: 'maxStockLevel', columnName: 'max_stock_level', label: 'Maks. Stok Seviyesi', type: 'number' },
      { key: 'leadTimeDays', columnName: 'lead_time_days', label: 'Tedarik Süresi (gün)', type: 'number' },
      { key: 'warehouseId', columnName: 'warehouse_id', label: 'Depo', type: 'relation', config: { targetModule: 'erp_warehouses' } },
      { key: 'warehouseLocation', columnName: 'warehouse_location', label: 'Depo Konumu', type: 'text' },
      { key: 'isActive', columnName: 'is_active', label: 'Aktif', type: 'boolean' },
      { key: 'isTrackable', columnName: 'is_trackable', label: 'Stok Takipli', type: 'boolean' },
      { key: 'isSellable', columnName: 'is_sellable', label: 'Satılabilir', type: 'boolean' },
      { key: 'isPurchasable', columnName: 'is_purchasable', label: 'Satın Alınabilir', type: 'boolean' },
      { key: 'isService', columnName: 'is_service', label: 'Hizmet', type: 'boolean' },
      { key: 'imageUrl', columnName: 'image_url', label: 'Görsel URL', type: 'text' },
      { key: 'weightKg', columnName: 'weight_kg', label: 'Ağırlık (kg)', type: 'number' },
      { key: 'tags', columnName: 'tags', label: 'Etiketler', type: 'text', config: { array: true } },
      { key: 'customFields', columnName: 'custom_fields', label: 'Özel Alanlar', type: 'text', config: { json: true } },
    ],
  },
  erp_suppliers: {
    label: 'Tedarikçiler',
    physicalTable: 'erp_suppliers',
    fields: [
      { key: 'name', columnName: 'name', label: 'Tedarikçi Adı', type: 'text', isRequired: true },
      { key: 'contactName', columnName: 'contact_name', label: 'İletişim Kişisi', type: 'text' },
      { key: 'email', columnName: 'email', label: 'E-posta', type: 'text' },
      { key: 'phone', columnName: 'phone', label: 'Telefon', type: 'text' },
      { key: 'website', columnName: 'website', label: 'Web Sitesi', type: 'text' },
      { key: 'taxNumber', columnName: 'tax_number', label: 'Vergi No', type: 'text' },
      { key: 'taxOffice', columnName: 'tax_office', label: 'Vergi Dairesi', type: 'text' },
      { key: 'addressLine1', columnName: 'address_line1', label: 'Adres 1', type: 'text' },
      { key: 'city', columnName: 'city', label: 'Şehir', type: 'text' },
      { key: 'country', columnName: 'country', label: 'Ülke', type: 'text' },
      { key: 'paymentTerms', columnName: 'payment_terms', label: 'Ödeme Koşulları', type: 'text' },
      { key: 'currency', columnName: 'currency', label: 'Para Birimi', type: 'text' },
      { key: 'creditLimit', columnName: 'credit_limit', label: 'Kredi Limiti', type: 'number' },
      { key: 'bankName', columnName: 'bank_name', label: 'Banka', type: 'text' },
      { key: 'bankIban', columnName: 'bank_iban', label: 'IBAN', type: 'text' },
      { key: 'category', columnName: 'category', label: 'Kategori', type: 'text' },
      { key: 'rating', columnName: 'rating', label: 'Puan', type: 'number' },
      { key: 'tags', columnName: 'tags', label: 'Etiketler', type: 'text', config: { array: true } },
      { key: 'isActive', columnName: 'is_active', label: 'Aktif', type: 'boolean' },
    ],
  },
  erp_orders: {
    label: 'Siparişler',
    physicalTable: 'erp_orders',
    fields: [
      { key: 'orderType', columnName: 'order_type', label: 'Sipariş Tipi', type: 'select', isRequired: true, config: { options: ['purchase', 'sale'] } },
      { key: 'contactId', columnName: 'contact_id', label: 'Kişi', type: 'relation', config: { targetModule: 'crm_contacts' } },
      { key: 'companyId', columnName: 'company_id', label: 'Şirket', type: 'relation', config: { targetModule: 'crm_companies' } },
      { key: 'supplierId', columnName: 'supplier_id', label: 'Tedarikçi', type: 'relation', config: { targetModule: 'erp_suppliers' } },
      { key: 'status', columnName: 'status', label: 'Durum', type: 'text' },
      { key: 'orderDate', columnName: 'order_date', label: 'Sipariş Tarihi', type: 'date' },
      { key: 'expectedDate', columnName: 'expected_date', label: 'Beklenen Tarih', type: 'date' },
      { key: 'actualDate', columnName: 'actual_date', label: 'Gerçekleşen Tarih', type: 'date' },
      { key: 'subtotal', columnName: 'subtotal', label: 'Ara Toplam', type: 'number' },
      { key: 'discountAmount', columnName: 'discount_amount', label: 'İskonto', type: 'number' },
      { key: 'taxAmount', columnName: 'tax_amount', label: 'KDV', type: 'number' },
      { key: 'shippingAmount', columnName: 'shipping_amount', label: 'Kargo', type: 'number' },
      { key: 'total', columnName: 'total', label: 'Toplam', type: 'number' },
      { key: 'paidAmount', columnName: 'paid_amount', label: 'Ödenen', type: 'number' },
      { key: 'currency', columnName: 'currency', label: 'Para Birimi', type: 'text' },
      { key: 'trackingNumber', columnName: 'tracking_number', label: 'Takip No', type: 'text' },
      { key: 'carrier', columnName: 'carrier', label: 'Kargo Firması', type: 'text' },
      { key: 'assignedToUserId', columnName: 'assigned_to_user_id', label: 'Atanan Kullanıcı', type: 'relation', config: { targetModule: 'users' } },
      { key: 'warehouseId', columnName: 'warehouse_id', label: 'Depo', type: 'relation', config: { targetModule: 'erp_warehouses' } },
      { key: 'notes', columnName: 'notes', label: 'Notlar', type: 'text' },
      { key: 'tags', columnName: 'tags', label: 'Etiketler', type: 'text', config: { array: true } },
    ],
  },
  erp_warehouses: {
    label: 'Depolar',
    physicalTable: 'erp_warehouses',
    fields: [
      { key: 'name', columnName: 'name', label: 'Depo Adı', type: 'text', isRequired: true },
      { key: 'code', columnName: 'code', label: 'Kod', type: 'text' },
      { key: 'warehouseType', columnName: 'warehouse_type', label: 'Depo Tipi', type: 'select', config: { options: ['main', 'secondary', 'virtual', 'transit'] } },
      { key: 'addressLine1', columnName: 'address_line1', label: 'Adres', type: 'text' },
      { key: 'city', columnName: 'city', label: 'Şehir', type: 'text' },
      { key: 'country', columnName: 'country', label: 'Ülke', type: 'text' },
      { key: 'managerUserId', columnName: 'manager_user_id', label: 'Sorumlu Kullanıcı', type: 'relation', config: { targetModule: 'users' } },
      { key: 'isActive', columnName: 'is_active', label: 'Aktif', type: 'boolean' },
    ],
  },
  // FAZ 10.2: derived from src/api/routes/accounting.ts's COLUMN_MAP + Zod schemas.
  acc_contacts: {
    label: 'Muhasebe Kişileri',
    physicalTable: 'acc_contacts',
    fields: [
      { key: 'contactType', columnName: 'contact_type', label: 'Tip', type: 'select', isRequired: true, config: { options: ['customer', 'vendor', 'both'] } },
      { key: 'name', columnName: 'name', label: 'Ad', type: 'text', isRequired: true },
      { key: 'shortName', columnName: 'short_name', label: 'Kısa Ad', type: 'text' },
      { key: 'taxNumber', columnName: 'tax_number', label: 'Vergi No', type: 'text' },
      { key: 'taxOffice', columnName: 'tax_office', label: 'Vergi Dairesi', type: 'text' },
      { key: 'email', columnName: 'email', label: 'E-posta', type: 'text' },
      { key: 'phone', columnName: 'phone', label: 'Telefon', type: 'text' },
      { key: 'addressLine1', columnName: 'address_line1', label: 'Adres', type: 'text' },
      { key: 'city', columnName: 'city', label: 'Şehir', type: 'text' },
      { key: 'country', columnName: 'country', label: 'Ülke', type: 'text' },
      { key: 'currency', columnName: 'currency', label: 'Para Birimi', type: 'text' },
      { key: 'creditLimit', columnName: 'credit_limit', label: 'Kredi Limiti', type: 'number' },
      { key: 'paymentTerms', columnName: 'payment_terms', label: 'Ödeme Koşulları', type: 'text' },
      { key: 'balance', columnName: 'balance', label: 'Bakiye', type: 'number' },
      { key: 'bankName', columnName: 'bank_name', label: 'Banka', type: 'text' },
      { key: 'bankIban', columnName: 'bank_iban', label: 'IBAN', type: 'text' },
      { key: 'crmContactId', columnName: 'crm_contact_id', label: 'CRM Kişisi', type: 'relation', config: { targetModule: 'crm_contacts' } },
      { key: 'crmCompanyId', columnName: 'crm_company_id', label: 'CRM Şirketi', type: 'relation', config: { targetModule: 'crm_companies' } },
      { key: 'tags', columnName: 'tags', label: 'Etiketler', type: 'text', config: { array: true } },
      { key: 'isActive', columnName: 'is_active', label: 'Aktif', type: 'boolean' },
    ],
  },
  acc_invoices: {
    label: 'Faturalar',
    physicalTable: 'acc_invoices',
    fields: [
      { key: 'invoiceType', columnName: 'invoice_type', label: 'Fatura Tipi', type: 'select', isRequired: true, config: { options: ['sale', 'purchase', 'credit_note', 'debit_note'] } },
      { key: 'contactId', columnName: 'contact_id', label: 'Kişi', type: 'relation', isRequired: true, config: { targetModule: 'acc_contacts' } },
      { key: 'status', columnName: 'status', label: 'Durum', type: 'select', config: { options: ['draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled'] } },
      { key: 'issueDate', columnName: 'issue_date', label: 'Kesim Tarihi', type: 'date' },
      { key: 'dueDate', columnName: 'due_date', label: 'Vade Tarihi', type: 'date' },
      { key: 'subtotal', columnName: 'subtotal', label: 'Ara Toplam', type: 'number' },
      { key: 'discountAmount', columnName: 'discount_amount', label: 'İskonto', type: 'number' },
      { key: 'taxAmount', columnName: 'tax_amount', label: 'KDV', type: 'number' },
      { key: 'total', columnName: 'total', label: 'Toplam', type: 'number' },
      { key: 'paidAmount', columnName: 'paid_amount', label: 'Ödenen', type: 'number' },
      { key: 'currency', columnName: 'currency', label: 'Para Birimi', type: 'text' },
      { key: 'efaturaUuid', columnName: 'efatura_uuid', label: 'E-Fatura UUID', type: 'text' },
      { key: 'notes', columnName: 'notes', label: 'Notlar', type: 'text' },
      { key: 'tags', columnName: 'tags', label: 'Etiketler', type: 'text', config: { array: true } },
    ],
  },
  acc_payments: {
    label: 'Ödemeler',
    physicalTable: 'acc_payments',
    fields: [
      { key: 'paymentType', columnName: 'payment_type', label: 'Ödeme Tipi', type: 'select', isRequired: true, config: { options: ['received', 'sent'] } },
      { key: 'amount', columnName: 'amount', label: 'Tutar', type: 'number', isRequired: true },
      { key: 'currency', columnName: 'currency', label: 'Para Birimi', type: 'text' },
      { key: 'paymentDate', columnName: 'payment_date', label: 'Ödeme Tarihi', type: 'date' },
      { key: 'paymentMethod', columnName: 'payment_method', label: 'Ödeme Yöntemi', type: 'text' },
      { key: 'reference', columnName: 'reference', label: 'Referans', type: 'text' },
      { key: 'notes', columnName: 'notes', label: 'Notlar', type: 'text' },
      { key: 'contactId', columnName: 'contact_id', label: 'Kişi', type: 'relation', config: { targetModule: 'acc_contacts' } },
      { key: 'invoiceId', columnName: 'invoice_id', label: 'Fatura', type: 'relation', config: { targetModule: 'acc_invoices' } },
      { key: 'isReconciled', columnName: 'is_reconciled', label: 'Mutabakat Yapıldı', type: 'boolean' },
    ],
  },
  acc_expenses: {
    label: 'Giderler',
    physicalTable: 'acc_expenses',
    fields: [
      { key: 'category', columnName: 'category', label: 'Kategori', type: 'text', isRequired: true },
      { key: 'subcategory', columnName: 'subcategory', label: 'Alt Kategori', type: 'text' },
      { key: 'description', columnName: 'description', label: 'Açıklama', type: 'text' },
      { key: 'amount', columnName: 'amount', label: 'Tutar', type: 'number', isRequired: true },
      { key: 'taxAmount', columnName: 'tax_amount', label: 'KDV', type: 'number' },
      { key: 'currency', columnName: 'currency', label: 'Para Birimi', type: 'text' },
      { key: 'expenseDate', columnName: 'expense_date', label: 'Gider Tarihi', type: 'date' },
      { key: 'paymentMethod', columnName: 'payment_method', label: 'Ödeme Yöntemi', type: 'text' },
      { key: 'status', columnName: 'status', label: 'Durum', type: 'select', config: { options: ['pending', 'approved', 'rejected', 'paid'] } },
      { key: 'contactId', columnName: 'contact_id', label: 'Kişi', type: 'relation', config: { targetModule: 'acc_contacts' } },
      { key: 'supplierId', columnName: 'supplier_id', label: 'Tedarikçi', type: 'relation', config: { targetModule: 'erp_suppliers' } },
      { key: 'isBillable', columnName: 'is_billable', label: 'Faturalandırılabilir', type: 'boolean' },
      { key: 'projectCode', columnName: 'project_code', label: 'Proje Kodu', type: 'text' },
      { key: 'receiptUrl', columnName: 'receipt_url', label: 'Fiş/Fatura URL', type: 'text' },
      { key: 'tags', columnName: 'tags', label: 'Etiketler', type: 'text', config: { array: true } },
    ],
  },
}

export async function seedSystemFields(): Promise<{ entities: number; modules: number; fields: number }> {
  const entities = await db.query.kibiEntities.findMany({
    where: (t, { eq }) => eq(t.isProvisioned, true),
    columns: { id: true },
  })

  let moduleCount = 0
  let fieldCount = 0

  for (const entity of entities) {
    for (const [moduleKey, def] of Object.entries(MODULE_DEFS)) {
      const [module] = await db
        .insert(kibiModules)
        .values({
          entityId: entity.id,
          key: moduleKey,
          label: def.label,
          isSystem: true,
          physicalTable: def.physicalTable,
          hasDeletedAt: def.hasDeletedAt ?? false,
        })
        .onConflictDoUpdate({
          target: [kibiModules.entityId, kibiModules.key],
          set: { label: def.label, isSystem: true, physicalTable: def.physicalTable, hasDeletedAt: def.hasDeletedAt ?? false },
        })
        .returning({ id: kibiModules.id })
      moduleCount++

      for (let i = 0; i < def.fields.length; i++) {
        const field = def.fields[i]
        await db
          .insert(kibiFields)
          .values({
            moduleId: module.id,
            key: field.key,
            columnName: field.columnName,
            label: field.label,
            type: field.type,
            isSystem: true,
            isRequired: field.isRequired ?? false,
            config: field.config ?? {},
            position: i,
          })
          .onConflictDoUpdate({
            target: [kibiFields.moduleId, kibiFields.key],
            set: {
              columnName: field.columnName,
              label: field.label,
              type: field.type,
              isSystem: true,
              isRequired: field.isRequired ?? false,
              config: field.config ?? {},
              position: i,
            },
          })
        fieldCount++
      }
    }
  }

  return { entities: entities.length, modules: moduleCount, fields: fieldCount }
}

// Run directly: `npx tsx src/lib/metadata/seed-system-fields.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  seedSystemFields()
    .then((result) => {
      console.log('Seed tamamlandı:', result)
      process.exit(0)
    })
    .catch((err) => {
      console.error('Seed hatası:', err)
      process.exit(1)
    })
}
