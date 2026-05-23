export interface AccountingCredentials {
  type: string
  [key: string]: unknown
}

export interface AccountingRecord {
  accounting_id: string
  record_type: string
  data: Record<string, unknown>
}

export abstract class AccountingAdapter {
  abstract readonly type: string

  constructor(protected creds: AccountingCredentials) {}

  abstract validateConnection(): Promise<{ ok: boolean; error?: string }>

  abstract getInvoices(params?: { from?: string; to?: string; page?: number }): Promise<AccountingRecord[]>

  abstract getPayments(params?: any): Promise<AccountingRecord[]>

  abstract getCustomers(params?: any): Promise<AccountingRecord[]>

  abstract getAccounts(): Promise<AccountingRecord[]>

  abstract syncAll(): Promise<void>
}
