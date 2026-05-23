import { AccountingAdapter, type AccountingCredentials, type AccountingRecord } from './accounting-base.js'

export interface ZohoBooksCreds extends AccountingCredentials {
  type: 'zoho_books'
}

export class ZohoBooksAdapter extends AccountingAdapter {
  readonly type = 'zoho_books'

  async validateConnection() {
    return { ok: false, error: 'Zoho Books adapter not yet implemented' }
  }

  async getInvoices() {
    return []
  }

  async getPayments() {
    return []
  }

  async getCustomers() {
    return []
  }

  async getAccounts() {
    return []
  }

  async syncAll() {}
}
