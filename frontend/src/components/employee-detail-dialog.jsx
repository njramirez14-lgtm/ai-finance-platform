import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  FileText, Plus, Trash, ExternalLink, Loader2, CalendarOff, User as UserIcon,
} from "lucide-react";
import api from "@/api/axios";

const DOC_TYPES = [
  { value: "CONTRACT", label: "Contrato" },
  { value: "ID", label: "DNI / NIE" },
  { value: "PAYSLIP", label: "Nómina" },
  { value: "SICK_NOTE", label: "Parte de baja médica" },
  { value: "VACATION_REQUEST", label: "Solicitud de vacaciones" },
  { value: "NDA", label: "NDA / confidencialidad" },
  { value: "TAX_FORM", label: "Modelo fiscal" },
  { value: "CV", label: "CV" },
  { value: "OTHER", label: "Otro" },
];

const LEAVE_TYPES = [
  { value: "SICK", label: "Baja médica", color: "bg-rose-500" },
  { value: "VACATION", label: "Vacaciones", color: "bg-emerald-500" },
  { value: "UNPAID", label: "Sin sueldo", color: "bg-slate-500" },
  { value: "MATERNITY", label: "Maternidad", color: "bg-pink-500" },
  { value: "PATERNITY", label: "Paternidad", color: "bg-blue-500" },
  { value: "FAMILY", label: "Familiar", color: "bg-amber-500" },
  { value: "OTHER", label: "Otro", color: "bg-zinc-500" },
];

const PROVIDER_LABEL = {
  GOOGLE_DRIVE: "Google Drive",
  DROPBOX: "Dropbox",
  ONEDRIVE: "OneDrive",
  LINK: "Enlace",
  LOCAL: "Local",
};

