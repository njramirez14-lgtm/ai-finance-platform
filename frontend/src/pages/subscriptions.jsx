import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Edit, Trash, Loader2, AlertCircle, Repeat, Calendar, CreditCard, Pause, Ban, Play, AlertTriangle, Clock,
  Sparkles, Check, CheckSquare, Square, CheckCircle2, XCircle,
} from "lucide-react";
import api from "@/api/axios";

const fmt = (n, c = "EUR") =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: c }).format(Number(n) || 0);

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

const CYCLES = [
  { value: "WEEKLY", label: "Semanal", months: 0.230769 },
  { value: "MONTHLY", label: "Mensual", months: 1 },
  { value: "QUARTERLY", label: "Trimestral", months: 3 },
  { value: "YEARLY", label: "Anual", months: 12 },
  { value: "CUSTOM", label: "Otro", months: 1 },
];
const cycleMeta = (v) => CYCLES.find((c) => c.value === v) || CYCLES[1];

const STATUSES = [
  { value: "ACTIVE", label: "Activa", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", Icon: Play },
  { value: "PAUSED", label: "Pausada", className: "bg-amber-500/15 text-amber-400 border-amber-500/30", Icon: Pause },
  { value: "CANCELLED", label: "Cancelada", className: "bg-rose-500/15 text-rose-400 border-rose-500/30", Icon: Ban },
];
const statusMeta = (v) => STATUSES.find((s) => s.value === v) || STATUSES[0];

const emptyForm = () => ({
  name: "",
  description: "",
  amount: "",
  currency: "EUR",
  billing_cycle: "MONTHLY",
  next_charge_date: "",
  started_at: "",
  status: "ACTIVE",
  notes: "",
  card_id: "",
  account_id: "",
  category_id: "",
});

export default function SubscriptionsPage() {
  const [items, setItems] = useState([]);
  const [cards, setCards] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("ACTIVE");

  // Analyzer
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [pickedKeys, setPickedKeys] = useState(() => new Set());
  const [creatingSubs, setCreatingSubs] = useState(false);

  const runAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeResult(null);
    setPickedKeys(new Set());
    try {
      const { data } = await api.post("/transactions/detect-subscriptions", {
        days: 180,
        include_matched: true,
      });
      setAnalyzeResult(data);
      // Pre-select all NEW candidates by default.
      const next = new Set();
      (data.candidates || []).forEach((c) => {
        if (!c.matched_subscription_id) next.add(c.normalized_key);
      });
      setPickedKeys(next);
    } catch (err) {
      setAnalyzeError(err.response?.data?.detail || err.message || "Error al analizar");
    } finally {
      setAnalyzing(false);
    }
  };

  const openAnalyze = () => {
    setAnalyzeOpen(true);
    if (!analyzeResult) runAnalyze();
  };

  const togglePicked = (key) => setPickedKeys((p) => {
    const n = new Set(p);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  const createPicked = async () => {
    if (!analyzeResult) return;
    const picks = (analyzeResult.candidates || []).filter(
      (c) => pickedKeys.has(c.normalized_key) && !c.matched_subscription_id,
    );
    if (picks.length === 0) return;
    setCreatingSubs(true);
    try {
      for (const c of picks) {
        await api.post("/subscriptions/", {
          name: c.name,
          amount: c.amount,
          currency: c.currency,
          billing_cycle: c.billing_cycle,
          next_charge_date: c.next_charge_date,
          started_at: c.last_charge_date,
          status: "ACTIVE",
          category_id: c.category_id || null,
          account_id: c.account_id || null,
          entity_id: c.entity_id || null,
        });
      }
      setAnalyzeOpen(false);
      setAnalyzeResult(null);
      await load();
    } catch (err) {
      setAnalyzeError(err.response?.data?.detail || err.message || "Error al crear suscripciones");
    } finally {
      setCreatingSubs(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, sum, c, a, cat] = await Promise.all([
        api.get("/subscriptions/?kind=EXPENSE"),
        api.get("/subscriptions/summary?kind=EXPENSE").catch(() => ({ data: null })),
        api.get("/cards/").catch(() => ({ data: [] })),
        api.get("/accounts/").catch(() => ({ data: [] })),
        api.get("/categories/").catch(() => ({ data: [] })),
      ]);
      setItems(s.data);
      setSummary(sum.data);
      setCards(c.data);
      setAccounts(a.data);
      setCategories(cat.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Error cargando suscripciones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (it) => {
    setEditing(it);
    setForm({
      name: it.name,
      description: it.description || "",
      amount: String(it.amount ?? ""),
      currency: it.currency || "EUR",
      billing_cycle: it.billing_cycle,
      next_charge_date: it.next_charge_date || "",
      started_at: it.started_at || "",
      status: it.status,
      notes: it.notes || "",
      card_id: it.card_id ? String(it.card_id) : "",
      account_id: it.account_id ? String(it.account_id) : "",
      category_id: it.category_id ? String(it.category_id) : "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("El nombre es obligatorio"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        amount: parseFloat(form.amount) || 0,
        currency: (form.currency || "EUR").toUpperCase(),
        billing_cycle: form.billing_cycle,
        next_charge_date: form.next_charge_date || null,
        started_at: form.started_at || null,
        status: form.status,
        kind: "EXPENSE",
        notes: form.notes.trim() || null,
        card_id: form.card_id ? parseInt(form.card_id, 10) : null,
        account_id: form.account_id ? parseInt(form.account_id, 10) : null,
        category_id: form.category_id ? parseInt(form.category_id, 10) : null,
      };
      if (editing) {
        await api.put(`/subscriptions/${editing.id}`, payload);
      } else {
        await api.post("/subscriptions/", payload);
      }
      setOpen(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (it) => {
    if (!window.confirm(`¿Borrar "${it.name}"?`)) return;
    try {
      await api.delete(`/subscriptions/${it.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error borrando");
    }
  };

  const toggleStatus = async (it) => {
    const newStatus = it.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      await api.put(`/subscriptions/${it.id}`, { status: newStatus });
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error");
    }
  };

  const filtered = useMemo(() => {
    if (filter === "ALL") return items;
    return items.filter((i) => i.status === filter);
  }, [items, filter]);

  const expenseCats = categories.filter((c) => c.type === "EXPENSE");

  const cardLabel = (id) => {
    if (!id) return null;
    const c = cards.find((x) => x.id === id);
    if (!c) return null;
    return `${c.alias}${c.last4 ? ` ····${c.last4}` : ""}`;
  };

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Repeat size={22} /> Servicios y suscripciones
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Netflix, Spotify, gimnasio, hosting… todo lo que pagas de forma recurrente.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={openAnalyze} className="gap-2">
            <Sparkles size={16} /> Analizar gastos
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="gap-2"><Plus size={16} /> Nueva suscripción</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar suscripción" : "Nueva suscripción"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
                <div className="space-y-2">
                  <Label htmlFor="s-name">Nombre</Label>
                  <Input
                    id="s-name"
                    placeholder="Ej. Netflix, Spotify, Gimnasio…"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="s-amount">Importe</Label>
                    <Input
                      id="s-amount"
                      type="number"
                      step="0.01"
                      placeholder="9.99"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Frecuencia</Label>
                    <Select value={form.billing_cycle} onValueChange={(val) => setForm({ ...form, billing_cycle: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CYCLES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="s-next">Próximo cobro</Label>
                    <Input
                      id="s-next"
                      type="date"
                      value={form.next_charge_date}
                      onChange={(e) => setForm({ ...form, next_charge_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s-started">Inicio</Label>
                    <Input
                      id="s-started"
                      type="date"
                      value={form.started_at}
                      onChange={(e) => setForm({ ...form, started_at: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Tarjeta</Label>
                    <Select
                      value={form.card_id || "none"}
                      onValueChange={(val) => setForm({ ...form, card_id: val === "none" ? "" : val })}
                    >
                      <SelectTrigger><SelectValue placeholder="Sin tarjeta" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin tarjeta</SelectItem>
                        {cards.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.alias}{c.last4 ? ` ····${c.last4}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Cuenta</Label>
                    <Select
                      value={form.account_id || "none"}
                      onValueChange={(val) => setForm({ ...form, account_id: val === "none" ? "" : val })}
                    >
                      <SelectTrigger><SelectValue placeholder="Sin cuenta" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin cuenta</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Categoría</Label>
                    <Select
                      value={form.category_id || "none"}
                      onValueChange={(val) => setForm({ ...form, category_id: val === "none" ? "" : val })}
                    >
                      <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin categoría</SelectItem>
                        {expenseCats.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Select value={form.status} onValueChange={(val) => setForm({ ...form, status: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="s-desc">Descripción</Label>
                  <Input
                    id="s-desc"
                    placeholder="Plan, web…"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando…</> : "Guardar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {error && !open && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Stat label="Coste mensual" value={fmt(summary?.monthly_total || 0)} tone="rose" />
          <Stat label="Coste anual" value={fmt(summary?.yearly_total || 0)} tone="amber" />
          <Stat label="Activas" value={summary?.active_count ?? 0} hint={`${summary?.paused_count ?? 0} pausadas, ${summary?.cancelled_count ?? 0} canceladas`} />
          <Stat
            label="Cobros ≤7d"
            value={items.filter((it) => {
              if (it.status !== "ACTIVE") return false;
              const d = daysUntil(it.next_charge_date);
              return d != null && d >= 0 && d <= 7;
            }).length}
            tone="amber"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Chip active={filter === "ACTIVE"} onClick={() => setFilter("ACTIVE")}>Activas</Chip>
          <Chip active={filter === "PAUSED"} onClick={() => setFilter("PAUSED")}>Pausadas</Chip>
          <Chip active={filter === "CANCELLED"} onClick={() => setFilter("CANCELLED")}>Canceladas</Chip>
          <Chip active={filter === "ALL"} onClick={() => setFilter("ALL")}>Todas</Chip>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} resultados</span>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded bg-muted/50 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <Repeat className="mx-auto text-muted-foreground" size={32} />
              <p className="text-sm text-muted-foreground">
                {items.length === 0 ? "Aún no tienes suscripciones." : "No hay resultados con este filtro."}
              </p>
              {items.length === 0 && (
                <Button variant="outline" onClick={openCreate} className="gap-2">
                  <Plus size={14} /> Nueva suscripción
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((it) => {
              const cm = cycleMeta(it.billing_cycle);
              const sm = statusMeta(it.status);
              const SIcon = sm.Icon;
              const card = cardLabel(it.card_id);
              return (
                <div
                  key={it.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border border-border bg-card/50 ${it.status !== "ACTIVE" ? "opacity-60" : ""}`}
                >
                  <div className="p-2 rounded-md bg-indigo-500/10 text-indigo-400 shrink-0">
                    <Repeat size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{it.name}</span>
                      <Badge variant="outline" className={sm.className}>
                        <SIcon size={10} className="mr-1" /> {sm.label}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span>{cm.label}</span>
                      {it.next_charge_date && (() => {
                        const dleft = daysUntil(it.next_charge_date);
                        const tone =
                          dleft == null ? "" :
                          dleft < 0 ? "text-rose-400" :
                          dleft <= 3 ? "text-rose-400" :
                          dleft <= 7 ? "text-amber-400" : "";
                        const label =
                          dleft == null ? `Próximo: ${it.next_charge_date}` :
                          dleft < 0 ? `Atrasado ${Math.abs(dleft)}d (${it.next_charge_date})` :
                          dleft === 0 ? `Hoy (${it.next_charge_date})` :
                          dleft === 1 ? `Mañana (${it.next_charge_date})` :
                          `En ${dleft}d (${it.next_charge_date})`;
                        return (
                          <>
                            <span>·</span>
                            <span className={`inline-flex items-center gap-1 ${tone}`}>
                              {tone ? <AlertTriangle size={10} /> : <Calendar size={10} />} {label}
                            </span>
                          </>
                        );
                      })()}
                      {card && (
                        <><span>·</span><span className="inline-flex items-center gap-1"><CreditCard size={10} /> {card}</span></>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold tabular-nums">{fmt(it.amount, it.currency)}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      ≈ {fmt(Number(it.amount || 0) / cm.months, it.currency)}/mes
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {it.status !== "CANCELLED" && (
                      <Button variant="ghost" size="sm" onClick={() => toggleStatus(it)} title={it.status === "ACTIVE" ? "Pausar" : "Reanudar"}>
                        {it.status === "ACTIVE" ? <Pause size={14} /> : <Play size={14} />}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openEdit(it)} title="Editar">
                      <Edit size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(it)} title="Borrar">
                      <Trash size={14} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={analyzeOpen} onOpenChange={setAnalyzeOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={18} /> Análisis de suscripciones
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 max-h-[65vh] overflow-y-auto space-y-4">
            {analyzing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                <Loader2 className="animate-spin" size={16} /> Cruzando transacciones con tus suscripciones…
              </div>
            )}

            {analyzeError && (
              <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{analyzeError}</span>
              </div>
            )}

            {!analyzing && analyzeResult && (
              <>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-3 rounded-md bg-muted/40 border border-border">
                    <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Detectadas</div>
                    <div className="text-xl font-bold tabular-nums">{analyzeResult.count}</div>
                  </div>
                  <div className="p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                    <div className="text-emerald-300/70 uppercase tracking-wider text-[10px]">Coincidencias</div>
                    <div className="text-xl font-bold tabular-nums text-emerald-400">{analyzeResult.matched_count}</div>
                  </div>
                  <div className="p-3 rounded-md bg-amber-500/5 border border-amber-500/20">
                    <div className="text-amber-300/70 uppercase tracking-wider text-[10px]">Nuevas</div>
                    <div className="text-xl font-bold tabular-nums text-amber-400">{analyzeResult.new_count}</div>
                  </div>
                </div>

                {analyzeResult.matched_count > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                      <CheckCircle2 size={12} /> Ya en tus suscripciones
                    </div>
                    {analyzeResult.candidates.filter((c) => c.matched_subscription_id).map((c) => (
                      <div key={c.normalized_key} className="flex items-start gap-3 p-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 text-sm">
                        <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {c.matched_subscription_name}
                            {c.name && c.name !== c.matched_subscription_name && (
                              <span className="text-xs text-muted-foreground ml-2">↔ {c.name}</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {c.occurrences} cargos · cada ~{c.avg_gap_days}d · último {c.last_charge_date} · total 6m {fmt(c.total_period)}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-semibold tabular-nums">{fmt(c.amount)}</div>
                          <Badge variant="outline" className="text-[10px]"><Repeat size={10} className="mr-1" /> {c.billing_cycle}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {analyzeResult.new_count > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-amber-400 uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle size={12} /> Nuevas — no estás siguiéndolas como suscripción
                    </div>
                    {analyzeResult.candidates.filter((c) => !c.matched_subscription_id).map((c) => {
                      const picked = pickedKeys.has(c.normalized_key);
                      return (
                        <button
                          type="button"
                          key={c.normalized_key}
                          onClick={() => togglePicked(c.normalized_key)}
                          className={`w-full text-left flex items-start gap-3 p-3 rounded-md border transition-colors ${
                            picked ? "border-amber-500/40 bg-amber-500/5" : "border-border hover:bg-muted/40"
                          }`}
                        >
                          {picked
                            ? <CheckSquare size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                            : <Square size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{c.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {c.occurrences} cargos · cada ~{c.avg_gap_days}d · último {c.last_charge_date}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="font-semibold tabular-nums">{fmt(c.amount)}</div>
                            <Badge variant="outline" className="text-[10px]"><Repeat size={10} className="mr-1" /> {c.billing_cycle}</Badge>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {analyzeResult.unmatched_existing && analyzeResult.unmatched_existing.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-rose-400 uppercase tracking-wider flex items-center gap-1">
                      <XCircle size={12} /> En tu lista pero sin cargos detectados (¿pausada / cancelada?)
                    </div>
                    {analyzeResult.unmatched_existing.map((s) => (
                      <div key={s.id} className="flex items-start gap-3 p-3 rounded-md border border-rose-500/20 bg-rose-500/5 text-sm">
                        <XCircle size={16} className="text-rose-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{s.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            No se encontraron cargos en los últimos 6 meses. Revisa si la suscripción sigue activa.
                          </div>
                        </div>
                        <div className="font-semibold tabular-nums">{fmt(s.amount)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {analyzeResult.count === 0 && analyzeResult.unmatched_existing.length === 0 && (
                  <div className="text-sm text-muted-foreground py-6 text-center">
                    No se han detectado patrones recurrentes. Sube los extractos de tus cuentas para que haya datos que analizar.
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setAnalyzeOpen(false)}>Cerrar</Button>
            <Button variant="outline" onClick={runAnalyze} disabled={analyzing} className="gap-2">
              <Sparkles size={14} /> Re-analizar
            </Button>
            {analyzeResult && analyzeResult.new_count > 0 && (
              <Button
                onClick={createPicked}
                disabled={creatingSubs || pickedKeys.size === 0}
                className="gap-2"
              >
                {creatingSubs
                  ? <><Loader2 className="animate-spin" size={14} /> Creando…</>
                  : <>Añadir {pickedKeys.size}</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function Stat({ label, value, hint, tone }) {
  const tones = {
    rose: "text-rose-500",
    amber: "text-amber-500",
  };
  return (
    <Card>
      <CardContent className="pt-4">
        <div className={`text-xs uppercase tracking-wider ${tones[tone] || "text-muted-foreground"}`}>{label}</div>
        <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
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
