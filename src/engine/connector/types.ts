/**
 * Connector AI — Semantic katalog türleri
 * Scanned tablo ve field'lardan semantic bilgi çıkarma
 */

export type SemanticRole =
  | 'identifier' | 'person_name' | 'person_name_first' | 'person_name_last'
  | 'company_name' | 'email' | 'phone' | 'address' | 'country' | 'url'
  | 'amount_money' | 'balance' | 'quantity' | 'unit_price' | 'tax_amount'
  | 'discount' | 'currency_code' | 'probability_score'
  | 'date_created' | 'date_updated' | 'date_due'
  | 'status' | 'category' | 'tags' | 'description' | 'notes'
  | 'product_name' | 'product_code'
  | 'unknown'

export type TableIntent =
  | 'customer_entity' | 'lead' | 'transaction' | 'invoice'
  | 'inventory' | 'supplier' | 'employee' | 'product'
  | 'purchase_order' | 'accounting_entry' | 'deal' | 'activity'
  | 'unknown' | 'custom'

export interface ConnectorColumn {
  sourceName: string
  displayName: string
  dataType: string
  semanticRole: SemanticRole
  isQueryable: boolean
  isWritable: boolean
  nullRate: number
  uniqueRatio: number
  sampleValues: any[]
  isPrimaryKey: boolean
  isForeignKey: boolean
  foreignKeyRef?: string
}

export interface ConnectorRelationship {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  relationshipType: 'one_to_many' | 'many_to_one' | 'one_to_one'
  confidenceScore: number
  isExplicitFK: boolean
}

export interface ConnectorDataQuality {
  totalRows: number
  sampledRows: number
  hasNullIds: boolean
  hasDuplicateIds: boolean
  encodingIssues: boolean
  anomalyFlags: string[]
}

export interface CatalogEntry {
  tableName: string
  displayName: string
  tableIntent: TableIntent
  columns: ConnectorColumn[]
  relationships: ConnectorRelationship[]
  queryTemplates: Record<string, string>
  dataQuality: ConnectorDataQuality
  isQueryable: boolean
  isWritable: boolean
  recordCount: number
}

export interface ScannedField {
  name: string
  dataType: string
  sampleValues: any[]
  nullable: boolean
  isPrimaryKey: boolean
  isForeignKey: boolean
}

export interface ScannedTable {
  name: string
  displayName: string
  recordCount: number
  fields: ScannedField[]
  sampleRows: Record<string, any>[]
}
