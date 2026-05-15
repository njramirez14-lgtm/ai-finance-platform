import { useEffect, useRef, useState } from "react";
import Layout from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Edit, Trash, Loader2, AlertCircle, Wallet, Banknote, CreditCard, PiggyBank, Bitcoin, Building2,
  Eye, EyeOff, Copy, Check, Upload, Sliders, FileText, TrendingUp, TrendingDown,
} from "lucide-react";
import api from "@/api/axios";
import useStore from "@/store";
import { scopeFilter } from "@/store/slices/scope";

const fmt = (n, currency = "EUR") =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(Number(n) || 0);

const ACCOUNT_TYPES = [
  { value: "CHECKING", label: "Cuenta corriente", Icon: Banknote },
  { value: "SAVINGS", label: "Ahorro", Icon: PiggyBank },
  { value: "CASH", label: "Efectivo", Icon: Wallet },
  { value: "CARD", label: "Tarjeta", Icon: CreditCard },
  { value: "CRYPTO", label: "Cripto", Icon: Bitcoin },
  { value: "OTHER", label: "Otro", Icon: Wallet },
];

const typeMeta = (t) => ACCOUNT_TYPES.find((x) => x.value === t) || ACCOUNT_TYPES[5];

const emptyForm = () => ({
  name: "",
  type: "CHECKING",
  currency: "EUR",
  initial_balance: "0",
  entity_id: "",
  account_number: "",
  notes: "",
});

function maskNumber(num) {
  if (!num) return "";
  const cleaned = String(num).replace(/\s+/g, "");
  if (cleaned.length <= 4) return cleaned;
  const last = cleaned.slice(-4);
  const stars = "•".repeat(Math.min(cleaned.length - 4, 16));
  return `${stars} ${last}`;
}

