/**
 * Chunking + hash-based identity helpers for KB documents (Entity KB + KIBI AI KB).
 *
 * Point IDs: Qdrant only accepts u64 or UUID — a raw SHA256 hex string is rejected.
 * We derive a deterministic UUIDv5 from (documentId + chunkHash), so re-uploading
 * the same content for the same document always lands on the same Qdrant point.
 */
import { createHash } from 'crypto'
import { v5 as uuidv5 } from 'uuid'

const KB_UUID_NAMESPACE = '7b6a1e8a-2f4b-4c3d-9a1e-5b6c7d8e9f00'

const CHUNK_SIZE    = 1200  // chars, approximates RecursiveCharacterTextSplitter defaults
const CHUNK_OVERLAP = 150

/** Trim, lowercase, unicode-normalize, collapse whitespace — applied before hashing only. */
export function normalizeForHash(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function chunkHash(chunkText: string): string {
  return sha256Hex(normalizeForHash(chunkText))
}

export function qdrantPointId(documentId: string, hash: string): string {
  return uuidv5(`${documentId}:${hash}`, KB_UUID_NAMESPACE)
}

/** Recursive-ish character splitter: paragraph → newline → sentence → hard cut, with overlap. */
export function splitIntoChunks(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return []
  if (clean.length <= size) return [clean]

  const chunks: string[] = []
  let start = 0
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length)
    if (end < clean.length) {
      const slice = clean.slice(start, end)
      const breakPoint = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'), slice.lastIndexOf('. '))
      if (breakPoint > size * 0.5) end = start + breakPoint + 1
    }
    const piece = clean.slice(start, end).trim()
    if (piece) chunks.push(piece)
    if (end >= clean.length) break
    start = end - overlap
  }
  return chunks
}

/** "abc-ltd" + "company_info" + "pdf" → "abc-ltd-companyinfo.pdf" */
export function normalizedFileName(prefix: string, category: string, ext: string): string {
  const slug = prefix.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const cat  = category.toLowerCase().replace(/_/g, '')
  return `${slug}-${cat}.${ext.toLowerCase()}`
}

export interface PreparedChunk {
  index: number
  text:  string
  hash:  string
}

export function prepareChunks(text: string): PreparedChunk[] {
  return splitIntoChunks(text).map((chunkText, index) => ({
    index,
    text: chunkText,
    hash: chunkHash(chunkText),
  }))
}
