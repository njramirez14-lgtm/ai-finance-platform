import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Edit, Trash, Loader2, AlertCircle, CreditCard, Building2, Pause, Copy, Check, AlertTriangle, Link as LinkIcon, TrendingDown,
} from "lucide-react";
import api from "@/api/axios";

const CARD_TYPES = [
  { value: "DEBIT", label: "Débito" },
  { value: "CREDIT", label: "Crédito" },
  { value: "PREPAID", label: "Prepago" },
  { value: "VIRTUAL", label: "Virtual" },
];

const BRANDS = ["VISA", "MASTERCARD", "AMEX", "MAESTRO", "DISCOVER", "OTRA"];

const COLORS = [
  { value: "indigo", className: "bg-gradient-to-br from-indigo-600 to-indigo-900" },
  { value: "rose", className: "bg-gradient-to-br from-rose-600 to-rose-900" },
  { value: "emerald", className: "bg-gradient-to-br from-emerald-600 to-emerald-900" },
  { value: "amber", className: "bg-gradient-to-br from-amber-600 to-amber-800" },
  { value: "purple", className: "bg-gradient-to-br from-purple-600 to-purple-900" },
  { value: "slate", className: "bg-gradient-to-br from-slate-600 to-slate-900" },
];
const colorClass = (c) => (COLORS.find((x) => x.value === c) || COLORS[0]).className;

const fmt = (n) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

const emptyForm = () => ({
  alias: "",
  last4: "",
  brand: "VISA",
  type: "DEBIT",
  bank_name: "",
  expiry_month: "",
  expiry_year: "",
  color: "indigo",
  notes: "",
  active: true,
  account_id: "",
  credit_limit: "",
});

function monthsUntilExpiry(month, year) {
  if (!month || !year) return null;
  const now = new Date();
  const expiry = new Date(year, month - 1, 1);
  return (expiry.getFullYear() - now.getFullYear()) * 12 + (expiry.getMonth() - now.getMonth());
}

