// FAZ 7.1: AST denylist. NOTE — this is defense-in-depth / fast user feedback, NOT the
// security boundary. The roadmap originally specified node:vm + this AST check as the
// sandbox; that combination doesn't actually contain malicious code (any host-realm object
// crossing into a vm context — like the ctx.records/ctx.http bindings this very feature
// needs — exposes `.constructor.constructor` back to the host Function constructor, with
// none of the tokens below ever appearing). The real boundary here is the V8 isolate
// (src/engine/functions/executor.ts, isolated-vm) — true memory/CPU isolation, no shared
// realm to escape into. This check exists to reject obviously-bad code early with a useful
// error message, and because the roadmap explicitly asks for it — not because it's load-bearing.
import { parse } from 'acorn'
import { simple as walkSimple } from 'acorn-walk'

const BANNED_IDENTIFIERS = new Set([
  'require', 'process', 'eval', 'Function', 'fs', 'child_process', 'global', 'globalThis',
])

export type AstGuardResult = { ok: true } | { ok: false; error: string }

export function validateFunctionCode(code: string): AstGuardResult {
  let ast: any
  try {
    // Parsed in the same async-function shape executor.ts actually runs it in — otherwise
    // a bare `await` at the textual top of valid async function-body code looks like
    // (invalid) top-level await in a 'script', and every async user function gets rejected.
    ast = parse(`(async () => {\n${code}\n})`, { ecmaVersion: 2022, sourceType: 'script' })
  } catch (err) {
    return { ok: false, error: `Sözdizimi hatası: ${(err as Error).message}` }
  }

  let violation: string | null = null
  walkSimple(ast, {
    Identifier(node: any) {
      if (!violation && BANNED_IDENTIFIERS.has(node.name)) {
        violation = `Yasaklı tanımlayıcı kullanıldı: '${node.name}'`
      }
    },
    ImportExpression() {
      if (!violation) violation = "Dinamik import() kullanımı yasak"
    },
    ImportDeclaration() {
      if (!violation) violation = "import bildirimi yasak"
    },
  })

  if (violation) return { ok: false, error: violation }
  return { ok: true }
}
