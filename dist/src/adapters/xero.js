import { AccountingAdapter } from './accounting-base.js';
export class XeroAdapter extends AccountingAdapter {
    type = 'xero';
    async validateConnection() {
        return { ok: false, error: 'Xero adapter not yet implemented' };
    }
    async getInvoices() {
        return [];
    }
    async getPayments() {
        return [];
    }
    async getCustomers() {
        return [];
    }
    async getAccounts() {
        return [];
    }
    async syncAll() { }
}
//# sourceMappingURL=xero.js.map