export default function CardsPage() {
  const [cards, setCards] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [filterBank, setFilterBank] = useState("all");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, a] = await Promise.all([
        api.get("/cards/"),
        api.get("/accounts/").catch(() => ({ data: [] })),
      ]);
      setCards(c.data);
      setAccounts(a.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Error cargando tarjetas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      alias: c.alias,
      last4: c.last4 || "",
      brand: c.brand || "VISA",
      type: c.type,
      bank_name: c.bank_name || "",
      expiry_month: c.expiry_month != null ? String(c.expiry_month) : "",
      expiry_year: c.expiry_year != null ? String(c.expiry_year) : "",
      color: c.color || "indigo",
      notes: c.notes || "",
      active: c.active !== false,
      account_id: c.account_id ? String(c.account_id) : "",
      credit_limit: c.credit_limit != null ? String(c.credit_limit) : "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.alias.trim()) { setError("Pon un alias para la tarjeta"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        alias: form.alias.trim(),
        last4: form.last4 ? form.last4.slice(-4).replace(/\D/g, "") : null,
        brand: form.brand || null,
        type: form.type,
        bank_name: form.bank_name.trim() || null,
        expiry_month: form.expiry_month ? parseInt(form.expiry_month, 10) : null,
        expiry_year: form.expiry_year ? parseInt(form.expiry_year, 10) : null,
        color: form.color || null,
        notes: form.notes.trim() || null,
        active: form.active,
        account_id: form.account_id ? parseInt(form.account_id, 10) : null,
        credit_limit: form.credit_limit ? parseFloat(form.credit_limit) : null,
      };
      if (editing) {
        await api.put(`/cards/${editing.id}`, payload);
      } else {
        await api.post("/cards/", payload);
      }
      setOpen(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`¿Borrar "${c.alias}"?`)) return;
    try {
      await api.delete(`/cards/${c.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error borrando");
    }
  };

  const filtered = useMemo(() => {
    if (filterBank === "all") return cards;
    if (filterBank === "_nobank") return cards.filter((c) => !c.bank_name);
    return cards.filter((c) => c.bank_name === filterBank);
  }, [cards, filterBank]);

  const grouped = useMemo(() => {
    const map = {};
    for (const c of filtered) {
      const key = c.bank_name || "Sin banco";
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const banks = useMemo(() => Array.from(new Set(cards.map((c) => c.bank_name).filter(Boolean))).sort(), [cards]);

  const monthlyTotalSpend = filtered.reduce((s, c) => s + Number(c.monthly_spend || 0), 0);
  const expiringSoon = cards.filter((c) => {
    const m = monthsUntilExpiry(c.expiry_month, c.expiry_year);
    return m != null && m >= 0 && m <= 3;
  });

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <CreditCard size={22} /> Tarjetas
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Solo guardamos alias y los últimos 4 dígitos — nunca el PAN completo. Vincula cada tarjeta a una cuenta para ver gasto y uso.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="gap-2"><Plus size={16} /> Nueva tarjeta</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar tarjeta" : "Nueva tarjeta"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="c-alias">Alias</Label>
                    <Input
                      id="c-alias"
                      placeholder="Ej. Mi Visa principal"
                      value={form.alias}
                      onChange={(e) => setForm({ ...form, alias: e.target.value })}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-bank">Banco</Label>
                    <Input
                      id="c-bank"
                      placeholder="Ej. BBVA"
                      value={form.bank_name}
                      onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-last4">Últimos 4 dígitos</Label>
                    <Input
                      id="c-last4"
                      placeholder="1234"
                      maxLength={4}
                      value={form.last4}
                      onChange={(e) => setForm({ ...form, last4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={form.type} onValueChange={(val) => setForm({ ...form, type: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CARD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Marca</Label>
                    <Select value={form.brand} onValueChange={(val) => setForm({ ...form, brand: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="c-mm">Mes caducidad</Label>
                    <Input
                      id="c-mm"
                      type="number"
                      min="1"
                      max="12"
                      placeholder="MM"
                      value={form.expiry_month}
                      onChange={(e) => setForm({ ...form, expiry_month: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-yy">Año</Label>
                    <Input
                      id="c-yy"
                      type="number"
                      min="2000"
                      max="2099"
                      placeholder="YYYY"
                      value={form.expiry_year}
                      onChange={(e) => setForm({ ...form, expiry_year: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cuenta vinculada</Label>
                    <Select
                      value={form.account_id || "none"}
                      onValueChange={(val) => setForm({ ...form, account_id: val === "none" ? "" : val })}
                    >
                      <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.type === "CREDIT" && (
                  <div className="space-y-2">
                    <Label htmlFor="c-limit">Límite de crédito (€)</Label>
                    <Input
                      id="c-limit"
                      type="number"
                      step="0.01"
                      placeholder="3000"
                      value={form.credit_limit}
                      onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Verás el % de uso basado en el gasto de los últimos 30 días en la cuenta vinculada.</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-2 flex-wrap">
                    {COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setForm({ ...form, color: c.value })}
                        className={`w-8 h-8 rounded-md ${c.className} ${form.color === c.value ? "ring-2 ring-offset-2 ring-offset-background ring-foreground" : ""}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="c-notes">Notas</Label>
                  <textarea
                    id="c-notes"
                    rows={2}
                    placeholder="Cualquier nota"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  Activa
                </label>

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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total tarjetas" value={cards.length} />
          <Stat label="Activas" value={cards.filter((c) => c.active !== false).length} />
          <Stat label="Gasto 30d" value={fmt(monthlyTotalSpend)} />
          <Stat label="Caducan ≤3 meses" value={expiringSoon.length} tone={expiringSoon.length > 0 ? "warning" : null} />
        </div>

        {banks.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Filtrar:</span>
            <Button size="sm" variant={filterBank === "all" ? "default" : "outline"} onClick={() => setFilterBank("all")}>Todas</Button>
            {banks.map((b) => (
              <Button key={b} size="sm" variant={filterBank === b ? "default" : "outline"} onClick={() => setFilterBank(b)}>{b}</Button>
            ))}
            {cards.some((c) => !c.bank_name) && (
              <Button size="sm" variant={filterBank === "_nobank" ? "default" : "outline"} onClick={() => setFilterBank("_nobank")}>Sin banco</Button>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => <div key={i} className="h-48 rounded-lg bg-muted/50 animate-pulse" />)}
          </div>
        ) : cards.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <CreditCard className="mx-auto text-muted-foreground" size={32} />
              <p className="text-sm text-muted-foreground">Aún no tienes tarjetas registradas.</p>
              <Button variant="outline" onClick={openCreate} className="gap-2">
                <Plus size={14} /> Nueva tarjeta
              </Button>
            </CardContent>
          </Card>
        ) : (
          grouped.map(([bank, list]) => (
            <Card key={bank}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 size={18} /> {bank}
                  <Badge variant="outline" className="ml-1">{list.length} {list.length === 1 ? "tarjeta" : "tarjetas"}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {list.map((c) => <CardTile key={c.id} card={c} onEdit={openEdit} onDelete={handleDelete} />)}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </Layout>
  );
}

function Stat({ label, value, tone }) {
  const toneClass = tone === "warning" ? "text-amber-400" : "";
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold tabular-nums mt-1 ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function CardTile({ card, onEdit, onDelete }) {
  const [copied, setCopied] = useState(false);
  const expiry = card.expiry_month && card.expiry_year
    ? `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`
    : null;
  const monthsLeft = monthsUntilExpiry(card.expiry_month, card.expiry_year);
  const expiringSoon = monthsLeft != null && monthsLeft >= 0 && monthsLeft <= 3;
  const expired = monthsLeft != null && monthsLeft < 0;

  const monthlySpend = Number(card.monthly_spend || 0);
  const creditLimit = Number(card.credit_limit || 0);
  const usagePct = creditLimit > 0 ? Math.min(100, (monthlySpend / creditLimit) * 100) : 0;

  const copyLast4 = async () => {
    if (!card.last4) return;
    try {
      await navigator.clipboard.writeText(card.last4);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="space-y-2">
      <div className={`relative rounded-xl p-4 text-white shadow-md ${colorClass(card.color)} ${card.active === false ? "opacity-50" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-white/70">
              {card.brand || "—"} · {card.type === "CREDIT" ? "Crédito" : card.type === "DEBIT" ? "Débito" : card.type === "PREPAID" ? "Prepago" : "Virtual"}
            </div>
            <div className="font-semibold mt-1 truncate">{card.alias}</div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => onEdit(card)} className="p-1 rounded hover:bg-white/10" title="Editar">
              <Edit size={12} />
            </button>
            <button onClick={() => onDelete(card)} className="p-1 rounded hover:bg-white/10" title="Borrar">
              <Trash size={12} />
            </button>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-2 font-mono tracking-widest text-sm">
          <span>•••• •••• •••• {card.last4 || "????"}</span>
          {card.last4 && (
            <button onClick={copyLast4} className="p-0.5 rounded hover:bg-white/10" title="Copiar últimos 4">
              {copied ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} className="text-white/70" />}
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-white/70">
          <span className={expired ? "text-rose-300" : expiringSoon ? "text-amber-200" : ""}>
            {expired ? `Caducó ${expiry}` : expiry || ""}
          </span>
          {card.active === false && <span className="flex items-center gap-1"><Pause size={10} /> Inactiva</span>}
        </div>
      </div>

      <div className="px-1 space-y-1.5">
        {card.account_name ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LinkIcon size={11} /> {card.account_name}
          </div>
        ) : (
          <div className="text-xs text-amber-400/80 flex items-center gap-1.5">
            <AlertTriangle size={11} /> Sin cuenta vinculada
          </div>
        )}
        {card.account_id && (
          <div className="flex items-center gap-1.5 text-xs">
            <TrendingDown size={11} className="text-rose-400" />
            <span className="text-muted-foreground">Gasto 30d:</span>
            <span className="font-medium tabular-nums">{fmt(monthlySpend)}</span>
          </div>
        )}
        {card.type === "CREDIT" && creditLimit > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Uso del límite</span>
              <span className="tabular-nums font-medium">{fmt(monthlySpend)} / {fmt(creditLimit)}</span>
            </div>
            <Progress
              value={usagePct}
              className={usagePct > 80 ? "[&>div]:bg-rose-500" : usagePct > 50 ? "[&>div]:bg-amber-500" : ""}
            />
            <div className="text-[10px] text-muted-foreground text-right">{usagePct.toFixed(0)}%</div>
          </div>
        )}
        {expiringSoon && !expired && (
          <div className="flex items-center gap-1.5 text-xs text-amber-400">
            <AlertTriangle size={11} /> Caduca en {monthsLeft === 0 ? "este mes" : `${monthsLeft} ${monthsLeft === 1 ? "mes" : "meses"}`}
          </div>
        )}
      </div>
    </div>
  );
}
