import { useState } from "react";
import Layout from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, FlaskConical, Loader2, AlertCircle, Target,
} from "lucide-react";
import api from "@/api/axios";

const fmt = (n, c = "EUR") =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: c, maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtPct = (n) => `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`;

const STRATEGIES = [
  { value: "buy_hold", label: "Buy & Hold (compras 1 vez, esperas)", desc: "El más simple. Compras todo el primer día y vendes el último." },
  { value: "dca", label: "DCA (compras periódicas)", desc: "Inviertes un fijo cada X días. Estadísticamente ganador a largo plazo." },
  { value: "sma", label: "Cruce de medias (SMA)", desc: "Compras cuando la media corta cruza por encima de la larga. Tendencia." },
  { value: "rsi", label: "Mean reversion (RSI)", desc: "Compras cuando el activo está sobrevendido (RSI bajo), vendes cuando sobrecomprado." },
];

const RANGES = [
  { value: "6mo", label: "6 meses" },
  { value: "1y", label: "1 año" },
  { value: "2y", label: "2 años" },
  { value: "5y", label: "5 años" },
];

const PRESETS = [
  { type: "stock", symbol: "^GSPC", label: "S&P 500" },
  { type: "stock", symbol: "AAPL", label: "Apple" },
  { type: "stock", symbol: "NVDA", label: "Nvidia" },
  { type: "stock", symbol: "TSLA", label: "Tesla" },
  { type: "crypto", symbol: "bitcoin", label: "Bitcoin" },
  { type: "crypto", symbol: "ethereum", label: "Ethereum" },
];

