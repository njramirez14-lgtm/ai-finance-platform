import { useEffect, useState } from "react";
import Layout from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Target, Loader2, AlertCircle, TrendingDown, TrendingUp, Activity,
  PiggyBank, Calendar, CheckCircle2, XCircle, Sparkles, RefreshCw,
} from "lucide-react";
import api from "@/api/axios";

const fmt = (n, c = "EUR") =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: c, maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtPct = (n, withSign = true) => {
  if (n == null) return "—";
  const v = Number(n);
  const sign = withSign && v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
};

const SEMAPHORE_STYLES = {
  green:  { bar: "bg-emerald-500", ring: "ring-emerald-500/30", text: "text-emerald-400", label: "Calma" },
  yellow: { bar: "bg-amber-500",   ring: "ring-amber-500/30",   text: "text-amber-400",   label: "Atento" },
  orange: { bar: "bg-orange-500",  ring: "ring-orange-500/30",  text: "text-orange-400",  label: "Oportunidad" },
  red:    { bar: "bg-rose-500",    ring: "ring-rose-500/30",    text: "text-rose-400",    label: "Acción" },
};

const ACTION_LABELS = {
  noop: "Mantener el plan",
  invest_core: "Aportar mensual",
  invest_reserve: "Desplegar reserva",
  invest_both: "Aportar + desplegar reserva",
};

