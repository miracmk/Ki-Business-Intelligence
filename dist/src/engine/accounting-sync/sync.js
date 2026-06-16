import { db } from '../../lib/db.js';
import { accountingRecords, accountingSyncState } from '../../../db/schema.js';
import { createAccountingAdapter } from '../../adapters/index.js';
import { decryptJson } from '../../lib/crypto.js';
export async function syncAccounting(connectionId) {
    const conn = await loadConnection(connectionId);
    const adapter = createAccountingAdapter(conn.creds);
    const now = new Date();
    // Sync invoices
    const invoices = await adapter.getInvoices();
    for (const inv of invoices) {
        await db.insert(accountingRecords).values({
            connectionId,
            tenantId: conn.tenantId,
            recordType: 'invoice',
            accountingId: inv.accounting_id,
            data: inv.data,
            lastSyncedAt: now,
        }).onConflictDoUpdate({
            target: [accountingRecords.connectionId, accountingRecords.recordType, accountingRecords.accountingId],
            set: { data: inv.data, lastSyncedAt: now },
        });
    }
    // Sync payments
    const payments = await adapter.getPayments();
    for (const pay of payments) {
        await db.insert(accountingRecords).values({
            connectionId,
            tenantId: conn.tenantId,
            recordType: 'payment',
            accountingId: pay.accounting_id,
            data: pay.data,
            lastSyncedAt: now,
        }).onConflictDoUpdate({
            target: [accountingRecords.connectionId, accountingRecords.recordType, accountingRecords.accountingId],
            set: { data: pay.data, lastSyncedAt: now },
        });
    }
    // Sync customers
    const customers = await adapter.getCustomers();
    for (const cust of customers) {
        await db.insert(accountingRecords).values({
            connectionId,
            tenantId: conn.tenantId,
            recordType: 'customer',
            accountingId: cust.accounting_id,
            data: cust.data,
            lastSyncedAt: now,
        }).onConflictDoUpdate({
            target: [accountingRecords.connectionId, accountingRecords.recordType, accountingRecords.accountingId],
            set: { data: cust.data, lastSyncedAt: now },
        });
    }
    // Update sync state
    for (const type of ['invoice', 'payment', 'customer']) {
        const count = await db.query.accountingRecords.findMany({
            where: (t, { and, eq }) => and(eq(t.connectionId, connectionId), eq(t.recordType, type)),
        });
        await db.insert(accountingSyncState).values({
            connectionId,
            recordType: type,
            lastSync: now,
            totalRecords: count.length,
            status: 'done',
        }).onConflictDoUpdate({
            target: [accountingSyncState.connectionId, accountingSyncState.recordType],
            set: { lastSync: now, totalRecords: count.length, status: 'done' },
        });
    }
}
async function loadConnection(connectionId) {
    const conn = await db.query.accountingConnections.findFirst({
        where: (t, { eq }) => eq(t.id, connectionId),
    });
    if (!conn)
        throw new Error(`Connection not found: ${connectionId}`);
    const creds = decryptJson(conn.credentials);
    return { ...conn, creds };
}
//# sourceMappingURL=sync.js.map