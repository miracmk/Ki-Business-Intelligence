// FAZ 5.2: side-effect module — import once at boot (server.ts) to wire afterSave hooks.
import { registerAfterSaveHook } from './lifecycle.js'
import { aiFieldHook } from './handlers/ai-field-hook.js'
import { ruleEngineHook } from './handlers/rule-engine-hook.js'

registerAfterSaveHook(aiFieldHook)
registerAfterSaveHook(ruleEngineHook)
