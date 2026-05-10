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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus, Edit, Trash, Loader2, AlertCircle, Receipt, UploadCloud, FileText, CheckCircle2,
} from "lucide-react";
import api from "@/api/axios";

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
  const [filter, setFilter] = useState("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [txRes, catRes, accRes, entRes] = await Promise.all([
        api.get("/transactions/", { params: { limit: 200 } }),
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
      date: tx.date,
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
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error borrando");
    }
  };

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filter !== "ALL" && t.type !== filter) return false;
      if (entityFilter !== "ALL") {
        if (entityFilter === "NONE") return !t.entity_id;
        if (String(t.entity_id) !== entityFilter) return false;
      }
      return true;
    });
  }, [transactions, filter, entityFilter]);

  const totals = useMemo(() => {
    let inc = 0, exp = 0;
    transactions.forEach((t) => {
      if (t.type === "INCOME") inc += Number(t.amount);
      else exp += Number(t.amount);
    });
    return { inc, exp, balance: inc - exp };
  }, [transactions]);

  const catName = (id) => {
    if (!id) return "—";
    const c = categories.find((x) => x.id === id);
    return c ? c.name : "—";
  };

  const formCategories = categories.filter((c) => c.type === form.type);

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Receipt size={22} /> Transacciones
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Registra tus ingresos y gastos manualmente o sube un extracto.
            </p>
          </div>
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
                  {formCategories.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No tienes categorías de {form.type === "INCOME" ? "ingreso" : "gasto"} aún. Crea una en la página de Categorías.
                    </p>
                  )}
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

        {error && !open && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MiniStat label="Ingresos" value={fmt(totals.inc)} tone="emerald" />
          <MiniStat label="Gastos" value={fmt(totals.exp)} tone="rose" />
          <MiniStat label="Balance" value={fmt(totals.balance)} tone={totals.balance >= 0 ? "indigo" : "rose"} />
        </div>

        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">Lista</TabsTrigger>
            <TabsTrigger value="upload">Subir extracto</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")}>Todas</FilterChip>
              <FilterChip active={filter === "INCOME"} onClick={() => setFilter("INCOME")}>Ingresos</FilterChip>
              <FilterChip active={filter === "EXPENSE"} onClick={() => setFilter("EXPENSE")}>Gastos</FilterChip>
              {entities.length > 0 && (
                <>
                  <span className="text-xs text-muted-foreground mx-2">|</span>
                  <FilterChip active={entityFilter === "ALL"} onClick={() => setEntityFilter("ALL")}>Todas entidades</FilterChip>
                  {entities.map((e) => (
                    <FilterChip
                      key={e.id}
                      active={entityFilter === String(e.id)}
                      onClick={() => setEntityFilter(String(e.id))}
                    >
                      {e.name}
                    </FilterChip>
                  ))}
                  <FilterChip active={entityFilter === "NONE"} onClick={() => setEntityFilter("NONE")}>Sin entidad</FilterChip>
                </>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
              </span>
            </div>

            <Card>
              <CardContent className="pt-6">
                {loading ? (
                  <div className="space-y-2 animate-pulse">
                    {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 rounded bg-muted/50" />)}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {transactions.length === 0
                        ? "Aún no tienes transacciones. ¡Añade la primera!"
                        : "No hay resultados con este filtro."}
                    </p>
                    {transactions.length === 0 && (
                      <Button variant="outline" className="gap-2" onClick={openCreate}>
                        <Plus size={14} /> Nueva transacción
                      </Button>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28">Fecha</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="w-32">Categoría</TableHead>
                        <TableHead className="w-24">Tipo</TableHead>
                        <TableHead className="text-right w-28">Monto</TableHead>
                        <TableHead className="w-24 text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{tx.date}</TableCell>
                          <TableCell className="font-medium">{tx.description || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{catName(tx.category_id)}</TableCell>
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
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(tx)} title="Editar">
                              <Edit size={14} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(tx)} title="Borrar">
                              <Trash size={14} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="upload">
            <UploadStatement onSaved={load} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function MiniStat({ label, value, tone }) {
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

function UploadStatement({ onSaved }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(null);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setSavedMsg(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const { data } = await api.post("/ai/upload-statement", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data.success) {
        setExtracted(data.transactions);
      } else {
        setError(data.error || "Error al procesar el archivo.");
      }
    } catch (err) {
      setError(err.response?.data?.error || "Error de conexión con el servidor IA.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAll = async () => {
    if (!extracted || extracted.length === 0) return;
    setSaving(true);
    try {
      const results = await Promise.allSettled(
        extracted.map((tx) =>
          api.post("/transactions/", {
            amount: Math.abs(parseFloat(tx.amount)),
            type: tx.type === "INCOME" ? "INCOME" : "EXPENSE",
            description: tx.description,
            date: tx.date,
          })
        )
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const fail = results.length - ok;
      setSavedMsg(
        fail === 0
          ? `${ok} transacciones guardadas`
          : `Guardadas ${ok} de ${results.length} (${fail} fallaron)`
      );
      if (fail === 0) {
        setExtracted(null);
        setFile(null);
      }
      onSaved?.();
    } catch (err) {
      setError("Error guardando transacciones");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UploadCloud size={18} /> Subir extracto bancario</CardTitle>
        <CardDescription>
          La IA extraerá las transacciones del archivo (CSV o texto). Podrás revisarlas antes de guardar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!extracted && (
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <input
              type="file"
              id="stmt-upload"
              className="hidden"
              accept=".csv,.txt,.pdf"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setError(null); }}
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
                <Button onClick={handleUpload} disabled={loading} className="gap-2">
                  {loading ? <><Loader2 size={14} className="animate-spin" /> Procesando…</> : "Analizar con IA"}
                </Button>
              </div>
            )}
          </div>
        )}

        {extracted && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{extracted.length} transacciones detectadas</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setExtracted(null); setFile(null); setSavedMsg(null); }}>
                  Descartar
                </Button>
                <Button size="sm" onClick={handleSaveAll} disabled={saving}>
                  {saving ? <><Loader2 size={14} className="animate-spin mr-1" /> Guardando…</> : "Guardar todas"}
                </Button>
              </div>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-24">Tipo</TableHead>
                    <TableHead className="text-right w-28">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extracted.map((tx, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{tx.date}</TableCell>
                      <TableCell>{tx.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          tx.type === "INCOME"
                            ? "border-emerald-500/30 text-emerald-400"
                            : "border-rose-500/30 text-rose-400"
                        }>{tx.type === "INCOME" ? "Ingreso" : "Gasto"}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {parseFloat(tx.amount).toFixed(2)}€
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {savedMsg && (
          <div className="flex items-center gap-2 p-3 rounded-md text-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 size={16} />
            {savedMsg}
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
