import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  TrendingUp, TrendingDown, RefreshCw, Loader2, AlertCircle,
  Crown, Building2, ExternalLink, Repeat, BarChart3, Users,
} from "lucide-react";
import api from "@/api/axios";

const fmtAmount = (min, max) => {
  if (min == null && max == null) return "—";
  const f = (n) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  if (min != null && max != null) return `$${f(min)} – $${f(max)}`;
  if (min != null) return `≥ $${f(min)}`;
  return `≤ $${f(max)}`;
};

const fmtDate = (s) => {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-ES", { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return s;
  }
};

function TxBadge({ type }) {
  if (type === "BUY") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1 hover:bg-emerald-500/15">
        <TrendingUp size={12} /> Compra
      </Badge>
    );
  }
  if (type === "SELL") {
    return (
      <Badge className="bg-rose-500/15 text-rose-500 border-rose-500/30 gap-1 hover:bg-rose-500/15">
        <TrendingDown size={12} /> Venta
      </Badge>
    );
  }
  return <Badge variant="outline" className="gap-1"><Repeat size={12} /> {type || "—"}</Badge>;
}

function PartyChip({ party }) {
  if (!party) return null;
  const p = party.toUpperCase();
  const isDem = p.startsWith("D");
  const isRep = p.startsWith("R");
  const cls = isDem
    ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
    : isRep
      ? "bg-red-500/15 text-red-400 border-red-500/30"
      : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  return <Badge variant="outline" className={cls}>{p[0]}</Badge>;
}

