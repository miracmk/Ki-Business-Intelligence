/**
 * KB Signal Writer — Entity konuşmalarından anonim sinyal → KIBI KB
 * Kişisel veri ASLA KIBI KB'ye gitmez — sadece yapısal sinyal
 */

import { aiEmbed } from './gateway.js'
import { qdrant } from '../../lib/qdrant.js'
import { db } from '../../lib/db.js'
import { aiPipelineLogs } from '../../../db/schema.js'

export interface KbSignal {
  entitySector: string // tenant.settings.industry
  entitySizeCategory: string // 'micro' | 'small' | 'medium' | 'large'
  entityRegion: string // tenant.settings.country veya timezone'dan
  intentType: string // 'support' | 'sales' | 'info' | 'general'
  problemCategory?: string // support_problem çıktısından
  solutionFound?: boolean // support_solution çıktısından
  solutionSource?: string // 'kb' | 'web' | 'escalated'
  confidenceScore?: number // çözüm güven skoru
  kbCategoryUsed?: string // hangi KB katalogundan çözüm bulundu
  language: string // konuşma dili
  sessionTurnCount: number // kaç mesaj sürdü
}

export async function writeKbSignal(signal: KbSignal, entityId?: string): Promise<void> {
  try {
    const signalText = buildSignalText(signal)

    // Embedding üret
    const embeddings = await aiEmbed(signalText, 'huggingface::BAAI/bge-m3')
    const embedding = embeddings[0]
    if (!embedding || embedding.length === 0) return

    // Qdrant'a kaydet: ki_platform_knowledge collection
    await qdrant.upsert('ki_platform_knowledge', {
      points: [
        {
          id: Math.random() * 1000000,
          vector: embedding,
          payload: {
            type: 'operational_signal',
            ...signal,
            entityId: entityId || null,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    })

    // ai_pipeline_logs'a yaz
    if (entityId) {
      await db.insert(aiPipelineLogs).values({
        entityId,
        pipelineType: 'platform',
        modelRole: 'kb_signal_writer',
        success: true,
        kbWritten: true,
        confidenceScore: signal.confidenceScore,
      })
    }
  } catch (e) {
    console.warn('[KB-SIGNAL-WRITER] Failed:', (e as Error).message)
  }
}

function buildSignalText(signal: KbSignal): string {
  const parts: string[] = [
    `Sektör: ${signal.entitySector}`,
    `Büyüklük: ${signal.entitySizeCategory}`,
    `Bölge: ${signal.entityRegion}`,
    `Niyet: ${signal.intentType}`,
    `Mesaj Sayısı: ${signal.sessionTurnCount}`,
    `Dil: ${signal.language}`,
  ]

  if (signal.problemCategory) parts.push(`Problem: ${signal.problemCategory}`)
  if (signal.solutionFound !== undefined) parts.push(`Çözüm Bulundu: ${signal.solutionFound}`)
  if (signal.solutionSource) parts.push(`Kaynak: ${signal.solutionSource}`)
  if (signal.kbCategoryUsed) parts.push(`KB Kategorisi: ${signal.kbCategoryUsed}`)
  if (signal.confidenceScore) parts.push(`Güven: ${signal.confidenceScore}`)

  return parts.join(' | ')
}
