/**
 * Extracts plain text from uploaded KB files (PDF/DOCX/XLSX/CSV/HTML/TXT) into a
 * canonical text format for chunking. Ported from the n8n "Qdrant Sales Agent
 * Vector Store Update" workflow's per-format extraction logic, with its DOCX bug
 * fixed (the n8n node ran DOCX through a PDF parser by mistake).
 */
import mammoth     from 'mammoth'
import ExcelJS      from 'exceljs'
import Papa         from 'papaparse'

export type SupportedFileType = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'html' | 'txt'

export function detectFileType(fileName: string, mimeType?: string): SupportedFileType | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  if (['pdf'].includes(ext)) return 'pdf'
  if (['docx'].includes(ext)) return 'docx'
  if (['xlsx', 'xls'].includes(ext)) return 'xlsx'
  if (['csv'].includes(ext)) return 'csv'
  if (['html', 'htm'].includes(ext)) return 'html'
  if (['txt', 'md'].includes(ext)) return 'txt'
  if (mimeType?.includes('pdf')) return 'pdf'
  if (mimeType?.includes('wordprocessingml')) return 'docx'
  if (mimeType?.includes('spreadsheetml') || mimeType?.includes('ms-excel')) return 'xlsx'
  if (mimeType?.includes('csv')) return 'csv'
  if (mimeType?.includes('html')) return 'html'
  return null
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
  return result.value
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(new Uint8Array(buffer) as any)
  const lines: string[] = []
  workbook.eachSheet((sheet) => {
    lines.push(`# ${sheet.name}`)
    sheet.eachRow((row) => {
      const cells = (row.values as unknown[]).slice(1).map((v) => (v == null ? '' : String(v)))
      if (cells.some((c) => c.trim())) lines.push(cells.join(' | '))
    })
  })
  return lines.join('\n')
}

function extractCsv(buffer: Buffer): string {
  const parsed = Papa.parse<string[]>(buffer.toString('utf8'), { skipEmptyLines: true })
  return parsed.data.map((row) => row.join(' | ')).join('\n')
}

/** Strips tags/scripts/styles, decodes a few common entities — mirrors the n8n regex-based HTML extractor. */
function extractHtml(buffer: Buffer): string {
  const html = buffer.toString('utf8')
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function extractText(buffer: Buffer, fileType: SupportedFileType): Promise<string> {
  switch (fileType) {
    case 'pdf':          return extractPdf(buffer)
    case 'docx':         return extractDocx(buffer)
    case 'xlsx':         return extractXlsx(buffer)
    case 'csv':          return extractCsv(buffer)
    case 'html':          return extractHtml(buffer)
    case 'txt':           return buffer.toString('utf8')
  }
}
