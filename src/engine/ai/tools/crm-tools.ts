/**
 * CRM Agent Tool'ları — YFZ 25
 * entity-db-engine.ts üzerinden çalışır.
 */

import { queryWithNaturalLanguage, writeWithNaturalLanguage } from '../entity-db-engine.js'

interface ToolCtx { entityId: string; tenantId: string }

export const crmTools = {
  contact_search: (ctx: ToolCtx, params: { name?: string; email?: string; phone?: string }) =>
    queryWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `${params.name || params.email || params.phone || ''} kişi ara`),

  contact_create: (ctx: ToolCtx, params: Record<string, any>) =>
    writeWithNaturalLanguage(ctx.entityId, ctx.tenantId, 'yeni kişi oluştur', params),

  contact_update: (ctx: ToolCtx, params: Record<string, any>) =>
    writeWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `${params.id || ''} kişi güncelle`, params),

  contact_tag: (ctx: ToolCtx, params: { contact_id: string; tag: string }) =>
    writeWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `${params.contact_id} kişiye etiket ekle`, { tag: params.tag }),

  lead_create: (ctx: ToolCtx, params: Record<string, any>) =>
    writeWithNaturalLanguage(ctx.entityId, ctx.tenantId, 'yeni lead oluştur', params),

  lead_update: (ctx: ToolCtx, params: Record<string, any>) =>
    writeWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `${params.id || ''} lead güncelle`, params),

  lead_convert: (ctx: ToolCtx, params: { lead_id: string }) =>
    writeWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `${params.lead_id} lead'i contact'a dönüştür`, params),

  lead_delete: (ctx: ToolCtx, params: { lead_id: string }) =>
    writeWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `${params.lead_id} lead pasife al`, {}),

  deal_create: (ctx: ToolCtx, params: Record<string, any>) =>
    writeWithNaturalLanguage(ctx.entityId, ctx.tenantId, 'yeni fırsat oluştur', params),

  deal_stage_update: (ctx: ToolCtx, params: { deal_id: string; stage: string }) =>
    writeWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `${params.deal_id} fırsat aşamasını ${params.stage} olarak güncelle`, {}),

  deal_close: (ctx: ToolCtx, params: { deal_id: string; outcome: string }) =>
    writeWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `${params.deal_id} fırsatı ${params.outcome} olarak kapat`, {}),

  company_search: (ctx: ToolCtx, params: { name?: string }) =>
    queryWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `${params.name || ''} firma ara`),

  activity_log: (ctx: ToolCtx, params: { contact_id: string; type?: string; content: string }) =>
    writeWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `${params.contact_id} kişiye aktivite ekle`, {
        type: params.type || 'note',
        content: params.content,
      }),

  pipeline_summary: (ctx: ToolCtx) =>
    queryWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      'satış pipeline özeti - aşamalara göre fırsat sayısı ve toplam değer'),

  recent_activities: (ctx: ToolCtx, params: { limit?: number }) =>
    queryWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `son ${params.limit || 20} aktivite kronolojik sırada`),
}
