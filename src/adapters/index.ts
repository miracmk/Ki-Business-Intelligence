import { ZohoAdapter } from './zoho.js'
import { PostgreSqlAdapter } from './postgresql.js'
import { CrmAdapter, type CrmCredentials } from './base.js'
import { QuickBooksAdapter } from './quickbooks.js'
import { XeroAdapter } from './xero.js'
import { ZohoBooksAdapter } from './zoho-books.js'
import { WaveAdapter } from './wave.js'
import { AccountingAdapter, type AccountingCredentials } from './accounting-base.js'

// Salesforce, HubSpot, SAP, Dynamics, NetSuite, Odoo, ERPNext
// — stubs now, same interface, implement incrementally
class NotImplementedAdapter extends CrmAdapter {
  constructor(creds: CrmCredentials, private name: string) { super(creds) }
  get type() { return this.name }

  private get crmIdField(): string {
    switch (this.name) {
      case 'salesforce':     return 'Id'
      case 'hubspot':        return 'id'
      case 'sap':            return 'DocEntry'
      case 'oracle_netsuite': return 'internalId'
      case 'dynamics365':    return 'accountid'
      case 'odoo':           return 'id'
      case 'erpnext':        return 'name'
      case 'pipedrive':      return 'id'
      case 'freshsales':     return 'id'
      case 'monday':         return 'id'
      case 'bitrix24':       return 'ID'
      case 'sugarcrm':       return 'id'
      case 'dynamics_bc':    return 'id'
      case 'oracle_fusion':  return 'PartyId'
      case 'odoo_erp':       return 'id'
      case 'epicor':         return 'SysRowID'
      case 'infor':          return 'id'
      case 'sage_intacct':   return 'RECORDNO'
      case 'acumatica':      return 'id'
      default:               return 'id'
    }
  }

  async validateConnection() { return { ok: false, error: `${this.name} adapter not yet implemented` } }
  async getModules()                    { return [] }
  async getModuleFields()               { return [] }
  async getRelatedLists()               { return [] }
  async search()                        { return [] }
  async getRecord()                     { return null }
  async createRecord(m: string, d: any) { return { id: '', module: m, crm_id: '', crm_id_field: this.crmIdField, data: d } }
  async updateRecord(m: string, id: string, d: any) { return { id, module: m, crm_id: id, crm_id_field: this.crmIdField, data: d } }
  async deleteRecord()                  {}
  async startBulkRead()                 { return { jobId: '', module: '', status: 'failed' as const } }
  async *downloadBulkResult(): AsyncIterable<Record<string, unknown>> {}
  async subscribeNotifications()        { return { channelId: '', expiresAt: '' } }
  async renewNotifications()            { return { channelId: '', expiresAt: '' } }
}

// Accounting stubs
class NotImplementedAccountingAdapter extends AccountingAdapter {
  constructor(creds: AccountingCredentials, private name: string) { super(creds) }
  get type() { return this.name }
  async validateConnection() { return { ok: false, error: `${this.name} adapter not yet implemented` } }
  async getInvoices() { return [] }
  async getPayments() { return [] }
  async getCustomers() { return [] }
  async getAccounts() { return [] }
  async syncAll() {}
}

export function createAdapter(creds: CrmCredentials): CrmAdapter {
  switch (creds.type) {
    // ── CRM types ──
    case 'zoho':           return new ZohoAdapter(creds)
    case 'salesforce':     return new NotImplementedAdapter(creds, 'salesforce')
    case 'hubspot':        return new NotImplementedAdapter(creds, 'hubspot')
    case 'dynamics365':    return new NotImplementedAdapter(creds, 'dynamics365')
    case 'pipedrive':      return new NotImplementedAdapter(creds, 'pipedrive')
    case 'freshsales':     return new NotImplementedAdapter(creds, 'freshsales')
    case 'monday':         return new NotImplementedAdapter(creds, 'monday')
    case 'odoo':           return new NotImplementedAdapter(creds, 'odoo')
    case 'bitrix24':       return new NotImplementedAdapter(creds, 'bitrix24')
    case 'sugarcrm':       return new NotImplementedAdapter(creds, 'sugarcrm')
    // ── ERP types ──
    case 'sap':            return new NotImplementedAdapter(creds, 'sap')
    case 'oracle_netsuite': return new NotImplementedAdapter(creds, 'oracle_netsuite')
    case 'dynamics_bc':    return new NotImplementedAdapter(creds, 'dynamics_bc')
    case 'oracle_fusion':  return new NotImplementedAdapter(creds, 'oracle_fusion')
    case 'odoo_erp':       return new NotImplementedAdapter(creds, 'odoo_erp')
    case 'erpnext':        return new NotImplementedAdapter(creds, 'erpnext')
    case 'epicor':         return new NotImplementedAdapter(creds, 'epicor')
    case 'infor':          return new NotImplementedAdapter(creds, 'infor')
    case 'sage_intacct':   return new NotImplementedAdapter(creds, 'sage_intacct')
    case 'acumatica':      return new NotImplementedAdapter(creds, 'acumatica')
    // ── Direct DB types ──
    case 'postgresql':     return new PostgreSqlAdapter(creds)
    case 'mysql':          return new NotImplementedAdapter(creds, 'mysql')
    default: throw new Error(`Unknown CRM type: ${creds.type}`)
  }
}

export function createAccountingAdapter(creds: AccountingCredentials): AccountingAdapter {
  switch (creds.type) {
    case 'quickbooks':        return new QuickBooksAdapter(creds)
    case 'xero':              return new XeroAdapter(creds)
    case 'zoho_books':        return new ZohoBooksAdapter(creds)
    case 'wave':              return new WaveAdapter(creds)
    case 'freshbooks':        return new NotImplementedAccountingAdapter(creds, 'freshbooks')
    case 'sage_accounting':   return new NotImplementedAccountingAdapter(creds, 'sage_accounting')
    case 'dynamics_finance':  return new NotImplementedAccountingAdapter(creds, 'dynamics_finance')
    case 'iyzico':            return new NotImplementedAccountingAdapter(creds, 'iyzico')
    case 'parasut':           return new NotImplementedAccountingAdapter(creds, 'parasut')
    default: throw new Error(`Unknown accounting type: ${creds.type}`)
  }
}

export { CrmAdapter } from './base.js'
export type { CrmCredentials, CrmRecord, SearchParams } from './base.js'
export { AccountingAdapter } from './accounting-base.js'
export type { AccountingCredentials, AccountingRecord } from './accounting-base.js'
