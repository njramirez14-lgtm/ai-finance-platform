import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Building2, ChevronsUpDown, Plus, User, Briefcase, Wallet, Globe2, Check,
} from "lucide-react";
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
import useStore from "@/store";
import { scopeLabel } from "@/store/slices/scope";

export function EntitySwitcher() {
  const { isMobile } = useSidebar();
  const isAuthed = useStore((s) => s.auth?.isAuthenticated);
  const scope = useStore((s) => s.scope);
  const setScope = useStore((s) => s.setScope);
  const entities = useStore((s) => s.entitiesCache);
  const setEntitiesCache = useStore((s) => s.setEntitiesCache);

  useEffect(() => {
    if (!isAuthed) return;
    let cancelled = false;
    api.get("/entities/")
      .then(({ data }) => { if (!cancelled) setEntitiesCache(data || []); })
      .catch(() => { if (!cancelled) setEntitiesCache([]); });
    return () => { cancelled = true; };
  }, [isAuthed, setEntitiesCache]);

  const personalCount = entities.filter((e) => e.type === "PERSONAL").length;
  const businessCount = entities.filter((e) => e.type === "BUSINESS").length;
  const title = scopeLabel(scope, entities);
  const subtitle = entities.length === 0
    ? "Sin entidades"
    : `${personalCount} personal${personalCount === 1 ? "" : "es"} · ${businessCount} empresa${businessCount === 1 ? "" : "s"}`;

  const isActive = (kind, value) => {
    if (!scope) return kind === "all";
    if (scope.kind !== kind) return false;
    if (kind === "all") return true;
    return String(scope.value) === String(value);
  };

  const select = (next) => setScope(next);

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
                <span className="truncate font-medium">{title}</span>
                <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-64 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">Vista global</DropdownMenuLabel>
            <ScopeItem
              icon={Globe2}
              label="Todo conjunto"
              active={isActive("all")}
              onSelect={() => select({ kind: "all", value: null })}
            />
            <ScopeItem
              icon={User}
              label="Solo personal"
              hint={personalCount ? `${personalCount} entidad${personalCount === 1 ? "" : "es"}` : "ninguna"}
              disabled={personalCount === 0}
              active={isActive("type", "PERSONAL")}
              onSelect={() => select({ kind: "type", value: "PERSONAL" })}
            />
            <ScopeItem
              icon={Briefcase}
              label="Solo empresa"
              hint={businessCount ? `${businessCount} entidad${businessCount === 1 ? "" : "es"}` : "ninguna"}
              disabled={businessCount === 0}
              active={isActive("type", "BUSINESS")}
              onSelect={() => select({ kind: "type", value: "BUSINESS" })}
            />

            {entities.length > 0 && <DropdownMenuSeparator />}
            {entities.length > 0 && (
              <DropdownMenuLabel className="text-muted-foreground text-xs">Una entidad</DropdownMenuLabel>
            )}
            {entities.map((e) => {
              const Icon = e.type === "BUSINESS" ? Briefcase : User;
              return (
                <ScopeItem
                  key={e.id}
                  icon={Icon}
                  label={e.name}
                  hint={e.type === "BUSINESS" ? "Empresa" : "Personal"}
                  active={isActive("entity", e.id)}
                  onSelect={() => select({ kind: "entity", value: e.id })}
                />
              );
            })}
            <ScopeItem
              icon={Building2}
              label="Sin asignar"
              hint="Transacciones sin entidad"
              active={isActive("entity", null) || (scope?.kind === "entity" && scope?.value == null)}
              onSelect={() => select({ kind: "entity", value: null })}
            />

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

function ScopeItem({ icon: Icon, label, hint, active, disabled, onSelect }) {
  return (
    <DropdownMenuItem
      className={`gap-2 p-2 ${active ? "bg-accent/60" : ""} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      onSelect={(e) => { e.preventDefault?.(); onSelect?.(); }}
    >
      <div className="flex size-6 items-center justify-center rounded-md border">
        <Icon className="size-3.5 shrink-0" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{label}</div>
        {hint && (
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{hint}</div>
        )}
      </div>
      {active && <Check className="size-3.5 text-foreground/70" />}
    </DropdownMenuItem>
  );
}
