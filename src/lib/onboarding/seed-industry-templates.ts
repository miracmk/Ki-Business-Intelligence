// FAZ 8.1: seeds the platform-wide industry_templates catalog. Idempotent (upsert on `key`).
// Run with: npx tsx src/lib/onboarding/seed-industry-templates.ts
import { db } from '../db.js'
import { industryTemplates } from '../../../db/schema.js'
import { sql } from 'drizzle-orm'

interface TemplateField {
  moduleKey: string
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'relation' | 'ai'
  config?: Record<string, unknown>
}

interface TemplateBlueprint {
  moduleKey: string
  fieldKey: string
  fromState: string
  toState: string
  conditions?: unknown
  requiresApprovalRole?: string
}

interface TemplateRule {
  moduleKey: string
  name: string
  trigger: 'on_create' | 'on_update'
  conditions?: unknown
  actions: Array<{ type: string; config?: Record<string, unknown> }>
}

interface TemplatePackage {
  fields: TemplateField[]
  blueprints: TemplateBlueprint[]
  rules: TemplateRule[]
}

const TEMPLATES: Record<string, { label: string; package: TemplatePackage }> = {
  ecommerce: {
    label: 'E-Ticaret',
    package: {
      fields: [
        { moduleKey: 'crm_contacts', key: 'preferredChannel', label: 'Tercih Edilen Kanal', type: 'select', config: { options: ['web', 'mobile', 'marketplace'] } },
        { moduleKey: 'crm_deals', key: 'marketplaceSource', label: 'Pazaryeri Kaynağı', type: 'select', config: { options: ['trendyol', 'hepsiburada', 'amazon', 'web'] } },
      ],
      blueprints: [],
      rules: [
        { moduleKey: 'crm_deals', name: 'Yüksek değerli pazaryeri siparişi', trigger: 'on_create', conditions: { field: 'dealValue', op: '>', value: 5000 }, actions: [{ type: 'update_field', config: { field: 'leadSource', value: 'high-value-marketplace' } }] },
      ],
    },
  },
  consulting_agency: {
    label: 'Danışmanlık / Ajans',
    package: {
      fields: [
        { moduleKey: 'crm_deals', key: 'projectType', label: 'Proje Tipi', type: 'select', config: { options: ['one-time', 'retainer'] } },
        { moduleKey: 'crm_contacts', key: 'industry', label: 'Müşteri Sektörü', type: 'text' },
      ],
      blueprints: [
        { moduleKey: 'crm_deals', fieldKey: 'stage', fromState: 'new', toState: 'qualified' },
        { moduleKey: 'crm_deals', fieldKey: 'stage', fromState: 'qualified', toState: 'proposal' },
      ],
      rules: [],
    },
  },
  b2b_service: {
    label: 'B2B Hizmet',
    package: {
      fields: [
        { moduleKey: 'crm_companies', key: 'contractValue', label: 'Sözleşme Değeri', type: 'number' },
        { moduleKey: 'crm_companies', key: 'renewalDate', label: 'Yenileme Tarihi', type: 'date' },
      ],
      blueprints: [],
      rules: [
        { moduleKey: 'crm_deals', name: 'Yeni B2B fırsatı etiketle', trigger: 'on_create', conditions: null, actions: [{ type: 'update_field', config: { field: 'leadSource', value: 'b2b-template' } }] },
      ],
    },
  },
}

export async function seedIndustryTemplates(): Promise<string[]> {
  const applied: string[] = []
  for (const [key, def] of Object.entries(TEMPLATES)) {
    await db.insert(industryTemplates)
      .values({ key, label: def.label, packageJson: def.package })
      .onConflictDoUpdate({ target: industryTemplates.key, set: { label: def.label, packageJson: def.package } })
    applied.push(key)
  }
  return applied
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedIndustryTemplates()
    .then((keys) => { console.log('Seed tamamlandı:', keys); process.exit(0) })
    .catch((err) => { console.error('Seed hatası:', err); process.exit(1) })
}