function AccountNumberLine({ value }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!value) {
    return <span className="text-xs text-muted-foreground italic">Sin número de cuenta</span>;
  }
  const display = revealed ? value : maskNumber(value);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="tracking-wider select-all">{display}</span>
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title={revealed ? "Ocultar" : "Mostrar"}
      >
        {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
      <button
        type="button"
        onClick={copy}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="Copiar"
      >
        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [entities, setEntities] = useState([]);
  const scope = useStore((s) => s.scope);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  // Adjust balance
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustAccount, setAdjustAccount] = useState(null);
  const [adjustTarget, setAdjustTarget] = useState("0");
  const [adjustDesc, setAdjustDesc] = useState("");
  const [adjustBusy, setAdjustBusy] = useState(false);

  // Upload statement
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadAccount, setUploadAccount] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const uploadInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, e] = await Promise.all([
        api.get("/accounts/"),
        api.get("/entities/"),
      ]);
      setAccounts(a.data);
      setEntities(e.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Error cargando cuentas");
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

  const openEdit = (acc) => {
    setEditing(acc);
    setForm({
      name: acc.name,
      type: acc.type,
      currency: acc.currency || "EUR",
      initial_balance: String(acc.initial_balance ?? "0"),
      entity_id: acc.entity_id ? String(acc.entity_id) : "",
      account_number: acc.account_number || "",
      notes: acc.notes || "",
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
        currency: (form.currency || "EUR").toUpperCase(),
        initial_balance: parseFloat(form.initial_balance) || 0,
        entity_id: form.entity_id ? parseInt(form.entity_id, 10) : null,
        account_number: form.account_number.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await api.put(`/accounts/${editing.id}`, payload);
      } else {
        await api.post("/accounts/", payload);
      }
      setOpen(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (acc) => {
    if (!window.confirm(`¿Borrar la cuenta "${acc.name}"? Las transacciones asociadas se quedarán sin cuenta.`)) return;
    try {
      await api.delete(`/accounts/${acc.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error borrando");
    }
  };

  const openAdjust = (acc) => {
    setAdjustAccount(acc);
    setAdjustTarget(String(acc.balance ?? "0"));
    setAdjustDesc("");
    setAdjustOpen(true);
  };

  const submitAdjust = async () => {
    if (!adjustAccount) return;
    setAdjustBusy(true);
    try {
      await api.post(`/accounts/${adjustAccount.id}/adjust-balance`, {
        target_balance: parseFloat(adjustTarget) || 0,
        description: adjustDesc.trim() || null,
      });
      setAdjustOpen(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error ajustando saldo");
    } finally {
      setAdjustBusy(false);
    }
  };

  const openUpload = (acc) => {
    setUploadAccount(acc);
    setUploadResult(null);
    setUploadOpen(true);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uploadAccount) return;
    setUploadBusy(true);
    setUploadResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post(
        `/accounts/${uploadAccount.id}/upload-statement`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setUploadResult(data);
      await load();
    } catch (err) {
      setUploadResult({ success: false, error: err.response?.data?.detail || "Error subiendo extracto" });
    } finally {
      setUploadBusy(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  const scopedAccounts = accounts.filter((a) => scopeFilter(a, scope, entities));
  const totalBalance = scopedAccounts.reduce((acc, a) => acc + Number(a.balance || 0), 0);
  const entityName = (id) => {
    if (!id) return null;
    const e = entities.find((x) => x.id === id);
    return e ? e.name : null;
  };

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Wallet size={22} /> Cuentas
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Bancos, tarjetas, efectivo y cripto en un solo lugar.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="gap-2"><Plus size={16} /> Nueva cuenta</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
                <DialogDescription>
                  El número de cuenta se mostrará oculto en la app — pulsa el ojo para verlo.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
                <div className="space-y-2">
                  <Label htmlFor="acc-name">Nombre</Label>
                  <Input
                    id="acc-name"
                    placeholder="Ej. BBVA Cuenta nómina"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={form.type} onValueChange={(val) => setForm({ ...form, type: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="acc-currency">Moneda</Label>
                    <Input
                      id="acc-currency"
                      placeholder="EUR"
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                      maxLength={4}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc-number">Número de cuenta / IBAN / wallet</Label>
                  <Input
                    id="acc-number"
                    placeholder="ES00 0000 0000 0000 0000 0000"
                    value={form.account_number}
                    onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Se guarda completo pero por defecto solo se verán los últimos 4 dígitos.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc-initial">Saldo inicial</Label>
                  <Input
                    id="acc-initial"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.initial_balance}
                    onChange={(e) => setForm({ ...form, initial_balance: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">El saldo real = inicial + (ingresos − gastos) de las transacciones.</p>
                </div>
                <div className="space-y-2">
                  <Label>Entidad (Personal o Empresa)</Label>
                  <Select
                    value={form.entity_id || "none"}
                    onValueChange={(val) => setForm({ ...form, entity_id: val === "none" ? "" : val })}
                  >
                    <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {entities.map((e) => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.name} ({e.type === "BUSINESS" ? "Empresa" : "Personal"})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {entities.length === 0 && (
                    <p className="text-xs text-muted-foreground">No tienes entidades. Crea una en la página Entidades.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc-notes">Notas (opcional)</Label>
                  <Input
                    id="acc-notes"
                    placeholder="Recordatorios, sucursal, contacto…"
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

        <Card>
          <CardHeader>
            <CardDescription className="text-xs uppercase tracking-wider text-indigo-400">Patrimonio total</CardDescription>
            <CardTitle className="text-3xl font-bold tabular-nums">{fmt(totalBalance)}</CardTitle>
            <CardDescription>Suma de saldos calculados de todas tus cuentas</CardDescription>
          </CardHeader>
        </Card>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-44 rounded-lg bg-muted/50 animate-pulse" />)}
          </div>
        ) : scopedAccounts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <Wallet className="mx-auto text-muted-foreground" size={32} />
              <p className="text-sm text-muted-foreground">Aún no tienes cuentas. ¡Añade la primera!</p>
              <Button variant="outline" onClick={openCreate} className="gap-2">
                <Plus size={14} /> Nueva cuenta
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scopedAccounts.map((acc) => {
              const meta = typeMeta(acc.type);
              const Icon = meta.Icon;
              const ent = entityName(acc.entity_id);
              const cards = acc.cards || [];
              return (
                <Card key={acc.id} className="relative overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 flex-shrink-0">
                          <Icon size={20} />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">{acc.name}</CardTitle>
                          <CardDescription className="text-xs">{meta.label} · {acc.currency}</CardDescription>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(acc)} title="Editar">
                          <Edit size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(acc)} title="Borrar">
                          <Trash size={14} />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="text-2xl font-bold tabular-nums">{fmt(acc.balance, acc.currency)}</div>
                      <AccountNumberLine value={acc.account_number} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <TrendingUp size={12} />
                        <span>30d ingresos: {fmt(acc.monthly_income, acc.currency)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-rose-400">
                        <TrendingDown size={12} />
                        <span>30d gastos: {fmt(acc.monthly_expense, acc.currency)}</span>
                      </div>
                    </div>

                    {(cards.length > 0 || ent) && (
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        {ent && (
                          <Badge variant="outline">
                            <Building2 size={10} className="mr-1" /> {ent}
                          </Badge>
                        )}
                        {cards.map((c) => (
                          <Badge key={c.id} variant="secondary" className="font-mono">
                            <CreditCard size={10} className="mr-1" />
                            {c.alias}{c.last4 ? ` ••${c.last4}` : ""}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 pt-2 border-t border-border/40">
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => openAdjust(acc)}>
                        <Sliders size={12} /> Ajustar saldo
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => openUpload(acc)}>
                        <Upload size={12} /> Subir extracto
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Adjust balance dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar saldo</DialogTitle>
            <DialogDescription>
              Crea una transacción correctora para que el saldo coincida con el real.
              {adjustAccount && <> Saldo actual: <strong>{fmt(adjustAccount.balance, adjustAccount.currency)}</strong>.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Saldo objetivo</Label>
              <Input
                type="number"
                step="0.01"
                value={adjustTarget}
                onChange={(e) => setAdjustTarget(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Input
                placeholder="Ajuste manual de saldo"
                value={adjustDesc}
                onChange={(e) => setAdjustDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjustOpen(false)}>Cancelar</Button>
            <Button onClick={submitAdjust} disabled={adjustBusy}>
              {adjustBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Aplicando…</> : "Ajustar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload statement dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir extracto</DialogTitle>
            <DialogDescription>
              {uploadAccount && <>Las transacciones se asignarán a <strong>{uploadAccount.name}</strong>. </>}
              Sube un CSV o texto de tu extracto bancario y la IA extrae los movimientos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <input
              ref={uploadInputRef}
              type="file"
              accept=".csv,.txt,.tsv,text/*"
              className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20 cursor-pointer"
              onChange={handleFile}
              disabled={uploadBusy}
            />
            {uploadBusy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Procesando con IA…
              </div>
            )}
            {uploadResult && uploadResult.success && (
              <div className="space-y-2 p-3 rounded-md text-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <div className="flex items-start gap-2">
                  <Check size={16} className="flex-shrink-0 mt-0.5" />
                  <span>Importadas <strong>{uploadResult.imported}</strong> transacciones y categorizadas con IA.</span>
                </div>
                {uploadResult.by_category && Object.keys(uploadResult.by_category).length > 0 && (
                  <div className="pt-2 border-t border-emerald-500/20 space-y-1">
                    <div className="text-xs text-emerald-300/80 font-medium">Por categoría:</div>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(uploadResult.by_category)
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
            {uploadResult && !uploadResult.success && (
              <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{uploadResult.error}</span>
              </div>
            )}
            <div className="text-xs text-muted-foreground flex items-start gap-2">
              <FileText size={12} className="mt-0.5 flex-shrink-0" />
              <span>Formatos: CSV o texto plano. Máx 5 MB.</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUploadOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
