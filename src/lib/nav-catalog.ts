// Single static source of truth for the sidebar navigation tree. The frontend never
// hardcodes routes/labels/icons itself — it renders whatever GET /nav-config (which merges
// this catalog with per-entity overrides from entity_sidebar_nav_config) returns. Adding a
// new page to the product means adding one row here, not touching Layout.tsx.
//
// `icon` is a kebab-case lucide icon name (e.g. 'layout-dashboard' → LayoutDashboard) —
// the frontend converts kebab-case to the PascalCase component name generically.
// `route: null` + `kind: 'placeholder'` renders a generic "Yakında" card instead of a page.
// `requiresEntitlement` cross-checks the entity_module_entitlements table (active/trial) —
// moved server-side here so the frontend no longer needs any entitlement logic of its own.
// `defaultRoles` is the catalog's OWN baseline restriction (e.g. platform-staff-only items);
// it is distinct from a per-entity `allowedRoles` override, which can only narrow further,
// never re-open an item the catalog itself restricted.

export interface NavCatalogItem {
  key: string
  group: string
  icon: string
  label: string
  route: string | null
  kind: 'page' | 'placeholder'
  requiresEntitlement?: string
  defaultRoles?: string[]
}

export interface NavCatalogGroup {
  key: string
  label: string
  icon: string
}

export const NAV_GROUPS: NavCatalogGroup[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { key: 'crm', label: 'CRM', icon: 'users' },
  { key: 'sales', label: 'Satış', icon: 'handshake' },
  { key: 'inventory', label: 'Envanter', icon: 'boxes' },
  { key: 'finance', label: 'Muhasebe', icon: 'bar-chart-2' },
  { key: 'hr', label: 'İnsan Kaynakları', icon: 'briefcase' },
  { key: 'operations', label: 'Operasyon', icon: 'truck' },
  { key: 'platform', label: 'Platform', icon: 'settings' },
  { key: 'ai', label: 'Yapay Zeka', icon: 'sparkles' },
]

