import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ChevronsUpDown, Plus, User, Briefcase, Wallet } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import api from "@/api/axios";

export function EntitySwitcher() {
  const { isMobile } = useSidebar();
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/entities/");
      setEntities(data);
    } catch (err) {
      setEntities([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const personalCount = entities.filter((e) => e.type === "PERSONAL").length;
  const businessCount = entities.filter((e) => e.type === "BUSINESS").length;

  const subtitle = loading
    ? "Cargando…"
    : entities.length === 0
      ? "Sin entidades"
      : `${personalCount} personal${personalCount === 1 ? "" : "es"} · ${businessCount} empresa${businessCount === 1 ? "" : "s"}`;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <Wallet className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">AI Finance</span>
                <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Tus entidades
            </DropdownMenuLabel>
            {entities.length === 0 && !loading && (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                Aún no tienes entidades. Crea Personal o Empresa para separar tus finanzas.
              </div>
            )}
            {entities.map((e) => {
              const Icon = e.type === "BUSINESS" ? Briefcase : User;
              return (
                <DropdownMenuItem key={e.id} asChild className="gap-2 p-2">
                  <Link to="/entities">
                    <div className="flex size-6 items-center justify-center rounded-md border">
                      <Icon className="size-3.5 shrink-0" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{e.name}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {e.type === "BUSINESS" ? "Empresa" : "Personal"}
                      </div>
                    </div>
                  </Link>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2 p-2">
              <Link to="/entities">
                <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                  <Plus className="size-4" />
                </div>
                <div className="text-muted-foreground font-medium">Gestionar entidades</div>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
