// FAZ 8.2: CSV/Excel import + dedup. HubSpot-style matching: email exact match first, then
// fuzzy name+company (Dice coefficient over character bigrams — no new dependency needed for
// this). Parsing reuses the same libs as src/engine/knowledge/file-extractor.ts (Papa/ExcelJS).
import Papa from 'papaparse'
import ExcelJS from 'exceljs'

export interface ImportRow {
  firstName?: string
  lastName?: string
  fullName?: string
  email?: string
  phone?: string
  companyName?: string
  [key: string]: unknown
}

export interface ExistingContact {
  id: string
  email?: string | null
  fullName?: string | null
  companyName?: string | null
}

export interface DedupResult {
  row: ImportRow
  match: 'exact' | 'fuzzy' | 'new'
  existingId?: string
  score?: number
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ')
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
  return set
}

function diceCoefficient(a: string, b: string): number {
  const A = bigrams(a)
  const B = bigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let intersection = 0
  for (const bg of A) if (B.has(bg)) intersection++
  return (2 * intersection) / (A.size + B.size)
}

const FUZZY_THRESHOLD = 0.6

export function dedupContacts(rows: ImportRow[], existing: ExistingContact[]): DedupResult[] {
  return rows.map((row) => {
    const email = row.email?.trim().toLowerCase()
    if (email) {
      const exact = existing.find((e) => e.email?.trim().toLowerCase() === email)
      if (exact) return { row, match: 'exact', existingId: exact.id, score: 1 }
    }

    const name = normalize(row.fullName || `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim())
    const company = normalize(row.companyName ?? '')
    let best: { id: string; score: number } | null = null
    for (const e of existing) {
      const eName = normalize(e.fullName ?? '')
      const eCompany = normalize(e.companyName ?? '')
      if (!name && !company) continue
      const nameScore = name && eName ? diceCoefficient(name, eName) : 0
      const companyScore = company && eCompany ? diceCoefficient(company, eCompany) : 0
      const score = nameScore * 0.7 + companyScore * 0.3
      if (score > FUZZY_THRESHOLD && (!best || score > best.score)) best = { id: e.id, score }
    }
    if (best) return { row, match: 'fuzzy', existingId: best.id, score: best.score }
    return { row, match: 'new' }
  })
}

// Headers must match field keys directly (firstName, lastName, email, phone, companyName) —
// no fuzzy header-mapping UI in this version; document this constraint to import-flow users.
export function parseImportRows(buffer: Buffer, filename: string): ImportRow[] {
  const ext = filename.toLowerCase().split('.').pop()
  if (ext === 'csv') {
    const parsed = Papa.parse<ImportRow>(buffer.toString('utf8'), { header: true, skipEmptyLines: true })
    return parsed.data
  }
  throw new Error('XLSX dosyaları için parseImportRowsXlsx kullanın (async)')
}

export async function parseImportRowsXlsx(buffer: Buffer): Promise<ImportRow[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(new Uint8Array(buffer) as any)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []

  let headers: string[] = []
  const rows: ImportRow[] = []
  sheet.eachRow((row, rowNumber) => {
    const cells = (row.values as unknown[]).slice(1).map((v) => (v == null ? '' : String(v)))
    if (rowNumber === 1) { headers = cells; return }
    const obj: ImportRow = {}
    headers.forEach((h, i) => { if (h) obj[h] = cells[i] ?? '' })
    if (Object.values(obj).some((v) => String(v).trim())) rows.push(obj)
  })
  return rows
}
