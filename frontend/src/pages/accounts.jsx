import { useEffect, useState } from "react";
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
  Plus, Edit, Trash, Loader2, AlertCircle, Wallet, Banknote, CreditCard, PiggyBank, Bitcoin, Building2,
} from "lucide-react";
import api from "@/api/axios";
import useStore from "@/store";
import { scopeFilter, scopeLabel } from "@/store/slices/scope";

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
});

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

  const scopedAccounts = accounts.filter((a) => scopeFilter(a, scope, entities));
  const totalBalance = scopedAccounts.reduce((acc, a) => acc + Number(a.balance || 0), 0);
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
              <Wallet size={22} /> Cuentas
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tus cuentas bancarias, tarjetas, efectivo y cripto, todo en un sitio.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="gap-2"><Plus size={16} /> Nueva cuenta</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
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
                  <Label htmlFor="acc-initial">Saldo inicial</Label>
                  <Input
                    id="acc-initial"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.initial_balance}
                    onChange={(e) => setForm({ ...form, initial_balance: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">El saldo real se calcula sumando tus transacciones a este valor inicial.</p>
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
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 rounded-lg bg-muted/50 animate-pulse" />)}
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
              return (
                <Card key={acc.id} className="relative">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                          <Icon size={20} />
                        </div>
                        <div>
                          <CardTitle className="text-base">{acc.name}</CardTitle>
                          <CardDescription className="text-xs">{meta.label} · {acc.currency}</CardDescription>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(acc)} title="Editar">
                          <Edit size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(acc)} title="Borrar">
                          <Trash size={14} />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold tabular-nums">{fmt(acc.balance, acc.currency)}</div>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span>Inicial: {fmt(acc.initial_balance, acc.currency)}</span>
                      {ent && (
                        <Badge variant="outline" className="ml-auto">
                          <Building2 size={10} className="mr-1" /> {ent}
                        </Badge>
                      )}
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
