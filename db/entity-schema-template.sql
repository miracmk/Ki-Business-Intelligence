-- ═══════════════════════════════════════════════════════════════════════════════
-- Entity Schema Template
-- Executed once per entity on provisioning. Replace :schema with entity slug.
-- All tables live in schema entity_{slug} for full isolation.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS ":schema";

-- ─────────────────────────────────────────────────────────────────────────────
-- ENTITY SETTINGS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".entity_settings (
  key        VARCHAR(255) PRIMARY KEY,
  value      JSONB        NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Defaults
INSERT INTO ":schema".entity_settings (key, value) VALUES
  ('currency',       '"TRY"'),
  ('timezone',       '"Europe/Istanbul"'),
  ('language',       '"tr"'),
  ('fiscal_year_start', '"01-01"'),
  ('tax_rate_default', '18');

-- ═══════════════════════════════════════════════════════════════════════════════
-- CRM MODULE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE ":schema".crm_contacts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id         VARCHAR(255),
  source_type         VARCHAR(50),                   -- 'zoho','salesforce','manual', etc.
  source_integration_id UUID,

  -- Personal info
  first_name          VARCHAR(255),
  last_name           VARCHAR(255),
  full_name           VARCHAR(511),
  email               VARCHAR(255),
  email_secondary     VARCHAR(255),
  phone               VARCHAR(50),
  mobile              VARCHAR(50),
  fax                 VARCHAR(50),

  -- Business
  company_name        VARCHAR(500),
  job_title           VARCHAR(255),
  department          VARCHAR(255),
  website             VARCHAR(500),

  -- Address
  address_line1       VARCHAR(500),
  address_line2       VARCHAR(500),
  city                VARCHAR(100),
  state               VARCHAR(100),
  country             VARCHAR(2)   DEFAULT 'TR',
  postal_code         VARCHAR(20),

  -- CRM classification
  contact_type        VARCHAR(50)  DEFAULT 'contact', -- 'lead','contact','customer','partner','vendor'
  lead_source         VARCHAR(100),
  lead_status         VARCHAR(100),
  status              VARCHAR(50)  DEFAULT 'active',

  -- Scoring
  lead_score          INTEGER      DEFAULT 0,
  opportunity_score   SMALLINT     DEFAULT 0,        -- 0-100

  -- Relations
  company_id          UUID,        -- references crm_companies.id
  assigned_to_user_id UUID,        -- references public.users.id
  owner_id            UUID,        -- FAZ 9.1: record creator, references public.users.id — record-level security (src/lib/security/scope.ts)

  -- Metadata
  tags                JSONB        DEFAULT '[]',
  custom_fields       JSONB        DEFAULT '{}',
  last_contacted_at   TIMESTAMPTZ,
  do_not_contact      BOOLEAN      DEFAULT FALSE,
  gdpr_consent        BOOLEAN      DEFAULT FALSE,
  gdpr_consent_date   TIMESTAMPTZ,

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX ":schema"_crm_contacts_email_idx    ON ":schema".crm_contacts (email);
CREATE INDEX ":schema"_crm_contacts_company_idx  ON ":schema".crm_contacts (company_id);
CREATE INDEX ":schema"_crm_contacts_type_idx     ON ":schema".crm_contacts (contact_type);
CREATE INDEX ":schema"_crm_contacts_source_idx   ON ":schema".crm_contacts (source_type, external_id);
-- FAZ 4.2: not schema-prefixed on purpose (see KIBIPR.md §12 — avoids the ":schema"_xxx_idx naming bug above).
CREATE INDEX idx_crm_contacts_custom_fields_gin ON ":schema".crm_contacts USING GIN (custom_fields);
CREATE INDEX idx_crm_contacts_owner_id ON ":schema".crm_contacts (owner_id);

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".crm_companies (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id         VARCHAR(255),
  source_type         VARCHAR(50),
  source_integration_id UUID,

  name                VARCHAR(500) NOT NULL,
  legal_name          VARCHAR(500),
  industry            VARCHAR(100),
  sub_industry        VARCHAR(100),
  company_type        VARCHAR(50)  DEFAULT 'prospect', -- 'prospect','customer','partner','vendor','competitor'

  -- Size
  employee_count      INTEGER,
  annual_revenue      NUMERIC(15,2),
  currency            VARCHAR(3)   DEFAULT 'TRY',

  -- Contact
  website             VARCHAR(500),
  email               VARCHAR(255),
  phone               VARCHAR(50),
  linkedin_url        VARCHAR(500),

  -- Turkish specifics
  tax_number          VARCHAR(50),
  tax_office          VARCHAR(100),
  mersis_number       VARCHAR(20),

  -- Address (HQ)
  address_line1       VARCHAR(500),
  address_line2       VARCHAR(500),
  city                VARCHAR(100),
  state               VARCHAR(100),
  country             VARCHAR(2)   DEFAULT 'TR',
  postal_code         VARCHAR(20),

  -- Scoring
  account_score       SMALLINT     DEFAULT 0,

  assigned_to_user_id UUID,
  owner_id            UUID,        -- FAZ 9.1: record creator — record-level security (src/lib/security/scope.ts)
  parent_company_id   UUID,        -- holding/subsidiary

  tags                JSONB        DEFAULT '[]',
  custom_fields       JSONB        DEFAULT '{}',

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX ":schema"_crm_companies_name_idx ON ":schema".crm_companies (name);
CREATE INDEX ":schema"_crm_companies_type_idx ON ":schema".crm_companies (company_type);
CREATE INDEX idx_crm_companies_custom_fields_gin ON ":schema".crm_companies USING GIN (custom_fields);
CREATE INDEX idx_crm_companies_owner_id ON ":schema".crm_companies (owner_id);

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".crm_deals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id         VARCHAR(255),
  source_type         VARCHAR(50),

  title               VARCHAR(500) NOT NULL,
  contact_id          UUID         REFERENCES ":schema".crm_contacts(id)  ON DELETE SET NULL,
  company_id          UUID         REFERENCES ":schema".crm_companies(id) ON DELETE SET NULL,

  -- Pipeline
  pipeline_name       VARCHAR(255) DEFAULT 'default',
  stage               VARCHAR(100) DEFAULT 'new', -- new,qualified,proposal,negotiation,won,lost
  probability         SMALLINT     DEFAULT 0,     -- 0-100

  -- Value
  deal_value          NUMERIC(15,2),
  currency            VARCHAR(3)   DEFAULT 'TRY',
  recurring_revenue   NUMERIC(15,2),   -- for SaaS/subscription deals

  -- Dates
  expected_close_date DATE,
  actual_close_date   DATE,
  lead_source         VARCHAR(100),
  lost_reason         TEXT,
  won_reason          TEXT,

  assigned_to_user_id UUID,
  owner_id            UUID,        -- FAZ 9.1: record creator — record-level security (src/lib/security/scope.ts)
  tags                JSONB        DEFAULT '[]',
  custom_fields       JSONB        DEFAULT '{}',

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  closed_at           TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX ":schema"_crm_deals_stage_idx   ON ":schema".crm_deals (stage);
CREATE INDEX ":schema"_crm_deals_contact_idx ON ":schema".crm_deals (contact_id);
CREATE INDEX ":schema"_crm_deals_company_idx ON ":schema".crm_deals (company_id);
CREATE INDEX idx_crm_deals_custom_fields_gin ON ":schema".crm_deals USING GIN (custom_fields);
CREATE INDEX idx_crm_deals_owner_id ON ":schema".crm_deals (owner_id);

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".crm_activities (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type                VARCHAR(50)  NOT NULL, -- 'call','email','meeting','task','note','demo'
  subject             VARCHAR(500),
  description         TEXT,

  contact_id          UUID,
  company_id          UUID,
  deal_id             UUID,

  assigned_to_user_id UUID,
  created_by_user_id  UUID,

  status              VARCHAR(50)  DEFAULT 'planned', -- planned,in_progress,completed,cancelled
  priority            VARCHAR(20)  DEFAULT 'medium',

  due_date            TIMESTAMPTZ,
  start_date          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  duration_minutes    INTEGER,

  location            VARCHAR(500),
  outcome             TEXT,
  follow_up_required  BOOLEAN      DEFAULT FALSE,
  follow_up_date      DATE,

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX ":schema"_crm_activities_contact_idx ON ":schema".crm_activities (contact_id);
CREATE INDEX ":schema"_crm_activities_deal_idx    ON ":schema".crm_activities (deal_id);
CREATE INDEX ":schema"_crm_activities_due_idx     ON ":schema".crm_activities (due_date);
CREATE INDEX idx_crm_activities_created_by_user_id ON ":schema".crm_activities (created_by_user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ERP MODULE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE ":schema".erp_products (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id         VARCHAR(255),
  source_type         VARCHAR(50),

  -- Identity
  sku                 VARCHAR(100),
  barcode             VARCHAR(100),
  name                VARCHAR(500) NOT NULL,
  short_name          VARCHAR(255),
  description         TEXT,

  -- Classification
  category            VARCHAR(255),
  subcategory         VARCHAR(255),
  brand               VARCHAR(255),
  supplier_id         UUID,        -- references erp_suppliers.id
  unit                VARCHAR(50)  DEFAULT 'adet', -- adet,kg,litre,m,m2,m3,kutu,paket

  -- Pricing
  cost_price          NUMERIC(15,4),
  sale_price          NUMERIC(15,4),
  min_sale_price      NUMERIC(15,4),
  currency            VARCHAR(3)   DEFAULT 'TRY',
  tax_rate            NUMERIC(5,2) DEFAULT 18,
  discount_rate       NUMERIC(5,2) DEFAULT 0,

  -- Stock
  stock_quantity      NUMERIC(15,3) DEFAULT 0,
  reserved_quantity   NUMERIC(15,3) DEFAULT 0,
  available_quantity  NUMERIC(15,3) GENERATED ALWAYS AS (stock_quantity - reserved_quantity) STORED,
  reorder_point       NUMERIC(15,3),
  max_stock_level     NUMERIC(15,3),
  lead_time_days      INTEGER       DEFAULT 0,

  -- Location
  warehouse_id        UUID,
  warehouse_location  VARCHAR(255), -- shelf/bin code

  -- Flags
  is_active           BOOLEAN      DEFAULT TRUE,
  is_trackable        BOOLEAN      DEFAULT TRUE,
  is_sellable         BOOLEAN      DEFAULT TRUE,
  is_purchasable      BOOLEAN      DEFAULT TRUE,
  is_service          BOOLEAN      DEFAULT FALSE,

  -- Media
  image_url           TEXT,
  images              JSONB        DEFAULT '[]',

  -- Specs
  weight_kg           NUMERIC(10,4),
  dimensions_cm       JSONB,       -- {l, w, h}
  custom_fields       JSONB        DEFAULT '{}',
  tags                JSONB        DEFAULT '[]',

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX ":schema"_erp_products_sku_idx     ON ":schema".erp_products (sku)     WHERE sku IS NOT NULL;
CREATE INDEX        ":schema"_erp_products_barcode_idx ON ":schema".erp_products (barcode)  WHERE barcode IS NOT NULL;
CREATE INDEX        ":schema"_erp_products_category_idx ON ":schema".erp_products (category);
CREATE INDEX        ":schema"_erp_products_supplier_idx ON ":schema".erp_products (supplier_id);
CREATE INDEX idx_erp_products_custom_fields_gin ON ":schema".erp_products USING GIN (custom_fields);

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".erp_stock_movements (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID        NOT NULL REFERENCES ":schema".erp_products(id),
  warehouse_id        UUID,

  movement_type       VARCHAR(50)  NOT NULL, -- purchase,sale,return_in,return_out,adjustment,transfer,waste,production_in,production_out
  quantity            NUMERIC(15,3) NOT NULL,   -- positive=in, negative=out
  quantity_before     NUMERIC(15,3),
  quantity_after      NUMERIC(15,3),

  unit_cost           NUMERIC(15,4),
  total_cost          NUMERIC(15,4),
  currency            VARCHAR(3)   DEFAULT 'TRY',

  -- Reference
  reference_type      VARCHAR(50),    -- order,invoice,adjustment,transfer
  reference_id        UUID,
  reference_number    VARCHAR(100),

  batch_number        VARCHAR(100),
  expiry_date         DATE,
  notes               TEXT,
  created_by          UUID,           -- user_id

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX ":schema"_erp_stock_movements_product_idx ON ":schema".erp_stock_movements (product_id, created_at DESC);
CREATE INDEX ":schema"_erp_stock_movements_ref_idx     ON ":schema".erp_stock_movements (reference_type, reference_id);

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".erp_warehouses (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(255) NOT NULL,
  code                VARCHAR(50)  UNIQUE,
  warehouse_type      VARCHAR(50)  DEFAULT 'main', -- main,secondary,virtual,transit
  address_line1       VARCHAR(500),
  city                VARCHAR(100),
  country             VARCHAR(2)   DEFAULT 'TR',
  manager_user_id     UUID,
  is_active           BOOLEAN      DEFAULT TRUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".erp_suppliers (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id         VARCHAR(255),

  name                VARCHAR(500) NOT NULL,
  contact_name        VARCHAR(255),
  email               VARCHAR(255),
  phone               VARCHAR(50),
  website             VARCHAR(500),

  -- Turkish
  tax_number          VARCHAR(50),
  tax_office          VARCHAR(100),
  mersis_number       VARCHAR(20),

  -- Address
  address_line1       VARCHAR(500),
  address_line2       VARCHAR(500),
  city                VARCHAR(100),
  country             VARCHAR(2)   DEFAULT 'TR',

  -- Payment
  payment_terms       VARCHAR(100), -- net30,net60,cod,prepaid
  currency            VARCHAR(3)   DEFAULT 'TRY',
  credit_limit        NUMERIC(15,2),

  -- Bank
  bank_name           VARCHAR(255),
  bank_iban           VARCHAR(50),
  bank_account_no     VARCHAR(50),

  category            VARCHAR(100),
  rating              SMALLINT     DEFAULT 3, -- 1-5
  tags                JSONB        DEFAULT '[]',
  is_active           BOOLEAN      DEFAULT TRUE,

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".erp_orders (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id         VARCHAR(255),
  source_type         VARCHAR(50),

  order_type          VARCHAR(20)  NOT NULL, -- purchase,sale
  order_number        VARCHAR(100) NOT NULL,

  -- Parties
  contact_id          UUID,       -- customer (sale) or supplier (purchase)
  company_id          UUID,
  supplier_id         UUID        REFERENCES ":schema".erp_suppliers(id) ON DELETE SET NULL,

  -- Status flow
  status              VARCHAR(50)  DEFAULT 'draft',
  -- purchase: draft→confirmed→ordered→partially_received→received→cancelled
  -- sale:     draft→confirmed→processing→picking→shipped→delivered→cancelled→returned

  -- Dates
  order_date          DATE         DEFAULT CURRENT_DATE,
  expected_date       DATE,
  actual_date         DATE,
  payment_due_date    DATE,

  -- Financials
  subtotal            NUMERIC(15,2),
  discount_amount     NUMERIC(15,2) DEFAULT 0,
  tax_amount          NUMERIC(15,2) DEFAULT 0,
  shipping_amount     NUMERIC(15,2) DEFAULT 0,
  other_charges       NUMERIC(15,2) DEFAULT 0,
  total               NUMERIC(15,2),
  paid_amount         NUMERIC(15,2) DEFAULT 0,
  currency            VARCHAR(3)   DEFAULT 'TRY',
  exchange_rate       NUMERIC(10,6) DEFAULT 1,

  -- Shipping
  shipping_address    JSONB,
  tracking_number     VARCHAR(255),
  carrier             VARCHAR(100),

  -- Internal
  assigned_to_user_id UUID,
  warehouse_id        UUID,
  notes               TEXT,
  internal_notes      TEXT,
  tags                JSONB        DEFAULT '[]',

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  cancelled_at        TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX ":schema"_erp_orders_number_idx ON ":schema".erp_orders (order_number);
CREATE INDEX        ":schema"_erp_orders_type_idx   ON ":schema".erp_orders (order_type, status);
CREATE INDEX        ":schema"_erp_orders_date_idx   ON ":schema".erp_orders (order_date DESC);

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".erp_order_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID        NOT NULL REFERENCES ":schema".erp_orders(id) ON DELETE CASCADE,
  product_id          UUID        REFERENCES ":schema".erp_products(id) ON DELETE SET NULL,

  -- Snapshot at order time
  product_name        VARCHAR(500),
  sku                 VARCHAR(100),
  unit                VARCHAR(50),

  quantity            NUMERIC(15,3) NOT NULL,
  quantity_received   NUMERIC(15,3) DEFAULT 0,  -- for purchase orders
  quantity_returned   NUMERIC(15,3) DEFAULT 0,

  unit_price          NUMERIC(15,4) NOT NULL,
  discount_percent    NUMERIC(5,2)  DEFAULT 0,
  discount_amount     NUMERIC(15,2) DEFAULT 0,
  tax_rate            NUMERIC(5,2)  DEFAULT 18,
  tax_amount          NUMERIC(15,2) DEFAULT 0,
  subtotal            NUMERIC(15,2),
  total               NUMERIC(15,2),

  notes               TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX ":schema"_erp_order_items_order_idx   ON ":schema".erp_order_items (order_id);
CREATE INDEX ":schema"_erp_order_items_product_idx ON ":schema".erp_order_items (product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- HR / STAFF
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".erp_staff (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID,        -- links to public.users if they have platform account

  -- Personal
  first_name             VARCHAR(255) NOT NULL,
  last_name              VARCHAR(255) NOT NULL,
  national_id            VARCHAR(20),  -- TC Kimlik No
  birth_date             DATE,
  birth_place            VARCHAR(100),
  gender                 VARCHAR(20),
  nationality            VARCHAR(50)  DEFAULT 'TC',
  marital_status         VARCHAR(30),

  -- Contact
  email                  VARCHAR(255),
  phone                  VARCHAR(50),
  mobile                 VARCHAR(50),
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(50),
  home_address           TEXT,

  -- Employment
  employee_number        VARCHAR(100),
  department             VARCHAR(255),
  position               VARCHAR(255),
  job_title              VARCHAR(255),
  job_description        TEXT,
  employment_type        VARCHAR(50)  DEFAULT 'full_time', -- full_time,part_time,contractor,intern,freelance
  work_location          VARCHAR(50)  DEFAULT 'office',    -- office,remote,hybrid

  -- Manager
  manager_id             UUID         REFERENCES ":schema".erp_staff(id) ON DELETE SET NULL,

  -- Dates
  hire_date              DATE,
  probation_end_date     DATE,
  contract_end_date      DATE,        -- NULL = indefinite
  termination_date       DATE,

  -- Compensation
  base_salary            NUMERIC(12,2),
  salary_currency        VARCHAR(3)   DEFAULT 'TRY',
  payment_frequency      VARCHAR(20)  DEFAULT 'monthly',  -- weekly,biweekly,monthly
  bonus_target           NUMERIC(12,2),
  overtime_rate          NUMERIC(5,2) DEFAULT 1.5,

  -- Bank
  bank_name              VARCHAR(255),
  bank_iban              VARCHAR(50),

  -- Leave balances
  annual_leave_days      NUMERIC(5,1) DEFAULT 14,
  used_leave_days        NUMERIC(5,1) DEFAULT 0,
  remaining_leave_days   NUMERIC(5,1) GENERATED ALWAYS AS (annual_leave_days - used_leave_days) STORED,
  sick_leave_days        NUMERIC(5,1) DEFAULT 0,

  -- Status
  status                 VARCHAR(50)  DEFAULT 'active', -- active,on_leave,probation,suspended,terminated

  -- Documents & Meta
  photo_url              TEXT,
  documents              JSONB        DEFAULT '[]',
  custom_fields          JSONB        DEFAULT '{}',

  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX ":schema"_erp_staff_employee_number_idx ON ":schema".erp_staff (employee_number) WHERE employee_number IS NOT NULL;
CREATE INDEX        ":schema"_erp_staff_department_idx      ON ":schema".erp_staff (department);
CREATE INDEX        ":schema"_erp_staff_status_idx          ON ":schema".erp_staff (status);
CREATE INDEX idx_erp_staff_custom_fields_gin ON ":schema".erp_staff USING GIN (custom_fields);

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".erp_staff_attendance (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID        NOT NULL REFERENCES ":schema".erp_staff(id) ON DELETE CASCADE,
  date            DATE        NOT NULL,

  check_in        TIMESTAMPTZ,
  check_out       TIMESTAMPTZ,
  break_minutes   INTEGER     DEFAULT 0,
  hours_worked    NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN check_in IS NOT NULL AND check_out IS NOT NULL
    THEN ROUND(EXTRACT(EPOCH FROM (check_out - check_in)) / 3600.0 - COALESCE(break_minutes, 0) / 60.0, 2)
    ELSE 0 END
  ) STORED,
  overtime_hours  NUMERIC(5,2) DEFAULT 0,

  attendance_type VARCHAR(50)  DEFAULT 'work',    -- work,annual_leave,sick_leave,public_holiday,unpaid_leave
  status          VARCHAR(50)  DEFAULT 'present', -- present,absent,late,early_departure,half_day

  check_in_source VARCHAR(30)  DEFAULT 'manual',  -- manual,qr,biometric,app
  check_in_location JSONB,    -- {lat, lng}

  approved_by     UUID,
  notes           TEXT,

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id, date)
);

