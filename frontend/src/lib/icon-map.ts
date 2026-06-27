// Explicit (tree-shakeable) icon lookup for nav-catalog icon keys — `import * as
// LucideIcons` pulls in the entire ~1500-icon library into the bundle; named imports let
// Vite/Rollup drop everything unused. Add an import + map entry here whenever
// src/lib/nav-catalog.ts (backend) gains a new icon key.
import {
  LayoutDashboard, Users, Building2, Handshake, CalendarCheck, Database,
  FilePenLine, PackageCheck, Box, Truck, ShoppingCart, BarChart2, FileText,
  CreditCard, Receipt, PieChart, Plug, IdCard, Wallet, CalendarOff, Clock,
  UserSearch, Headphones, ShoppingBag, Megaphone, CalendarDays, GitBranch,
  Code2, ListPlus, FileUp, Sparkles, ShieldCheck, FolderOpen, Settings2,
  Settings, Shield, Brain, LifeBuoy, Boxes, Briefcase, Circle,
  type LucideProps,
} from 'lucide-react'

type IconComponent = React.ComponentType<LucideProps>

const ICONS: Record<string, IconComponent> = {
  'layout-dashboard': LayoutDashboard,
  users: Users,
  'building-2': Building2,
  handshake: Handshake,
  'calendar-check': CalendarCheck,
  database: Database,
  'file-pen-line': FilePenLine,
  'package-check': PackageCheck,
  box: Box,
  truck: Truck,
  'shopping-cart': ShoppingCart,
  'bar-chart-2': BarChart2,
  'file-text': FileText,
  'credit-card': CreditCard,
  receipt: Receipt,
  'pie-chart': PieChart,
  plug: Plug,
  'id-card': IdCard,
  wallet: Wallet,
  'calendar-off': CalendarOff,
  clock: Clock,
  'user-search': UserSearch,
  headphones: Headphones,
  'shopping-bag': ShoppingBag,
  megaphone: Megaphone,
  'calendar-days': CalendarDays,
  'git-branch': GitBranch,
  'code-2': Code2,
  'list-plus': ListPlus,
  'file-up': FileUp,
  sparkles: Sparkles,
  'shield-check': ShieldCheck,
  'folder-open': FolderOpen,
  'settings-2': Settings2,
  settings: Settings,
  shield: Shield,
  brain: Brain,
  'life-buoy': LifeBuoy,
  boxes: Boxes,
  briefcase: Briefcase,
}

export function resolveIcon(key: string): IconComponent {
  return ICONS[key] ?? Circle
}
