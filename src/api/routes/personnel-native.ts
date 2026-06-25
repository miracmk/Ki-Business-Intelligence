// YFZ 34 Faz 5f: Personnel Management — native paid add-on (addon_personnel_management).
// Schema (erp_staff/erp_staff_attendance/erp_payroll) already exists in every Base
// ERP entity schema (it was never removed from entity-schema-template.sql — it was
// deliberately EXCLUDED from the free Faz 4 ERP native CRUD scope, see KIBIPR.md
// §6/§14.2/§14.4). This phase is purely the entitlement-gated CRUD + UI; no new
// migration needed.
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { queryEntitySchema } from '../../lib/entity-provisioner.js'
import { hasActiveEntitlement } from '../../lib/entitlements.js'

const staffSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  nationalId: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  employeeNumber: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
  jobTitle: z.string().optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contractor', 'intern', 'freelance']).optional(),
  workLocation: z.enum(['office', 'remote', 'hybrid']).optional(),
  managerId: z.string().uuid().optional().nullable(),
  hireDate: z.string().optional(),
  baseSalary: z.number().optional(),
  salaryCurrency: z.string().optional(),
  bankName: z.string().optional(),
  bankIban: z.string().optional(),
  annualLeaveDays: z.number().optional(),
  status: z.enum(['active', 'on_leave', 'probation', 'suspended', 'terminated']).optional(),
})

const attendanceSchema = z.object({
  staffId: z.string().uuid(),
  date: z.string(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  breakMinutes: z.number().optional(),
  attendanceType: z.enum(['work', 'annual_leave', 'sick_leave', 'public_holiday', 'unpaid_leave']).optional(),
  status: z.enum(['present', 'absent', 'late', 'early_departure', 'half_day']).optional(),
  notes: z.string().optional(),
})

const payrollSchema = z.object({
  staffId: z.string().uuid(),
  periodYear: z.number(),
  periodMonth: z.number().min(1).max(12),
  baseSalary: z.number(),
  overtimePay: z.number().optional(),
  bonus: z.number().optional(),
  commission: z.number().optional(),
  allowances: z.number().optional(),
  sgkEmployee: z.number().optional(),
  unemploymentEmployee: z.number().optional(),
  incomeTax: z.number().optional(),
  stampTax: z.number().optional(),
  otherDeductions: z.number().optional(),
  currency: z.string().optional(),
})

const STAFF_COLUMN_MAP: Record<string, string> = {
  firstName: 'first_name', lastName: 'last_name', nationalId: 'national_id', birthDate: 'birth_date',
  gender: 'gender', email: 'email', phone: 'phone', mobile: 'mobile', employeeNumber: 'employee_number',
  department: 'department', position: 'position', jobTitle: 'job_title', employmentType: 'employment_type',
  workLocation: 'work_location', managerId: 'manager_id', hireDate: 'hire_date', baseSalary: 'base_salary',
  salaryCurrency: 'salary_currency', bankName: 'bank_name', bankIban: 'bank_iban',
  annualLeaveDays: 'annual_leave_days', status: 'status',
}

function buildInsert(map: Record<string, string>, data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const cols: string[] = []
  const params: unknown[] = []
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue
    cols.push(map[key])
    params.push(val)
  }
  for (const [col, val] of Object.entries(extra)) { cols.push(col); params.push(val) }
  return { cols, placeholders: cols.map((_, i) => `$${i + 1}`), params }
}

function buildUpdate(map: Record<string, string>, data: Record<string, unknown>) {
  const sets: string[] = []
  const params: unknown[] = []
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue
    params.push(val); sets.push(`${map[key]} = $${params.length}`)
  }
  return { sets, params }
}

async function resolveEntityContext(tenantId: string | null): Promise<{ entityId: string; schema: string } | null> {
  const isUUID = (s: string | null | undefined) =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  if (!isUUID(tenantId)) return null
  const entity = await db.query.kibiEntities.findFirst({
    where: (t, { eq }) => eq(t.entityId, tenantId!),
    columns: { id: true, entityDbSchema: true, isProvisioned: true },
  })
  if (!entity?.isProvisioned || !entity.entityDbSchema) return null
  return { entityId: entity.id, schema: entity.entityDbSchema }
}