export default function BacktestPage() {
  const [form, setForm] = useState({
    asset_type: "stock",
    symbol: "^GSPC",
    strategy: "buy_hold",
    range: "2y",
    initial_cash: "1000",
    fast: "20",
    slow: "50",
    rsi_period: "14",
    rsi_oversold: "30",
    rsi_overbought: "70",
    dca_every_days: "30",
    dca_amount: "100",
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = {
        asset_type: form.asset_type,
        symbol: form.symbol,
        strategy: form.strategy,
        range: form.range,
        initial_cash: parseFloat(form.initial_cash) || 1000,
      };
      if (form.strategy === "sma") {
        params.fast = parseInt(form.fast, 10);
        params.slow = parseInt(form.slow, 10);
      }
      if (form.strategy === "rsi") {
        params.rsi_period = parseInt(form.rsi_period, 10);
        params.rsi_oversold = parseFloat(form.rsi_oversold);
        params.rsi_overbought = parseFloat(form.rsi_overbought);
      }
      if (form.strategy === "dca") {
        params.dca_every_days = parseInt(form.dca_every_days, 10);
        params.dca_amount = parseFloat(form.dca_amount);
      }
      const { data } = await api.get("/backtest/run", { params });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Error ejecutando backtest");
    } finally {
      setLoading(false);
    }
  };

  const beatsBuyHold = result && result.total_return_pct > result.buy_hold_return_pct;
  const strategyMeta = STRATEGIES.find((s) => s.value === form.strategy);

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FlaskConical size={22} /> Backtest
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Prueba estrategias contra datos históricos reales. Sin dinero, sin riesgo.
          </p>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-2 p-3 rounded-md text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            Resultados pasados <strong>no garantizan</strong> resultados futuros. El 70-90% de day traders retail pierden dinero según estudios académicos.
            Esto es educación, no consejo de inversión.
          </span>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Configurar test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quick presets */}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Activos populares</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {PRESETS.map((p) => {
                  const active = form.symbol === p.symbol && form.asset_type === p.type;
                  return (
                    <button
                      key={p.symbol}
                      type="button"
                      onClick={() => setForm({ ...form, asset_type: p.type, symbol: p.symbol })}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                        active
                          ? "bg-foreground text-background border-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.asset_type} onValueChange={(v) => setForm({ ...form, asset_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stock">Acción / Índice</SelectItem>
                    <SelectItem value="crypto">Cripto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bt-symbol">Símbolo</Label>
                <Input
                  id="bt-symbol"
                  placeholder={form.asset_type === "stock" ? "AAPL" : "bitcoin"}
                  value={form.symbol}
                  onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Periodo</Label>
                <Select value={form.range} onValueChange={(v) => setForm({ ...form, range: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bt-cash">Capital inicial (€)</Label>
                <Input
                  id="bt-cash"
                  type="number"
                  value={form.initial_cash}
                  onChange={(e) => setForm({ ...form, initial_cash: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Estrategia</Label>
              <Select value={form.strategy} onValueChange={(v) => setForm({ ...form, strategy: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {strategyMeta && <p className="text-xs text-muted-foreground">{strategyMeta.desc}</p>}
            </div>

            {form.strategy === "sma" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>SMA rápida (días)</Label>
                  <Input type="number" value={form.fast} onChange={(e) => setForm({ ...form, fast: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>SMA lenta (días)</Label>
                  <Input type="number" value={form.slow} onChange={(e) => setForm({ ...form, slow: e.target.value })} />
                </div>
              </div>
            )}

            {form.strategy === "rsi" && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Periodo RSI</Label>
                  <Input type="number" value={form.rsi_period} onChange={(e) => setForm({ ...form, rsi_period: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Sobrevendido</Label>
                  <Input type="number" value={form.rsi_oversold} onChange={(e) => setForm({ ...form, rsi_oversold: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Sobrecomprado</Label>
                  <Input type="number" value={form.rsi_overbought} onChange={(e) => setForm({ ...form, rsi_overbought: e.target.value })} />
                </div>
              </div>
            )}

            {form.strategy === "dca" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Cada cuántos días</Label>
                  <Input type="number" value={form.dca_every_days} onChange={(e) => setForm({ ...form, dca_every_days: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Cantidad por compra (€)</Label>
                  <Input type="number" value={form.dca_amount} onChange={(e) => setForm({ ...form, dca_amount: e.target.value })} />
                </div>
              </div>
            )}

            <Button onClick={run} disabled={loading} className="gap-2">
              {loading ? <><Loader2 size={14} className="animate-spin" /> Calculando…</> : <><FlaskConical size={14} /> Ejecutar backtest</>}
            </Button>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Capital final" value={fmt(result.final_value)} accent={result.total_return_pct >= 0 ? "emerald" : "rose"} />
              <Stat
                label="Rentabilidad"
                value={fmtPct(result.total_return_pct)}
                hint={`vs Buy & Hold: ${fmtPct(result.buy_hold_return_pct)}`}
                accent={result.total_return_pct >= 0 ? "emerald" : "rose"}
              />
              <Stat label="Max drawdown" value={`-${result.max_drawdown_pct.toFixed(1)}%`} accent="rose" hint="La peor caída" />
              <Stat label="Sharpe" value={result.sharpe.toFixed(2)} accent="indigo" hint="Riesgo-retorno (>1 es bueno)" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat label="Operaciones" value={result.trades_count} />
              <Stat label="Win rate" value={`${result.win_rate_pct.toFixed(0)}%`} hint="Solo aplica en SMA/RSI" />
              <Stat label="Periodo" value={`${result.period_days} días`} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Curva de capital
                  <Badge variant="outline" className={beatsBuyHold ? "border-emerald-500/30 text-emerald-400" : "border-rose-500/30 text-rose-400"}>
                    {beatsBuyHold ? <><TrendingUp size={10} className="mr-1" /> Bate al Buy & Hold</> : <><TrendingDown size={10} className="mr-1" /> Peor que Buy & Hold</>}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {result.symbol.toUpperCase()} · {STRATEGIES.find((s) => s.value === result.strategy)?.label}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EquityChart curve={result.equity_curve} />
              </CardContent>
            </Card>

            {result.trades.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Últimas operaciones</CardTitle>
                  <CardDescription>{result.trades.length} más recientes de {result.trades_count} totales</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-96 overflow-y-auto">
                    {result.trades.map((t, i) => (
                      <div key={i} className="grid grid-cols-4 gap-2 py-1.5 px-2 border-b border-border text-sm">
                        <span className="font-mono text-xs text-muted-foreground">
                          {new Date(t.t * 1000).toLocaleDateString("es-ES")}
                        </span>
                        <Badge variant="outline" className={
                          t.side === "buy"
                            ? "border-emerald-500/30 text-emerald-400 w-fit"
                            : "border-rose-500/30 text-rose-400 w-fit"
                        }>
                          {t.side === "buy" ? "Comprar" : "Vender"}
                        </Badge>
                        <span className="font-mono">${Number(t.price).toFixed(2)}</span>
                        <span className={`font-mono text-right ${t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {t.pct != null ? fmtPct(t.pct) : t.amount ? `+${fmt(t.amount)}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {result.notes.length > 0 && (
              <div className="text-xs text-muted-foreground italic space-y-1">
                {result.notes.map((n, i) => <p key={i}>· {n}</p>)}
              </div>
            )}

            <Card className="border-purple-500/30 bg-purple-500/5">
              <CardContent className="py-4 flex items-start gap-3">
                <Target size={20} className="text-purple-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <strong>¿Qué hacer con esto?</strong>
                  {beatsBuyHold ? (
                    <span className="text-muted-foreground"> Tu estrategia bate al "comprar y esperar" en este test. Antes de operar real, prueba en otros activos y otros periodos. Una sola victoria no es prueba.</span>
                  ) : (
                    <span className="text-muted-foreground"> Tu estrategia perdió frente al "comprar y esperar". Es lo que pasa al 95% de retail. Prueba otros parámetros o acepta que indexar es el camino.</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}

function Stat({ label, value, hint, accent }) {
  const tones = {
    emerald: "text-emerald-500",
    rose: "text-rose-500",
    indigo: "text-indigo-400",
  };
  return (
    <Card>
      <CardContent className="pt-4">
        <div className={`text-xs uppercase tracking-wider ${tones[accent] || "text-muted-foreground"}`}>{label}</div>
        <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function EquityChart({ curve }) {
  if (!curve || curve.length < 2) return <p className="text-sm text-muted-foreground py-8 text-center">Sin datos.</p>;
  const values = curve.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 800, H = 220, PAD = 4;
  const step = (W - PAD * 2) / (curve.length - 1);
  const points = curve
    .map((p, i) => `${PAD + i * step},${PAD + (H - PAD * 2) - ((p.v - min) / range) * (H - PAD * 2)}`)
    .join(" ");
  const fill = `0,${H - PAD} ${points} ${W - PAD},${H - PAD}`;
  const positive = curve[curve.length - 1].v >= curve[0].v;
  const stroke = positive ? "#10b981" : "#f43f5e";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-56" preserveAspectRatio="none">
      <defs>
        <linearGradient id="eqgrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.4" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fill} fill="url(#eqgrad)" />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}
