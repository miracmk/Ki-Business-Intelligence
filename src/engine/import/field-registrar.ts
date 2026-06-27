// FAZ 10.5: import-time auto field registration. CSV/XLSX headers that don't match any known
// system column or already-registered custom field become NAMED custom fields in kibi_fields
// (same shape src/api/routes/metadata.ts's manual "add field" endpoint creates — columnName:
// null, lives in custom_fields JSONB) — never dumped anonymously under the raw header text,
// which is what would happen if the row were handed to recordsCreate/Update unchanged (unknown
// keys are silently dropped there, not even blobbed).
import { db } from '../../lib/db.js'
import { kibiFields } from '../../../db/schema.js'
import { getModuleSchema, invalidateModuleSchemaCache } from '../../lib/metadata/resolver.js'

// Same camelCase convention metadata.ts's newFieldSchema enforces.
const FIELD_KEY_RE = /^[a-zA-Z][a-zA-Z0-9]*$/

const TR_TRANSLIT: Record<string, string> = {
  ı: 'i', İ: 'I', ğ: 'g', Ğ: 'G', ş: 's', Ş: 'S', ö: 'o', Ö: 'O', ü: 'u', Ü: 'U', ç: 'c', Ç: 'C',
}

function toFieldKey(header: string, fallbackIndex: number): string {
  const translit = header.replace(/[ışŞğĞöÖüÜçÇİ]/g, (c) => TR_TRANSLIT[c] ?? c)
  const ascii = translit.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  const words = ascii.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  let candidate = ''
  if (words.length > 0) {
    const [first, ...rest] = words
    candidate = first.toLowerCase() + rest.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('')
  }
  return FIELD_KEY_RE.test(candidate) ? candidate : `customField${fallbackIndex}`
}

export interface FieldRegistrationResult {
  headerKeyMap: Map<string, string> // original header -> field key to use when writing via recordsCreate/Update
  registeredFields: string[]        // newly created field keys, for commit-response visibility
}

export async function ensureFieldsRegistered(entityId: string, moduleKey: string, headers: string[]): Promise<FieldRegistrationResult> {
  const moduleRow = await db.query.kibiModules.findFirst({
    where: (t, { eq, and }) => and(eq(t.entityId, entityId), eq(t.key, moduleKey)),
  })
  if (!moduleRow) throw new Error(`Modül bulunamadı: ${moduleKey}`)

  const moduleSchema = await getModuleSchema(entityId, moduleKey)
  const knownKeys = new Set<string>([
    ...(moduleSchema ? Object.keys(moduleSchema.columnMap) : []),
    ...(moduleSchema ? moduleSchema.customFieldKeys : []),
  ])
  const usedKeys = new Set(knownKeys)

  const existing = await db.query.kibiFields.findMany({ where: (t, { eq }) => eq(t.moduleId, moduleRow.id) })
  let position = existing.length

  const headerKeyMap = new Map<string, string>()
  const registeredFields: string[] = []
  let fallbackIndex = 0

  for (const header of headers) {
    if (knownKeys.has(header)) { headerKeyMap.set(header, header); continue }

    const candidate = toFieldKey(header, ++fallbackIndex)
    if (knownKeys.has(candidate)) {
      // Header text differs from an existing key only cosmetically (case/punctuation/Turkish
      // chars) — reuse the existing field instead of registering a near-duplicate.
      headerKeyMap.set(header, candidate)
      continue
    }

    // Guard against two DIFFERENT new headers in the same import normalizing to the same
    // candidate (e.g. "İlçe" and "ilce") — would otherwise silently merge two source columns
    // into one field, last-value-wins.
    let finalKey = candidate
    let suffix = 2
    while (usedKeys.has(finalKey)) finalKey = `${candidate}${suffix++}`

    await db.insert(kibiFields).values({
      moduleId: moduleRow.id,
      key: finalKey,
      columnName: null,
      label: header,
      type: 'text',
      isSystem: false,
      isRequired: false,
      config: {},
      position: position++,
    })
    usedKeys.add(finalKey)
    registeredFields.push(finalKey)
    headerKeyMap.set(header, finalKey)
  }

  if (registeredFields.length > 0) invalidateModuleSchemaCache(entityId)
  return { headerKeyMap, registeredFields }
}