CREATE INDEX ":schema"_erp_staff_attendance_staff_date_idx ON ":schema".erp_staff_attendance (staff_id, date DESC);

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".erp_payroll (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id          UUID        NOT NULL REFERENCES ":schema".erp_staff(id),
  period_year       SMALLINT    NOT NULL,
  period_month      SMALLINT    NOT NULL,  -- 1-12

  -- Base
  base_salary       NUMERIC(12,2) NOT NULL,
  working_days      SMALLINT,
  actual_days       SMALLINT,
  overtime_hours    NUMERIC(6,2)  DEFAULT 0,
  overtime_pay      NUMERIC(12,2) DEFAULT 0,

  -- Bonuses & deductions
  bonus             NUMERIC(12,2) DEFAULT 0,
  commission        NUMERIC(12,2) DEFAULT 0,
  allowances        NUMERIC(12,2) DEFAULT 0,  -- travel, meal, phone
  gross_pay         NUMERIC(12,2),

  -- Deductions (Turkish payroll)
  sgk_employee      NUMERIC(12,2) DEFAULT 0,  -- 14%
  sgk_employer      NUMERIC(12,2) DEFAULT 0,  -- 20.5%
  unemployment_employee NUMERIC(12,2) DEFAULT 0, -- 1%
  income_tax        NUMERIC(12,2) DEFAULT 0,
  stamp_tax         NUMERIC(12,2) DEFAULT 0,
  other_deductions  NUMERIC(12,2) DEFAULT 0,

  net_pay           NUMERIC(12,2),
  currency          VARCHAR(3)    DEFAULT 'TRY',

  payment_date      DATE,
  payment_method    VARCHAR(50)   DEFAULT 'bank_transfer',
  payment_reference VARCHAR(255),

  status            VARCHAR(30)   DEFAULT 'draft', -- draft,approved,paid
  notes             TEXT,

  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id, period_year, period_month)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ACCOUNTING MODULE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE ":schema".acc_contacts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id     VARCHAR(255),
  contact_type    VARCHAR(20)  NOT NULL,  -- customer,vendor,both

  -- Identity
  name            VARCHAR(500) NOT NULL,
  short_name      VARCHAR(100),

  -- Turkish
  tax_number      VARCHAR(50),
  tax_office      VARCHAR(100),
  mersis_number   VARCHAR(20),

  -- Contact
  email           VARCHAR(255),
  phone           VARCHAR(50),
  website         VARCHAR(500),

  -- Address
  address_line1   VARCHAR(500),
  address_line2   VARCHAR(500),
  city            VARCHAR(100),
  country         VARCHAR(2)   DEFAULT 'TR',
  postal_code     VARCHAR(20),

  -- Financials
  currency        VARCHAR(3)   DEFAULT 'TRY',
  credit_limit    NUMERIC(15,2),
  payment_terms   VARCHAR(50)  DEFAULT 'net30',
  balance         NUMERIC(15,2) DEFAULT 0,  -- positive=owes us, negative=we owe

  -- Bank
  bank_name       VARCHAR(255),
  bank_iban       VARCHAR(50),

  -- Link to CRM
  crm_contact_id  UUID,   -- entity_*.crm_contacts.id
  crm_company_id  UUID,   -- entity_*.crm_companies.id

  tags            JSONB   DEFAULT '[]',
  is_active       BOOLEAN DEFAULT TRUE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ":schema"_acc_contacts_type_idx ON ":schema".acc_contacts (contact_type);
