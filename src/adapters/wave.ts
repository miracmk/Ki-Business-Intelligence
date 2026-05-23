import { AccountingAdapter, type AccountingCredentials, type AccountingRecord } from './accounting-base.js'

export interface WaveCreds extends AccountingCredentials {
  type: 'wave'
}

export class WaveAdapter extends AccountingAdapter {
  readonly type = 'wave'

  async validateConnection() {
    return { ok: false, error: 'Wave adapter not yet implemented' }
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
