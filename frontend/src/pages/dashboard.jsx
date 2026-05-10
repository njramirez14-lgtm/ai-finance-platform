import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  TrendingUp, TrendingDown, Wallet, Receipt, Plus, AlertCircle, ArrowRight,
  Camera, Sparkles, LineChart, Building2,
} from "lucide-react";
import api from "@/api/axios";
import TicketScanDialog from "@/components/ticket-scan-dialog";
import useStore from "@/store";
import { scopeFilter, scopeLabel } from "@/store/slices/scope";

const fmt = (n) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

const monthKey = (d) => d.slice(0, 7);
const monthLabel = (key) => {
  const [y, m] = key.split("-");
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${months[parseInt(m, 10) - 1]}'${y.slice(2)}`;
};

export default function DashboardPage() {
  const [recent, setRecent] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const scope = useStore((s) => s.scope);
  const entities = useStore((s) => s.entitiesCache);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, all, acc, cat, liab] = await Promise.all([
        api.get("/transactions/", { params: { limit: 8 } }),
        api.get("/transactions/", { params: { limit: 500 } }),
        api.get("/accounts/").catch(() => ({ data: [] })),
        api.get("/categories/").catch(() => ({ data: [] })),
        api.get("/liabilities/").catch(() => ({ data: [] })),
      ]);
      setRecent(r.data);
      setTransactions(all.data);
      setAccounts(acc.data);
      setCategories(cat.data);
      setLiabilities(liab.data || []);
    } catch (err) {
      setError(err.response?.data?.detail || "Error cargando el dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const scopedTransactions = useMemo(
    () => transactions.filter((t) => scopeFilter(t, scope, entities)),
    [transactions, scope, entities],
  );
  const scopedRecent = useMemo(
    () => recent.filter((t) => scopeFilter(t, scope, entities)),
    [recent, scope, entities],
  );
  const scopedAccounts = useMemo(
    () => accounts.filter((a) => scopeFilter(a, scope, entities)),
    [accounts, scope, entities],
  );
  const scopedLiabilities = useMemo(
    () => liabilities.filter((l) => scopeFilter(l, scope, entities)),
    [liabilities, scope, entities],
  );

  const income = scopedTransactions
    .filter((t) => t.type === "INCOME")
    .reduce((acc, t) => acc + Number(t.amount), 0);
  const expense = scopedTransactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((acc, t) => acc + Number(t.amount), 0);
  const balance = income - expense;
  const count = scopedTransactions.length;
  const savingsRate = income > 0 ? Math.round((balance / income) * 100) : 0;
  const totalAccountBalance = scopedAccounts.reduce((acc, a) => acc + Number(a.balance || 0), 0);
  const totalDebt = scopedLiabilities.reduce((acc, l) => acc + Number(l.current_balance || 0), 0);
  const monthlyDebtPayment = scopedLiabilities.reduce((acc, l) => acc + Number(l.monthly_payment || 0), 0);
  const netWorth = totalAccountBalance - totalDebt;

  // Monthly aggregation last 6 months
  const monthly = useMemo(() => {
    const map = {};
    for (const tx of scopedTransactions) {
      const key = monthKey(tx.date);
      if (!map[key]) map[key] = { income: 0, expense: 0 };
      if (tx.type === "INCOME") map[key].income += Number(tx.amount);
      else map[key].expense += Number(tx.amount);
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6);
  }, [scopedTransactions]);

  // Top spending categories this month
  const topCats = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const totals = {};
    for (const tx of scopedTransactions) {
      if (tx.type !== "EXPENSE") continue;
      if (!tx.date.startsWith(currentMonth)) continue;
      const key = tx.category_id || "none";
      totals[key] = (totals[key] || 0) + Number(tx.amount);
    }
    const catName = (id) => {
      if (id === "none") return "Sin categoría";
      const c = categories.find((x) => x.id === Number(id));
      return c ? c.name : `#${id}`;
    };
    return Object.entries(totals)
      .map(([id, amount]) => ({ id, name: catName(id), amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [scopedTransactions, categories]);

  const topCatMax = topCats[0]?.amount || 0;

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              Resumen general
              {scope && scope.kind !== "all" && (
                <Badge variant="outline" className="text-xs font-normal">
                  {scopeLabel(scope, entities)}
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tu situación financiera de un vistazo.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setTicketOpen(true)} className="gap-2">
              <Camera size={16} /> Subir ticket
            </Button>
            <Link to="/transactions">
              <Button className="gap-2"><Plus size={16} /> Nueva transacción</Button>
            </Link>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Ingresos" value={fmt(income)} icon={<TrendingUp size={18} />} tone="emerald" loading={loading} />
          <KpiCard label="Gastos" value={fmt(expense)} icon={<TrendingDown size={18} />} tone="rose" loading={loading} />
          <KpiCard
            label="Balance"
            value={fmt(balance)}
            icon={<Wallet size={18} />}
            tone={balance >= 0 ? "indigo" : "rose"}
            hint={income > 0 ? `${savingsRate}% de ahorro` : null}
            loading={loading}
          />
          <KpiCard
            label="Patrimonio neto"
            value={fmt(netWorth)}
            icon={<Building2 size={18} />}
            tone={netWorth >= 0 ? "slate" : "rose"}
            hint={totalDebt > 0 ? `Activos ${fmt(totalAccountBalance)} − Deudas ${fmt(totalDebt)}` : `${scopedAccounts.length} cuenta${scopedAccounts.length === 1 ? "" : "s"}`}
            loading={loading}
          />
        </div>

        {(totalDebt > 0 || scopedLiabilities.length > 0) && (
          <Card className="border-rose-500/20 bg-rose-500/5">
            <CardContent className="py-4 flex items-center gap-4 flex-wrap">
              <div className="p-2 rounded-md bg-rose-500/15 text-rose-400">
                <Building2 size={20} />
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="text-xs uppercase tracking-wider text-rose-400">Deuda total</div>
                <div className="text-xl font-bold tabular-nums">{fmt(totalDebt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Cuotas mensuales</div>
                <div className="text-xl font-bold tabular-nums">{fmt(monthlyDebtPayment)}</div>
              </div>
              <Link to="/liabilities">
                <Button variant="outline" size="sm" className="gap-1">
                  Ver deudas <ArrowRight size={14} />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Quick actions cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <QuickAction
            to="/markets"
            icon={<LineChart size={18} />}
            title="Ver mercados"
            description="Precios en vivo de cripto y acciones"
            tone="indigo"
          />
          <QuickAction
            to="/advisor"
            icon={<Sparkles size={18} />}
            title="Asesor IA"
            description="Fiscal, ahorro, inversión — con tus datos"
            tone="purple"
          />
          <QuickAction
            onClick={() => setTicketOpen(true)}
            icon={<Camera size={18} />}
            title="Foto del ticket"
            description="La IA lo lee y lo guarda como gasto"
            tone="emerald"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Monthly chart */}
          <Card>
            <CardHeader>
              <CardTitle>Últimos 6 meses</CardTitle>
              <CardDescription>Ingresos vs gastos</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-48 bg-muted/50 rounded animate-pulse" />
              ) : monthly.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Sin datos suficientes.</p>
              ) : (
                <MonthlyBars data={monthly} />
              )}
            </CardContent>
          </Card>

          {/* Top categories */}
          <Card>
            <CardHeader>
              <CardTitle>Top gastos este mes</CardTitle>
              <CardDescription>Por categoría</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3].map((i) => <div key={i} className="h-8 rounded bg-muted/50" />)}
                </div>
              ) : topCats.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Sin gastos este mes.</p>
              ) : (
                <div className="space-y-3">
                  {topCats.map((c) => (
                    <div key={c.id}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium truncate">{c.name}</span>
                        <span className="font-mono tabular-nums text-rose-400">{fmt(c.amount)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-rose-500/60 rounded-full"
                          style={{ width: `${Math.max(4, (c.amount / topCatMax) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Account balances */}
        {scopedAccounts.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Cuentas</CardTitle>
                <CardDescription>Saldo actual calculado</CardDescription>
              </div>
              <Link to="/accounts" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                Ver todas <ArrowRight size={14} />
              </Link>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {scopedAccounts.slice(0, 6).map((a) => (
                  <div key={a.id} className="p-3 rounded-lg border border-border bg-card/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{a.name}</span>
                      <Badge variant="outline" className="text-[10px]">{a.type}</Badge>
                    </div>
                    <div className="mt-1 text-lg font-bold tabular-nums">{fmt(a.balance)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent transactions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Últimas transacciones</CardTitle>
              <CardDescription>Tus 8 movimientos más recientes</CardDescription>
            </div>
            <Link to="/transactions" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Ver todas <ArrowRight size={14} />
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2 animate-pulse">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 rounded bg-muted/50" />)}
              </div>
            ) : scopedRecent.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <p className="text-sm text-muted-foreground">Aún no hay transacciones.</p>
                <div className="flex gap-2 justify-center">
                  <Link to="/transactions">
                    <Button variant="outline" className="gap-2"><Plus size={14} /> Añadir manual</Button>
                  </Link>
                  <Button variant="outline" onClick={() => setTicketOpen(true)} className="gap-2"><Camera size={14} /> Foto de ticket</Button>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-24">Tipo</TableHead>
                    <TableHead className="text-right w-32">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scopedRecent.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{tx.date}</TableCell>
                      <TableCell className="font-medium">{tx.description || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          tx.type === "INCOME"
                            ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
                            : "border-rose-500/30 text-rose-400 bg-rose-500/5"
                        }>
                          {tx.type === "INCOME" ? "Ingreso" : "Gasto"}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${
                        tx.type === "INCOME" ? "text-emerald-400" : "text-rose-400"
                      }`}>
                        {tx.type === "INCOME" ? "+" : "-"}{fmt(tx.amount).replace(/^-/, "")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <TicketScanDialog
        open={ticketOpen}
        onOpenChange={setTicketOpen}
        accounts={scopedAccounts}
        categories={categories}
        onSaved={load}
      />
    </Layout>
  );
}

function KpiCard({ label, value, icon, tone = "slate", hint, loading }) {
  const tones = {
    emerald: "text-emerald-500",
    rose: "text-rose-500",
    indigo: "text-indigo-400",
    slate: "text-slate-400",
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className={`flex items-center gap-2 text-xs uppercase tracking-wider ${tones[tone]}`}>
          {icon} {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-24 bg-muted/50 rounded animate-pulse" />
        ) : (
          <>
            <div className="text-2xl font-bold tabular-nums">{value}</div>
            {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function QuickAction({ to, onClick, icon, title, description, tone }) {
  const tones = {
    indigo: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:border-indigo-500/40",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20 hover:border-purple-500/40",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:border-emerald-500/40",
  };
  const inner = (
    <div className={`p-4 rounded-lg border-2 transition-all ${tones[tone]} cursor-pointer`}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-background/50">{icon}</div>
        <div className="flex-1">
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
        </div>
        <ArrowRight size={16} />
      </div>
    </div>
  );
  if (to) return <Link to={to}>{inner}</Link>;
  return <button type="button" onClick={onClick} className="text-left w-full">{inner}</button>;
}

function MonthlyBars({ data }) {
  const max = Math.max(...data.flatMap(([_, v]) => [v.income, v.expense]), 1);
  return (
    <div className="space-y-3">
      {data.map(([key, v]) => {
        const incPct = (v.income / max) * 100;
        const expPct = (v.expense / max) * 100;
        const net = v.income - v.expense;
        return (
          <div key={key}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium uppercase tracking-wider text-muted-foreground">{monthLabel(key)}</span>
              <span className={`font-mono tabular-nums ${net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {net >= 0 ? "+" : ""}{fmt(net)}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] w-12 text-emerald-500">+{fmt(v.income).replace(/[€\s]/g, "")}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${incPct}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] w-12 text-rose-500">-{fmt(v.expense).replace(/[€\s]/g, "")}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-rose-500/60 rounded-full" style={{ width: `${expPct}%` }} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