export function EmployeeDetailDialog({ employee, open, onClose, onChanged }) {
  if (!employee) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5" /> {employee.name}
            <Badge variant="secondary" className="ml-2">{employee.role || "—"}</Badge>
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="docs">
          <TabsList>
            <TabsTrigger value="docs"><FileText className="h-4 w-4 mr-1" />Documentos</TabsTrigger>
            <TabsTrigger value="leaves"><CalendarOff className="h-4 w-4 mr-1" />Bajas y vacaciones</TabsTrigger>
          </TabsList>
          <TabsContent value="docs">
            <DocumentsTab employee={employee} onChanged={onChanged} />
          </TabsContent>
          <TabsContent value="leaves">
            <LeavesTab employee={employee} onChanged={onChanged} />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentsTab({ employee, onChanged }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyDoc(employee.id));
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/employee-documents/", { params: { employee_id: employee.id } });
      setDocs(data || []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [employee.id]);

  async function save() {
    const payload = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    await api.post("/employee-documents/", payload);
    setForm(emptyDoc(employee.id));
    setAdding(false);
    load();
    onChanged?.();
  }

  async function remove(id) {
    if (!confirm("¿Borrar este documento?")) return;
    await api.delete(`/employee-documents/${id}`);
    load();
    onChanged?.();
  }

  return (
    <div className="space-y-4 py-2">
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="py-3 text-xs space-y-1">
          <div className="font-medium">Conectar con Google Drive / Dropbox / OneDrive</div>
          <div className="text-muted-foreground">
            Pega el link compartido del documento. Detectamos automáticamente la fuente y, si es Drive, extraemos el file ID.
            Para conexión OAuth nativa (file picker), pendiente — por ahora paste-link es la vía rápida y segura.
          </div>
        </CardContent>
      </Card>

      {!adding && (
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1" />Añadir documento</Button>
      )}
      {adding && (
        <Card>
          <CardContent className="pt-4 grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Contrato Indefinido 2026" /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.doc_type} onValueChange={(v) => setForm({ ...form, doc_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Fecha emisión</Label><Input type="date" value={form.issued_date} onChange={(e) => setForm({ ...form, issued_date: e.target.value })} /></div>
            <div className="col-span-2"><Label>Link (Drive, Dropbox, OneDrive o cualquier URL)</Label><Input value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} placeholder="https://drive.google.com/file/d/..." /></div>
            <div><Label>Vence (opcional)</Label><Input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></div>
            <div className="col-span-2"><Label>Notas</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="col-span-2 flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => { setAdding(false); setForm(emptyDoc(employee.id)); }}>Cancelar</Button>
              <Button onClick={save} disabled={!form.title}>Guardar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? <div className="text-center py-6"><Loader2 className="animate-spin inline" /></div> :
       docs.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Sin documentos.</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Título</TableHead><TableHead>Tipo</TableHead><TableHead>Fuente</TableHead><TableHead>Vence</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {docs.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.title}</TableCell>
                <TableCell><Badge variant="secondary">{DOC_TYPES.find((t) => t.value === d.doc_type)?.label || d.doc_type}</Badge></TableCell>
                <TableCell className="text-xs">
                  {d.provider && <Badge variant="outline" className="mr-1">{PROVIDER_LABEL[d.provider] || d.provider}</Badge>}
                  {d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer" className="text-blue-500 underline inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />Abrir</a>}
                </TableCell>
                <TableCell className="text-xs">{d.expires_at ? new Date(d.expires_at).toLocaleDateString("es-ES") : "—"}</TableCell>
                <TableCell><Button size="icon" variant="ghost" onClick={() => remove(d.id)}><Trash className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function LeavesTab({ employee, onChanged }) {
  const [leaves, setLeaves] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyLeave(employee.id));
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([
        api.get("/employee-leaves/", { params: { employee_id: employee.id } }),
        api.get("/employee-leaves/summary", { params: { employee_id: employee.id } }).catch(() => ({ data: null })),
      ]);
      setLeaves(l.data || []);
      setSummary(s.data);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [employee.id]);

  async function save() {
    const payload = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    if (!payload.start_date) { alert("Falta fecha de inicio"); return; }
    await api.post("/employee-leaves/", payload);
    setForm(emptyLeave(employee.id));
    setAdding(false);
    load();
    onChanged?.();
  }

  async function remove(id) {
    if (!confirm("¿Borrar?")) return;
    await api.delete(`/employee-leaves/${id}`);
    load();
    onChanged?.();
  }

  return (
    <div className="space-y-4 py-2">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Vacaciones disfrutadas {summary.year}</div><div className="text-2xl font-bold">{summary.vacation_taken_days}d</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Vacaciones planificadas</div><div className="text-2xl font-bold">{summary.vacation_planned_days}d</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Días de baja médica</div><div className="text-2xl font-bold text-rose-500">{summary.sick_days}d</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Total ausencias {summary.year}</div><div className="text-2xl font-bold">{Object.values(summary.by_type || {}).reduce((a, b) => a + b, 0)}d</div></CardContent></Card>
        </div>
      )}

      {!adding && <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1" />Registrar baja / vacaciones</Button>}
      {adding && (
        <Card>
          <CardContent className="pt-4 grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEAVE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="REQUESTED">Solicitado</SelectItem>
                  <SelectItem value="APPROVED">Aprobado</SelectItem>
                  <SelectItem value="REJECTED">Rechazado</SelectItem>
                  <SelectItem value="TAKEN">Disfrutado</SelectItem>
                  <SelectItem value="CANCELLED">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Inicio</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><Label>Fin (opcional)</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            <div className="col-span-2"><Label>Motivo</Label><Input value={form.reason || ""} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            <div className="col-span-2 flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => { setAdding(false); setForm(emptyLeave(employee.id)); }}>Cancelar</Button>
              <Button onClick={save}>Guardar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? <div className="text-center py-6"><Loader2 className="animate-spin inline" /></div> :
       leaves.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Sin bajas ni vacaciones registradas.</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Periodo</TableHead><TableHead>Días</TableHead><TableHead>Estado</TableHead><TableHead>Motivo</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {leaves.map((l) => {
              const lt = LEAVE_TYPES.find((t) => t.value === l.leave_type);
              return (
                <TableRow key={l.id}>
                  <TableCell><span className={`inline-block w-2 h-2 rounded-full mr-2 ${lt?.color || "bg-zinc-400"}`} />{lt?.label || l.leave_type}</TableCell>
                  <TableCell className="text-sm">
                    {new Date(l.start_date).toLocaleDateString("es-ES")}
                    {l.end_date && ` → ${new Date(l.end_date).toLocaleDateString("es-ES")}`}
                  </TableCell>
                  <TableCell>{l.days ?? "—"}d</TableCell>
                  <TableCell><Badge variant={l.status === "APPROVED" || l.status === "TAKEN" ? "default" : "outline"}>{l.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.reason || "—"}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={() => remove(l.id)}><Trash className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function emptyDoc(empId) {
  return {
    employee_id: empId, title: "", doc_type: "CONTRACT",
    file_url: "", drive_file_id: "", provider: null,
    issued_date: "", expires_at: "", status: "ACTIVE", notes: "",
  };
}

function emptyLeave(empId) {
  return {
    employee_id: empId, leave_type: "VACATION",
    start_date: "", end_date: "", status: "APPROVED",
    document_id: null, reason: "",
  };
}
