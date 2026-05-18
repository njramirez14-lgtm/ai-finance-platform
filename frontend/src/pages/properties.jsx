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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash, Loader2, Building, TrendingUp, TrendingDown, Home, MapPin,
} from "lucide-react";
import api from "@/api/axios";

const TYPES = [
  { value: "RESIDENCE", label: "Vivienda habitual" },
  { value: "RENTAL", label: "Alquiler" },
  { value: "VACATION", label: "Segunda residencia" },
  { value: "COMMERCIAL", label: "Comercial" },
  { value: "LAND", label: "Terreno" },
  { value: "OTHER", label: "Otro" },
];

const fmt = (n, c = "EUR") =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: c }).format(Number(n) || 0);

const empty = () => ({
  name: "",
  property_type: "RESIDENCE",
  address: "",
  city: "",
  country: "España",
  area_m2: "",
  purchase_date: "",
  purchase_price: "",
  current_value: "",
  monthly_rental_income: "",
  monthly_expenses: "",
  currency: "EUR",
  notes: "",
  liability_id: "",
});

export default function PropertiesPage() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [liabilities, setLiabilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());

  async function load() {
    setLoading(true);
    try {
      const [a, s, l] = await Promise.all([
        api.get("/properties/"),
        api.get("/properties/summary"),
        api.get("/liabilities/").catch(() => ({ data: [] })),
      ]);
      setItems(a.data || []);
      setSummary(s.data || null);
      setLiabilities(l.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    const payload = { ...form };
    Object.keys(payload).forEach((k) => {
      if (payload[k] === "") payload[k] = null;
    });
    payload.purchase_price = Number(payload.purchase_price || 0);
    payload.monthly_rental_income = Number(payload.monthly_rental_income || 0);
    payload.monthly_expenses = Number(payload.monthly_expenses || 0);
    if (payload.current_value != null) payload.current_value = Number(payload.current_value);
    if (payload.area_m2 != null) payload.area_m2 = Number(payload.area_m2);
    if (payload.liability_id) payload.liability_id = Number(payload.liability_id);
    await api.post("/properties/", payload);
    setOpen(false);
    setForm(empty());
    load();
  }

  async function remove(id) {
    if (!confirm("¿Borrar esta propiedad?")) return;
    await api.delete(`/properties/${id}`);
    load();
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Building className="h-7 w-7" /> Propiedades</h1>
            <p className="text-muted-foreground">Asesor inmobiliario: equity, cashflow, rentabilidad por inmueble.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <Button onClick={() => { setForm(empty()); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Añadir propiedad
            </Button>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Nueva propiedad</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nombre / alias</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Piso Madrid Salamanca" />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.property_type} onValueChange={(v) => setForm({ ...form, property_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Hipoteca asociada (opcional)</Label>
                  <Select value={form.liability_id || "_none"} onValueChange={(v) => setForm({ ...form, liability_id: v === "_none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Ninguna" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Sin hipoteca —</SelectItem>
                      {liabilities.filter((l) => l.type === "MORTGAGE").map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>{l.name} ({fmt(l.current_balance)})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Dirección</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div><Label>Ciudad</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                <div><Label>País</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
                <div><Label>Superficie (m²)</Label><Input type="number" value={form.area_m2} onChange={(e) => setForm({ ...form, area_m2: e.target.value })} /></div>
                <div><Label>Fecha compra</Label><Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div>
                <div><Label>Precio compra (€)</Label><Input type="number" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} /></div>
                <div><Label>Valor actual (€)</Label><Input type="number" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} /></div>
                <div><Label>Alquiler mensual (€)</Label><Input type="number" value={form.monthly_rental_income} onChange={(e) => setForm({ ...form, monthly_rental_income: e.target.value })} placeholder="0 si no alquilas" /></div>
                <div><Label>Gastos mensuales (€)</Label><Input type="number" value={form.monthly_expenses} onChange={(e) => setForm({ ...form, monthly_expenses: e.target.value })} placeholder="comunidad, IBI, seguros…" /></div>
                <div className="col-span-2"><Label>Notas</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save} disabled={!form.name}>Guardar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Valor total" value={fmt(summary.total_value)} icon={Home} />
            <SummaryCard label="Equity" value={fmt(summary.total_equity)} icon={TrendingUp} />
            <SummaryCard label="Cashflow mensual" value={fmt(summary.total_monthly_net)} icon={summary.total_monthly_net >= 0 ? TrendingUp : TrendingDown} positive={summary.total_monthly_net >= 0} />
            <SummaryCard label="Inmuebles" value={summary.count} icon={Building} />
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>Mis propiedades</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" /></div>
            ) : items.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">Aún no has añadido propiedades. Pulsa "Añadir propiedad" para empezar.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead className="text-right">Valor actual</TableHead>
                    <TableHead className="text-right">Equity</TableHead>
                    <TableHead className="text-right">Cashflow/mes</TableHead>
                    <TableHead className="text-right">Yield anual</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell><Badge variant="secondary">{TYPES.find((t) => t.value === p.property_type)?.label || p.property_type}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground"><MapPin className="inline h-3 w-3 mr-1" />{[p.city, p.country].filter(Boolean).join(", ") || "—"}</TableCell>
                      <TableCell className="text-right">{fmt(p.current_value || p.purchase_price, p.currency)}</TableCell>
                      <TableCell className="text-right">{fmt(p.equity, p.currency)}</TableCell>
                      <TableCell className={`text-right ${Number(p.monthly_net_cashflow) >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(p.monthly_net_cashflow, p.currency)}</TableCell>
                      <TableCell className="text-right">{p.annual_yield_pct != null ? `${p.annual_yield_pct.toFixed(2)}%` : "—"}</TableCell>
                      <TableCell><Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function SummaryCard({ label, value, icon: Icon, positive }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
        <div className={`text-2xl font-bold mt-1 ${positive === false ? "text-red-600" : positive === true ? "text-green-600" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
