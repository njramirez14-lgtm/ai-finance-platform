import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus, Edit, Trash, Loader2, AlertCircle, Receipt, UploadCloud, FileText, CheckCircle2,
  Search, X, Wallet, Tag, Trash2, CheckSquare, Square, Sparkles, Repeat,
} from "lucide-react";
import api from "@/api/axios";
import useStore from "@/store";
import { scopeFilter, scopeLabel } from "@/store/slices/scope";

const fmt = (n) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({
  amount: "",
  type: "EXPENSE",
  description: "",
  date: todayIso(),
  category_id: "",
  account_id: "",
  entity_id: "",
});

const DATE_RANGES = [
  { value: "all", label: "Todo" },
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "365", label: "1a" },
];

function dateInRange(dateStr, range) {
  if (range === "all") return true;
  const days = parseInt(range, 10);
  if (!days) return true;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  return new Date(dateStr) >= cutoff;
}

function monthLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [filterRange, setFilterRange] = useState("90");
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [groupByMonth, setGroupByMonth] = useState(false);

  // Multi-select
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Expense analyzer
  const [analyzerOpen, setAnalyzerOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [pickedKeys, setPickedKeys] = useState(() => new Set());
  const [creatingSubs, setCreatingSubs] = useState(false);
  const [analyzerError, setAnalyzerError] = useState(null);

  const analyzeExpenses = async () => {
    setAnalyzing(true);
    setAnalyzerError(null);
    setCandidates([]);
    setPickedKeys(new Set());
    try {
      const { data } = await api.post("/transactions/detect-subscriptions", { days: 180, include_matched: false });
      setCandidates(data.candidates || []);
      setPickedKeys(new Set((data.candidates || []).map((c) => c.normalized_key)));
    } catch (err) {
      setAnalyzerError(err?.response?.data?.detail || err.message || "Error al analizar");
    } finally {
      setAnalyzing(false);
    }
  };

  const openAnalyzer = () => {
    setAnalyzerOpen(true);
    if (candidates.length === 0) analyzeExpenses();
  };

  const togglePicked = (key) => {
    setPickedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const createSubscriptionsFromPicked = async () => {
    const picks = candidates.filter((c) => pickedKeys.has(c.normalized_key));
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
      setAnalyzerOpen(false);
      setCandidates([]);
      setPickedKeys(new Set());
    } catch (err) {
      setAnalyzerError(err?.response?.data?.detail || err.message || "Error al crear suscripciones");
    } finally {
      setCreatingSubs(false);
    }
  };

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const scope = useStore((s) => s.scope);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [txRes, catRes, accRes, entRes] = await Promise.all([
        api.get("/transactions/", { params: { limit: 500 } }),
        api.get("/categories/"),
        api.get("/accounts/").catch(() => ({ data: [] })),
        api.get("/entities/").catch(() => ({ data: [] })),
      ]);
      setTransactions(txRes.data);
      setCategories(catRes.data);
      setAccounts(accRes.data);
      setEntities(entRes.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Error cargando transacciones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (tx) => {
    setEditing(tx);
    setForm({
      amount: String(tx.amount),
      type: tx.type,
      description: tx.description || "",
      date: (tx.date || "").slice(0, 10),
      category_id: tx.category_id ? String(tx.category_id) : "",
      account_id: tx.account_id ? String(tx.account_id) : "",
      entity_id: tx.entity_id ? String(tx.entity_id) : "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { setError("El monto debe ser mayor que 0"); return; }
    if (!form.date) { setError("La fecha es obligatoria"); return; }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        amount: amt,
        type: form.type,
        description: form.description || null,
        date: form.date,
        category_id: form.category_id ? parseInt(form.category_id, 10) : null,
        account_id: form.account_id ? parseInt(form.account_id, 10) : null,
        entity_id: form.entity_id ? parseInt(form.entity_id, 10) : null,
      };
      if (editing) {
        await api.put(`/transactions/${editing.id}`, payload);
      } else {
        await api.post("/transactions/", payload);
      }
      setOpen(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tx) => {
    if (!window.confirm(`¿Borrar la transacción "${tx.description || tx.amount + "€"}"?`)) return;
    try {
      await api.delete(`/transactions/${tx.id}`);
      setSelected((prev) => {
        const next = new Set(prev); next.delete(tx.id); return next;
      });
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error borrando");
    }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`¿Borrar ${selected.size} transacciones? Esta acción no se puede deshacer.`)) return;
    setBulkBusy(true);
    try {
      await api.post("/transactions/bulk-delete", { ids: Array.from(selected) });
      clearSelection();
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error borrando en bloque");
    } finally {
      setBulkBusy(false);
    }
  };

  const scoped = useMemo(
    () => transactions.filter((t) => scopeFilter(t, scope, entities)),
    [transactions, scope, entities],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter((t) => {
      if (filterType !== "ALL" && t.type !== filterType) return false;
      if (filterAccount !== "all" && String(t.account_id || "") !== filterAccount) return false;
      if (filterCategory !== "all" && String(t.category_id || "") !== filterCategory) return false;
      if (!dateInRange(t.date, filterRange)) return false;
      if (q && !(t.description || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [scoped, search, filterType, filterRange, filterAccount, filterCategory]);

  const totals = useMemo(() => {
    let inc = 0, exp = 0, trf = 0;
    filtered.forEach((t) => {
      if (t.type === "INCOME") inc += Number(t.amount);
      else if (t.type === "TRANSFER") trf += Number(t.amount);
      else exp += Number(t.amount);
    });
    return { inc, exp, trf, balance: inc - exp };
  }, [filtered]);

  const grouped = useMemo(() => {
    if (!groupByMonth) return [["all", filtered]];
    const map = new Map();
    for (const tx of filtered) {
      const key = (tx.date || "").slice(0, 7); // YYYY-MM
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(tx);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered, groupByMonth]);

  const catName = (id) => categories.find((x) => x.id === id)?.name || "—";
  const accountName = (id) => accounts.find((x) => x.id === id)?.name || null;

  const formCategories = categories.filter((c) => c.type === form.type);
  const clearFilters = () => {
    setSearch(""); setFilterType("ALL"); setFilterRange("90"); setFilterAccount("all"); setFilterCategory("all");
  };

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Receipt size={22} /> Transacciones
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Filtra, busca, agrupa por mes. Edita con un click. Sube extractos para que la IA categorice automáticamente.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openAnalyzer} className="gap-2">
              <Sparkles size={16} /> Analizar gastos
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="gap-2"><Plus size={16} /> Nueva transacción</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar transacción" : "Nueva transacción"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select
                      value={form.type}
                      onValueChange={(val) => setForm({ ...form, type: val, category_id: "" })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INCOME">Ingreso</SelectItem>
                        <SelectItem value="EXPENSE">Gasto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tx-date">Fecha</Label>
                    <Input
                      id="tx-date"
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tx-amount">Monto (€)</Label>
                  <Input
                    id="tx-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tx-desc">Descripción</Label>
                  <Input
                    id="tx-desc"
                    placeholder="Ej. Supermercado Mercadona"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <Select
                    value={form.category_id || "none"}
                    onValueChange={(val) => setForm({ ...form, category_id: val === "none" ? "" : val })}
                  >
                    <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin categoría</SelectItem>
                      {formCategories.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                  <div className="space-y-2">
                    <Label>Entidad</Label>
                    <Select
                      value={form.entity_id || "none"}
                      onValueChange={(val) => setForm({ ...form, entity_id: val === "none" ? "" : val })}
                    >
                      <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {entities.map((e) => (
                          <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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

        <div className={`grid grid-cols-1 gap-4 ${totals.trf > 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
          <MiniStat label="Ingresos" value={fmt(totals.inc)} tone="emerald" />
          <MiniStat label="Gastos" value={fmt(totals.exp)} tone="rose" />
          <MiniStat label="Balance" value={fmt(totals.balance)} tone={totals.balance >= 0 ? "emerald" : "rose"} />
          {totals.trf > 0 && (
            <MiniStat label="Transferencias" value={fmt(totals.trf)} tone="amber" />
          )}
        </div>

        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">Lista</TabsTrigger>
            <TabsTrigger value="upload">Subir extracto</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <Input
                      placeholder="Buscar descripción…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <Select value={filterAccount} onValueChange={setFilterAccount}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las cuentas</SelectItem>
                      {accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las categorías</SelectItem>
                      {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex gap-1">
                    {["ALL", "INCOME", "EXPENSE", "TRANSFER"].map((t) => (
                      <FilterChip key={t} active={filterType === t} onClick={() => setFilterType(t)}>
                        {t === "ALL" ? "Todo" : t === "INCOME" ? "Ingresos" : t === "EXPENSE" ? "Gastos" : "Transferencias"}
                      </FilterChip>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {DATE_RANGES.map((r) => (
                      <FilterChip key={r.value} active={filterRange === r.value} onClick={() => setFilterRange(r.value)}>
                        {r.label}
                      </FilterChip>
                    ))}
                  </div>
                  <FilterChip active={groupByMonth} onClick={() => setGroupByMonth((v) => !v)}>
                    Agrupar por mes
                  </FilterChip>
                  {(search || filterType !== "ALL" || filterRange !== "90" || filterAccount !== "all" || filterCategory !== "all") && (
                    <Button size="sm" variant="ghost" onClick={clearFilters} className="gap-1 text-xs h-7">
                      <X size={12} /> Limpiar
                    </Button>
                  )}
                  {scope && scope.kind !== "all" && (
                    <Badge variant="outline" className="ml-2 text-xs">Vista: {scopeLabel(scope, entities)}</Badge>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* List */}
            {loading ? (
              <Card><CardContent className="pt-6 space-y-2 animate-pulse">
                {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 rounded bg-muted/50" />)}
              </CardContent></Card>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {transactions.length === 0
                      ? "Aún no tienes transacciones. ¡Añade la primera!"
                      : "No hay resultados con estos filtros."}
                  </p>
                  {transactions.length === 0 && (
                    <Button variant="outline" className="gap-2" onClick={openCreate}>
                      <Plus size={14} /> Nueva transacción
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              grouped.map(([key, rows]) => {
                const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
                const someChecked = rows.some((r) => selected.has(r.id));
                const toggleGroup = () => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (allChecked) rows.forEach((r) => next.delete(r.id));
                    else rows.forEach((r) => next.add(r.id));
                    return next;
                  });
                };
                return (
                <Card key={key}>
                  {groupByMonth && (
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium capitalize text-muted-foreground">
                        {monthLabel(rows[0].date)} · {rows.length} {rows.length === 1 ? "movimiento" : "movimientos"}
                      </CardTitle>
                    </CardHeader>
                  )}
                  <CardContent className={groupByMonth ? "pt-2" : "pt-6"}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <button
                              type="button"
                              onClick={toggleGroup}
                              className={`p-0.5 rounded hover:bg-muted ${someChecked && !allChecked ? "text-indigo-400" : ""}`}
                              title={allChecked ? "Deseleccionar todo" : "Seleccionar todo"}
                            >
                              {allChecked ? <CheckSquare size={14} className="text-indigo-400" /> : <Square size={14} className="text-muted-foreground" />}
                            </button>
                          </TableHead>
                          <TableHead className="w-24">Fecha</TableHead>
                          <TableHead>Descripción</TableHead>
                          <TableHead className="w-32">Categoría</TableHead>
                          <TableHead className="w-32">Cuenta</TableHead>
                          <TableHead className="text-right w-28">Monto</TableHead>
                          <TableHead className="w-16 text-right">Acción</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((tx) => {
                          const acc = accountName(tx.account_id);
                          const isSelected = selected.has(tx.id);
                          return (
                            <TableRow
                              key={tx.id}
                              className={`group cursor-pointer hover:bg-muted/40 ${isSelected ? "bg-indigo-500/5" : ""}`}
                              onClick={() => openEdit(tx)}
                            >
                              <TableCell onClick={(e) => { e.stopPropagation(); toggleSelected(tx.id); }} className="cursor-pointer">
                                {isSelected
                                  ? <CheckSquare size={14} className="text-indigo-400" />
                                  : <Square size={14} className="text-muted-foreground/60 group-hover:text-muted-foreground" />}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">{(tx.date || "").slice(0, 10)}</TableCell>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span>{tx.description || "—"}</span>
                                  {tx.type === "TRANSFER" && (
                                    <Badge variant="outline" className="gap-1 text-[10px] border-amber-500/40 text-amber-400">
                                      <Repeat size={10} /> transferencia
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {tx.category_id ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <Tag size={11} /> {catName(tx.category_id)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground/60">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {acc ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <Wallet size={11} /> {acc}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground/60">—</span>
                                )}
                              </TableCell>
                              <TableCell className={`text-right font-mono font-semibold ${
                                tx.type === "INCOME"
                                  ? "text-emerald-400"
                                  : tx.type === "TRANSFER"
                                    ? "text-amber-400"
                                    : "text-rose-400"
                              }`}>
                                {tx.type === "INCOME" ? "+" : tx.type === "TRANSFER" ? "↔ " : "-"}{fmt(tx.amount).replace(/^-/, "")}
                              </TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(tx)}
                                  className="p-1.5 rounded hover:bg-rose-500/10 text-rose-400/70 hover:text-rose-400 transition-colors"
                                  title="Borrar"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );})
            )}
          </TabsContent>

          <TabsContent value="upload">
            <UploadStatement accounts={accounts} onSaved={load} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Floating bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-full bg-background border border-border shadow-2xl">
          <span className="text-sm font-medium">
            {selected.size} {selected.size === 1 ? "seleccionada" : "seleccionadas"}
          </span>
          <Button size="sm" variant="outline" onClick={clearSelection}>
            Deseleccionar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={bulkDelete}
            disabled={bulkBusy}
            className="gap-1.5"
          >
            {bulkBusy
              ? <><Loader2 size={14} className="animate-spin" /> Borrando…</>
              : <><Trash2 size={14} /> Borrar {selected.size}</>}
          </Button>
        </div>
      )}

      <Dialog open={analyzerOpen} onOpenChange={setAnalyzerOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={18} /> Suscripciones detectadas
            </DialogTitle>
            <DialogDescription>
              Patrones de cargo recurrente en los últimos 6 meses. Marca las que quieras añadir como suscripciones.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 max-h-[60vh] overflow-y-auto space-y-2">
            {analyzing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="animate-spin" size={16} /> Analizando transacciones…
              </div>
            )}

            {analyzerError && (
              <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{analyzerError}</span>
              </div>
            )}

            {!analyzing && !analyzerError && candidates.length === 0 && (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No se han detectado patrones recurrentes. Necesitas al menos 2 cargos del mismo comercio con importe similar y separación regular (semanal, mensual, trimestral, anual).
              </div>
            )}

            {candidates.map((c) => {
              const picked = pickedKeys.has(c.normalized_key);
              return (
                <button
                  type="button"
                  key={c.normalized_key}
                  onClick={() => togglePicked(c.normalized_key)}
                  className={`w-full text-left flex items-start gap-3 p-3 rounded-md border transition-colors ${
                    picked ? "border-emerald-500/40 bg-emerald-500/5" : "border-border hover:bg-muted/40"
                  }`}
                >
                  {picked
                    ? <CheckSquare size={18} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    : <Square size={18} className="text-muted-foreground mt-0.5 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{c.name}</span>
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Repeat size={10} /> {c.billing_cycle}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {c.occurrences} cargos · cada ~{c.avg_gap_days}d
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Último: {c.last_charge_date} · Próximo estimado: {c.next_charge_date}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-semibold tabular-nums">{fmt(c.amount)}</div>
                    <div className="text-[10px] text-muted-foreground">por cargo</div>
                  </div>
                </button>
              );
            })}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setAnalyzerOpen(false)}>Cerrar</Button>
            <Button variant="outline" onClick={analyzeExpenses} disabled={analyzing} className="gap-2">
              <Sparkles size={14} /> Re-analizar
            </Button>
            <Button
              onClick={createSubscriptionsFromPicked}
              disabled={creatingSubs || pickedKeys.size === 0}
              className="gap-2"
            >
              {creatingSubs
                ? <><Loader2 className="animate-spin" size={14} /> Creando…</>
                : <>Añadir {pickedKeys.size} a suscripciones</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function MiniStat({ label, value, tone }) {
  const tones = {
    emerald: "text-emerald-500",
    rose: "text-rose-500",
    indigo: "text-indigo-400",
    amber: "text-amber-500",
  };
  return (
    <Card>
      <CardContent className="pt-4">
        <div className={`text-xs uppercase tracking-wider ${tones[tone]}`}>{label}</div>
        <div className={`text-2xl font-bold tabular-nums mt-1 ${tones[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function FilterChip({ active, onClick, children }) {
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

function UploadStatement({ accounts, onSaved }) {
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleUpload = async () => {
    if (!file || !accountId) {
      setError(!accountId ? "Elige la cuenta de destino primero" : "Selecciona un archivo");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post(`/accounts/${accountId}/upload-statement`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      onSaved?.();
    } catch (err) {
      setError(err.response?.data?.detail || "Error procesando el archivo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UploadCloud size={18} /> Subir extracto bancario</CardTitle>
        <CardDescription>
          Acepta <strong>CSV, TXT, PDF y Excel (XLSX)</strong>. Se procesa en chunks de ~100 líneas para evitar cortes y errores de cuota. La IA extrae los movimientos y los categoriza (Mercadona → Alimentación, Netflix → Suscripciones, etc.).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Cuenta de destino</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue placeholder="Elige una cuenta…" /></SelectTrigger>
            <SelectContent>
              {accounts.length === 0 ? (
                <SelectItem value="_none" disabled>No tienes cuentas — crea una primero</SelectItem>
              ) : accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <input
            type="file"
            id="stmt-upload"
            className="hidden"
            accept=".csv,.txt,.tsv,.pdf,.xlsx,.xlsm,text/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setError(null); setResult(null); }}
          />
          <label
            htmlFor="stmt-upload"
            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-md text-sm font-medium transition-colors"
          >
            <FileText size={16} />
            {file ? file.name : "Seleccionar archivo"}
          </label>
          {file && (
            <div className="mt-4">
              <Button onClick={handleUpload} disabled={loading || !accountId} className="gap-2">
                {loading ? <><Loader2 size={14} className="animate-spin" /> Procesando…</> : "Analizar y guardar"}
              </Button>
            </div>
          )}
        </div>

        {result && result.success && (
          <div className="space-y-3 p-3 rounded-md text-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div>Importadas <strong>{result.imported}</strong> transacciones con categorías asignadas por IA.</div>
                {result.chunks_total > 1 && (
                  <div className="text-xs text-emerald-300/70 mt-0.5">
                    Procesados {result.chunks_processed}/{result.chunks_total} chunks
                    {result.failed_chunks > 0 && ` · ${result.failed_chunks} fallaron`}
                    {result.rate_limited && " · cuota Gemini agotada (vuelve a probar en unos minutos)"}
                  </div>
                )}
              </div>
            </div>

            {(result.income_total > 0 || result.expense_total > 0) && (
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-500/20 text-xs">
                <div>
                  <div className="text-emerald-300/70 uppercase tracking-wider text-[10px]">Ingresos</div>
                  <div className="font-mono font-semibold">{fmt(result.income_total)}</div>
                  <div className="text-emerald-300/60 text-[10px]">{result.by_type?.INCOME ?? 0} mov.</div>
                </div>
                <div>
                  <div className="text-rose-300/70 uppercase tracking-wider text-[10px]">Gastos</div>
                  <div className="font-mono font-semibold text-rose-300">-{fmt(result.expense_total)}</div>
                  <div className="text-rose-300/60 text-[10px]">{result.by_type?.EXPENSE ?? 0} mov.</div>
                </div>
                <div>
                  <div className="text-emerald-300/70 uppercase tracking-wider text-[10px]">Neto</div>
                  <div className="font-mono font-semibold">{fmt((result.income_total || 0) - (result.expense_total || 0))}</div>
                </div>
              </div>
            )}

            {result.by_month && Object.keys(result.by_month).length > 0 && (
              <div className="pt-2 border-t border-emerald-500/20 space-y-1.5">
                <div className="text-xs text-emerald-300/80 font-medium">Por mes:</div>
                <div className="space-y-1">
                  {Object.entries(result.by_month).map(([mes, info]) => {
                    const net = (info.income || 0) - (info.expense || 0);
                    return (
                      <div key={mes} className="flex items-center gap-2 text-xs">
                        <span className="font-mono w-16 text-emerald-300/80">{mes}</span>
                        <span className="text-emerald-300/60 w-14">{info.count} mov.</span>
                        <span className="text-emerald-400">+{fmt(info.income)}</span>
                        <span className="text-rose-400">-{fmt(info.expense)}</span>
                        <span className={`ml-auto font-mono font-semibold ${net >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          = {fmt(net)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {result.by_category && Object.keys(result.by_category).length > 0 && (
              <div className="pt-2 border-t border-emerald-500/20 space-y-1">
                <div className="text-xs text-emerald-300/80 font-medium">Por categoría:</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(result.by_category)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, count]) => (
                      <Badge key={cat} variant="outline" className="text-xs border-emerald-500/30 text-emerald-300">
                        {cat} <span className="ml-1 opacity-70">({count})</span>
                      </Badge>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
