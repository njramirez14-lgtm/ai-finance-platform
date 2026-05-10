import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PieChart as PieIcon, BarChart3, AlertCircle, Building2 } from "lucide-react";
import api from "@/api/axios";

const fmt = (n) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

const monthKey = (d) => d.slice(0, 7);
const monthLabel = (key) => {
  const [y, m] = key.split("-");
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${months[parseInt(m, 10) - 1]} '${y.slice(2)}`;
};

const PALETTE = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#3b82f6",
];

export default function ReportsPage() {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [entityFilter, setEntityFilter] = useState("ALL");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [tx, cat, ent] = await Promise.all([
          api.get("/transactions/", { params: { limit: 500 } }),
          api.get("/categories/"),
          api.get("/entities/").catch(() => ({ data: [] })),
        ]);
        setTransactions(tx.data);
        setCategories(cat.data);
        setEntities(ent.data);
      } catch (err) {
        setError(err.response?.data?.detail || "Error cargando informes");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (entityFilter === "ALL") return transactions;
    if (entityFilter === "NONE") return transactions.filter((t) => !t.entity_id);
    return transactions.filter((t) => String(t.entity_id) === entityFilter);
  }, [transactions, entityFilter]);

  const monthly = useMemo(() => {
    const map = {};
    for (const tx of filtered) {
      const key = monthKey(tx.date);
      if (!map[key]) map[key] = { income: 0, expense: 0 };
      if (tx.type === "INCOME") map[key].income += Number(tx.amount);
      else map[key].expense += Number(tx.amount);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const byCategory = useMemo(() => {
    const totals = {};
    for (const tx of filtered) {
      if (tx.type !== "EXPENSE") continue;
      const cid = tx.category_id || "none";
      totals[cid] = (totals[cid] || 0) + Number(tx.amount);
    }
    const catName = (id) => {
      if (id === "none") return "Sin categoría";
      const c = categories.find((x) => x.id === Number(id));
      return c ? c.name : `#${id}`;
    };
    const total = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(totals)
      .map(([id, amount]) => ({ id, name: catName(id), amount, pct: (amount / total) * 100 }))
      .sort((a, b) => b.amount - a.amount);
  }, [filtered, categories]);

  const totalIncome = filtered.filter((t) => t.type === "INCOME").reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = filtered.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + Number(t.amount), 0);

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <BarChart3 size={22} /> Informes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análisis visual de tus finanzas, mes a mes y por categoría.
          </p>
        </div>

        {entities.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Building2 size={12} /> Entidad:</span>
            <Chip active={entityFilter === "ALL"} onClick={() => setEntityFilter("ALL")}>Todas</Chip>
            {entities.map((e) => (
              <Chip key={e.id} active={entityFilter === String(e.id)} onClick={() => setEntityFilter(String(e.id))}>
                {e.name}
              </Chip>
            ))}
            <Chip active={entityFilter === "NONE"} onClick={() => setEntityFilter("NONE")}>Sin entidad</Chip>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SimpleCard label="Ingresos totales" value={fmt(totalIncome)} tone="emerald" />
          <SimpleCard label="Gastos totales" value={fmt(totalExpense)} tone="rose" />
          <SimpleCard label="Ahorro neto" value={fmt(totalIncome - totalExpense)} tone={totalIncome - totalExpense >= 0 ? "indigo" : "rose"} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Mes a mes</CardTitle>
            <CardDescription>Ingresos vs gastos · {filtered.length} transacciones</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64 bg-muted/50 rounded animate-pulse" />
            ) : monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sin datos.</p>
            ) : (
              <MonthlyChart data={monthly} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PieIcon size={18} /> Gastos por categoría</CardTitle>
            <CardDescription>Distribución de tu dinero</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64 bg-muted/50 rounded animate-pulse" />
            ) : byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Aún no hay gastos para mostrar.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <DonutChart data={byCategory.slice(0, 8)} total={totalExpense} />
                <div className="space-y-2">
                  {byCategory.slice(0, 10).map((c, i) => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{c.pct.toFixed(0)}%</span>
                      <span className="font-mono tabular-nums w-20 text-right">{fmt(c.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
        active
          ? "bg-foreground text-background border-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SimpleCard({ label, value, tone }) {
  const tones = {
    emerald: "text-emerald-500",
    rose: "text-rose-500",
    indigo: "text-indigo-400",
  };
  return (
    <Card>
      <CardContent className="pt-4">
        <div className={`text-xs uppercase tracking-wider ${tones[tone]}`}>{label}</div>
        <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function MonthlyChart({ data }) {
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
                <span className="text-[10px] w-16 text-emerald-500 text-right">{fmt(v.income)}</span>
                <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${incPct}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] w-16 text-rose-500 text-right">{fmt(v.expense)}</span>
                <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
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

function DonutChart({ data, total }) {
  const size = 200;
  const radius = 80;
  const stroke = 30;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = data.map((d, i) => {
    const len = (d.amount / total) * circ;
    const arc = {
      offset,
      length: len,
      color: PALETTE[i % PALETTE.length],
      id: d.id,
    };
    offset += len;
    return arc;
  });

  return (
    <div className="flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} opacity="0.2" />
        {arcs.map((a) => (
          <circle
            key={a.id}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={a.color}
            strokeWidth={stroke}
            strokeDasharray={`${a.length} ${circ - a.length}`}
            strokeDashoffset={-a.offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        ))}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="currentColor"
          className="text-sm font-bold"
        >
          {new Intl.NumberFormat("es-ES", { notation: "compact", style: "currency", currency: "EUR" }).format(total)}
        </text>
      </svg>
    </div>
  );
}