export default function StrategyPage() {
  const [plan, setPlan] = useState(null);
  const [signals, setSignals] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    monthly_core_amount: "",
    monthly_reserve_amount: "",
    core_symbol: "",
    core_symbol_label: "",
    active: true,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [busyAlertId, setBusyAlertId] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiIntent, setAiIntent] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiProposal, setAiProposal] = useState(null);

  const askAi = async () => {
    setAiBusy(true);
    try {
      const { data } = await api.post("/strategy/plan/ai-generate", { intent: aiIntent, apply: false });
      setAiProposal(data);
    } catch (err) {
      alert(err.response?.data?.detail || "La IA no pudo proponer plan");
    } finally {
      setAiBusy(false);
    }
  };

  const applyAi = async () => {
    setAiBusy(true);
    try {
      await api.post("/strategy/plan/ai-generate", { intent: aiIntent, apply: true });
      setAiOpen(false);
      setAiProposal(null);
      setAiIntent("");
      await loadAll();
    } catch (err) {
      alert(err.response?.data?.detail || "No se pudo aplicar el plan");
    } finally {
      setAiBusy(false);
    }
  };

  const loadAll = async () => {
    setError(null);
    try {
      const [planRes, sigRes, alertsRes] = await Promise.all([
        api.get("/strategy/plan"),
        api.get("/strategy/signals"),
        api.get("/strategy/alerts"),
      ]);
      setPlan(planRes.data);
      setSignals(sigRes.data);
      setAlerts(alertsRes.data || []);
      setForm({
        monthly_core_amount: String(planRes.data.monthly_core_amount ?? "400"),
        monthly_reserve_amount: String(planRes.data.monthly_reserve_amount ?? "100"),
        core_symbol: planRes.data.core_symbol ?? "VOO",
        core_symbol_label: planRes.data.core_symbol_label ?? "S&P 500 (Vanguard VOO)",
        active: !!planRes.data.active,
      });
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo cargar la estrategia");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const refreshSignals = async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get("/strategy/signals");
      setSignals(data);
    } finally {
      setRefreshing(false);
    }
  };

  const savePlan = async () => {
    try {
      const payload = {
        monthly_core_amount: parseFloat(form.monthly_core_amount) || 0,
        monthly_reserve_amount: parseFloat(form.monthly_reserve_amount) || 0,
        core_symbol: form.core_symbol,
        core_symbol_label: form.core_symbol_label,
        active: form.active,
      };
      const { data } = await api.put("/strategy/plan", payload);
      setPlan(data);
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.detail || "Error guardando plan");
    }
  };

  const confirmAlert = async (id) => {
    setBusyAlertId(id);
    try {
      await api.post(`/strategy/alerts/${id}/confirm`, {});
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.detail || "Error confirmando alerta");
    } finally {
      setBusyAlertId(null);
    }
  };

  const dismissAlert = async (id) => {
    setBusyAlertId(id);
    try {
      await api.post(`/strategy/alerts/${id}/dismiss`);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.detail || "Error descartando alerta");
    } finally {
      setBusyAlertId(null);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  const sem = SEMAPHORE_STYLES[signals?.semaphore || "green"];
  const pending = alerts.filter((a) => a.status === "pending");
  const past = alerts.filter((a) => a.status !== "pending").slice(0, 8);

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Target size={22} /> Estrategia automatizada
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              El agente vigila el mercado y te avisa cuándo invertir. Tú solo confirmas.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refreshSignals} disabled={refreshing} className="gap-2">
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Actualizar
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Semáforo */}
        <Card className={`border ${sem.ring} ring-1`}>
          <CardContent className="py-5">
            <div className="flex items-center gap-4">
              <div className={`w-3 h-16 rounded-full ${sem.bar}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs uppercase tracking-wider font-semibold ${sem.text}`}>{sem.label}</span>
                  {signals?.triggers_fired?.length > 0 && (
                    <Badge variant="outline" className={`${sem.text} border-current`}>
                      {signals.triggers_fired.length} disparador{signals.triggers_fired.length > 1 ? "es" : ""}
                    </Badge>
                  )}
                </div>
                <h2 className="text-lg font-semibold mt-0.5">{signals?.semaphore_label || ""}</h2>
                <p className="text-sm text-muted-foreground mt-1">{signals?.rationale}</p>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Sugerencia</div>
                <div className="text-sm font-semibold">{ACTION_LABELS[signals?.suggested_action || "noop"]}</div>
                {signals?.suggested_reserve_deploy > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Desplegar {fmt(signals.suggested_reserve_deploy)}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Signals grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="VIX"
            icon={Activity}
            value={signals?.vix != null ? signals.vix.toFixed(2) : "—"}
            hint={signals?.vix_change_pct != null ? `${fmtPct(signals.vix_change_pct)} hoy` : ""}
            accent={signals?.vix >= 30 ? "rose" : signals?.vix >= 20 ? "amber" : "emerald"}
          />
          <Stat
            label="S&P 500"
            icon={signals?.sp500_drawdown_pct < 0 ? TrendingDown : TrendingUp}
            value={signals?.sp500_price != null ? signals.sp500_price.toFixed(0) : "—"}
            hint={signals?.sp500_drawdown_pct != null ? `${fmtPct(signals.sp500_drawdown_pct, true)} desde máximos` : ""}
            accent={signals?.sp500_drawdown_pct <= -10 ? "rose" : signals?.sp500_drawdown_pct <= -5 ? "amber" : "emerald"}
          />
          <Stat
            label={signals?.core_etf_symbol || "VOO"}
            icon={Target}
            value={signals?.core_etf_price != null ? `$${signals.core_etf_price.toFixed(2)}` : "—"}
            hint="ETF core del plan"
            accent="indigo"
          />
          <Stat
            label="Reserva acumulada"
            icon={PiggyBank}
            value={fmt(plan?.reserve_balance || 0)}
            hint="Disponible para desplegar"
            accent="emerald"
          />
        </div>

        {/* Pending alerts */}
        {pending.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles size={14} className="text-amber-400" /> Alertas pendientes ({pending.length})
            </h3>
            {pending.map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                busy={busyAlertId === a.id}
                onConfirm={() => confirmAlert(a.id)}
                onDismiss={() => dismissAlert(a.id)}
              />
            ))}
          </div>
        )}

        {/* Plan setup */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target size={16} /> Tu plan
              </CardTitle>
              <CardDescription>
                Aportaciones mensuales y ETF que el agente gestiona por ti.
              </CardDescription>
            </div>
            {!editing && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setAiOpen(true)} className="gap-1">
                  <Sparkles size={14} /> Pedir a la IA
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Editar</Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {!editing ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <PlanField label="Core mensual" value={fmt(plan?.monthly_core_amount)} hint={`Auto a ${plan?.core_symbol}`} />
                <PlanField label="Reserva mensual" value={fmt(plan?.monthly_reserve_amount)} hint="Acumula para oportunidades" />
                <PlanField label="ETF core" value={plan?.core_symbol} hint={plan?.core_symbol_label} />
                <PlanField label="Estado" value={plan?.active ? "Activo" : "Pausado"} accent={plan?.active ? "emerald" : "muted"} />
                <PlanField
                  label="Último mensual"
                  value={plan?.last_monthly_executed_at ? new Date(plan.last_monthly_executed_at).toLocaleDateString("es-ES") : "Nunca"}
                />
                <PlanField
                  label="Último disparador"
                  value={plan?.last_trigger_fired_at ? new Date(plan.last_trigger_fired_at).toLocaleDateString("es-ES") : "Nunca"}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Core mensual (€)</Label>
                    <Input
                      type="number"
                      value={form.monthly_core_amount}
                      onChange={(e) => setForm({ ...form, monthly_core_amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reserva mensual (€)</Label>
                    <Input
                      type="number"
                      value={form.monthly_reserve_amount}
                      onChange={(e) => setForm({ ...form, monthly_reserve_amount: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Símbolo ETF</Label>
                    <Input
                      value={form.core_symbol}
                      onChange={(e) => setForm({ ...form, core_symbol: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nombre legible</Label>
                    <Input
                      value={form.core_symbol_label}
                      onChange={(e) => setForm({ ...form, core_symbol_label: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.active}
                    onClick={() => setForm({ ...form, active: !form.active })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      form.active ? "bg-emerald-500" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        form.active ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <Label className="cursor-pointer" onClick={() => setForm({ ...form, active: !form.active })}>
                    Plan activo (recibe alertas)
                  </Label>
                </div>
                <div className="flex gap-2">
                  <Button onClick={savePlan}>Guardar</Button>
                  <Button variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI plan generator dialog */}
        {aiOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setAiOpen(false)}>
            <Card className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Sparkles size={16} /> Generar plan con IA</CardTitle>
                <CardDescription>
                  Describe tus objetivos (presupuesto mensual, horizonte, tolerancia al riesgo) y Claude te propondrá un plan. Tú lo revisas y aplicas si te convence.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label>Tu intención</Label>
                <textarea
                  className="w-full min-h-[110px] rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Quiero invertir 500€/mes a 20 años, perfil moderado. Prefiero ETF acumulativo mundial. Tengo un bebé en camino, así que 30% reserva para emergencias del mercado."
                  value={aiIntent}
                  onChange={(e) => setAiIntent(e.target.value)}
                />
                {aiProposal && (
                  <div className="border rounded-md p-3 bg-muted/30 space-y-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Propuesta</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Core mensual: <strong>{fmt(aiProposal.proposed.monthly_core_amount)}</strong></div>
                      <div>Reserva mensual: <strong>{fmt(aiProposal.proposed.monthly_reserve_amount)}</strong></div>
                      <div>ETF: <strong>{aiProposal.proposed.core_symbol}</strong></div>
                      <div className="text-xs text-muted-foreground col-span-2">{aiProposal.proposed.core_symbol_label}</div>
                    </div>
                    {aiProposal.rationale && (
                      <div className="text-xs text-muted-foreground border-t pt-2">{aiProposal.rationale}</div>
                    )}
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => { setAiOpen(false); setAiProposal(null); }}>Cerrar</Button>
                  <Button variant="outline" onClick={askAi} disabled={!aiIntent.trim() || aiBusy}>
                    {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    {aiProposal ? "Reformular" : "Proponer"}
                  </Button>
                  {aiProposal && (
                    <Button onClick={applyAi} disabled={aiBusy}>Aplicar al plan</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* How it works */}
        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardContent className="py-4 flex items-start gap-3">
            <Target size={18} className="text-purple-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm space-y-2">
              <p><strong>Cómo funciona:</strong></p>
              <ul className="text-muted-foreground list-disc pl-4 space-y-1">
                <li>Cada mes te aviso para meter {fmt(plan?.monthly_core_amount)} en {plan?.core_symbol} (DCA), una de las estrategias más rentables a largo plazo.</li>
                <li>Otros {fmt(plan?.monthly_reserve_amount)} se acumulan en tu reserva, esperando una bajada del mercado.</li>
                <li>Cuando el S&P 500 baja un 10/15/20% desde sus máximos, te aviso para que despliegues parte o toda la reserva.</li>
                <li>Tú decides siempre — el agente solo sugiere y nunca opera por ti.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Recent history */}
        {past.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar size={14} /> Historial reciente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {past.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-border text-sm last:border-0">
                    <div className="flex items-center gap-2">
                      {a.status === "confirmed" ? (
                        <CheckCircle2 size={14} className="text-emerald-400" />
                      ) : (
                        <XCircle size={14} className="text-muted-foreground" />
                      )}
                      <span>{a.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {a.created_at ? new Date(a.created_at).toLocaleDateString("es-ES") : ""}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}

function Stat({ label, icon: Icon, value, hint, accent }) {
  const tones = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-400",
    indigo: "text-indigo-400",
  };
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className={`text-xs uppercase tracking-wider ${tones[accent] || "text-muted-foreground"}`}>{label}</div>
          {Icon && <Icon size={14} className={tones[accent] || "text-muted-foreground"} />}
        </div>
        <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function PlanField({ label, value, hint, accent }) {
  const tones = {
    emerald: "text-emerald-400",
    muted: "text-muted-foreground",
  };
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums mt-0.5 ${tones[accent] || ""}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function AlertCard({ alert, busy, onConfirm, onDismiss }) {
  const levelStyles = {
    info:        "border-slate-500/30 bg-slate-500/5",
    warning:     "border-amber-500/40 bg-amber-500/5",
    opportunity: "border-emerald-500/40 bg-emerald-500/5",
  };
  return (
    <Card className={`border ${levelStyles[alert.level] || levelStyles.info}`}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold">{alert.title}</h4>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                {alert.kind === "monthly" ? "Mensual" : alert.kind === "trigger" ? "Disparador" : "Info"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: alert.message }} />
            {alert.suggested_amount != null && Number(alert.suggested_amount) > 0 && (
              <div className="mt-2 text-sm">
                Sugerencia del agente: <strong>{fmt(alert.suggested_amount)}</strong> — {ACTION_LABELS[alert.suggested_action] || alert.suggested_action}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button size="sm" onClick={onConfirm} disabled={busy} className="gap-1">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Confirmar
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy} className="gap-1">
              <XCircle size={12} /> Descartar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
