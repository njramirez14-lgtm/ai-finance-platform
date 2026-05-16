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
} from "lucide-react";

import { NavMain } from "@/components/nav-main";
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

  const data = {
    user: {
      name: user ? user.username : null,
      email: user ? user.email : null,
      avatar: "/avatars/shadcn.jpg",
    },
    navMain: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: LucideLayoutDashboard,
        isActive: true,
      },
      {
        title: "Transacciones",
        url: "/transactions",
        icon: Table2Icon,
      },
      {
        title: "Cuentas",
        url: "/accounts",
        icon: Wallet,
      },
      {
        title: "Tarjetas",
        url: "/cards",
        icon: CreditCard,
      },
      {
        title: "Suscripciones",
        url: "/subscriptions",
        icon: Repeat,
      },
      {
        title: "Deudas",
        url: "/liabilities",
        icon: Home,
      },
      {
        title: "Entidades",
        url: "/entities",
        icon: Building2,
      },
      {
        title: "Cartera",
        url: "/portfolio",
        icon: TrendingUp,
      },
      {
        title: "Categorías",
        url: "/categories",
        icon: Layers,
      },
      {
        title: "Mercados",
        url: "/markets",
        icon: LineChart,
      },
      {
        title: "Smart Money",
        url: "/smart-money",
        icon: Crown,
      },
      {
        title: "Backtest",
        url: "/backtest",
        icon: FlaskConical,
      },
      {
        title: "Mi estrategia",
        url: "/strategy",
        icon: Target,
      },
      {
        title: "Asesor IA",
        url: "/advisor",
        icon: Sparkles,
      },
      {
        title: "Informes",
        url: "/reports",
        icon: PieChart,
      },
      {
        title: "Ajustes",
        url: "/settings",
        icon: Settings2,
      },
    ],
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <EntitySwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
