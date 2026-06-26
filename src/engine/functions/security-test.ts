// FAZ 7: manual security regression script for the custom function executor. Run after ANY
// change to executor.ts / ast-guard.ts / safe-fetch.ts / records-bridge.ts:
//   docker exec ki_worker npx tsx src/engine/functions/security-test.ts
// (must run inside ki_worker — isolated-vm's prebuilt binary + DB access live there.)
//
// This is not wired into a CI test runner — this repo has no test framework configured.
// It's a deliberate, repeatable check for the one thing that matters most here: that user
// function code can never reach the host realm (process, fs, the real Function constructor)
// even via a host-realm object the bridge itself hands back (ctx.records.find's result).
// A green run here is the actual evidence backing KIBIPR.md's "isolate contains escapes" claim.
import { executeFunction } from './executor.js'
import { db } from '../../lib/db.js'
import { queryEntitySchema } from '../../lib/entity-provisioner.js'

let failures = 0

function check(name: string, condition: boolean, detail: unknown) {
  if (condition) {
    console.log(`✓ ${name}`)
  } else {
    failures++
    console.error(`✗ ${name}`, detail)
  }
}

async function main() {
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.isProvisioned, true),
    columns: { id: true, entityDbSchema: true },
  })
  if (!entity?.entityDbSchema) {
    console.error('No provisioned entity found — cannot run records-bridge escape test.')
    process.exit(1)
  }
  const { id: entityId, entityDbSchema: schema } = entity

  const r1 = await executeFunction({ code: 'return 1 + 1;', entityId, schema, input: {} })
  check('basic return value', r1.ok && r1.result === 2, r1)

  const r2 = await executeFunction({ code: 'ctx.log("hi", ctx.input.name); return ctx.input.name + "!";', entityId, schema, input: { name: 'world' } })
  check('ctx.log + ctx.input round-trip', r2.ok && r2.result === 'world!' && r2.logs[0] === 'hi world', r2)

  const r3 = await executeFunction({ code: 'return require("fs");', entityId, schema, input: {} })
  check('AST guard rejects require()', !r3.ok && /require/.test(r3.error ?? ''), r3)

  const r4 = await executeFunction({ code: 'while(true){} return 1;', entityId, schema, input: {}, timeoutMs: 1000 })
  check('sync infinite loop is killed by timeout', !r4.ok && /timed out/i.test(r4.error ?? ''), r4)

  const r5 = await executeFunction({ code: 'while(true){ await Promise.resolve(); } return 1;', entityId, schema, input: {}, timeoutMs: 1000 })
  check('ASYNC microtask-flood loop is killed by timeout (node:vm cannot do this)', !r5.ok && /timed out/i.test(r5.error ?? ''), r5)

  // Insert a temp row so ctx.records.find returns a real host-realm array to attack.
  const [tempRow] = await queryEntitySchema(schema, `INSERT INTO crm_contacts (first_name, email) VALUES ('SecurityTest', 'security-test@example.com') RETURNING id`, [])
  try {
    const r6 = await executeFunction({
      entityId, schema, input: {},
      code: `
        try {
          const rows = await ctx.records.find('crm_contacts', {});
          const F = rows.constructor.constructor;
          const hostFn = F('return process')();
          return { escaped: true, env: Object.keys(hostFn.env || {}) };
        } catch (e) {
          return { escaped: false, error: e.message };
        }
      `,
    })
    check(
      'escape via ctx.records.find() result .constructor.constructor is contained',
      r6.ok && (r6.result as any)?.escaped === false,
      r6,
    )
  } finally {
    await queryEntitySchema(schema, `DELETE FROM crm_contacts WHERE id = $1`, [tempRow.id])
  }

  const r7 = await executeFunction({
    entityId, schema, input: {},
    code: `
      try {
        const F = ({}).constructor.constructor;
        const hostFn = F('return process')();
        return { escaped: true };
      } catch (e) {
        return { escaped: false, error: e.message };
      }
    `,
  })
  check('escape via plain object .constructor.constructor is contained', r7.ok && (r7.result as any)?.escaped === false, r7)

  console.log(failures === 0 ? `\nAll checks passed.` : `\n${failures} check(s) FAILED.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
