import { AccountingAdapter } from './accounting-base.js';
export class QuickBooksAdapter extends AccountingAdapter {
    type = 'quickbooks';
    async validateConnection() {
        return { ok: false, error: 'QuickBooks adapter not yet implemented' };
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
//# sourceMappingURL=quickbooks.js.map