CREATE INDEX ":schema"_acc_contacts_name_idx ON ":schema".acc_contacts (name);

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".acc_invoices (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id     VARCHAR(255),
  source_type     VARCHAR(50),

  invoice_type    VARCHAR(20)  NOT NULL,  -- sale,purchase,credit_note,debit_note
  invoice_number  VARCHAR(100) NOT NULL,

  contact_id      UUID         NOT NULL REFERENCES ":schema".acc_contacts(id),
  order_id        UUID,        -- links to erp_orders

  -- Status
  status          VARCHAR(30)  DEFAULT 'draft',
  -- draft→sent→viewed→partially_paid→paid→overdue→cancelled

  -- Dates
  issue_date      DATE         DEFAULT CURRENT_DATE,
  due_date        DATE,
  delivery_date   DATE,

  -- Amounts
  subtotal        NUMERIC(15,2) DEFAULT 0,
  discount_amount NUMERIC(15,2) DEFAULT 0,
  tax_amount      NUMERIC(15,2) DEFAULT 0,
  withholding_tax NUMERIC(15,2) DEFAULT 0,   -- tevkifat
  stamp_tax       NUMERIC(15,2) DEFAULT 0,   -- damga vergisi
  total           NUMERIC(15,2) DEFAULT 0,
  paid_amount     NUMERIC(15,2) DEFAULT 0,
  remaining_amount NUMERIC(15,2) GENERATED ALWAYS AS (total - paid_amount) STORED,

  currency        VARCHAR(3)   DEFAULT 'TRY',
  exchange_rate   NUMERIC(10,6) DEFAULT 1,

  -- Turkish e-fatura / e-arşiv
  efatura_uuid    VARCHAR(50),
  efatura_status  VARCHAR(30),  -- draft,sent,approved,rejected
  efatura_type    VARCHAR(30),  -- SATIS,IADE,ISTISNA,OZELMATRAH,IHRACKAYITLI,SGK

  -- Content
  notes           TEXT,
  terms           TEXT,
  file_path       TEXT,

  -- Tags
  tags            JSONB DEFAULT '[]',

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  cancelled_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX ":schema"_acc_invoices_number_idx ON ":schema".acc_invoices (invoice_number);
CREATE INDEX        ":schema"_acc_invoices_contact_idx ON ":schema".acc_invoices (contact_id);
CREATE INDEX        ":schema"_acc_invoices_type_status_idx ON ":schema".acc_invoices (invoice_type, status);
CREATE INDEX        ":schema"_acc_invoices_due_idx ON ":schema".acc_invoices (due_date) WHERE status NOT IN ('paid','cancelled');

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".acc_invoice_lines (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID        NOT NULL REFERENCES ":schema".acc_invoices(id) ON DELETE CASCADE,
  product_id      UUID,       -- ref to erp_products

  line_order      SMALLINT    DEFAULT 0,
  description     VARCHAR(500),
  sku             VARCHAR(100),
  unit            VARCHAR(50),

  quantity        NUMERIC(15,4) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(15,4) NOT NULL,
  discount_rate   NUMERIC(5,2)  DEFAULT 0,
  discount_amount NUMERIC(15,2) DEFAULT 0,
  tax_rate        NUMERIC(5,2)  DEFAULT 18,
  tax_amount      NUMERIC(15,2),
  subtotal        NUMERIC(15,2),
  total           NUMERIC(15,2),

  account_code    VARCHAR(50),  -- chart of accounts code
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX ":schema"_acc_invoice_lines_invoice_idx ON ":schema".acc_invoice_lines (invoice_id);

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".acc_payments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number  VARCHAR(100),
  payment_type    VARCHAR(20)  NOT NULL,  -- received,sent

  contact_id      UUID         REFERENCES ":schema".acc_contacts(id) ON DELETE SET NULL,
  invoice_id      UUID         REFERENCES ":schema".acc_invoices(id) ON DELETE SET NULL,
  bank_account_id UUID,

  amount          NUMERIC(15,2) NOT NULL,
  currency        VARCHAR(3)   DEFAULT 'TRY',
  exchange_rate   NUMERIC(10,6) DEFAULT 1,

  payment_date    DATE         DEFAULT CURRENT_DATE,
  payment_method  VARCHAR(50),  -- bank_transfer,credit_card,cash,check,stripe,iyzico,papara
  reference       VARCHAR(255),

  -- Reconciliation
  is_reconciled   BOOLEAN      DEFAULT FALSE,

  notes           TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX ":schema"_acc_payments_contact_idx ON ":schema".acc_payments (contact_id);
