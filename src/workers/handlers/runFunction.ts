// FAZ 5.5/7.3 bridge: `run_function` actions are accepted now so rule authors aren't blocked,
// but the FAZ 7 executor (node:vm + AST guard) doesn't exist yet — this is a stub that logs
// and succeeds (not a throw) so it doesn't endlessly retry until FAZ 7 lands.
export interface RunFunctionJobData {
  functionId: string
  moduleKey: string
  recordId: string
}

export async function runFunctionHandler(data: RunFunctionJobData): Promise<void> {
  console.warn(`[run_function] FAZ 7 henüz uygulanmadı — functionId=${data.functionId} atlandı (module=${data.moduleKey}, record=${data.recordId})`)
}