export const personnelNativeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req, reply) => {
    const user = req.user as { tenantId: string | null; role?: string } | undefined
    if (!user) return
    if (user.role === 'admin' || user.role === 'supervisor') return
    const ctx = await resolveEntityContext(user.tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    if (!(await hasActiveEntitlement(ctx.entityId, 'addon_personnel_management'))) {
      return reply.status(402).send({ error: 'Personnel Management add-on aktif değil. Lütfen modülü etkinleştirin.' })
    }
  })

  // ── Staff ──────────────────────────────────────────────────────────────────
  app.get('/staff', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { search, department, status } = req.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    if (search) { params.push(`%${search}%`); conditions.push(`(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR employee_number ILIKE $${params.length})`) }
    if (department) { params.push(department); conditions.push(`department = $${params.length}`) }
    if (status) { params.push(status); conditions.push(`status = $${params.length}`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const staff = await queryEntitySchema(ctx.schema, `
      SELECT id, first_name AS "firstName", last_name AS "lastName", employee_number AS "employeeNumber",
             department, position, job_title AS "jobTitle", employment_type AS "employmentType",
             email, phone, hire_date AS "hireDate", base_salary AS "baseSalary", salary_currency AS "salaryCurrency",
             annual_leave_days AS "annualLeaveDays", used_leave_days AS "usedLeaveDays",
             remaining_leave_days AS "remainingLeaveDays", status, manager_id AS "managerId"
      FROM erp_staff ${where} ORDER BY first_name ASC
    `, params)
    return { staff }
  })

  app.post('/staff', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = staffSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { cols, placeholders, params } = buildInsert(STAFF_COLUMN_MAP, body.data)
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_staff (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
      RETURNING id, first_name AS "firstName", last_name AS "lastName", department, status
    `, params)
    return reply.status(201).send({ staff: rows[0] })
  })

  app.put('/staff/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    const body = staffSchema.partial().safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const { sets, params } = buildUpdate(STAFF_COLUMN_MAP, body.data)
    if (sets.length === 0) return { ok: true }
    params.push(id)
    await queryEntitySchema(ctx.schema, `UPDATE erp_staff SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
    return { ok: true }
  })

  app.delete('/staff/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `UPDATE erp_staff SET status = 'terminated', termination_date = CURRENT_DATE WHERE id = $1`, [id])
    return { ok: true }
  })

  // ── Attendance ─────────────────────────────────────────────────────────────
  app.get('/attendance', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { staffId } = req.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    if (staffId) { params.push(staffId); conditions.push(`staff_id = $${params.length}`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const attendance = await queryEntitySchema(ctx.schema, `
      SELECT id, staff_id AS "staffId", date, check_in AS "checkIn", check_out AS "checkOut",
             hours_worked AS "hoursWorked", attendance_type AS "attendanceType", status
      FROM erp_staff_attendance ${where} ORDER BY date DESC LIMIT 200
    `, params)
    return { attendance }
  })

  app.post('/attendance', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = attendanceSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const d = body.data
    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_staff_attendance (staff_id, date, check_in, check_out, break_minutes, attendance_type, status, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (staff_id, date) DO UPDATE SET check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out,
        break_minutes = EXCLUDED.break_minutes, attendance_type = EXCLUDED.attendance_type, status = EXCLUDED.status
      RETURNING id, staff_id AS "staffId", date, status
    `, [d.staffId, d.date, d.checkIn ?? null, d.checkOut ?? null, d.breakMinutes ?? 0, d.attendanceType ?? 'work', d.status ?? 'present', d.notes ?? null])
    return reply.status(201).send({ attendance: rows[0] })
  })

  // ── Payroll ────────────────────────────────────────────────────────────────
  app.get('/payroll', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { staffId } = req.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    if (staffId) { params.push(staffId); conditions.push(`p.staff_id = $${params.length}`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const payroll = await queryEntitySchema(ctx.schema, `
      SELECT p.id, p.staff_id AS "staffId", s.first_name AS "firstName", s.last_name AS "lastName",
             p.period_year AS "periodYear", p.period_month AS "periodMonth", p.base_salary AS "baseSalary",
             p.gross_pay AS "grossPay", p.net_pay AS "netPay", p.currency, p.status
      FROM erp_payroll p LEFT JOIN erp_staff s ON s.id = p.staff_id
      ${where} ORDER BY p.period_year DESC, p.period_month DESC
    `, params)
    return { payroll }
  })

  app.post('/payroll', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const body = payrollSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const d = body.data
    const overtimePay = d.overtimePay ?? 0, bonus = d.bonus ?? 0, commission = d.commission ?? 0, allowances = d.allowances ?? 0
    const sgkEmployee = d.sgkEmployee ?? Math.round(d.baseSalary * 0.14 * 100) / 100
    const unemploymentEmployee = d.unemploymentEmployee ?? Math.round(d.baseSalary * 0.01 * 100) / 100
    const incomeTax = d.incomeTax ?? 0, stampTax = d.stampTax ?? 0, otherDeductions = d.otherDeductions ?? 0
    const grossPay = d.baseSalary + overtimePay + bonus + commission + allowances
    const netPay = grossPay - sgkEmployee - unemploymentEmployee - incomeTax - stampTax - otherDeductions

    const rows = await queryEntitySchema(ctx.schema, `
      INSERT INTO erp_payroll (staff_id, period_year, period_month, base_salary, overtime_pay, bonus, commission,
        allowances, gross_pay, sgk_employee, unemployment_employee, income_tax, stamp_tax, other_deductions, net_pay, currency)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING id, staff_id AS "staffId", gross_pay AS "grossPay", net_pay AS "netPay"
    `, [d.staffId, d.periodYear, d.periodMonth, d.baseSalary, overtimePay, bonus, commission, allowances,
        grossPay, sgkEmployee, unemploymentEmployee, incomeTax, stampTax, otherDeductions, netPay, d.currency ?? 'TRY'])
    return reply.status(201).send({ payroll: rows[0] })
  })

  app.put('/payroll/:id/approve', { onRequest: [app.authenticate] }, async (req, reply) => {
    const ctx = await resolveEntityContext((req.user as any).tenantId)
    if (!ctx) return reply.status(404).send({ error: 'Entity şeması hazır değil' })
    const { id } = req.params as { id: string }
    await queryEntitySchema(ctx.schema, `UPDATE erp_payroll SET status = 'approved' WHERE id = $1`, [id])
    return { ok: true }
  })
}