CREATE INDEX ":schema"_acc_payments_date_idx    ON ":schema".acc_payments (payment_date DESC);
CREATE INDEX ":schema"_acc_payments_invoice_idx ON ":schema".acc_payments (invoice_id);

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".acc_expenses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number  VARCHAR(100),
  category        VARCHAR(100) NOT NULL,  -- rent,salary,utilities,marketing,logistics,...
  subcategory     VARCHAR(100),
  description     TEXT,

  contact_id      UUID         REFERENCES ":schema".acc_contacts(id) ON DELETE SET NULL,
  supplier_id     UUID,

  amount          NUMERIC(15,2) NOT NULL,
  tax_amount      NUMERIC(15,2) DEFAULT 0,
  total_amount    NUMERIC(15,2) GENERATED ALWAYS AS (amount + COALESCE(tax_amount,0)) STORED,
  currency        VARCHAR(3)   DEFAULT 'TRY',

  expense_date    DATE         DEFAULT CURRENT_DATE,
  payment_method  VARCHAR(50),

  -- Approval
  status          VARCHAR(30)  DEFAULT 'pending',  -- pending,approved,rejected,paid
  approved_by     UUID,
  approved_at     TIMESTAMPTZ,

  is_billable     BOOLEAN      DEFAULT FALSE,  -- rechargeable to customer
  project_code    VARCHAR(100),
  cost_center     VARCHAR(100),

  receipt_url     TEXT,
  receipt_number  VARCHAR(100),

  account_code    VARCHAR(50),
  tags            JSONB        DEFAULT '[]',

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX ":schema"_acc_expenses_category_idx ON ":schema".acc_expenses (category);
CREATE INDEX ":schema"_acc_expenses_date_idx     ON ":schema".acc_expenses (expense_date DESC);
CREATE INDEX ":schema"_acc_expenses_status_idx   ON ":schema".acc_expenses (status);

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".acc_bank_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name       VARCHAR(255) NOT NULL,
  account_name    VARCHAR(255),
  account_type    VARCHAR(50)  DEFAULT 'checking',  -- checking,savings,credit,virtual
  iban            VARCHAR(50),
  account_number  VARCHAR(50),
  branch_code     VARCHAR(20),
  swift_code      VARCHAR(20),
  currency        VARCHAR(3)   DEFAULT 'TRY',
  current_balance NUMERIC(15,2) DEFAULT 0,
  -- Integration
  integration_type VARCHAR(50), -- plaid,yapily,saltedge,manual
  integration_id  VARCHAR(255),
  last_synced_at  TIMESTAMPTZ,
  sync_error      TEXT,

  is_active       BOOLEAN      DEFAULT TRUE,
  is_default      BOOLEAN      DEFAULT FALSE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".acc_bank_transactions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id UUID        NOT NULL REFERENCES ":schema".acc_bank_accounts(id),

  transaction_date DATE       NOT NULL,
  value_date       DATE,
  amount           NUMERIC(15,2) NOT NULL,    -- positive=credit, negative=debit
  balance_after    NUMERIC(15,2),

  description      VARCHAR(1000),
  counterparty     VARCHAR(500),
  counterparty_iban VARCHAR(50),
  reference        VARCHAR(255),

  -- Auto-categorisation
  category         VARCHAR(100),
  subcategory      VARCHAR(100),

  -- Reconciliation
  is_reconciled    BOOLEAN      DEFAULT FALSE,
  linked_invoice_id UUID        REFERENCES ":schema".acc_invoices(id) ON DELETE SET NULL,
  linked_expense_id UUID        REFERENCES ":schema".acc_expenses(id) ON DELETE SET NULL,
  linked_payment_id UUID        REFERENCES ":schema".acc_payments(id) ON DELETE SET NULL,

  external_id      VARCHAR(255),
  raw_data         JSONB,

  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX ":schema"_acc_bank_transactions_account_date_idx ON ":schema".acc_bank_transactions (bank_account_id, transaction_date DESC);