export const NAV_CATALOG: NavCatalogItem[] = [
  // ── Dashboard ──────────────────────────────────────────────────────────
  { key: 'dashboard', group: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard', route: '/app/dashboard', kind: 'page' },

  // ── CRM ────────────────────────────────────────────────────────────────
  { key: 'crm_contacts', group: 'crm', icon: 'users', label: 'Kişiler', route: '/app/crm-native?view=contacts', kind: 'page' },
  { key: 'crm_companies', group: 'crm', icon: 'building-2', label: 'Şirketler', route: '/app/crm-native?view=companies', kind: 'page' },
  { key: 'crm_deals', group: 'crm', icon: 'handshake', label: 'Anlaşmalar', route: '/app/crm-native?view=deals', kind: 'page' },
  { key: 'crm_activities', group: 'crm', icon: 'calendar-check', label: 'Aktiviteler', route: '/app/crm-native?view=activities', kind: 'page' },
  { key: 'crm_connections', group: 'crm', icon: 'database', label: 'CRM Bağlantıları', route: '/app/crm', kind: 'page' },

  // ── Sales (no real page yet) ───────────────────────────────────────────
  { key: 'sales_quotes', group: 'sales', icon: 'file-pen-line', label: 'Teklifler & Proforma', route: null, kind: 'placeholder' },
  { key: 'sales_orders', group: 'sales', icon: 'package-check', label: 'Satış Siparişleri', route: null, kind: 'placeholder' },

  // ── Inventory (ERP native) ─────────────────────────────────────────────
  { key: 'inv_products', group: 'inventory', icon: 'box', label: 'Ürünler', route: '/app/erp-native?view=products', kind: 'page' },
  { key: 'inv_suppliers', group: 'inventory', icon: 'truck', label: 'Tedarikçiler', route: '/app/erp-native?view=suppliers', kind: 'page' },
  { key: 'inv_orders', group: 'inventory', icon: 'shopping-cart', label: 'Satınalma Siparişleri', route: '/app/erp-native?view=orders', kind: 'page' },

  // ── Finance (Accounting native) ────────────────────────────────────────
  { key: 'fin_overview', group: 'finance', icon: 'bar-chart-2', label: 'Özet', route: '/app/accounting?tab=summary', kind: 'page' },
  { key: 'fin_invoices', group: 'finance', icon: 'file-text', label: 'Faturalar', route: '/app/accounting?tab=invoices', kind: 'page' },
  { key: 'fin_payments', group: 'finance', icon: 'credit-card', label: 'Ödemeler', route: '/app/accounting?tab=payments', kind: 'page' },
  { key: 'fin_expenses', group: 'finance', icon: 'receipt', label: 'Giderler', route: '/app/accounting?tab=expenses', kind: 'page' },
  { key: 'fin_reports', group: 'finance', icon: 'pie-chart', label: 'Raporlar', route: '/app/accounting?tab=reports', kind: 'page' },
  { key: 'fin_integrations', group: 'finance', icon: 'plug', label: 'Muhasebe Entegrasyonları', route: '/app/accounting?tab=integrations', kind: 'page' },

  // ── HR (Personnel native, addon-gated) ─────────────────────────────────
  { key: 'hr_employees', group: 'hr', icon: 'id-card', label: 'Personel', route: '/app/personnel?tab=staff', kind: 'page', requiresEntitlement: 'addon_personnel_management' },
  { key: 'hr_payroll', group: 'hr', icon: 'wallet', label: 'Bordro', route: '/app/personnel?tab=payroll', kind: 'page', requiresEntitlement: 'addon_personnel_management' },
  { key: 'hr_leave', group: 'hr', icon: 'calendar-off', label: 'İzin Talepleri', route: null, kind: 'placeholder' },
  { key: 'hr_attendance', group: 'hr', icon: 'clock', label: 'Devam Takibi', route: null, kind: 'placeholder' },
  { key: 'hr_recruitment', group: 'hr', icon: 'user-search', label: 'İşe Alım', route: null, kind: 'placeholder' },

  // ── Operations (addon-gated) ───────────────────────────────────────────
  { key: 'ops_customer_service', group: 'operations', icon: 'headphones', label: 'Müşteri Hizmetleri', route: '/app/customer-service', kind: 'page', requiresEntitlement: 'addon_customer_service' },
  { key: 'ops_fulfillment', group: 'operations', icon: 'truck', label: 'Sevkiyat', route: '/app/fulfillment', kind: 'page', requiresEntitlement: 'addon_fulfillment' },
  { key: 'ops_ecommerce', group: 'operations', icon: 'shopping-bag', label: 'E-Ticaret', route: '/app/ecommerce', kind: 'page', requiresEntitlement: 'addon_ecommerce' },
  { key: 'ops_marketing', group: 'operations', icon: 'megaphone', label: 'Pazarlama', route: '/app/marketing', kind: 'page', requiresEntitlement: 'addon_marketing' },
  { key: 'ops_events', group: 'operations', icon: 'calendar-days', label: 'Etkinlikler', route: '/app/events', kind: 'page', requiresEntitlement: 'addon_event' },

  // ── Platform (tools + settings) ────────────────────────────────────────
  { key: 'plat_blueprint', group: 'platform', icon: 'git-branch', label: 'Blueprint', route: '/app/blueprint', kind: 'page' },
  { key: 'plat_functions', group: 'platform', icon: 'code-2', label: 'Fonksiyonlar', route: '/app/functions', kind: 'page' },
  { key: 'plat_field_manager', group: 'platform', icon: 'list-plus', label: 'Alan Yöneticisi', route: '/app/field-manager', kind: 'page' },
  { key: 'plat_import', group: 'platform', icon: 'file-up', label: 'İçe Aktarma', route: '/app/import', kind: 'page' },
  { key: 'plat_onboarding', group: 'platform', icon: 'sparkles', label: 'Sektörel Şablonlar', route: '/app/onboarding', kind: 'page' },
  { key: 'plat_ai_actions', group: 'platform', icon: 'shield-check', label: 'AI Onayları', route: '/app/ai-actions', kind: 'page' },
  { key: 'plat_files', group: 'platform', icon: 'folder-open', label: 'Dosyalar', route: '/app/files', kind: 'page' },
  { key: 'plat_entity_settings', group: 'platform', icon: 'settings-2', label: 'Entity Ayarları', route: '/app/settings', kind: 'page' },
  { key: 'plat_platform_settings', group: 'platform', icon: 'settings', label: 'Platform Ayarları', route: '/app/admin/settings', kind: 'page', defaultRoles: ['admin', 'supervisor'] },
  { key: 'plat_admin', group: 'platform', icon: 'shield', label: 'Platform Yönetimi', route: '/app/admin', kind: 'page', defaultRoles: ['admin', 'supervisor'] },

  // ── AI Premium ──────────────────────────────────────────────────────────
  { key: 'ai_kibi', group: 'ai', icon: 'sparkles', label: 'KIBI AI', route: '/app/chat', kind: 'page', requiresEntitlement: 'ai_premium' },
  { key: 'ai_entity', group: 'ai', icon: 'brain', label: 'Entity AI', route: '/app/entity-ai', kind: 'page', requiresEntitlement: 'ai_premium' },
  { key: 'ai_support', group: 'ai', icon: 'life-buoy', label: 'Destek', route: '/app/support', kind: 'page' },
  { key: 'ai_wallet', group: 'ai', icon: 'credit-card', label: 'Ki Wallet', route: '/app/wallet', kind: 'page' },
]

export function getNavCatalogItem(key: string): NavCatalogItem | undefined {
  return NAV_CATALOG.find(i => i.key === key)
}
