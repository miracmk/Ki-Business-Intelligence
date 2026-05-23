import { AccountingAdapter, type AccountingCredentials, type AccountingRecord } from './accounting-base.js'

export interface XeroCreds extends AccountingCredentials {
  type: 'xero'
}

export class XeroAdapter extends AccountingAdapter {
  readonly type = 'xero'

  async validateConnection() {
    return { ok: false, error: 'Xero adapter not yet implemented' }
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
