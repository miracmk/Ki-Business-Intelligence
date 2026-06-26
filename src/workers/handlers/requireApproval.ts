// FAZ 5.5/6 bridge: `require_approval` actions are accepted now so rule authors aren't
// blocked, but the FAZ 6 approval queue (blueprint_approvals) doesn't exist yet — stub.
export interface RequireApprovalJobData {
  moduleKey: string
  recordId: string
  role?: string
}

export async function requireApprovalHandler(data: RequireApprovalJobData): Promise<void> {
  console.warn(`[require_approval] FAZ 6 henüz uygulanmadı — atlandı (module=${data.moduleKey}, record=${data.recordId}, role=${data.role ?? '-'})`)
}
