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
import { Plus, Trash, Loader2, Users, Mail, Phone, AlertCircle, FolderOpen } from "lucide-react";
import api from "@/api/axios";
import useStore from "@/store";
import { EmployeeDetailDialog } from "@/components/employee-detail-dialog";

const CONTRACTS = [
  { value: "FULL_TIME", label: "Jornada completa" },
  { value: "PART_TIME", label: "Media jornada" },
  { value: "FREELANCE", label: "Autónomo / freelance" },
  { value: "INTERN", label: "Prácticas" },
  { value: "OTHER", label: "Otro" },
];

const fmt = (n) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

const empty = (entityId) => ({
  entity_id: entityId || "",
  name: "", role: "", email: "", phone: "",
  contract_type: "FULL_TIME", start_date: "", end_date: "",
  status: "ACTIVE", monthly_salary: "", payment_day: "",
  currency: "EUR", notes: "",
});

export default function EmployeesPage() {
  const entities = useStore((s) => s.entitiesCache);
  const scope = useStore((s) => s.scope);
  const currentEntityId = scope?.kind === "entity" ? scope.value : null;

  const [items, setItems] = useState([]);
  const [payroll, setPayroll] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty(currentEntityId));
  const [detailEmp, setDetailEmp] = useState(null);

  const companyEntities = (entities || []).filter((e) => e.type === "BUSINESS");

  async function load() {
    setLoading(true);
    try {
      const params = currentEntityId ? { entity_id: currentEntityId } : {};
      const [a, p] = await Promise.all([
        api.get("/employees/", { params }),
        api.get("/employees/payroll", { params }).catch(() => ({ data: null })),
      ]);
      setItems(a.data || []);
      setPayroll(p.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [currentEntityId]);

  async function save() {
    const payload = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    if (!payload.entity_id) {
      alert("Selecciona una entidad empresa primero (cambia el switcher arriba)");
      return;
    }
    payload.entity_id = Number(payload.entity_id);
    payload.monthly_salary = Number(payload.monthly_salary || 0);
    if (payload.payment_day != null) payload.payment_day = Number(payload.payment_day);
    await api.post("/employees/", payload);
    setOpen(false);
    setForm(empty(currentEntityId));
    load();
  }

  async function remove(id) {
    if (!confirm("¿Borrar este empleado?")) return;
    await api.delete(`/employees/${id}`);
    load();
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Users className="h-7 w-7" /> Empleados</h1>
            <p className="text-muted-foreground">CRM ligero del equipo: contratos, sueldos y próximas nóminas.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <Button onClick={() => { setForm(empty(currentEntityId)); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Añadir empleado
            </Button>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Nuevo empleado</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Empresa</Label>
                  <Select value={String(form.entity_id || "")} onValueChange={(v) => setForm({ ...form, entity_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecciona empresa" /></SelectTrigger>
                    <SelectContent>
                      {companyEntities.map((e) => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2"><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Puesto</Label><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
                <div>
                  <Label>Contrato</Label>
                  <Select value={form.contract_type} onValueChange={(v) => setForm({ ...form, contract_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CONTRACTS.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>Fecha alta</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label>Fecha baja (opcional)</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
                <div><Label>Sueldo mensual bruto (€)</Label><Input type="number" value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })} /></div>
                <div><Label>Día de pago (1-31)</Label><Input type="number" min="1" max="31" value={form.payment_day} onChange={(e) => setForm({ ...form, payment_day: e.target.value })} /></div>
                <div className="col-span-2"><Label>Notas</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save} disabled={!form.name || !form.entity_id}>Guardar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {companyEntities.length === 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <strong>Crea primero una entidad de tipo "empresa"</strong> en <a href="/entities" className="underline">Entidades</a> y selecciónala arriba para empezar a añadir empleados.
              </div>
            </CardContent>
          </Card>
        )}

        {payroll && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Empleados activos" value={payroll.active_employees} />
            <Stat label="Nómina mensual" value={fmt(payroll.total_monthly)} />
            <Stat label="Coste anual" value={fmt(payroll.total_annual)} note="14 pagas" />
            <Stat label="Próximo pago" value={payroll.next_paydays?.[0]?.name || "—"} note={payroll.next_paydays?.[0] ? `en ${payroll.next_paydays[0].days_until}d` : ""} />
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>Plantilla</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin" /></div>
            ) : items.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">Sin empleados todavía.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Puesto</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Contrato</TableHead>
                    <TableHead className="text-right">Sueldo/mes</TableHead>
                    <TableHead>Día pago</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium cursor-pointer hover:underline" onClick={() => setDetailEmp(e)}>{e.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.role || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {e.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{e.email}</div>}
                        {e.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{e.phone}</div>}
                      </TableCell>
                      <TableCell><Badge variant="secondary">{CONTRACTS.find((c) => c.value === e.contract_type)?.label || e.contract_type || "—"}</Badge></TableCell>
                      <TableCell className="text-right">{fmt(e.monthly_salary)}</TableCell>
                      <TableCell>{e.payment_day ? `día ${e.payment_day}` : "—"}</TableCell>
                      <TableCell><Badge variant={e.status === "ACTIVE" ? "default" : "outline"}>{e.status}</Badge></TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => setDetailEmp(e)} title="Documentos y bajas"><FolderOpen className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(e.id)}><Trash className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <EmployeeDetailDialog
          employee={detailEmp}
          open={!!detailEmp}
          onClose={() => setDetailEmp(null)}
          onChanged={load}
        />

        {payroll?.next_paydays?.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Calendario de nóminas</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Empleado</TableHead><TableHead className="text-right">Sueldo</TableHead><TableHead>Próximo pago</TableHead><TableHead className="text-right">Faltan</TableHead></TableRow></TableHeader>
                <TableBody>
                  {payroll.next_paydays.map((p) => (
                    <TableRow key={p.employee_id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">{fmt(p.salary)}</TableCell>
                      <TableCell>{new Date(p.next_payday).toLocaleDateString("es-ES")}</TableCell>
                      <TableCell className="text-right">{p.days_until} días</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}

function Stat({ label, value, note }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {note && <div className="text-xs text-muted-foreground mt-1">{note}</div>}
      </CardContent>
    </Card>
  );
}
