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
import {
  Plus, Edit, Trash, Loader2, AlertCircle, TrendingUp, TrendingDown, Minus,
  ShoppingCart, DollarSign, RefreshCw, Search, X,
} from "lucide-react";
import api from "@/api/axios";

const ASSET_TYPES = [
  { value: "STOCK", label: "Acción" },
  { value: "ETF", label: "ETF" },
  { value: "CRYPTO", label: "Cripto" },
  { value: "BOND", label: "Bono" },
  { value: "OTHER", label: "Otro" },
];

const BROKERS = ["Trade Republic", "Interactive Brokers", "DEGIRO", "MyInvestor", "Renta 4", "Binance", "Coinbase", "Otro"];

const fmt = (n, c = "EUR") =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: c }).format(Number(n) || 0);
const fmtPct = (n) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`);

const emptyForm = () => ({
  symbol: "",
  isin: "",
  name: "",
  asset_type: "STOCK",
  quantity: "",
  avg_buy_price: "",
  currency: "EUR",
  broker: "Trade Republic",
  account_id: "",
  notes: "",
});

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  // Symbol search inside the add modal
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Trade dialogs
  const [tradeMode, setTradeMode] = useState(null); // 'buy' | 'sell' | null
  const [tradeTarget, setTradeTarget] = useState(null);
  const [tradeQty, setTradeQty] = useState("");
  const [tradePrice, setTradePrice] = useState("");
  const [tradeBusy, setTradeBusy] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const [h, s, a] = await Promise.all([
        api.get("/holdings/"),
        api.get("/holdings/summary").catch(() => ({ data: null })),
        api.get("/accounts/").catch(() => ({ data: [] })),
      ]);
      setHoldings(h.data);
      setSummary(s.data);
      setAccounts(a.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Error cargando cartera");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); load(); }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setSearchQuery("");
    setSearchResults([]);
    setOpen(true);
  };

  const openEdit = (h) => {
    setEditing(h);
    setForm({
      symbol: h.symbol,
      isin: h.isin || "",
      name: h.name || "",
      asset_type: h.asset_type,
      quantity: String(h.quantity ?? ""),
      avg_buy_price: String(h.avg_buy_price ?? ""),
      currency: h.currency || "EUR",
      broker: h.broker || "Trade Republic",
      account_id: h.account_id ? String(h.account_id) : "",
      notes: h.notes || "",
    });
    setSearchQuery("");
    setSearchResults([]);
    setOpen(true);
  };

  const doSearch = async (q) => {
    setSearchQuery(q);
    if (q.length < 1) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data } = await api.get(`/holdings/search/${encodeURIComponent(q)}`);
      setSearchResults(Array.isArray(data) ? data.slice(0, 6) : []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const pickResult = (r) => {
    setForm((f) => ({
      ...f,
      symbol: r.symbol,
      name: r.name || f.name,
      currency: r.currency || f.currency,
    }));
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleSave = async () => {
    if (!form.symbol.trim()) { setError("El símbolo es obligatorio"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        symbol: form.symbol.toUpperCase().trim(),
        isin: form.isin.toUpperCase().trim() || null,
        name: form.name.trim() || null,
        asset_type: form.asset_type,
        quantity: parseFloat(form.quantity) || 0,
        avg_buy_price: parseFloat(form.avg_buy_price) || 0,
        currency: (form.currency || "EUR").toUpperCase(),
        broker: form.broker || null,
        account_id: form.account_id ? parseInt(form.account_id, 10) : null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await api.put(`/holdings/${editing.id}`, payload);
      } else {
        await api.post("/holdings/", payload);
      }
      setOpen(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (h) => {
    if (!window.confirm(`¿Borrar la posición "${h.symbol}"?`)) return;
    try {
      await api.delete(`/holdings/${h.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error borrando");
    }
  };

  const openTrade = (h, mode) => {
    setTradeMode(mode);
    setTradeTarget(h);
    setTradeQty("");
    setTradePrice(h.current_price ? String(h.current_price) : String(h.avg_buy_price || ""));
  };

  const submitTrade = async () => {
    if (!tradeTarget) return;
    const q = parseFloat(tradeQty);
    const p = parseFloat(tradePrice);
    if (!q || q <= 0) { setError("Cantidad inválida"); return; }
    if (!p || p <= 0) { setError("Precio inválido"); return; }
    setTradeBusy(true);
    try {
      await api.post(`/holdings/${tradeTarget.id}/${tradeMode}`, {
        quantity: q,
        price: p,
      });
      setTradeMode(null); setTradeTarget(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error en la operación");
    } finally {
      setTradeBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const map = {};
    for (const h of holdings) {
      const key = h.broker || "Sin broker";
      if (!map[key]) map[key] = [];
      map[key].push(h);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [holdings]);

  const totalPnl = Number(summary?.total_pnl || 0);
  const totalPct = Number(summary?.total_pnl_pct || 0);

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <TrendingUp size={22} /> Cartera
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tus inversiones: acciones, ETFs, cripto. Precios en vivo vía FMP. Coste medio recalculado en cada compra.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} className="gap-1.5">
              {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Actualizar precios
            </Button>
            <Button onClick={openCreate} className="gap-2"><Plus size={16} /> Nueva posición</Button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} className="hover:text-rose-300"><X size={14} /></button>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Posiciones" value={summary?.positions ?? "—"} />
          <Stat label="Invertido" value={fmt(summary?.total_cost || 0)} />
          <Stat label="Valor actual" value={fmt(summary?.total_value || 0)} tone="indigo" />
          <Stat
            label="P&L total"
            value={`${totalPnl >= 0 ? "+" : ""}${fmt(totalPnl)}`}
            hint={fmtPct(totalPct)}
            tone={totalPnl >= 0 ? "emerald" : "rose"}
          />
        </div>

        {loading ? (
          <Card><CardContent className="pt-6 space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded bg-muted/50" />)}
          </CardContent></Card>
        ) : holdings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <TrendingUp className="mx-auto text-muted-foreground" size={32} />
              <p className="text-sm text-muted-foreground">Aún no tienes posiciones. Añade tu primera inversión.</p>
              <Button variant="outline" onClick={openCreate} className="gap-2">
                <Plus size={14} /> Nueva posición
              </Button>
            </CardContent>
          </Card>
        ) : (
          grouped.map(([broker, items]) => (
            <Card key={broker}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {broker} · {items.length} {items.length === 1 ? "posición" : "posiciones"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Símbolo</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-right w-24">Cantidad</TableHead>
                      <TableHead className="text-right w-28">Coste medio</TableHead>
                      <TableHead className="text-right w-28">Precio actual</TableHead>
                      <TableHead className="text-right w-28">Valor</TableHead>
                      <TableHead className="text-right w-32">P&L</TableHead>
                      <TableHead className="w-32"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((h) => {
                      const pnl = Number(h.unrealized_pnl ?? 0);
                      const pnlPct = h.unrealized_pnl_pct == null ? null : Number(h.unrealized_pnl_pct);
                      const todayPct = h.change_today_pct == null ? null : Number(h.change_today_pct);
                      const pnlTone = pnl > 0 ? "text-emerald-400" : pnl < 0 ? "text-rose-400" : "text-muted-foreground";
                      return (
                        <TableRow key={h.id}>
                          <TableCell className="font-mono font-semibold">
                            {h.symbol}
                            {todayPct != null && (
                              <span className={`block text-[10px] font-normal ${todayPct > 0 ? "text-emerald-400" : todayPct < 0 ? "text-rose-400" : "text-muted-foreground"}`}>
                                hoy {fmtPct(todayPct)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{h.name || "—"}</div>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                              <Badge variant="outline" className="text-[9px]">{h.asset_type}</Badge>
                              {h.isin && <span className="font-mono">{h.isin}</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-sm">
                            {Number(h.quantity || 0).toLocaleString("es-ES", { maximumFractionDigits: 8 })}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-sm">{fmt(h.avg_buy_price, h.currency)}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-sm">
                            {h.current_price != null ? fmt(h.current_price, h.currency) : <span className="text-muted-foreground/60">—</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums font-semibold">
                            {h.current_value != null ? fmt(h.current_value, h.currency) : fmt(h.cost_basis, h.currency)}
                          </TableCell>
                          <TableCell className={`text-right font-mono tabular-nums font-semibold ${pnlTone}`}>
                            {h.current_price != null ? (
                              <>
                                <div>{pnl >= 0 ? "+" : ""}{fmt(pnl, h.currency)}</div>
                                <div className="text-[10px]">{pnlPct != null ? fmtPct(pnlPct) : ""}</div>
                              </>
                            ) : (
                              <span className="text-muted-foreground/60">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openTrade(h, "buy")} title="Comprar más" className="text-emerald-400 hover:text-emerald-300">
                                <ShoppingCart size={13} />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openTrade(h, "sell")} title="Vender" className="text-rose-400 hover:text-rose-300" disabled={Number(h.quantity || 0) <= 0}>
                                <DollarSign size={13} />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(h)} title="Editar">
                                <Edit size={13} />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(h)} title="Borrar">
                                <Trash size={13} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar posición" : "Nueva posición"}</DialogTitle>
            <DialogDescription>
              Busca por símbolo o nombre (Apple, VWCE, Bitcoin…) y rellena cantidad + coste medio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[65vh] overflow-y-auto pr-1">
            {!editing && (
              <div className="space-y-2">
                <Label>Buscar símbolo</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <Input
                    placeholder="Apple, VWCE, BTC…"
                    value={searchQuery}
                    onChange={(e) => doSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                {searching && <div className="text-xs text-muted-foreground">Buscando…</div>}
                {searchResults.length > 0 && (
                  <div className="border border-border rounded-md divide-y divide-border max-h-40 overflow-y-auto">
                    {searchResults.map((r) => (
                      <button
                        key={`${r.symbol}-${r.exchangeShortName || r.exchange || ""}`}
                        type="button"
                        onClick={() => pickResult(r)}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
                      >
                        <div className="font-mono font-semibold">{r.symbol}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.name} · {r.exchangeShortName || r.exchange}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="h-symbol">Símbolo</Label>
                <Input
                  id="h-symbol"
                  placeholder="AAPL, VWCE.DE, BTC-USD"
                  value={form.symbol}
                  onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.asset_type} onValueChange={(v) => setForm({ ...form, asset_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="h-name">Nombre</Label>
              <Input
                id="h-name"
                placeholder="Apple Inc."
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="h-isin">ISIN (opcional)</Label>
              <Input
                id="h-isin"
                placeholder="US0378331005"
                value={form.isin}
                onChange={(e) => setForm({ ...form, isin: e.target.value })}
                className="font-mono text-sm"
                maxLength={20}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="h-qty">Cantidad</Label>
                <Input
                  id="h-qty"
                  type="number"
                  step="0.00000001"
                  placeholder="10"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="h-price">Coste medio</Label>
                <Input
                  id="h-price"
                  type="number"
                  step="0.0001"
                  placeholder="150.25"
                  value={form.avg_buy_price}
                  onChange={(e) => setForm({ ...form, avg_buy_price: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                  maxLength={4}
                />
              </div>
              <div className="space-y-2">
                <Label>Broker</Label>
                <Select value={form.broker} onValueChange={(v) => setForm({ ...form, broker: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BROKERS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cuenta de cash asociada (opcional)</Label>
              <Select
                value={form.account_id || "none"}
                onValueChange={(v) => setForm({ ...form, account_id: v === "none" ? "" : v })}
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
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando…</> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Buy/Sell dialog */}
      <Dialog open={tradeMode !== null} onOpenChange={(o) => !o && setTradeMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tradeMode === "buy" ? "Comprar más" : "Vender"} {tradeTarget?.symbol}
            </DialogTitle>
            <DialogDescription>
              {tradeMode === "buy"
                ? "El coste medio se recalcula automáticamente con esta nueva compra."
                : "Reduce las unidades. La rentabilidad realizada no se guarda todavía."}
              {tradeTarget && (
                <span className="block mt-1 text-xs">
                  Actualmente: <strong>{Number(tradeTarget.quantity || 0).toLocaleString("es-ES", { maximumFractionDigits: 8 })}</strong> a coste medio {fmt(tradeTarget.avg_buy_price, tradeTarget.currency)}.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  step="0.00000001"
                  value={tradeQty}
                  onChange={(e) => setTradeQty(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Precio por unidad</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={tradePrice}
                  onChange={(e) => setTradePrice(e.target.value)}
                />
              </div>
            </div>
            {tradeQty && tradePrice && (
              <div className="text-xs text-muted-foreground p-2 rounded bg-muted/40">
                Total: {fmt(parseFloat(tradeQty) * parseFloat(tradePrice) || 0, tradeTarget?.currency)}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTradeMode(null)}>Cancelar</Button>
            <Button
              onClick={submitTrade}
              disabled={tradeBusy}
              className={tradeMode === "buy" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}
            >
              {tradeBusy
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando…</>
                : tradeMode === "buy" ? "Comprar" : "Vender"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function Stat({ label, value, hint, tone }) {
  const tones = {
    emerald: "text-emerald-500",
    rose: "text-rose-500",
    indigo: "text-indigo-400",
  };
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold tabular-nums mt-1 ${tones[tone] || ""}`}>{value}</div>
        {hint && <div className={`text-xs mt-1 ${tones[tone] || "text-muted-foreground"}`}>{hint}</div>}
      </CardContent>
    </Card>
  );
}
