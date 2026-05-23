import { AccountingAdapter, type AccountingCredentials, type AccountingRecord } from './accounting-base.js'

export interface QuickBooksCreds extends AccountingCredentials {
  type: 'quickbooks'
}

export class QuickBooksAdapter extends AccountingAdapter {
  readonly type = 'quickbooks'

  async validateConnection() {
    return { ok: false, error: 'QuickBooks adapter not yet implemented' }
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