CREATE INDEX ":schema"_acc_bank_transactions_unreconciled_idx ON ":schema".acc_bank_transactions (bank_account_id, is_reconciled) WHERE is_reconciled = FALSE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Chart of accounts (entity-specific, Turkish TEKDÜZEN)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE ":schema".acc_chart_of_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(20)  NOT NULL,
  name            VARCHAR(255) NOT NULL,
  account_type    VARCHAR(50)  NOT NULL,   -- asset,liability,equity,revenue,expense
  account_subtype VARCHAR(100),
  parent_code     VARCHAR(20),
  level           SMALLINT     DEFAULT 1,  -- 1=main, 2=group, 3=detail
  is_active       BOOLEAN      DEFAULT TRUE,
  allow_posting   BOOLEAN      DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX ":schema"_acc_coa_code_idx ON ":schema".acc_chart_of_accounts (code);

-- Seed Turkish Tekdüzen Hesap Planı (top-level)
INSERT INTO ":schema".acc_chart_of_accounts (code, name, account_type, level) VALUES
  ('1', 'DÖNEN VARLIKLAR', 'asset', 1),
  ('10', 'Hazır Değerler', 'asset', 2),
  ('100', 'Kasa', 'asset', 3),
  ('102', 'Bankalar', 'asset', 3),
  ('11', 'Menkul Kıymetler', 'asset', 2),
  ('12', 'Ticari Alacaklar', 'asset', 2),
  ('120', 'Alıcılar', 'asset', 3),
  ('121', 'Alacak Senetleri', 'asset', 3),
  ('15', 'Stoklar', 'asset', 2),
  ('150', 'İlk Madde ve Malzeme', 'asset', 3),
  ('153', 'Ticari Mallar', 'asset', 3),
  ('2', 'DURAN VARLIKLAR', 'asset', 1),
  ('25', 'Maddi Duran Varlıklar', 'asset', 2),
  ('3', 'KISA VADELİ YÜKÜMLÜLÜKLER', 'liability', 1),
  ('32', 'Ticari Borçlar', 'liability', 2),
  ('320', 'Satıcılar', 'liability', 3),
  ('33', 'Diğer Kısa Vadeli Yükümlülükler', 'liability', 2),
  ('36', 'Ödenecek Vergi ve Diğer Yükümlülükler', 'liability', 2),
  ('360', 'Ödenecek Vergi ve Fonlar', 'liability', 3),
  ('4', 'UZUN VADELİ YÜKÜMLÜLÜKLER', 'liability', 1),
  ('5', 'ÖZKAYNAKLAR', 'equity', 1),
  ('50', 'Ödenmiş Sermaye', 'equity', 2),
  ('500', 'Sermaye', 'equity', 3),
  ('57', 'Geçmiş Yıl Karları/Zararları', 'equity', 2),
  ('590', 'Dönem Net Karı/Zararı', 'equity', 3),
  ('6', 'GELİRLER', 'revenue', 1),
  ('60', 'Brüt Satışlar', 'revenue', 2),
  ('600', 'Yurt İçi Satışlar', 'revenue', 3),
  ('601', 'Yurt Dışı Satışlar', 'revenue', 3),
  ('7', 'MALİYETLER', 'expense', 1),
  ('70', 'Maliyet Hesapları', 'expense', 2),
  ('740', 'Hizmet Üretim Maliyeti', 'expense', 3),
  ('760', 'Pazarlama Satış Dağıtım Giderleri', 'expense', 3),
  ('770', 'Genel Yönetim Giderleri', 'expense', 3),
  ('780', 'Finansman Giderleri', 'expense', 3);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CUSTOMER SERVICE MANAGEMENT MODULE (Native Add-on — addon_customer_service)
