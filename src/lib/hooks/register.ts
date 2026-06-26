// FAZ 5.2/6.2: side-effect module — import once at boot (server.ts) to wire lifecycle hooks.
import { registerAfterSaveHook, registerBeforeSaveHook } from './lifecycle.js'
import { aiFieldHook } from './handlers/ai-field-hook.js'
import { ruleEngineHook } from './handlers/rule-engine-hook.js'
import { blueprintGateHook } from './handlers/blueprint-gate-hook.js'

registerAfterSaveHook(aiFieldHook)
registerAfterSaveHook(ruleEngineHook)
registerBeforeSaveHook(blueprintGateHook)