export default function SmartMoneyPage() {
  const [trades, setTrades] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [freshness, setFreshness] = useState(null);

  const [filters, setFilters] = useState({
    politician: "",
    ticker: "",
    transaction_type: "all",
    days: "180",
  });

  const params = useMemo(() => {
    const p = { limit: 200, days: Number(filters.days) || 180 };
    if (filters.politician.trim()) p.politician = filters.politician.trim();
    if (filters.ticker.trim()) p.ticker = filters.ticker.trim().toUpperCase();
    if (filters.transaction_type && filters.transaction_type !== "all") {
      p.transaction_type = filters.transaction_type;
    }
    return p;
  }, [filters]);

  const loadTrades = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/smart-money/trades", { params });
      setTrades(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.response?.data?.detail || "Error cargando trades");
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data } = await api.get("/smart-money/stats", { params: { days: 30 } });
      setStats(data);
    } catch {
      setStats(null);
    }
  };

  const loadFreshness = async () => {
    try {
      const { data } = await api.get("/smart-money/freshness");
      setFreshness(data);
    } catch {
      setFreshness(null);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const { data } = await api.post("/smart-money/sync/lambda", null, { params: { days: 180, limit: 500 } });
      await Promise.all([loadTrades(), loadStats(), loadFreshness()]);
      setError(null);
      alert(`Sync OK (Lambda Finance · House + Senate) · descargados ${data.fetched_records}, insertados ${data.inserted}, omitidos ${data.skipped}`);
    } catch (err) {
      setError(err.response?.data?.detail || "Error sincronizando con la fuente");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { loadTrades(); }, [params]);
  useEffect(() => { loadStats(); loadFreshness(); }, []);

  const isEmpty = !loading && trades.length === 0;

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Crown size={22} /> Smart Money
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sigue lo que compran y venden los congresistas y senadores de EEUU (Pelosi & cía) — datos vía Lambda Finance (House + Senate, actualizado a diario).
            </p>
          </div>
          <Button onClick={handleSync} disabled={syncing} className="gap-2">
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sincronizar Congreso
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {freshness && (
          <div className={`flex items-start gap-2 p-3 rounded-md text-sm border ${freshness.is_stale ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" : "bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"}`}>
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">
                {freshness.is_stale
                  ? `Datos antiguos: última operación registrada hace ${freshness.days_since_last_trade} días (${fmtDate(freshness.last_trade_date)})`
                  : `Datos al día: última operación hace ${freshness.days_since_last_trade ?? "?"} días (${fmtDate(freshness.last_trade_date)})`}
              </div>
              <div className="text-xs opacity-80 mt-0.5">{freshness.note}</div>
              {freshness.by_source?.length > 0 && (
                <div className="text-xs opacity-70 mt-1">
                  Fuentes: {freshness.by_source.map((s) => `${s.source} (${s.total}, último ${s.last_trade ? fmtDate(s.last_trade) : "—"})`).join(" · ")}
                </div>
              )}
            </div>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<BarChart3 size={16} />} label={`Trades (${stats.window_days}d)`} value={stats.total_trades} />
            <StatCard icon={<TrendingUp size={16} className="text-emerald-500" />} label="Compras" value={stats.buys} />
            <StatCard icon={<TrendingDown size={16} className="text-rose-500" />} label="Ventas" value={stats.sells} />
            <StatCard icon={<Users size={16} />} label="Actores únicos" value={stats.top_actors?.length || 0} />
          </div>
        )}

        {stats && (stats.top_tickers?.length > 0 || stats.top_actors?.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top tickers (últimos {stats.window_days}d)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {stats.top_tickers.length === 0 && <p className="text-sm text-muted-foreground">Sin datos</p>}
                  {stats.top_tickers.map((t) => (
                    <button
                      key={t.ticker}
                      onClick={() => setFilters((f) => ({ ...f, ticker: t.ticker }))}
                      className="px-2 py-1 rounded-md border border-border bg-muted/40 hover:bg-muted text-xs font-mono"
                    >
                      {t.ticker} <span className="text-muted-foreground">×{t.count}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Más activos (últimos {stats.window_days}d)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {stats.top_actors.length === 0 && <p className="text-sm text-muted-foreground">Sin datos</p>}
                  {stats.top_actors.map((a) => (
                    <button
                      key={a.name}
                      onClick={() => setFilters((f) => ({ ...f, politician: a.name }))}
                      className="px-2 py-1 rounded-md border border-border bg-muted/40 hover:bg-muted text-xs"
                    >
                      {a.name} <span className="text-muted-foreground">×{a.count}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filtros</CardTitle>
            <CardDescription>{total} trades coinciden con los filtros actuales</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input
                placeholder="Político (ej. Pelosi)"
                value={filters.politician}
                onChange={(e) => setFilters((f) => ({ ...f, politician: e.target.value }))}
              />
              <Input
                placeholder="Ticker (ej. NVDA)"
                value={filters.ticker}
                onChange={(e) => setFilters((f) => ({ ...f, ticker: e.target.value }))}
              />
              <Select
                value={filters.transaction_type}
                onValueChange={(v) => setFilters((f) => ({ ...f, transaction_type: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="BUY">Solo compras</SelectItem>
                  <SelectItem value="SELL">Solo ventas</SelectItem>
                  <SelectItem value="EXCHANGE">Intercambios</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.days}
                onValueChange={(v) => setFilters((f) => ({ ...f, days: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 días</SelectItem>
                  <SelectItem value="30">Últimos 30 días</SelectItem>
                  <SelectItem value="90">Últimos 90 días</SelectItem>
                  <SelectItem value="180">Últimos 6 meses</SelectItem>
                  <SelectItem value="365">Último año</SelectItem>
                  <SelectItem value="3650">Histórico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(filters.politician || filters.ticker || filters.transaction_type !== "all") && (
              <div className="mt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilters({ politician: "", ticker: "", transaction_type: "all", days: filters.days })}
                >
                  Limpiar filtros
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Operaciones</CardTitle>
            <CardDescription>
              Fuente: <a href="https://github.com/timothycarambat/senate-stock-watcher-data" target="_blank" rel="noreferrer" className="underline">senate-stock-watcher-data</a> (STOCK Act).
              Para sembrar la base la primera vez, pulsa "Sincronizar Congreso".
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-12 rounded-md bg-muted/50 animate-pulse" />)}
              </div>
            ) : isEmpty ? (
              <div className="py-12 text-center text-sm text-muted-foreground space-y-2">
                <Building2 size={32} className="mx-auto opacity-50" />
                <p>No hay trades todavía. Pulsa "Sincronizar Congreso" para descargar la base de datos pública del Senado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Político</TableHead>
                      <TableHead>Ticker</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Importe</TableHead>
                      <TableHead className="hidden md:table-cell">Activo</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDate(t.transaction_date)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <PartyChip party={t.actor_party} />
                            <button
                              onClick={() => setFilters((f) => ({ ...f, politician: t.actor_name }))}
                              className="text-sm hover:underline text-left"
                            >
                              {t.actor_name}
                            </button>
                            {t.actor_state && <span className="text-xs text-muted-foreground">({t.actor_state})</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {t.ticker ? (
                            <button
                              onClick={() => setFilters((f) => ({ ...f, ticker: t.ticker }))}
                              className="font-mono text-sm hover:underline"
                            >
                              {t.ticker}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell><TxBadge type={t.transaction_type} /></TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmtAmount(t.amount_min, t.amount_max)}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-xs truncate">
                          {t.asset_name || "—"}
                        </TableCell>
                        <TableCell>
                          {t.raw_url && (
                            <a href={t.raw_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-2xl font-semibold mt-1">{value ?? "—"}</div>
      </CardContent>
    </Card>
  );
}
