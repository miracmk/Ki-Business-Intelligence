/**
 * Zoho CRM Adapter
 * Translated from n8n workflows:
 *   - CRM Bulk Read Initiator    → startBulkRead()
 *   - CRM Bulk Read Processor    → downloadBulkResult()
 *   - CRM Notification Processor → subscribeNotifications()
 *   - Zoho CRM Metadata Sync     → getModules() + getModuleFields()
 *   - zoho_crm_universal tool    → search() + getRecord()
 *   - Zoho Token Manager         → getToken() (internal)
 */
import Papa from 'papaparse';
const csvParse = Papa.parse.bind(Papa);
import { CrmAdapter } from './base.js';
// Modules to skip (from n8n Filter API Supported node)
const EXCLUDED_MODULE_PREFIXES = [
    'commercientquickbooksonline__', 'zohopagesensebeta__', 'zohoassist1__', 'zohosign__',
];
const EXCLUDED_MODULES = new Set([
    'Google_AdWords', 'Marketing_Attribution', 'Desk', 'Social', 'SalesInbox',
    'Reports', 'Analytics', 'Documents', 'Zoho_Books', 'Approvals',
    'Actions_Performed', 'Email_Sentiment', 'DealHistory', 'Consents',
    'Data_Subject_Requests', 'Tasks', 'Email_Analytics', 'Calls',
    'Visits', 'Campaigns', 'Notes', 'Attachments', 'Functions__s',
]);
// Field types to exclude from bulk reads (from n8n Get Module Fields node)
const EXCLUDED_FIELD_TYPES = new Set([
    'lookup', 'ownerlookup', 'fileupload', 'imageupload',
    'subform', 'multiselectlookup', 'consent_lookup',
    'multireminder', 'rollup_summary', 'profileimage',
]);
export class ZohoAdapter extends CrmAdapter {
    type = 'zoho';
    get c() { return this.creds; }
    get apiBase() { return `https://www.zohoapis.${this.c.region}/crm`; }
    get accountsBase() { return `https://accounts.zoho.${this.c.region}`; }
    // ── Token management (replaces "Zoho Token Manager" workflow) ────────────
    tokenCache = null;
    async getToken() {
        if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 60_000) {
            return this.tokenCache.token;
        }
        const res = await fetch(`${this.accountsBase}/oauth/v2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: this.c.clientId,
                client_secret: this.c.clientSecret,
                refresh_token: this.c.refreshToken,
            }),
        });
        if (!res.ok)
            throw new Error(`Zoho token refresh failed: ${res.status}`);
        const data = await res.json();
        if (data.error)
            throw new Error(`Zoho OAuth error: ${data.error}`);
        this.tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
        return this.tokenCache.token;
    }
    async fetch(path, version = 'v8', opts) {
        const token = await this.getToken();
        const url = `${this.apiBase}/${version}${path}`;
        const res = await fetch(url, {
            ...opts,
            headers: {
                Authorization: `Zoho-oauthtoken ${token}`,
                'Content-Type': 'application/json',
                ...(opts?.headers ?? {}),
            },
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Zoho API ${res.status} ${path}: ${body}`);
        }
        return res.json();
    }
    async validateConnection() {
        try {
            await this.getToken();
            return { ok: true };
        }
        catch (e) {
            return { ok: false, error: String(e) };
        }
    }
    // ── Metadata sync (replaces "Zoho CRM Metadata Sync" workflow) ───────────
    async getModules() {
        const data = await this.fetch('/settings/modules');
        return (data.modules ?? [])
            .filter((m) => m['api_supported'] === true)
            .filter((m) => !EXCLUDED_MODULE_PREFIXES.some((p) => String(m['api_name']).startsWith(p)))
            .filter((m) => !EXCLUDED_MODULES.has(String(m['api_name'])))
            .map((m) => ({
            apiName: String(m['api_name']),
            label: String(m['plural_label'] ?? m['module_name']),
            singular: String(m['singular_label'] ?? m['module_name']),
            raw: m,
        }));
    }
    async getModuleFields(module) {
        try {
            const data = await this.fetch(`/settings/fields?module=${module}`);
            return (data.fields ?? [])
                .filter((f) => !EXCLUDED_FIELD_TYPES.has(String(f['data_type'])))
                .filter((f) => !String(f['api_name']).includes('_External_Id'))
                .filter((f) => !String(f['api_name']).startsWith('zohocontracts__'))
                .map((f) => ({
                apiName: String(f['api_name']),
                label: String(f['field_label'] ?? ''),
                dataType: String(f['data_type'] ?? ''),
                fieldType: String(f['field_type'] ?? ''),
                isMandatory: Boolean(f['system_mandatory']),
                isReadOnly: Boolean(f['read_only']),
                isCustomField: Boolean(f['custom_field']),
                maxLength: f['length'],
                pickListValues: f['pick_list_values'],
                lookup: f['lookup'],
                raw: f,
            }));
        }
        catch {
            return [];
        }
    }
    async getRelatedLists(module) {
        try {
            const data = await this.fetch(`/settings/related_lists?module=${module}`);
            return (data.related_lists ?? []).map((r) => ({
                apiName: String(r['api_name']),
                displayLabel: String(r['display_label'] ?? ''),
                module: r['module'],
                type: r['type'],
                raw: r,
            }));
        }
        catch {
            return [];
        }
    }
    // ── Record operations (replaces "zoho_crm_universal" tool) ───────────────
    async search({ module, criteria, fields, page = 1, perPage = 200 }) {
        const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
        if (criteria)
            params.set('criteria', criteria);
        if (fields?.length)
            params.set('fields', fields.join(','));
        try {
            const data = await this.fetch(`/${module}/search?${params}`);
            return (data.data ?? []).map((r) => this.mapRecord(module, r));
        }
        catch {
            return [];
        }
    }
    async getRecord(module, id) {
        try {
            const data = await this.fetch(`/${module}/${id}`);
            return data.data?.[0] ? this.mapRecord(module, data.data[0]) : null;
        }
        catch {
            return null;
        }
    }
    async createRecord(module, data) {
        const res = await this.fetch(`/${module}`, 'v8', { method: 'POST', body: JSON.stringify({ data: [data] }) });
        return this.mapRecord(module, res.data[0]?.details ?? {});
    }
    async updateRecord(module, id, data) {
        const res = await this.fetch(`/${module}/${id}`, 'v8', { method: 'PUT', body: JSON.stringify({ data: [data] }) });
        return this.mapRecord(module, res.data[0]?.details ?? {});
    }
    async deleteRecord(module, id) {
        await this.fetch(`/${module}/${id}`, 'v8', { method: 'DELETE' });
    }
    // ── Bulk Read (replaces "CRM Bulk Read Initiator" workflow) ───────────────
    async startBulkRead(module, callbackUrl) {
        const res = await this.fetch('/bulk/read', 'bulk/v8', {
            method: 'POST',
            body: JSON.stringify({
                callback: { url: callbackUrl, method: 'post' },
                query: { module: { api_name: module } },
            }),
        });
        const item = res.data[0];
        if (!item || item.status !== 'success') {
            throw new Error(`Bulk read job failed for ${module}: ${item?.message}`);
        }
        return { jobId: item.details.id, module, status: 'pending' };
    }
    // ── Bulk result download (replaces "CRM Bulk Read Processor" workflow) ────
    // Called after webhook callback with state=COMPLETED
    async *downloadBulkResult(jobId) {
        // Step 1: download ZIP
        const token = await this.getToken();
        const res = await fetch(`${this.apiBase}/bulk/v8/read/${jobId}/result`, {
            headers: { Authorization: `Zoho-oauthtoken ${token}` },
        });
        if (!res.ok)
            throw new Error(`Bulk download failed: ${res.status}`);
        // Step 2: decompress ZIP → CSV
        // In Node.js we use the CompressionStream API (Node 18+) or unzip manually
        const buffer = await res.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        const csvContent = await unzipFirst(uint8);
        // Step 3: parse CSV (like n8n Parse CSV node)
        const result = csvParse(csvContent, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: false, // keep everything as string like n8n does
        });
        for (const row of result.data) {
            const id = row['Id'] ?? row['id'] ?? row['ID'];
            if (!id)
                continue;
            yield row;
        }
    }
    // ── Real-time notifications (replaces "CRM Notification Processor" webhook) ─
    async subscribeNotifications(modules, callbackUrl) {
        const channelId = Date.now();
        const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const events = modules.flatMap((m) => [`${m}.create`, `${m}.edit`, `${m}.delete`]);
        const res = await this.fetch('/actions/watch', 'v8', {
            method: 'POST',
            body: JSON.stringify({
                watch: [{
                        channel_id: channelId,
                        events,
                        channel_expiry: expiry,
                        notify_url: callbackUrl,
                        token: 'ki_notify_token',
                    }],
            }),
        });
        const ch = res.watch[0];
        return { channelId: String(ch?.channel_id ?? channelId), expiresAt: ch?.expiry ?? expiry };
    }
    async renewNotifications(channelId, callbackUrl) {
        // Same as subscribe with same channel_id
        return this.subscribeNotifications([], callbackUrl).then(() => ({
            channelId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }));
    }
    // ── Internal helpers ──────────────────────────────────────────────────────
    mapRecord(module, data) {
        const crmId = String(data['Id'] ?? data['id'] ?? '');
        return {
            id: crmId,
            module,
            crm_id: crmId,
            crm_id_field: 'Id',
            data,
            createdTime: data['Created_Time'],
            modifiedTime: data['Modified_Time'],
        };
    }
}
// ── ZIP extraction (Node 18+ DecompressionStream) ─────────────────────────────
async function unzipFirst(zipBytes) {
    // Find the first local file header (PK\x03\x04) and extract content
    // For single-file ZIPs from Zoho, we can find the data directly
    const view = new DataView(zipBytes.buffer);
    const sig = 0x04034b50; // local file header signature (little-endian)
    let offset = 0;
    while (offset < zipBytes.length - 4) {
        if (view.getUint32(offset, true) === sig) {
            const fnLen = view.getUint16(offset + 26, true);
            const extraLen = view.getUint16(offset + 28, true);
            const dataStart = offset + 30 + fnLen + extraLen;
            const compSize = view.getUint32(offset + 18, true);
            const method = view.getUint16(offset + 8, true);
            const compData = zipBytes.slice(dataStart, dataStart + compSize);
            if (method === 0) {
                // Stored (no compression)
                return new TextDecoder().decode(compData);
            }
            else if (method === 8) {
                // Deflate
                const ds = new DecompressionStream('deflate-raw');
                const writer = ds.writable.getWriter();
                const reader = ds.readable.getReader();
                writer.write(compData);
                writer.close();
                const chunks = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    chunks.push(value);
                }
                const total = chunks.reduce((n, c) => n + c.length, 0);
                const merged = new Uint8Array(total);
                let pos = 0;
                for (const c of chunks) {
                    merged.set(c, pos);
                    pos += c.length;
                }
                return new TextDecoder().decode(merged);
            }
        }
        offset++;
    }
    throw new Error('No valid ZIP local file header found');
}
//# sourceMappingURL=zoho.js.map