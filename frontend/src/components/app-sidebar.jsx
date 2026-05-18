import * as React from "react";
import {
  LucideLayoutDashboard,
  PieChart,
  Settings2,
  Table2Icon,
  Layers,
  Wallet,
  Building2,
  Sparkles,
  LineChart,
  Home,
  CreditCard,
  Repeat,
  FlaskConical,
  Target,
  Crown,
  TrendingUp,
  PiggyBank,
  Newspaper,
  Car,
  Building,
  PartyPopper,
  Users,
  Bell,
} from "lucide-react";

import { NavSection } from "@/components/nav-section";
import { NavUser } from "@/components/nav-user";
import { EntitySwitcher } from "@/components/entity-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import useStore from "@/store";

export function AppSidebar({ ...props }) {
  const { user } = useStore((state) => state.auth);
  const scope = useStore((s) => s.scope);
  const entities = useStore((s) => s.entitiesCache);

  // Determine if the user is currently operating in a "company" workspace.
  // If scope is a specific entity, check its type. If scope.kind === "type", use that.
  let mode = "ALL"; // ALL | PERSONAL | BUSINESS
  if (scope?.kind === "entity" && scope.value != null) {
    const e = (entities || []).find((x) => x.id === Number(scope.value));
    if (e) mode = e.type;
  } else if (scope?.kind === "type") {
    mode = scope.value;
  }
  const showCompany = mode === "BUSINESS" || mode === "ALL";
  const showPersonal = mode === "PERSONAL" || mode === "ALL";

  const sections = [
    {
      label: "General",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LucideLayoutDashboard },
        { title: "Informes", url: "/reports", icon: PieChart },
      ],
    },
    {
      label: "Finanzas día a día",
      items: [
        { title: "Transacciones", url: "/transactions", icon: Table2Icon },
        { title: "Categorías", url: "/categories", icon: Layers },
        { title: "Cuentas", url: "/accounts", icon: Wallet },
        { title: "Tarjetas", url: "/cards", icon: CreditCard },
        { title: "Suscripciones", url: "/subscriptions", icon: Repeat },
        { title: "Ingresos", url: "/income", icon: TrendingUp },
        { title: "Presupuestos", url: "/budgets", icon: PiggyBank },
      ],
    },
    {
      label: "Patrimonio",
      items: [
        { title: "Cartera", url: "/portfolio", icon: TrendingUp },
        { title: "Propiedades", url: "/properties", icon: Building },
        { title: "Vehículos", url: "/vehicles", icon: Car },
        { title: "Deudas", url: "/liabilities", icon: Home },
        { title: "Entidades", url: "/entities", icon: Building2 },
      ],
    },
    ...(mode === "BUSINESS" ? [{
      label: "Empresa",
      items: [
        { title: "Empleados", url: "/employees", icon: Users },
        { title: "Sueldos / nómina", url: "/employees", icon: TrendingUp },
        { title: "Pagos automáticos", url: "/subscriptions", icon: Repeat },
        { title: "Recordatorios", url: "/reminders", icon: Bell },
      ],
    }] : mode === "ALL" ? [{
      label: "Empresa",
      items: [
        { title: "Empleados", url: "/employees", icon: Users },
        { title: "Pagos automáticos", url: "/subscriptions", icon: Repeat },
      ],
    }] : []),
    ...(mode !== "BUSINESS" ? [{
      label: "Recordatorios",
      items: [
        { title: "Recordatorios", url: "/reminders", icon: Bell },
      ],
    }] : []),
    {
      label: "Inversión & Inteligencia",
      items: [
        { title: "Mi estrategia", url: "/strategy", icon: Target },
        { title: "Mercados", url: "/markets", icon: LineChart },
        { title: "Noticias", url: "/news", icon: Newspaper },
        { title: "Smart Money", url: "/smart-money", icon: Crown },
        { title: "Backtest", url: "/backtest", icon: FlaskConical },
        { title: "Asesor IA", url: "/advisor", icon: Sparkles },
      ],
    },
    {
      label: "Demo",
      items: [
        { title: "Demo pública", url: "/demo", icon: PartyPopper },
      ],
    },
    {
      label: "Sistema",
      items: [
        { title: "Ajustes", url: "/settings", icon: Settings2 },
      ],
    },
  ];

  const userData = {
    name: user ? user.username : null,
    email: user ? user.email : null,
    avatar: "/avatars/shadcn.jpg",
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <EntitySwitcher />
      </SidebarHeader>
      <SidebarContent>
        {sections.map((s) => (
          <NavSection key={s.label} label={s.label} items={s.items} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
