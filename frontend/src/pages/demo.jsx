import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Building, Car, Plus, Trash, Share2, Sparkles, ArrowRight, Check,
} from "lucide-react";
import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "/api";
const demoApi = axios.create({ baseURL });

const fmt = (n) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

export default function DemoPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [sid, setSid] = useState(sessionId || null);
  const [creating, setCreating] = useState(false);
  const [summary, setSummary] = useState(null);
  const [props, setProps] = useState([]);
  const [vehs, setVehs] = useState([]);
  const [copied, setCopied] = useState(false);
  const [openProp, setOpenProp] = useState(false);
  const [openVeh, setOpenVeh] = useState(false);
  const [propForm, setPropForm] = useState(emptyProp());
  const [vehForm, setVehForm] = useState(emptyVeh());

  async function newSession() {
    setCreating(true);
    try {
      const r = await demoApi.post("/demo/sessions");
      navigate(`/demo/${r.data.session_id}`);
    } finally {
      setCreating(false);
    }
  }

  async function load(id) {
    if (!id) return;
    const [p, v, s] = await Promise.all([
      demoApi.get(`/demo/sessions/${id}/properties`),
      demoApi.get(`/demo/sessions/${id}/vehicles`),
      demoApi.get(`/demo/sessions/${id}/summary`),
    ]);
    setProps(p.data || []);
    setVehs(v.data || []);
    setSummary(s.data || null);
  }

  useEffect(() => {
    if (sessionId) {
      setSid(sessionId);
      load(sessionId).catch(() => {
        // expired
        setSid(null);
      });
    }
  }, [sessionId]);

  function shareLink() {
    const url = `${window.location.origin}/demo/${sid}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function addProp() {
    const body = { ...propForm };
    Object.keys(body).forEach((k) => { if (body[k] === "") body[k] = null; });
    ["purchase_price", "current_value", "monthly_rental_income", "monthly_expenses", "monthly_mortgage_payment", "mortgage_balance", "area_m2"].forEach((k) => {
      if (body[k] != null) body[k] = Number(body[k]);
    });
    await demoApi.post(`/demo/sessions/${sid}/properties`, body);
    setOpenProp(false);
    setPropForm(emptyProp());
    load(sid);
  }

  async function addVeh() {
    const body = { ...vehForm };
    Object.keys(body).forEach((k) => { if (body[k] === "") body[k] = null; });
    ["purchase_price", "current_value", "monthly_income", "monthly_expenses", "monthly_loan_payment", "loan_balance", "year"].forEach((k) => {
      if (body[k] != null) body[k] = Number(body[k]);
    });
    await demoApi.post(`/demo/sessions/${sid}/vehicles`, body);
    setOpenVeh(false);
    setVehForm(emptyVeh());
    load(sid);
  }

  async function delProp(id) {
    await demoApi.delete(`/demo/sessions/${sid}/properties/${id}`);
    load(sid);
  }

  async function delVeh(id) {
    await demoApi.delete(`/demo/sessions/${sid}/vehicles/${id}`);
    load(sid);
  }

  // Landing
  if (!sid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm font-medium">Demo pública</span>
            </div>
            <CardTitle className="text-3xl mt-2">Asesor de patrimonio</CardTitle>
            <CardDescription className="text-base">
              Prueba la app sin registro. Tu sesión es independiente — no toca datos reales y caduca al cerrar.
              Al terminar puedes compartir el link con quien quieras para que vea exactamente lo mismo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex gap-2"><Check className="h-4 w-4 text-green-600 mt-0.5" />Empieza con 2 propiedades y 2 vehículos de ejemplo</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-green-600 mt-0.5" />Edita, añade, elimina — todo en sandbox</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-green-600 mt-0.5" />Cashflow, equity y valor neto calculados en tiempo real</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-green-600 mt-0.5" />Link compartible para enseñárselo a otra persona</li>
            </ul>
            <Button size="lg" className="w-full" onClick={newSession} disabled={creating}>
              {creating ? "Creando demo…" : "Empezar demo"} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" /> Demo sandbox · sesión {sid?.slice(0, 8)}…
            </div>
            <h1 className="text-3xl font-bold mt-1">Asesor de patrimonio</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={shareLink}>
              <Share2 className="mr-2 h-4 w-4" /> {copied ? "¡Copiado!" : "Copiar link"}
            </Button>
            <Button variant="ghost" onClick={() => navigate("/demo")}>Nueva demo</Button>
          </div>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Activos totales" value={fmt(summary.total_assets)} />
            <Stat label="Deuda total" value={fmt(summary.total_debt)} negative />
            <Stat label="Patrimonio neto" value={fmt(summary.net_worth)} positive />
            <Stat label="Cashflow mensual neto" value={fmt(summary.monthly_net)} positive={Number(summary.monthly_net) >= 0} />
          </div>
        )}

        <Tabs defaultValue="properties">
          <TabsList>
            <TabsTrigger value="properties"><Building className="h-4 w-4 mr-2" />Propiedades ({props.length})</TabsTrigger>
            <TabsTrigger value="vehicles"><Car className="h-4 w-4 mr-2" />Vehículos ({vehs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="properties">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Propiedades</CardTitle>
                <Dialog open={openProp} onOpenChange={setOpenProp}>
                  <Button onClick={() => { setPropForm(emptyProp()); setOpenProp(true); }}>
                    <Plus className="mr-2 h-4 w-4" /> Añadir
                  </Button>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader><DialogTitle>Nueva propiedad</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Nombre" full v={propForm.name} on={(x) => setPropForm({ ...propForm, name: x })} />
                      <Field label="Ciudad" v={propForm.city} on={(x) => setPropForm({ ...propForm, city: x })} />
                      <Field label="País" v={propForm.country} on={(x) => setPropForm({ ...propForm, country: x })} />
                      <Field label="Precio compra (€)" type="number" v={propForm.purchase_price} on={(x) => setPropForm({ ...propForm, purchase_price: x })} />
                      <Field label="Valor actual (€)" type="number" v={propForm.current_value} on={(x) => setPropForm({ ...propForm, current_value: x })} />
                      <Field label="Alquiler/mes (€)" type="number" v={propForm.monthly_rental_income} on={(x) => setPropForm({ ...propForm, monthly_rental_income: x })} />
                      <Field label="Gastos/mes (€)" type="number" v={propForm.monthly_expenses} on={(x) => setPropForm({ ...propForm, monthly_expenses: x })} />
                      <Field label="Cuota hipoteca/mes (€)" type="number" v={propForm.monthly_mortgage_payment} on={(x) => setPropForm({ ...propForm, monthly_mortgage_payment: x })} />
                      <Field label="Capital pendiente hipoteca (€)" type="number" v={propForm.mortgage_balance} on={(x) => setPropForm({ ...propForm, mortgage_balance: x })} />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOpenProp(false)}>Cancelar</Button>
                      <Button onClick={addProp} disabled={!propForm.name}>Guardar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Ciudad</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Equity</TableHead>
                      <TableHead className="text-right">Cashflow</TableHead>
                      <TableHead className="text-right">Yield</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {props.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.city || "—"}</TableCell>
                        <TableCell className="text-right">{fmt(p.current_value || p.purchase_price)}</TableCell>
                        <TableCell className="text-right">{fmt(p.equity)}</TableCell>
                        <TableCell className={`text-right ${Number(p.monthly_net_cashflow) >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(p.monthly_net_cashflow)}</TableCell>
                        <TableCell className="text-right">{p.annual_yield_pct != null ? `${p.annual_yield_pct}%` : "—"}</TableCell>
                        <TableCell><Button size="icon" variant="ghost" onClick={() => delProp(p.id)}><Trash className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vehicles">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Vehículos</CardTitle>
                <Dialog open={openVeh} onOpenChange={setOpenVeh}>
                  <Button onClick={() => { setVehForm(emptyVeh()); setOpenVeh(true); }}>
                    <Plus className="mr-2 h-4 w-4" /> Añadir
                  </Button>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader><DialogTitle>Nuevo vehículo</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Nombre" full v={vehForm.name} on={(x) => setVehForm({ ...vehForm, name: x })} />
                      <Field label="Marca" v={vehForm.make} on={(x) => setVehForm({ ...vehForm, make: x })} />
                      <Field label="Modelo" v={vehForm.model} on={(x) => setVehForm({ ...vehForm, model: x })} />
                      <Field label="Año" type="number" v={vehForm.year} on={(x) => setVehForm({ ...vehForm, year: x })} />
                      <Field label="Matrícula" v={vehForm.license_plate} on={(x) => setVehForm({ ...vehForm, license_plate: x })} />
                      <Field label="Precio compra (€)" type="number" v={vehForm.purchase_price} on={(x) => setVehForm({ ...vehForm, purchase_price: x })} />
                      <Field label="Valor actual (€)" type="number" v={vehForm.current_value} on={(x) => setVehForm({ ...vehForm, current_value: x })} />
                      <Field label="Ingresos/mes (€)" type="number" v={vehForm.monthly_income} on={(x) => setVehForm({ ...vehForm, monthly_income: x })} />
                      <Field label="Gastos/mes (€)" type="number" v={vehForm.monthly_expenses} on={(x) => setVehForm({ ...vehForm, monthly_expenses: x })} />
                      <Field label="Cuota préstamo/mes (€)" type="number" v={vehForm.monthly_loan_payment} on={(x) => setVehForm({ ...vehForm, monthly_loan_payment: x })} />
                      <Field label="Capital pendiente (€)" type="number" v={vehForm.loan_balance} on={(x) => setVehForm({ ...vehForm, loan_balance: x })} />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOpenVeh(false)}>Cancelar</Button>
                      <Button onClick={addVeh} disabled={!vehForm.name}>Guardar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Equity</TableHead>
                      <TableHead className="text-right">Cashflow</TableHead>
                      <TableHead className="text-right">Depreciación</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehs.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">{v.name}</TableCell>
                        <TableCell>{[v.make, v.model, v.year].filter(Boolean).join(" ") || "—"}</TableCell>
                        <TableCell className="text-right">{fmt(v.current_value || v.purchase_price)}</TableCell>
                        <TableCell className="text-right">{fmt(v.equity)}</TableCell>
                        <TableCell className={`text-right ${Number(v.monthly_net_cashflow) >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(v.monthly_net_cashflow)}</TableCell>
                        <TableCell className="text-right">{v.depreciation_pct != null ? `${v.depreciation_pct}%` : "—"}</TableCell>
                        <TableCell><Button size="icon" variant="ghost" onClick={() => delVeh(v.id)}><Trash className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground text-center pt-4">
          Esta demo es un sandbox público. Datos no persistentes. ¿Quieres la versión completa? <a href="/signup" className="underline">Crea una cuenta</a>.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, positive, negative }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${positive ? "text-green-600" : negative ? "text-red-600" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Field({ label, type = "text", v, on, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={v ?? ""} onChange={(e) => on(e.target.value)} />
    </div>
  );
}

function emptyProp() {
  return {
    name: "", property_type: "RESIDENCE", address: "", city: "", country: "España",
    area_m2: "", purchase_date: "", purchase_price: "", current_value: "",
    monthly_rental_income: "", monthly_expenses: "",
    monthly_mortgage_payment: "", mortgage_balance: "",
    currency: "EUR", notes: "",
  };
}

function emptyVeh() {
  return {
    name: "", vehicle_type: "CAR", make: "", model: "", year: "", license_plate: "",
    purchase_date: "", purchase_price: "", current_value: "",
    monthly_income: "", monthly_expenses: "",
    monthly_loan_payment: "", loan_balance: "",
    currency: "EUR", notes: "",
  };
}
