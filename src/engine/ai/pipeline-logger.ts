import { db }              from '../../lib/db.js'
import { aiPipelineLogs } from '../../../db/schema.js'

const PII_PATTERNS = [
  /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi,
  /\b(?:\+?90|0)?\s*[5][0-9]{2}\s*[0-9]{3}\s*[0-9]{2}\s*[0-9]{2}\b/g,
  /\b[0-9]{10,13}\b/g,
]

function sanitizeError(msg: string | undefined): string | undefined {
  if (!msg) return msg
  let s = msg
  for (const p of PII_PATTERNS) s = s.replace(p, '[REDACTED]')
  return s
}

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
      errorMessage:    sanitizeError(entry.errorMessage) ?? null,
      confidenceScore: entry.confidenceScore ?? null,
      escalated:       entry.escalated ?? false,
      kbWritten:       entry.kbWritten ?? false,
    })
  } catch { /* non-fatal */ }
}
