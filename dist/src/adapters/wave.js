import { AccountingAdapter } from './accounting-base.js';
export class WaveAdapter extends AccountingAdapter {
    type = 'wave';
    async validateConnection() {
        return { ok: false, error: 'Wave adapter not yet implemented' };
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
//# sourceMappingURL=wave.js.map