/**
 * CRM Adapter base — every CRM implements this interface.
 * The sync engine and AI tools call through this, never directly to CRM APIs.
 */
export class CrmAdapter {
    creds;
    constructor(creds) {
        this.creds = creds;
    }
}
//# sourceMappingURL=base.js.map