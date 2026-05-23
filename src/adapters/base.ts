/**
 * CRM Adapter base — every CRM implements this interface.
 * The sync engine and AI tools call through this, never directly to CRM APIs.
 */

export interface CrmCredentials {
  type: string
  [key: string]: unknown
}

export interface CrmModule {
  apiName:  string
  label:    string
  singular: string
}

export interface CrmRecord {
  id:           string
  module:       string
  crm_id:       string
  crm_id_field: string
  data:         Record<string, unknown>
  createdTime?: string
  modifiedTime?: string
}

export interface SearchParams {
  module:    string
  criteria?: string      // e.g. "(Email:equals:foo@bar.com)"
  fields?:   string[]
  page?:     number
  perPage?:  number
}

export interface BulkJob {
  jobId:   string
  module:  string
  status:  'pending' | 'running' | 'done' | 'failed'
  downloadUrl?: string
  count?:  number
}

export interface NotifSubscription {
  channelId:  string
  expiresAt:  string
}

export abstract class CrmAdapter {
  abstract readonly type: string

  constructor(protected creds: CrmCredentials) {}

  abstract validateConnection(): Promise<{ ok: boolean; error?: string }>
  abstract getModules(): Promise<CrmModule[]>
  abstract getModuleFields(module: string): Promise<Array<{
    apiName: string; label: string; dataType: string; fieldType: string
    isMandatory: boolean; isReadOnly: boolean; isCustomField: boolean
    maxLength?: number; pickListValues?: unknown[]; lookup?: unknown
  }>>
  abstract getRelatedLists(module: string): Promise<Array<{
    apiName: string; displayLabel: string; module?: string; type?: string
  }>>

  abstract search(params: SearchParams): Promise<CrmRecord[]>
  abstract getRecord(module: string, id: string): Promise<CrmRecord | null>
  abstract createRecord(module: string, data: Record<string, unknown>): Promise<CrmRecord>
  abstract updateRecord(module: string, id: string, data: Record<string, unknown>): Promise<CrmRecord>
  abstract deleteRecord(module: string, id: string): Promise<void>

  // Async bulk sync (callback-based, like Zoho Bulk Read)
  abstract startBulkRead(module: string, callbackUrl: string): Promise<BulkJob>
  abstract downloadBulkResult(jobId: string): AsyncIterable<Record<string, unknown>>

  // Real-time push notifications
  abstract subscribeNotifications(
    modules: string[],
    callbackUrl: string,
  ): Promise<NotifSubscription>
  abstract renewNotifications(channelId: string, callbackUrl: string): Promise<NotifSubscription>
}
