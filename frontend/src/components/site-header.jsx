import { useLocation } from "react-router-dom";
import { ModeToggle } from "@/components/mode-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const PAGE_TITLES = {
  "/dashboard": "Dashboard",
  "/transactions": "Transacciones",
  "/accounts": "Cuentas",
  "/cards": "Tarjetas",
  "/subscriptions": "Suscripciones",
  "/liabilities": "Deudas",
  "/entities": "Entidades",
  "/categories": "Categorías",
  "/markets": "Mercados",
  "/backtest": "Backtest",
  "/strategy": "Mi estrategia",
  "/advisor": "Asesor IA",
  "/reports": "Reports",
  "/settings": "Ajustes",
  "/trading": "Trading",
};

export function SiteHeader() {
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] || "AI Finance";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="flex items-center px-4">
        <ModeToggle />
      </div>
    </header>
  );
}
