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
  Plus, Edit, Trash, Loader2, AlertCircle, Building2, User, Briefcase, Wallet, CreditCard, Home,
} from "lucide-react";
import api from "@/api/axios";

const fmt = (n) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

const emptyForm = () => ({
  name: "",
  type: "PERSONAL",
  tax_id: "",
});

export default function EntitiesPage() {
  const [entities, setEntities] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
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
      const [e, a, c, l] = await Promise.all([
        api.get("/entities/"),
        api.get("/accounts/").catch(() => ({ data: [] })),
        api.get("/cards/").catch(() => ({ data: [] })),
        api.get("/liabilities/").catch(() => ({ data: [] })),
      ]);
      setEntities(e.data);
      setAccounts(a.data);
      setCards(c.data);
      setLiabilities(l.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Error cargando entidades");
    } finally {
      setLoading(false);
    }
  };

  const entityStats = (id) => {
    const accs = accounts.filter((a) => a.entity_id === id);
    const liabs = liabilities.filter((l) => l.entity_id === id);
    const accountIds = new Set(accs.map((a) => a.id));
    const cs = cards.filter((c) => c.account_id && accountIds.has(c.account_id));
    const balance = accs.reduce((s, a) => s + Number(a.balance || 0), 0);
    const debt = liabs.reduce((s, l) => s + Number(l.current_balance || 0), 0);
    return {
      accounts: accs.length,
      cards: cs.length,
      liabilities: liabs.length,
      balance,
      debt,
      net: balance - debt,
    };
  };

  useEffect(() => { load(); }, []);

  const openCreate = (defaultType = "PERSONAL") => {
    setEditing(null);
    setForm({ ...emptyForm(), type: defaultType });
    setOpen(true);
  };
  const openEdit = (e) => {
    setEditing(e);
    setForm({ name: e.name, type: e.type, tax_id: e.tax_id || "" });
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
        tax_id: form.tax_id?.trim() || null,
      };
      if (editing) {
        await api.put(`/entities/${editing.id}`, payload);
      } else {
        await api.post("/entities/", payload);
      }
      setOpen(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e) => {
    if (!window.confirm(`¿Borrar "${e.name}"? Las cuentas y transacciones se quedarán sin entidad.`)) return;
    try {
      await api.delete(`/entities/${e.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error borrando");
    }
  };

  const personal = entities.filter((e) => e.type === "PERSONAL");
  const business = entities.filter((e) => e.type === "BUSINESS");

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Building2 size={22} /> Entidades
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Separa tus finanzas personales de las de tu empresa o autónomo.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openCreate("PERSONAL")} className="gap-2"><Plus size={16} /> Nueva entidad</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar entidad" : "Nueva entidad"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={(val) => setForm({ ...form, type: val })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERSONAL">Personal</SelectItem>
                      <SelectItem value="BUSINESS">Empresa / Autónomo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ent-name">Nombre</Label>
                  <Input
                    id="ent-name"
                    placeholder={form.type === "BUSINESS" ? "Ej. Mi Empresa S.L." : "Ej. Yo / Familia"}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ent-tax">{form.type === "BUSINESS" ? "CIF / NIF" : "DNI / NIF (opcional)"}</Label>
                  <Input
                    id="ent-tax"
                    placeholder={form.type === "BUSINESS" ? "B12345678" : "00000000A"}
                    value={form.tax_id}
                    onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EntityColumn
            title="Personal"
            icon={<User size={18} />}
            tone="emerald"
            items={personal}
            entityStats={entityStats}
            loading={loading}
            onEdit={openEdit}
            onDelete={handleDelete}
            onAdd={() => openCreate("PERSONAL")}
            emptyText="Aún no tienes entidades personales"
          />
          <EntityColumn
            title="Empresa / Autónomo"
            icon={<Briefcase size={18} />}
            tone="indigo"
            items={business}
            entityStats={entityStats}
            loading={loading}
            onEdit={openEdit}
            onDelete={handleDelete}
            onAdd={() => openCreate("BUSINESS")}
            emptyText="Sin empresas o actividades autónomas"
          />
        </div>
      </div>
    </Layout>
  );
}

function EntityColumn({ title, icon, tone, items, entityStats, loading, onEdit, onDelete, onAdd, emptyText }) {
  const tones = {
    emerald: "text-emerald-500",
    indigo: "text-indigo-400",
  };
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className={`flex items-center gap-2 ${tones[tone]}`}>{icon} {title}</CardTitle>
          <CardDescription>{items.length} {items.length === 1 ? "entidad" : "entidades"}</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onAdd} className="gap-1"><Plus size={14} /> Añadir</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          [1, 2].map((i) => <div key={i} className="h-20 rounded bg-muted/50 animate-pulse" />)
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{emptyText}</p>
        ) : (
          items.map((e) => {
            const s = entityStats(e.id);
            return (
              <div key={e.id} className="p-3 rounded-md border border-border bg-card/50 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.name}</div>
                    {e.tax_id && <div className="text-xs text-muted-foreground font-mono">{e.tax_id}</div>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(e)} title="Editar">
                      <Edit size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(e)} title="Borrar">
                      <Trash size={14} />
                    </Button>
                  </div>
                </div>
                {(s.accounts > 0 || s.liabilities > 0 || s.cards > 0) && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {s.accounts > 0 && (
                      <span className="inline-flex items-center gap-1"><Wallet size={11} /> {s.accounts}</span>
                    )}
                    {s.cards > 0 && (
                      <span className="inline-flex items-center gap-1"><CreditCard size={11} /> {s.cards}</span>
                    )}
                    {s.liabilities > 0 && (
                      <span className="inline-flex items-center gap-1"><Home size={11} /> {s.liabilities}</span>
                    )}
                    <div className="ml-auto flex items-center gap-2 text-xs">
                      <span className="text-emerald-400 tabular-nums">{fmt(s.balance)}</span>
                      {s.debt > 0 && <span className="text-rose-400 tabular-nums">-{fmt(s.debt)}</span>}
                      <span className="font-semibold tabular-nums">= {fmt(s.net)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
