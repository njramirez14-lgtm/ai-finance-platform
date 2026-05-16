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
  Plus, Edit, Trash, Loader2, AlertCircle, TrendingUp, Calendar, Pause, Ban, Play, Briefcase,
} from "lucide-react";
import api from "@/api/axios";

const fmt = (n, c = "EUR") =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: c }).format(Number(n) || 0);

const CYCLES = [
  { value: "WEEKLY", label: "Semanal" },
  { value: "MONTHLY", label: "Mensual" },
  { value: "QUARTERLY", label: "Trimestral" },
  { value: "YEARLY", label: "Anual" },
  { value: "CUSTOM", label: "Otro" },
];
const cycleLabel = (v) => CYCLES.find((c) => c.value === v)?.label || v;

const STATUSES = [
  { value: "ACTIVE", label: "Activo", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", Icon: Play },
  { value: "PAUSED", label: "Pausado", className: "bg-amber-500/15 text-amber-400 border-amber-500/30", Icon: Pause },
  { value: "CANCELLED", label: "Terminado", className: "bg-rose-500/15 text-rose-400 border-rose-500/30", Icon: Ban },
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
  account_id: "",
  category_id: "",
});

export default function IncomePage() {
  const [items, setItems] = useState([]);
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

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, sum, a, cat] = await Promise.all([
        api.get("/subscriptions/?kind=INCOME"),
        api.get("/subscriptions/summary?kind=INCOME").catch(() => ({ data: null })),
        api.get("/accounts/").catch(() => ({ data: [] })),
        api.get("/categories/").catch(() => ({ data: [] })),
      ]);
      setItems(s.data);
      setSummary(sum.data);
      setAccounts(a.data);
      setCategories(cat.data.filter((c) => c.type === "INCOME"));
    } catch (err) {
      setError(err.response?.data?.detail || "Error cargando ingresos");
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
      billing_cycle: it.billing_cycle || "MONTHLY",
      next_charge_date: it.next_charge_date || "",
      started_at: it.started_at || "",
      status: it.status || "ACTIVE",
      notes: it.notes || "",
      account_id: it.account_id ? String(it.account_id) : "",
      category_id: it.category_id ? String(it.category_id) : "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Nombre obligatorio"); return; }
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
        kind: "INCOME",
        notes: form.notes.trim() || null,
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

  const filtered = useMemo(() => {
    if (filter === "ALL") return items;
    return items.filter((i) => i.status === filter);
  }, [items, filter]);

  const accountName = (id) => accounts.find((a) => a.id === id)?.name;

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <TrendingUp size={22} /> Ingresos recurrentes
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Nómina, alquileres que cobras, freelance fijo, dividendos… Todo lo que entra mes a mes.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="gap-2"><Plus size={16} /> Nuevo ingreso</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar ingreso" : "Nuevo ingreso recurrente"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
                <div className="space-y-2">
                  <Label htmlFor="inc-name">Nombre *</Label>
                  <Input
                    id="inc-name"
                    placeholder="Nómina, Cliente X freelance, Alquiler piso Madrid…"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="inc-amount">Importe (€) *</Label>
                    <Input
                      id="inc-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ciclo</Label>
                    <Select value={form.billing_cycle} onValueChange={(v) => setForm({ ...form, billing_cycle: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CYCLES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="inc-next">Próximo cobro</Label>
                    <Input
                      id="inc-next"
                      type="date"
                      value={form.next_charge_date}
                      onChange={(e) => setForm({ ...form, next_charge_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inc-started">Empezó el</Label>
                    <Input
                      id="inc-started"
                      type="date"
                      value={form.started_at}
                      onChange={(e) => setForm({ ...form, started_at: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cuenta donde se ingresa</Label>
                  <Select
                    value={form.account_id || "none"}
                    onValueChange={(v) => setForm({ ...form, account_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Sin cuenta" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin cuenta</SelectItem>
                      {accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inc-notes">Notas</Label>
                  <Input
                    id="inc-notes"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
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

        {error && !open && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs uppercase tracking-wider text-emerald-500">Ingreso mensual</div>
              <div className="text-2xl font-bold tabular-nums mt-1 text-emerald-500">
                {fmt(summary?.monthly_total || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs uppercase tracking-wider text-amber-500">Ingreso anual</div>
              <div className="text-2xl font-bold tabular-nums mt-1 text-amber-500">
                {fmt(summary?.yearly_total || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Activos</div>
              <div className="text-2xl font-bold tabular-nums mt-1">{summary?.active_count || 0}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {summary?.paused_count || 0} pausados, {summary?.cancelled_count || 0} terminados
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-2">
          {["ACTIVE", "PAUSED", "CANCELLED", "ALL"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                filter === f
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "ACTIVE" ? "Activos" : f === "PAUSED" ? "Pausados" : f === "CANCELLED" ? "Terminados" : "Todos"}
            </button>
          ))}
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} resultados</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-muted-foreground" size={24} />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              <Briefcase size={28} className="mx-auto mb-2 text-muted-foreground/40" />
              Aún no tienes ingresos recurrentes registrados. Empieza por la nómina.
              <div className="mt-4">
                <Button variant="outline" onClick={openCreate} className="gap-2">
                  <Plus size={14} /> Nuevo ingreso
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((it) => {
              const meta = statusMeta(it.status);
              const StatusIcon = meta.Icon;
              return (
                <Card key={it.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base truncate">{it.name}</CardTitle>
                        <CardDescription className="text-xs truncate">
                          {cycleLabel(it.billing_cycle)}
                          {it.account_id && <> · {accountName(it.account_id)}</>}
                        </CardDescription>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(it)} className="h-8 w-8 p-0">
                          <Edit size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(it)} className="h-8 w-8 p-0">
                          <Trash size={14} />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-2xl font-bold tabular-nums text-emerald-500">
                      +{fmt(it.amount, it.currency)}
                    </div>
                    <Badge variant="outline" className={`text-[10px] gap-1 ${meta.className}`}>
                      <StatusIcon size={10} /> {meta.label}
                    </Badge>
                    {it.next_charge_date && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar size={11} /> Próximo: {it.next_charge_date}
                      </div>
                    )}
                    {it.notes && (
                      <p className="text-xs text-muted-foreground italic line-clamp-2">{it.notes}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
