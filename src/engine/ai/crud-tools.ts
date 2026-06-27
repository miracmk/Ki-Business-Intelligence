// FAZ 10.4: the AI agent's ONLY data-access surface. Read tools call recordsFind directly
// (no approval needed — Read'ler direkt okuma). Write tools NEVER write — they call
// proposeAction, which only inserts an ai_pending_actions row; a human approves before
// anything actually changes (src/api/routes/ai-actions.ts). This file deliberately does NOT
// import recordsCreate/recordsUpdate/recordsDelete — that's the structural guarantee, not a
// convention to remember.
import type { AiTool } from './gateway.js'
import { recordsFind } from '../functions/records-bridge.js'
import { proposeAction } from './propose-action.js'
import { getModuleSchema } from '../../lib/metadata/resolver.js'

export const CRUD_TOOLS: AiTool[] = [
  {
    name: 'list_module_fields',
    description: "Bir modülde GERÇEKTEN var olan alan adlarını listeler (örn. crm_contacts'ta 'name' diye bir alan YOKTUR, 'firstName'/'lastName' vardır). propose_create_record/propose_update_record çağırmadan ÖNCE, doğru alan adlarını kullanmak için bunu çağır — yanlış alan adı sessizce göz ardı edilir ve eksik kayıt önerilir.",
    parameters: {
      type: 'object',
      properties: {
        moduleKey: { type: 'string', description: "örn. 'crm_contacts', 'erp_products', 'acc_invoices'" },
      },
      required: ['moduleKey'],
    },
  },
  {
    name: 'find_records',
    description: 'CRM, ERP veya Muhasebe modüllerinden kayıt arar (örn. kişi, şirket, anlaşma, ürün, fatura). Sadece okuma yapar, hiçbir veriyi değiştirmez.',
    parameters: {
      type: 'object',
      properties: {
        moduleKey: { type: 'string', description: "Modül anahtarı, örn. 'crm_contacts', 'crm_deals', 'erp_products', 'acc_invoices'" },
        filter: { type: 'object', description: 'Alan adı → değer eşleşmesi (örn. {"email":"x@y.com"}). Boş obje = tüm kayıtlar (ilk 50).' },
      },
      required: ['moduleKey'],
    },
  },
  {
    name: 'propose_create_record',
    description: 'Yeni bir kayıt oluşturulmasını ÖNERİR (örn. yeni kişi, yeni görev). Hiçbir şey hemen oluşturulmaz — bir insan onaylamadan kayıt yazılmaz.',
    parameters: {
      type: 'object',
      properties: {
        moduleKey: { type: 'string', description: "örn. 'crm_contacts', 'crm_activities'" },
        data: { type: 'object', description: 'Oluşturulacak kaydın alanları (camelCase)' },
        summary: { type: 'string', description: 'Bu öneriyi onaylayacak insana kısa açıklama: ne, neden' },
      },
      required: ['moduleKey', 'data', 'summary'],
    },
  },
  {
    name: 'propose_update_record',
    description: 'Var olan bir kaydın güncellenmesini ÖNERİR. Hiçbir şey hemen değişmez — bir insan onaylamadan kayıt güncellenmez.',
    parameters: {
      type: 'object',
      properties: {
        moduleKey: { type: 'string' },
        recordId: { type: 'string', description: 'Güncellenecek kaydın UUID id\'si (önce find_records ile bulunmalı)' },
        data: { type: 'object', description: 'Değişecek alanlar (camelCase)' },
        summary: { type: 'string' },
      },
      required: ['moduleKey', 'recordId', 'data', 'summary'],
    },
  },
  {
    name: 'propose_delete_record',
    description: 'Bir kaydın silinmesini ÖNERİR. Hiçbir şey hemen silinmez — bir insan onaylamadan kayıt silinmez.',
    parameters: {
      type: 'object',
      properties: {
        moduleKey: { type: 'string' },
        recordId: { type: 'string', description: 'Silinecek kaydın UUID id\'si (önce find_records ile bulunmalı)' },
        summary: { type: 'string', description: 'Neden silinmesi öneriliyor' },
      },
      required: ['moduleKey', 'recordId', 'summary'],
    },
  },
]

export interface CrudToolContext {
  entityId: string
  schema: string
  sessionId?: string
  requestedByUserId?: string | null // the chatting user — lets them approve/reject their own proposal later
  requestedByRole?: string | null // FAZ 10.4 fix: needed so find_records can re-apply FAZ 9 scope —
  // without it, a non-elevated user chatting with the Entity AI could read every owner's
  // records through find_records even though GET /crm-native/contacts would hide them.
}

export async function executeCrudTool(name: string, args: Record<string, unknown>, ctx: CrudToolContext): Promise<unknown> {
  switch (name) {
    case 'list_module_fields': {
      const moduleSchema = await getModuleSchema(ctx.entityId, String(args.moduleKey))
      if (!moduleSchema) return { error: 'Modül bulunamadı veya registry boş' }
      return {
        knownFields: Object.keys(moduleSchema.columnMap),
        customFields: [...moduleSchema.customFieldKeys],
      }
    }
    case 'find_records':
      return recordsFind(ctx.entityId, ctx.schema, String(args.moduleKey), (args.filter as Record<string, unknown>) ?? {}, {
        sub: ctx.requestedByUserId ?? undefined,
        role: ctx.requestedByRole ?? undefined,
      })
    case 'propose_create_record':
      return proposeAction({
        entityId: ctx.entityId,
        moduleKey: String(args.moduleKey),
        action: 'create',
        proposedData: args.data as Record<string, unknown>,
        summary: String(args.summary),
        sessionId: ctx.sessionId,
        requestedByUserId: ctx.requestedByUserId,
      })
    case 'propose_update_record':
      return proposeAction({
        entityId: ctx.entityId,
        moduleKey: String(args.moduleKey),
        action: 'update',
        recordId: String(args.recordId),
        proposedData: args.data as Record<string, unknown>,
        summary: String(args.summary),
        sessionId: ctx.sessionId,
        requestedByUserId: ctx.requestedByUserId,
      })
    case 'propose_delete_record':
      return proposeAction({
        entityId: ctx.entityId,
        moduleKey: String(args.moduleKey),
        action: 'delete',
        recordId: String(args.recordId),
        summary: String(args.summary),
        sessionId: ctx.sessionId,
        requestedByUserId: ctx.requestedByUserId,
      })
    default:
      throw new Error(`Bilinmeyen araç: ${name}`)
  }
}
