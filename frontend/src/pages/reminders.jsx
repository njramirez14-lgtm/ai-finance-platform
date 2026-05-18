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
import { Bell, Plus, Trash, Check, Loader2, CalendarClock } from "lucide-react";
import api from "@/api/axios";
import useStore from "@/store";

const CATEGORIES = [
  { value: "TAX", label: "Impuestos" },
  { value: "INVOICE", label: "Factura" },
  { value: "PAYMENT", label: "Pago" },
  { value: "LEGAL", label: "Legal" },
  { value: "PAYROLL", label: "Nóminas" },
  { value: "MEETING", label: "Reunión" },
  { value: "OTHER", label: "Otro" },
];

const REPEAT = [
  { value: "NONE", label: "No se repite" },
  { value: "DAILY", label: "Diario" },
  { value: "WEEKLY", label: "Semanal" },
  { value: "MONTHLY", label: "Mensual" },
  { value: "YEARLY", label: "Anual" },
];

const empty = (entityId) => ({
  entity_id: entityId || null,
  title: "", description: "",
  category: "OTHER", due_at: "",
  repeat_rule: "NONE", status: "PENDING", notify_at: "",
});

export default function RemindersPage() {
  const entities = useStore((s) => s.entitiesCache);
  const scope = useStore((s) => s.scope);
  const currentEntityId = scope?.kind === "entity" ? scope.value : null;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty(currentEntityId));
  const [statusFilter, setStatusFilter] = useState("PENDING");

  async function load() {
    setLoading(true);
    try {
      const params = { status: statusFilter };
      if (currentEntityId) params.entity_id = currentEntityId;
      const { data } = await api.get("/reminders/", { params });
      setItems(data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [currentEntityId, statusFilter]);

  async function save() {
    const payload = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    if (!payload.due_at) {
      alert("Indica una fecha y hora");
      return;
    }
    payload.due_at = new Date(payload.due_at).toISOString();
    if (payload.notify_at) payload.notify_at = new Date(payload.notify_at).toISOString();
    if (payload.entity_id) payload.entity_id = Number(payload.entity_id);
    await api.post("/reminders/", payload);
    setOpen(false);
    setForm(empty(currentEntityId));
    load();
  }

  async function done(id) {
    await api.post(`/reminders/${id}/complete`);
    load();
  }

  async function remove(id) {
    if (!confirm("¿Borrar este recordatorio?")) return;
    await api.delete(`/reminders/${id}`);
    load();
  }

  function dueLabel(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    const diff = Math.round((d - new Date()) / (1000 * 60 * 60 * 24));
    const human = d.toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
    if (diff < 0) return <span className="text-rose-500">{human} (vencido)</span>;
    if (diff === 0) return <span className="text-amber-500">{human} (hoy)</span>;
    if (diff <= 3) return <span className="text-amber-500">{human} (en {diff}d)</span>;
    return <span>{human}</span>;
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Bell className="h-7 w-7" /> Recordatorios</h1>
            <p className="text-muted-foreground">Impuestos, facturas, vencimientos legales. Recurrentes opcionales.</p>
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pendientes</SelectItem>
                <SelectItem value="DONE">Completados</SelectItem>
                <SelectItem value="SNOOZED">Pospuestos</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={open} onOpenChange={setOpen}>
              <Button onClick={() => { setForm(empty(currentEntityId)); setOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo
              </Button>
              <DialogContent className="max-w-xl">
                <DialogHeader><DialogTitle>Nuevo recordatorio</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Pagar IVA trimestral" /></div>
                  <div>
                    <Label>Categoría</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Entidad (opcional)</Label>
                    <Select value={form.entity_id ? String(form.entity_id) : "_none"} onValueChange={(v) => setForm({ ...form, entity_id: v === "_none" ? null : v })}>
                      <SelectTrigger><SelectValue placeholder="Ninguna" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— Personal —</SelectItem>
                        {(entities || []).map((e) => (
                          <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Vencimiento</Label><Input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></div>
                  <div>
                    <Label>Repetición</Label>
                    <Select value={form.repeat_rule} onValueChange={(v) => setForm({ ...form, repeat_rule: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{REPEAT.map((r) => (<SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2"><Label>Notas</Label><Input value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={save} disabled={!form.title || !form.due_at}>Guardar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4" />Lista</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" /></div>
            ) : items.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No hay recordatorios {statusFilter === "PENDING" ? "pendientes" : ""}.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead>Repite</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.title}
                        {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                      </TableCell>
                      <TableCell><Badge variant="secondary">{CATEGORIES.find((c) => c.value === r.category)?.label || r.category}</Badge></TableCell>
                      <TableCell className="text-sm">{dueLabel(r.due_at)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{REPEAT.find((x) => x.value === r.repeat_rule)?.label || "—"}</TableCell>
                      <TableCell>
                        {r.status === "PENDING" && (
                          <Button size="icon" variant="ghost" onClick={() => done(r.id)} title="Marcar hecho"><Check className="h-4 w-4 text-emerald-500" /></Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash className="h-4 w-4" /></Button>
                      </TableCell>
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
