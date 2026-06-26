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
  fields: FieldDef[]
}

const MODULE_DEFS: Record<string, ModuleDef> = {
  crm_contacts: {
    label: 'Kişiler',
    physicalTable: 'crm_contacts',
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
    ],
  },
  crm_companies: {
    label: 'Şirketler',
    physicalTable: 'crm_companies',
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
    ],
  },
  crm_deals: {
    label: 'Anlaşmalar',
    physicalTable: 'crm_deals',
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
        })
        .onConflictDoUpdate({
          target: [kibiModules.entityId, kibiModules.key],
          set: { label: def.label, isSystem: true, physicalTable: def.physicalTable },
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
