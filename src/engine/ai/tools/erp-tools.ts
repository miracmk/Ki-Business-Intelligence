/**
 * ERP Agent Tool'ları — YFZ 24
 * entity-db-engine.ts üzerinden çalışır.
 */

import { queryWithNaturalLanguage, writeWithNaturalLanguage } from '../entity-db-engine.js'

interface ToolCtx { entityId: string; tenantId: string }

export const erpTools = {
  stock_query: (ctx: ToolCtx, params: { product?: string }) =>
    queryWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `${params.product || 'tüm ürünler'} stok durumu`),

  low_stock_report: (ctx: ToolCtx, threshold = 10) =>
    queryWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `stok miktarı ${threshold} altında olan ürünler`),

  stock_alert_set: (ctx: ToolCtx, params: Record<string, any>) =>
    writeWithNaturalLanguage(ctx.entityId, ctx.tenantId, 'stok uyarı eşiği güncelle', params),

  supplier_balance: (ctx: ToolCtx, params: { supplier?: string }) =>
    queryWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `${params.supplier || 'tüm tedarikçiler'} bakiyesi ve alacak durumu`),

  supplier_purchase_request: (ctx: ToolCtx, params: Record<string, any>) =>
    writeWithNaturalLanguage(ctx.entityId, ctx.tenantId, 'satın alma talebi oluştur', params),

  customer_balance: (ctx: ToolCtx, params: { customer?: string }) =>
    queryWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `${params.customer || 'tüm müşteriler'} bakiyesi`),

  customer_overdue: (ctx: ToolCtx, params: { days?: number; customer?: string }) =>
    queryWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `vadesi geçmiş alacaklar${params.customer ? ` - ${params.customer}` : ''}${params.days ? ` son ${params.days} gün` : ''}`),

  payment_link_create: (ctx: ToolCtx, params: Record<string, any>) =>
    writeWithNaturalLanguage(ctx.entityId, ctx.tenantId, 'ödeme linki oluştur', params),

  invoice_query: (ctx: ToolCtx, params: { invoice_no?: string; customer?: string }) =>
    queryWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      `${params.invoice_no || params.customer || ''} fatura bilgileri`),

  invoice_overdue: (ctx: ToolCtx) =>
    queryWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      'vadesi geçmiş ödenmemiş faturalar'),

  accounting_summary: (ctx: ToolCtx) =>
    queryWithNaturalLanguage(ctx.entityId, ctx.tenantId,
      'bu ay gelir gider özeti ve toplam alacak borç durumu'),
}
