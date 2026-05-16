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
  Plus, Edit, Trash, Loader2, AlertCircle, PiggyBank, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2,
} from "lucide-react";
import api from "@/api/axios";

const fmt = (n) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

const monthLabel = (key) => {
  const [y, m] = key.split("-");
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
};

const shiftMonth = (key, delta) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function BudgetsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [progress, setProgress] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ category_id: "global", amount: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, cat] = await Promise.all([
        api.get("/budgets/progress", { params: { month } }),
        api.get("/categories/").catch(() => ({ data: [] })),
      ]);
      setProgress(p.data);
      setCategories(cat.data.filter((c) => c.type === "EXPENSE"));
    } catch (err) {
      setError(err.response?.data?.detail || "Error cargando presupuestos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month]);

  const openCreate = () => {
    setEditing(null);
    setForm({ category_id: "global", amount: "" });
    setOpen(true);
  };
  const openEdit = (it) => {
    setEditing(it);
    setForm({
      category_id: it.category_id == null ? "global" : String(it.category_id),
      amount: String(it.amount ?? ""),
    });
    setOpen(true);
  };

  const handleSave = async () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { setError("El importe debe ser mayor que 0"); return; }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.put(`/budgets/${editing.budget_id}`, { amount: amt });
      } else {
        await api.post("/budgets/", {
          category_id: form.category_id === "global" ? null : parseInt(form.category_id, 10),
          month,
          amount: amt,
          currency: "EUR",
        });
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
    if (!window.confirm(`¿Borrar presupuesto de "${it.category_name}"?`)) return;
    try {
      await api.delete(`/budgets/${it.budget_id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error borrando");
    }
  };

  // Categories already budgeted this month (avoid duplicates in selector)
  const budgetedCatIds = useMemo(() => {
    if (!progress) return new Set();
    return new Set(progress.items.map((i) => i.category_id));
  }, [progress]);
  const availableCategories = useMemo(
    () => categories.filter((c) => editing && editing.category_id === c.id || !budgetedCatIds.has(c.id)),
    [categories, budgetedCatIds, editing],
  );
  const hasGlobal = budgetedCatIds.has(null);

  const items = progress?.items || [];
  const totalBudget = Number(progress?.total_budget || 0);
  const totalSpent = Number(progress?.total_spent || 0);
  const totalRemaining = Number(progress?.total_remaining || 0);
  const overallPct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;
  const isCurrent = month === currentMonth();

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <PiggyBank size={22} /> Presupuestos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Define un máximo mensual por categoría. Te avisamos cuando lo superas.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="gap-2"><Plus size={16} /> Nuevo presupuesto</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar presupuesto" : "Nuevo presupuesto"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <Select
                    value={form.category_id}
                    onValueChange={(v) => setForm({ ...form, category_id: v })}
                    disabled={!!editing}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(!hasGlobal || (editing && editing.category_id == null)) && (
                        <SelectItem value="global">Global (todos los gastos)</SelectItem>
                      )}
                      {availableCategories.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget-amount">Importe mensual (€)</Label>
                  <Input
                    id="budget-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  Mes: <span className="font-medium text-foreground">{monthLabel(month)}</span>
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

        {/* Month switcher */}
        <div className="flex items-center justify-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setMonth(shiftMonth(month, -1))} className="gap-1">
            <ChevronLeft size={14} />
          </Button>
          <div className="text-sm font-medium capitalize min-w-[12ch] text-center">
            {monthLabel(month)}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="gap-1"
            disabled={isCurrent}
          >
            <ChevronRight size={14} />
          </Button>
          {!isCurrent && (
            <Button variant="outline" size="sm" onClick={() => setMonth(currentMonth())}>
              Hoy
            </Button>
          )}
        </div>

        {/* Summary */}
        <Card>
          <CardContent className="pt-5">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Presupuesto</div>
                <div className="text-2xl font-bold tabular-nums">{fmt(totalBudget)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-rose-500">Gastado</div>
                <div className="text-2xl font-bold tabular-nums text-rose-500">{fmt(totalSpent)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-emerald-500">Restante</div>
                <div className={`text-2xl font-bold tabular-nums ${totalRemaining >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {fmt(totalRemaining)}
                </div>
              </div>
            </div>
            {totalBudget > 0 && (
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${totalSpent > totalBudget ? "bg-rose-500" : "bg-emerald-500/60"}`}
                  style={{ width: `${overallPct}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Per-category bars */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-muted-foreground" size={24} />
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              <PiggyBank size={28} className="mx-auto mb-2 text-muted-foreground/40" />
              Aún no hay presupuestos para {monthLabel(month)}. Crea uno para empezar a controlar.
              <div className="mt-4">
                <Button variant="outline" onClick={openCreate} className="gap-2">
                  <Plus size={14} /> Nuevo presupuesto
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((it) => {
              const pct = Math.min(100, it.pct);
              const barClass = it.over_budget
                ? "bg-rose-500"
                : pct > 85
                  ? "bg-amber-500"
                  : "bg-emerald-500/60";
              return (
                <Card key={it.budget_id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {it.over_budget ? (
                          <AlertTriangle size={16} className="text-rose-500 shrink-0" />
                        ) : pct > 85 ? (
                          <AlertCircle size={16} className="text-amber-500 shrink-0" />
                        ) : (
                          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{it.category_name || "Sin categoría"}</div>
                          <div className="text-xs text-muted-foreground">
                            {fmt(it.spent)} de {fmt(it.amount)}
                            {it.over_budget && (
                              <Badge variant="outline" className="ml-2 text-[10px] border-rose-500/40 text-rose-500">
                                +{fmt(it.spent - it.amount)} sobre presupuesto
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className={`font-bold tabular-nums ${it.over_budget ? "text-rose-500" : ""}`}>
                            {it.pct.toFixed(0)}%
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {it.remaining >= 0 ? `${fmt(it.remaining)} libres` : "agotado"}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(it)} className="h-8 w-8 p-0">
                          <Edit size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(it)} className="h-8 w-8 p-0">
                          <Trash size={14} />
                        </Button>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
                    </div>
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
