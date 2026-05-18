import { useEffect, useState } from "react";
import Layout from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
import { Plus, Trash, Loader2, Car, TrendingUp, TrendingDown } from "lucide-react";
import api from "@/api/axios";

const TYPES = [
  { value: "CAR", label: "Coche" },
  { value: "MOTORCYCLE", label: "Moto" },
  { value: "BICYCLE", label: "Bici" },
  { value: "BOAT", label: "Barco" },
  { value: "TRUCK", label: "Furgoneta/Camión" },
  { value: "OTHER", label: "Otro" },
];

const fmt = (n, c = "EUR") =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: c }).format(Number(n) || 0);

const empty = () => ({
  name: "",
  vehicle_type: "CAR",
  make: "",
  model: "",
  year: "",
  license_plate: "",
  purchase_date: "",
  purchase_price: "",
  current_value: "",
  monthly_income: "",
  monthly_expenses: "",
  currency: "EUR",
  notes: "",
  liability_id: "",
});

export default function VehiclesPage() {
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
        api.get("/vehicles/"),
        api.get("/vehicles/summary"),
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
    payload.monthly_income = Number(payload.monthly_income || 0);
    payload.monthly_expenses = Number(payload.monthly_expenses || 0);
    if (payload.current_value != null) payload.current_value = Number(payload.current_value);
    if (payload.year != null) payload.year = Number(payload.year);
    if (payload.liability_id) payload.liability_id = Number(payload.liability_id);
    await api.post("/vehicles/", payload);
    setOpen(false);
    setForm(empty());
    load();
  }

  async function remove(id) {
    if (!confirm("¿Borrar este vehículo?")) return;
    await api.delete(`/vehicles/${id}`);
    load();
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Car className="h-7 w-7" /> Vehículos</h1>
            <p className="text-muted-foreground">Valor, financiación, depreciación y coste mensual por vehículo.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <Button onClick={() => { setForm(empty()); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Añadir vehículo
            </Button>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Nuevo vehículo</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Nombre / alias</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tesla Model 3" /></div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.vehicle_type} onValueChange={(v) => setForm({ ...form, vehicle_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Préstamo asociado (opcional)</Label>
                  <Select value={form.liability_id || "_none"} onValueChange={(v) => setForm({ ...form, liability_id: v === "_none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Ninguno" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Sin financiación —</SelectItem>
                      {liabilities.filter((l) => l.type === "LOAN").map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>{l.name} ({fmt(l.current_balance)})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Marca</Label><Input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} /></div>
                <div><Label>Modelo</Label><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
                <div><Label>Año</Label><Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
                <div><Label>Matrícula</Label><Input value={form.license_plate} onChange={(e) => setForm({ ...form, license_plate: e.target.value })} /></div>
                <div><Label>Fecha compra</Label><Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div>
                <div><Label>Precio compra (€)</Label><Input type="number" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} /></div>
                <div><Label>Valor actual (€)</Label><Input type="number" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} /></div>
                <div><Label>Ingresos mensuales (€)</Label><Input type="number" value={form.monthly_income} onChange={(e) => setForm({ ...form, monthly_income: e.target.value })} placeholder="alquiler, Uber, flota…" /></div>
                <div className="col-span-2"><Label>Gastos mensuales (€)</Label><Input type="number" value={form.monthly_expenses} onChange={(e) => setForm({ ...form, monthly_expenses: e.target.value })} placeholder="seguro, combustible, mantenimiento, parking" /></div>
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
            <Stat label="Valor total" value={fmt(summary.total_value)} />
            <Stat label="Equity" value={fmt(summary.total_equity)} />
            <Stat label="Cashflow mensual" value={fmt(summary.total_monthly_net)} positive={summary.total_monthly_net >= 0} />
            <Stat label="Vehículos" value={summary.count} />
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>Mis vehículos</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" /></div>
            ) : items.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">Aún no has añadido vehículos.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="text-right">Valor actual</TableHead>
                    <TableHead className="text-right">Equity</TableHead>
                    <TableHead className="text-right">Cashflow/mes</TableHead>
                    <TableHead className="text-right">Depreciación</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell><Badge variant="secondary">{TYPES.find((t) => t.value === v.vehicle_type)?.label || v.vehicle_type}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{[v.make, v.model, v.year].filter(Boolean).join(" ") || "—"}</TableCell>
                      <TableCell className="text-right">{fmt(v.current_value || v.purchase_price, v.currency)}</TableCell>
                      <TableCell className="text-right">{fmt(v.equity, v.currency)}</TableCell>
                      <TableCell className={`text-right ${Number(v.monthly_net_cashflow) >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(v.monthly_net_cashflow, v.currency)}</TableCell>
                      <TableCell className="text-right">{v.depreciation_pct != null ? `${v.depreciation_pct.toFixed(1)}%` : "—"}</TableCell>
                      <TableCell><Button size="icon" variant="ghost" onClick={() => remove(v.id)}><Trash className="h-4 w-4" /></Button></TableCell>
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

function Stat({ label, value, positive }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${positive === false ? "text-red-600" : positive === true ? "text-green-600" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
