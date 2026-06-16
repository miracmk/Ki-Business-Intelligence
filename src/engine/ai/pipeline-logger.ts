import { db }              from '../../lib/db.js'
import { aiPipelineLogs } from '../../../db/schema.js'

export interface PipelineLogEntry {
  entityId?:        string
  sessionId?:       string
  pipelineType:     'entity' | 'platform'
  modelRole:        string
  modelUsed:        string
  inputTokens?:     number
  outputTokens?:    number
  latencyMs:        number
  success:          boolean
  errorMessage?:    string
  confidenceScore?: number
  escalated?:       boolean
  kbWritten?:       boolean
}

export async function logPipelineStep(entry: PipelineLogEntry): Promise<void> {
  try {
    await db.insert(aiPipelineLogs).values({
      entityId:        entry.entityId ?? null,
      sessionId:       entry.sessionId ?? null,
      pipelineType:    entry.pipelineType,
      modelRole:       entry.modelRole,
      modelUsed:       entry.modelUsed,
      inputTokens:     entry.inputTokens ?? null,
      outputTokens:    entry.outputTokens ?? null,
      latencyMs:       entry.latencyMs,
      success:         entry.success,
      errorMessage:    entry.errorMessage ?? null,
      confidenceScore: entry.confidenceScore ?? null,
      escalated:       entry.escalated ?? false,
      kbWritten:       entry.kbWritten ?? false,
    })
  } catch { /* non-fatal */ }
}
