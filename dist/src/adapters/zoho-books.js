import { AccountingAdapter } from './accounting-base.js';
export class ZohoBooksAdapter extends AccountingAdapter {
    type = 'zoho_books';
    async validateConnection() {
        return { ok: false, error: 'Zoho Books adapter not yet implemented' };
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
//# sourceMappingURL=zoho-books.js.map