-- YFZ 34 Faz 5a. Tables live in Base DDL (no extra provisioning cost); native
-- CRUD/UI access is gated behind the entitlement, not the schema itself.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE ":schema".support_sla_policies (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(255) NOT NULL,
  priority              VARCHAR(20)  NOT NULL, -- low,medium,high,urgent
  first_response_hours  NUMERIC(6,2) NOT NULL DEFAULT 24,
  resolution_hours      NUMERIC(6,2) NOT NULL DEFAULT 72,
  is_active             BOOLEAN      DEFAULT TRUE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE ":schema".support_tickets (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number           VARCHAR(50) NOT NULL,
  contact_id              UUID        REFERENCES ":schema".crm_contacts(id) ON DELETE SET NULL,

  subject                 VARCHAR(500) NOT NULL,
  description             TEXT,
  category                VARCHAR(100),

  status                  VARCHAR(30)  DEFAULT 'open', -- open,in_progress,waiting_customer,resolved,closed
  priority                VARCHAR(20)  DEFAULT 'medium', -- low,medium,high,urgent

  assigned_to_user_id     UUID,
  sla_policy_id           UUID        REFERENCES ":schema".support_sla_policies(id) ON DELETE SET NULL,

  first_response_due_at   TIMESTAMPTZ,
  resolution_due_at       TIMESTAMPTZ,
  first_responded_at      TIMESTAMPTZ,
  resolved_at             TIMESTAMPTZ,
  closed_at               TIMESTAMPTZ,

  tags                    JSONB       DEFAULT '[]',

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX support_tickets_number_idx  ON ":schema".support_tickets (ticket_number);
CREATE INDEX        support_tickets_status_idx  ON ":schema".support_tickets (status);
CREATE INDEX        support_tickets_contact_idx ON ":schema".support_tickets (contact_id);

CREATE TABLE ":schema".support_ticket_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID        NOT NULL REFERENCES ":schema".support_tickets(id) ON DELETE CASCADE,
  sender_type     VARCHAR(20) NOT NULL, -- customer,agent
  sender_user_id  UUID,
  content         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX support_ticket_messages_ticket_idx ON ":schema".support_ticket_messages (ticket_id, created_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FULFILLMENT SERVICE MANAGEMENT MODULE (Native Add-on — addon_fulfillment)
-- YFZ 34 Faz 5b. Schema lives in Base DDL; CRUD/UI gated by entitlement.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE ":schema".erp_couriers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  carrier_code    VARCHAR(50), -- aras,yurtici,mng,ups,fedex,dhl,ptt,custom
  api_credentials TEXT,        -- AES-256-GCM encrypted JSON (encryptJson)
  is_active       BOOLEAN      DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE ":schema".erp_shipments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID        NOT NULL REFERENCES ":schema".erp_orders(id) ON DELETE CASCADE,
  courier_id        UUID        REFERENCES ":schema".erp_couriers(id) ON DELETE SET NULL,
  tracking_number   VARCHAR(255),
  carrier           VARCHAR(100),
  status            VARCHAR(30)  DEFAULT 'picking', -- picking,packed,shipped,out_for_delivery,delivered,failed
  shipping_address  JSONB,
  shipped_at        TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX erp_shipments_order_idx  ON ":schema".erp_shipments (order_id);
CREATE INDEX erp_shipments_status_idx ON ":schema".erp_shipments (status);

CREATE TABLE ":schema".erp_warehouse_picks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id     UUID        REFERENCES ":schema".erp_shipments(id) ON DELETE CASCADE,
  warehouse_id    UUID        REFERENCES ":schema".erp_warehouses(id) ON DELETE SET NULL,
  status          VARCHAR(30) DEFAULT 'pending', -- pending,picking,picked,packed
  picked_by       UUID,
  picked_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX erp_warehouse_picks_shipment_idx ON ":schema".erp_warehouse_picks (shipment_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- E-COMMERCE MANAGEMENT MODULE (Native Add-on — addon_ecommerce)
-- YFZ 34 Faz 5c. Schema lives in Base DDL; CRUD/UI gated by entitlement.
-- Real marketplace API sync (Amazon/Trendyol/Hepsiburada/eBay/Walmart) is a future
-- extension point — this phase ships connection/listing/order management with a
-- simulated connection test (same precedent as accounting.ts payment-integrations).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE ":schema".erp_marketplace_connections (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        VARCHAR(50) NOT NULL, -- amazon,ebay,walmart,trendyol,hepsiburada
  name            VARCHAR(255) NOT NULL,
  credentials     TEXT,        -- AES-256-GCM encrypted JSON
  is_active       BOOLEAN      DEFAULT TRUE,
  last_sync_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE ":schema".erp_marketplace_listings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   UUID        NOT NULL REFERENCES ":schema".erp_marketplace_connections(id) ON DELETE CASCADE,
  product_id      UUID        REFERENCES ":schema".erp_products(id) ON DELETE SET NULL,
  marketplace_sku VARCHAR(255),
  price_override  NUMERIC(15,2),
  stock_override  NUMERIC(15,3),
  is_active       BOOLEAN      DEFAULT TRUE,
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX erp_marketplace_listings_connection_idx ON ":schema".erp_marketplace_listings (connection_id);
CREATE INDEX erp_marketplace_listings_product_idx    ON ":schema".erp_marketplace_listings (product_id);

CREATE TABLE ":schema".erp_marketplace_orders (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id       UUID        NOT NULL REFERENCES ":schema".erp_marketplace_connections(id) ON DELETE CASCADE,
  order_id            UUID        REFERENCES ":schema".erp_orders(id) ON DELETE SET NULL, -- normalized into Base ERP orders
  external_order_id   VARCHAR(255) NOT NULL,
  external_status     VARCHAR(100),
  raw_data            JSONB,
  imported_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX erp_marketplace_orders_external_idx ON ":schema".erp_marketplace_orders (connection_id, external_order_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- MARKETING MANAGEMENT MODULE (Native Add-on — addon_marketing)
-- YFZ 34 Faz 5d. Schema lives in Base DDL; CRUD/UI gated by entitlement.
-- Email sending reuses the existing tenant SMTP channel config (tenants.settings.
-- channels.email) — no new email infra. AI content generation cross-depends on
-- the ai_premium entitlement (Premium upsell), checked separately in the route.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE ":schema".crm_email_campaigns (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  subject         VARCHAR(500) NOT NULL,
  body            TEXT,
  segment         VARCHAR(50)  DEFAULT 'all', -- all,lead,contact,customer,partner,vendor
  status          VARCHAR(30)  DEFAULT 'draft', -- draft,scheduled,sending,sent,failed
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  recipient_count INTEGER      DEFAULT 0,
  sent_count      INTEGER      DEFAULT 0,
  failed_count    INTEGER      DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX crm_email_campaigns_status_idx ON ":schema".crm_email_campaigns (status);

CREATE TABLE ":schema".crm_social_posts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform        VARCHAR(50) NOT NULL, -- instagram,facebook,twitter,linkedin,tiktok
  content         TEXT,
  ai_generated    BOOLEAN     DEFAULT FALSE,
  status          VARCHAR(30) DEFAULT 'draft', -- draft,scheduled,published
  scheduled_at    TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX crm_social_posts_status_idx ON ":schema".crm_social_posts (status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- EVENT MANAGEMENT MODULE (Native Add-on — addon_event)
-- YFZ 34 Faz 5e. Schema lives in Base DDL; CRUD/UI gated by entitlement.
-- Paid registrations soft-link to acc_invoices (consistent with the existing
-- cross-module soft-link convention — see acc_invoices.order_id).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE ":schema".erp_event_venues (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  address_line1   VARCHAR(500),
  city            VARCHAR(100),
  country         VARCHAR(2)  DEFAULT 'TR',
  capacity        INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ":schema".erp_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(500) NOT NULL,
  description     TEXT,
  venue_id        UUID        REFERENCES ":schema".erp_event_venues(id) ON DELETE SET NULL,
  start_date      TIMESTAMPTZ NOT NULL,
  end_date        TIMESTAMPTZ,
  capacity        INTEGER,
  status          VARCHAR(30) DEFAULT 'planned', -- planned,published,ongoing,completed,cancelled
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX erp_events_status_idx ON ":schema".erp_events (status);
CREATE INDEX erp_events_start_idx  ON ":schema".erp_events (start_date);

CREATE TABLE ":schema".erp_event_tickets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES ":schema".erp_events(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  price           NUMERIC(15,2) DEFAULT 0,
  currency        VARCHAR(3)  DEFAULT 'TRY',
  quantity_total  INTEGER,
  quantity_sold   INTEGER     DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX erp_event_tickets_event_idx ON ":schema".erp_event_tickets (event_id);

CREATE TABLE ":schema".erp_event_registrations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES ":schema".erp_events(id) ON DELETE CASCADE,
  ticket_id       UUID        REFERENCES ":schema".erp_event_tickets(id) ON DELETE SET NULL,
  contact_id      UUID        REFERENCES ":schema".crm_contacts(id) ON DELETE SET NULL,
  invoice_id      UUID,       -- soft-link to acc_invoices
  status          VARCHAR(30) DEFAULT 'registered', -- registered,checked_in,cancelled
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_in_at   TIMESTAMPTZ
);

CREATE INDEX erp_event_registrations_event_idx   ON ":schema".erp_event_registrations (event_id);
CREATE INDEX erp_event_registrations_contact_idx ON ":schema".erp_event_registrations (contact_id);
