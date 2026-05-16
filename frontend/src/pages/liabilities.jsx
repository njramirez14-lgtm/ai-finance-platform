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
  Plus, Edit, Trash, Loader2, AlertCircle, Home, Building2, CreditCard, Briefcase, GraduationCap, Wallet, BanknoteArrowDown,
  Sparkles, FileSearch, Check,
} from "lucide-react";
import api from "@/api/axios";
import useStore from "@/store";
import { scopeFilter } from "@/store/slices/scope";

const fmt = (n, c = "EUR") =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: c }).format(Number(n) || 0);
const fmtPct = (n) => (n == null || n === "" ? "—" : `${Number(n).toFixed(2)}%`);

const LIABILITY_TYPES = [
  { value: "MORTGAGE", label: "Hipoteca", Icon: Home, tone: "indigo" },
  { value: "LOAN", label: "Préstamo personal", Icon: Briefcase, tone: "amber" },
  { value: "CREDIT_CARD", label: "Tarjeta de crédito", Icon: CreditCard, tone: "rose" },
  { value: "LINE_OF_CREDIT", label: "Línea de crédito", Icon: Wallet, tone: "purple" },
  { value: "STUDENT", label: "Préstamo estudios", Icon: GraduationCap, tone: "emerald" },
  { value: "OTHER", label: "Otro", Icon: Building2, tone: "slate" },
];
const typeMeta = (t) => LIABILITY_TYPES.find((x) => x.value === t) || LIABILITY_TYPES[5];

const TONE_BG = {
  indigo: "bg-indigo-500/10 text-indigo-400",
  amber: "bg-amber-500/10 text-amber-400",
  rose: "bg-rose-500/10 text-rose-400",
  purple: "bg-purple-500/10 text-purple-400",
  emerald: "bg-emerald-500/10 text-emerald-400",
  slate: "bg-slate-500/10 text-slate-300",
};

const emptyForm = () => ({
  name: "",
  type: "MORTGAGE",
  lender: "",
  original_amount: "0",
  current_balance: "0",
  interest_rate: "",
  monthly_payment: "",
  start_date: "",
  end_date: "",
  currency: "EUR",
  notes: "",
  entity_id: "",
});

function progress(original, current) {
  const o = Number(original);
  const c = Number(current);
  if (!o || o <= 0) return 0;
  return Math.max(0, Math.min(100, ((o - c) / o) * 100));
}

function monthsLeft(end_date) {
  if (!end_date) return null;
  const end = new Date(end_date);
  const now = new Date();
  const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
  return months > 0 ? months : 0;
}

export default function LiabilitiesPage() {
  const [items, setItems] = useState([]);
  const [entities, setEntities] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const scope = useStore((s) => s.scope);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  // Payment dialog
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payAccount, setPayAccount] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  // Analyze statement dialog
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [analyzeTarget, setAnalyzeTarget] = useState(null);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [picks, setPicks] = useState(() => new Set());

  const openAnalyze = (it) => {
    setAnalyzeTarget(it);
    setAnalyzeResult(null);
    setAnalyzeError(null);
    setPicks(new Set());
    setAnalyzeOpen(true);
  };

  const handleAnalyzeFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !analyzeTarget) return;
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > 4.4) {
      setAnalyzeError(`Archivo demasiado grande (${sizeMb.toFixed(1)} MB). Máx 4,5 MB.`);
      return;
    }
    setAnalyzeBusy(true);
    setAnalyzeError(null);
    setAnalyzeResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(
        `/liabilities/${analyzeTarget.id}/analyze-statement`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setAnalyzeResult(data);
      // Pre-select every field Gemini found something for.
      const next = new Set();
      const map = {
        monthly_payment: "monthly_payment",
        interest_rate_annual: "interest_rate",
        current_balance: "current_balance",
        original_amount: "original_amount",
        start_date: "start_date",
        end_date: "end_date",
        lender: "lender",
        loan_type: "type",
      };
      Object.keys(map).forEach((k) => {
        if (data[k] !== null && data[k] !== undefined && data[k] !== "") next.add(k);
      });
      setPicks(next);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      setAnalyzeError(detail || (status ? `Error ${status}` : "Error analizando documento"));
    } finally {
      setAnalyzeBusy(false);
      e.target.value = "";
    }
  };

  const togglePick = (k) => setPicks((p) => {
    const n = new Set(p);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  const applyAnalysis = async () => {
    if (!analyzeTarget || !analyzeResult) return;
    const fieldMap = {
      monthly_payment: () => analyzeResult.monthly_payment,
      interest_rate_annual: () => analyzeResult.interest_rate_annual,
      current_balance: () => analyzeResult.current_balance,
      original_amount: () => analyzeResult.original_amount,
      start_date: () => analyzeResult.start_date,
      end_date: () => analyzeResult.end_date,
      lender: () => analyzeResult.lender,
      loan_type: () => analyzeResult.loan_type,
    };
    const payload = {};
    picks.forEach((k) => {
      const val = fieldMap[k]?.();
      if (val === null || val === undefined || val === "") return;
      if (k === "interest_rate_annual") payload.interest_rate = val;
      else if (k === "loan_type") payload.type = val;
      else payload[k] = val;
    });
    if (Object.keys(payload).length === 0) return;
    setApplyBusy(true);
    try {
      await api.put(`/liabilities/${analyzeTarget.id}`, payload);
      setAnalyzeOpen(false);
      await load();
    } catch (err) {
      setAnalyzeError(err.response?.data?.detail || "Error aplicando los cambios");
    } finally {
      setApplyBusy(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, b, c] = await Promise.all([
        api.get("/liabilities/"),
        api.get("/entities/").catch(() => ({ data: [] })),
        api.get("/accounts/").catch(() => ({ data: [] })),
      ]);
      setItems(a.data);
      setEntities(b.data);
      setAccounts(c.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Error cargando deudas");
    } finally {
      setLoading(false);
    }
  };

  const openPayment = (it) => {
    setPayTarget(it);
    setPayAmount(it.monthly_payment ? String(it.monthly_payment) : "");
    setPayAccount("");
    setPayOpen(true);
  };

  const submitPayment = async () => {
    if (!payTarget) return;
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { setError("Importe inválido"); return; }
    setPayBusy(true);
    try {
      await api.post(`/liabilities/${payTarget.id}/pay`, {
        amount: amt,
        account_id: payAccount ? parseInt(payAccount, 10) : null,
      });
      setPayOpen(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error registrando pago");
    } finally {
      setPayBusy(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (it) => {
    setEditing(it);
    setForm({
      name: it.name,
      type: it.type,
      lender: it.lender || "",
      original_amount: String(it.original_amount ?? "0"),
      current_balance: String(it.current_balance ?? "0"),
      interest_rate: it.interest_rate != null ? String(it.interest_rate) : "",
      monthly_payment: it.monthly_payment != null ? String(it.monthly_payment) : "",
      start_date: it.start_date || "",
      end_date: it.end_date || "",
      currency: it.currency || "EUR",
      notes: it.notes || "",
      entity_id: it.entity_id ? String(it.entity_id) : "",
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
        type: form.type,
        lender: form.lender.trim() || null,
        original_amount: parseFloat(form.original_amount) || 0,
        current_balance: parseFloat(form.current_balance) || 0,
        interest_rate: form.interest_rate === "" ? null : parseFloat(form.interest_rate),
        monthly_payment: form.monthly_payment === "" ? null : parseFloat(form.monthly_payment),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        currency: (form.currency || "EUR").toUpperCase(),
        notes: form.notes.trim() || null,
        entity_id: form.entity_id ? parseInt(form.entity_id, 10) : null,
      };
      if (editing) {
        await api.put(`/liabilities/${editing.id}`, payload);
      } else {
        await api.post("/liabilities/", payload);
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
      await api.delete(`/liabilities/${it.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error borrando");
    }
  };

  const scoped = useMemo(
    () => items.filter((it) => scopeFilter(it, scope, entities)),
    [items, scope, entities],
  );

  const totals = useMemo(() => {
    let debt = 0, monthly = 0, original = 0;
    scoped.forEach((it) => {
      debt += Number(it.current_balance || 0);
      original += Number(it.original_amount || 0);
      monthly += Number(it.monthly_payment || 0);
    });
    return { debt, monthly, original, paid: original - debt };
  }, [scoped]);

  const entityName = (id) => {
    if (!id) return null;
    const e = entities.find((x) => x.id === id);
    return e ? e.name : null;
  };

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Home size={22} /> Deudas
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Hipotecas, préstamos, tarjetas y cualquier deuda en un solo sitio.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="gap-2"><Plus size={16} /> Nueva deuda</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar deuda" : "Nueva deuda"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="li-name">Nombre</Label>
                    <Input
                      id="li-name"
                      placeholder="Ej. Hipoteca BBVA"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={form.type} onValueChange={(val) => setForm({ ...form, type: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LIABILITY_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="li-lender">Entidad financiera</Label>
                  <Input
                    id="li-lender"
                    placeholder="Ej. BBVA, ING, Santander"
                    value={form.lender}
                    onChange={(e) => setForm({ ...form, lender: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="li-orig">Importe original</Label>
                    <Input
                      id="li-orig"
                      type="number"
                      step="0.01"
                      value={form.original_amount}
                      onChange={(e) => setForm({ ...form, original_amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="li-bal">Saldo pendiente</Label>
                    <Input
                      id="li-bal"
                      type="number"
                      step="0.01"
                      value={form.current_balance}
                      onChange={(e) => setForm({ ...form, current_balance: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="li-rate">Interés anual (%)</Label>
                    <Input
                      id="li-rate"
                      type="number"
                      step="0.01"
                      placeholder="3.25"
                      value={form.interest_rate}
                      onChange={(e) => setForm({ ...form, interest_rate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="li-pay">Cuota mensual</Label>
                    <Input
                      id="li-pay"
                      type="number"
                      step="0.01"
                      placeholder="650"
                      value={form.monthly_payment}
                      onChange={(e) => setForm({ ...form, monthly_payment: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="li-start">Fecha inicio</Label>
                    <Input
                      id="li-start"
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="li-end">Fecha fin (opcional)</Label>
                    <Input
                      id="li-end"
                      type="date"
                      value={form.end_date}
                      onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="li-cur">Moneda</Label>
                    <Input
                      id="li-cur"
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                      maxLength={4}
                    />
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

                <div className="space-y-2">
                  <Label htmlFor="li-notes">Notas</Label>
                  <textarea
                    id="li-notes"
                    rows={3}
                    placeholder="Cualquier nota, condiciones especiales…"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard label="Deuda total" value={fmt(totals.debt)} tone="rose" />
          <SummaryCard label="Cuotas mensuales" value={fmt(totals.monthly)} tone="amber" />
          <SummaryCard label="Ya pagado" value={fmt(totals.paid)} hint={totals.original > 0 ? `${Math.round((totals.paid / totals.original) * 100)}% del total inicial` : null} tone="emerald" />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => <div key={i} className="h-44 rounded-lg bg-muted/50 animate-pulse" />)}
          </div>
        ) : scoped.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <Home className="mx-auto text-muted-foreground" size={32} />
              <p className="text-sm text-muted-foreground">Aún no tienes deudas registradas. ¡Suerte!</p>
              <Button variant="outline" onClick={openCreate} className="gap-2">
                <Plus size={14} /> Nueva deuda
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scoped.map((it) => {
              const meta = typeMeta(it.type);
              const Icon = meta.Icon;
              const pct = progress(it.original_amount, it.current_balance);
              const months = monthsLeft(it.end_date);
              const ent = entityName(it.entity_id);
              return (
                <Card key={it.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${TONE_BG[meta.tone]}`}>
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-base truncate">{it.name}</CardTitle>
                          <CardDescription className="text-xs truncate">
                            {meta.label}{it.lender && <> · {it.lender}</>}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(it)} title="Editar" className="h-8 w-8 p-0">
                          <Edit size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(it)} title="Borrar" className="h-8 w-8 p-0">
                          <Trash size={14} />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">Pendiente</div>
                      <div className="text-2xl font-bold tabular-nums">{fmt(it.current_balance, it.currency)}</div>
                      <div className="text-xs text-muted-foreground">de {fmt(it.original_amount, it.currency)}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => openPayment(it)}
                        disabled={Number(it.current_balance || 0) <= 0}
                      >
                        <BanknoteArrowDown size={14} /> Pagar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => openAnalyze(it)}
                        title="Analizar cuadro de amortización, escritura o extracto"
                      >
                        <FileSearch size={14} /> Analizar
                      </Button>
                    </div>

                    {it.original_amount > 0 && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Pagado</span>
                          <span className="font-mono">{pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-border">
                      <Stat label="Cuota" value={it.monthly_payment ? fmt(it.monthly_payment, it.currency) : "—"} />
                      <Stat label="Interés" value={fmtPct(it.interest_rate)} />
                      <Stat label="Restan" value={months != null ? `${months} m` : "—"} />
                    </div>

                    {ent && (
                      <Badge variant="outline" className="text-[10px]">
                        <Building2 size={10} className="mr-1" /> {ent}
                      </Badge>
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

      {/* Payment dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {payTarget && (
              <div className="p-3 rounded-md bg-muted/50 text-sm">
                <div className="font-medium">{payTarget.name}</div>
                <div className="text-xs text-muted-foreground">
                  Saldo actual: <span className="font-mono">{fmt(payTarget.current_balance, payTarget.currency)}</span>
                  {payTarget.monthly_payment && (
                    <> · Cuota: <span className="font-mono">{fmt(payTarget.monthly_payment, payTarget.currency)}</span></>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Importe del pago</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Cuenta de pago (opcional)</Label>
              <Select value={payAccount || "none"} onValueChange={(v) => setPayAccount(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Sin cuenta — solo reduce el saldo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Solo reduce saldo</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Si eliges cuenta, se creará automáticamente la transacción de gasto.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayOpen(false)}>Cancelar</Button>
            <Button onClick={submitPayment} disabled={payBusy}>
              {payBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Registrando…</> : "Registrar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={analyzeOpen} onOpenChange={setAnalyzeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={18} /> Analizar documento del préstamo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {analyzeTarget && (
              <div className="text-sm text-muted-foreground">
                Deuda: <strong>{analyzeTarget.name}</strong>. Sube el cuadro de amortización, escritura, certificado de deuda o el extracto del banco que tenga las cuotas.
              </div>
            )}

            {!analyzeResult && (
              <input
                type="file"
                accept=".csv,.txt,.tsv,.pdf,.xlsx,.xlsm,text/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20 cursor-pointer"
                onChange={handleAnalyzeFile}
                disabled={analyzeBusy}
              />
            )}

            {analyzeBusy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                <Loader2 className="animate-spin" size={16} /> Analizando con Gemini…
              </div>
            )}

            {analyzeError && (
              <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{analyzeError}</span>
              </div>
            )}

            {analyzeResult && (
              <div className="space-y-3">
                {analyzeResult.summary && (
                  <div className="p-3 rounded-md text-sm bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    {analyzeResult.summary}
                    {analyzeResult.confidence && (
                      <div className="text-[10px] uppercase tracking-wider text-indigo-300/70 mt-1">
                        Confianza: {analyzeResult.confidence}
                        {analyzeResult.used_vision && " · leído por Gemini Vision"}
                      </div>
                    )}
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  Marca los valores que quieres aplicar a la deuda <strong>{analyzeTarget?.name}</strong>:
                </div>

                <div className="space-y-1">
                  {[
                    ["monthly_payment", "Cuota mensual", (v) => fmt(v, analyzeTarget?.currency)],
                    ["interest_rate_annual", `Interés anual${analyzeResult.interest_rate_kind ? ` (${analyzeResult.interest_rate_kind})` : ""}`, (v) => `${Number(v).toFixed(2)}%`],
                    ["current_balance", "Capital pendiente", (v) => fmt(v, analyzeTarget?.currency)],
                    ["original_amount", "Importe original", (v) => fmt(v, analyzeTarget?.currency)],
                    ["start_date", "Fecha inicio", (v) => v],
                    ["end_date", "Fecha fin", (v) => v],
                    ["lender", "Entidad", (v) => v],
                    ["loan_type", "Tipo de deuda", (v) => v],
                  ].map(([key, label, format]) => {
                    const val = analyzeResult[key];
                    const has = val !== null && val !== undefined && val !== "";
                    return (
                      <button
                        type="button"
                        key={key}
                        disabled={!has}
                        onClick={() => has && togglePick(key)}
                        className={`w-full flex items-center gap-3 p-2 rounded-md border text-sm text-left transition-colors ${
                          !has
                            ? "border-border/40 text-muted-foreground/40 cursor-not-allowed"
                            : picks.has(key)
                              ? "border-emerald-500/40 bg-emerald-500/5"
                              : "border-border hover:bg-muted/40"
                        }`}
                      >
                        <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${picks.has(key) ? "bg-emerald-500 border-emerald-500 text-white" : "border-border"}`}>
                          {picks.has(key) && <Check size={10} />}
                        </span>
                        <span className="flex-1">{label}</span>
                        <span className="font-mono text-xs">
                          {has ? format(val) : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {(analyzeResult.term_months || analyzeResult.remaining_months || analyzeResult.payments_paid) && (
                  <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-border">
                    {analyzeResult.term_months != null && (
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Plazo</div>
                        <div className="font-mono font-semibold">{analyzeResult.term_months} meses</div>
                      </div>
                    )}
                    {analyzeResult.payments_paid != null && (
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Pagadas</div>
                        <div className="font-mono font-semibold">{analyzeResult.payments_paid}</div>
                      </div>
                    )}
                    {analyzeResult.remaining_months != null && (
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Quedan</div>
                        <div className="font-mono font-semibold">{analyzeResult.remaining_months}</div>
                      </div>
                    )}
                    {analyzeResult.total_interest_paid != null && (
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Interés pagado</div>
                        <div className="font-mono font-semibold">{fmt(analyzeResult.total_interest_paid, analyzeTarget?.currency)}</div>
                      </div>
                    )}
                    {analyzeResult.total_interest_remaining != null && (
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Interés pendiente</div>
                        <div className="font-mono font-semibold">{fmt(analyzeResult.total_interest_remaining, analyzeTarget?.currency)}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setAnalyzeOpen(false)}>Cerrar</Button>
            {analyzeResult && (
              <Button
                onClick={applyAnalysis}
                disabled={applyBusy || picks.size === 0}
                className="gap-2"
              >
                {applyBusy
                  ? <><Loader2 className="animate-spin" size={14} /> Aplicando…</>
                  : <>Aplicar {picks.size} {picks.size === 1 ? "cambio" : "cambios"}</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function SummaryCard({ label, value, hint, tone }) {
  const tones = {
    emerald: "text-emerald-500",
    rose: "text-rose-500",
    amber: "text-amber-500",
  };
  return (
    <Card>
      <CardContent className="pt-4">
        <div className={`text-xs uppercase tracking-wider ${tones[tone]}`}>{label}</div>
        <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="font-mono font-medium">{value}</div>
    </div>
  );
}
