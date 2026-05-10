import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import { Camera, Upload, Loader2, AlertCircle, Sparkles, CheckCircle2, X } from "lucide-react";
import api from "@/api/axios";

export default function TicketScanDialog({ open, onOpenChange, accounts = [], categories = [], onSaved }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Form state for the saving step
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setExtracted(null);
    setError(null);
    setSuccess(false);
    setAccountId("");
    setCategoryId("");
    setAmount("");
    setDescription("");
    setDate("");
  };

  const handleClose = (val) => {
    if (!val) reset();
    onOpenChange?.(val);
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Tiene que ser una imagen");
      return;
    }
    setFile(f);
    setError(null);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const scan = async () => {
    if (!file) return;
    setScanning(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/ai/scan-ticket", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const ex = data.extracted || {};
      setExtracted(ex);
      setAmount(ex.amount ? String(ex.amount) : "");
      setDescription(ex.description || ex.merchant || "");
      setDate(ex.date || new Date().toISOString().slice(0, 10));
      // Auto-suggest category by name match
      if (ex.suggested_category) {
        const match = categories.find(
          (c) => c.type === "EXPENSE" && c.name.toLowerCase() === ex.suggested_category.toLowerCase()
        );
        if (match) setCategoryId(String(match.id));
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Error analizando el ticket");
    } finally {
      setScanning(false);
    }
  };

  const save = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Importe inválido"); return; }
    if (!date) { setError("Falta la fecha"); return; }
    setSaving(true);
    setError(null);
    try {
      await api.post("/transactions/", {
        amount: amt,
        type: extracted?.type === "INCOME" ? "INCOME" : "EXPENSE",
        description: description || null,
        date,
        category_id: categoryId ? parseInt(categoryId, 10) : null,
        account_id: accountId ? parseInt(accountId, 10) : null,
      });
      setSuccess(true);
      onSaved?.();
      setTimeout(() => handleClose(false), 1200);
    } catch (err) {
      setError(err.response?.data?.detail || "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const expenseCats = categories.filter((c) => c.type === "EXPENSE");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera size={18} /> Subir ticket
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="py-12 text-center space-y-3">
            <CheckCircle2 className="mx-auto text-emerald-400" size={48} />
            <p className="font-semibold">Transacción guardada</p>
          </div>
        ) : !extracted ? (
          <div className="space-y-4 py-2">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <input
                type="file"
                id="ticket-upload"
                className="hidden"
                accept="image/*"
                capture="environment"
                onChange={handleFile}
              />
              <label
                htmlFor="ticket-upload"
                className="cursor-pointer inline-flex flex-col items-center gap-2"
              >
                <div className="p-3 rounded-full bg-indigo-500/10 text-indigo-400">
                  <Upload size={24} />
                </div>
                <span className="font-medium">{file ? file.name : "Hacer foto o subir imagen"}</span>
                <span className="text-xs text-muted-foreground">JPG, PNG, WebP — hasta 8 MB</span>
              </label>
            </div>

            {previewUrl && (
              <div className="relative rounded-lg overflow-hidden border border-border max-h-64">
                <img src={previewUrl} alt="ticket" className="w-full object-contain max-h-64" />
                <button
                  onClick={() => { setFile(null); setPreviewUrl(null); }}
                  className="absolute top-2 right-2 p-1 rounded-full bg-background/80 hover:bg-background"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button onClick={scan} disabled={!file || scanning} className="gap-2">
                {scanning ? <><Loader2 size={14} className="animate-spin" /> Leyendo ticket…</> : <><Sparkles size={14} /> Analizar con IA</>}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-3 gap-3">
              {previewUrl && (
                <div className="col-span-1 rounded-lg overflow-hidden border border-border">
                  <img src={previewUrl} alt="ticket" className="w-full object-contain" />
                </div>
              )}
              <div className="col-span-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-purple-400" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    Extraído por IA · {extracted.confidence ? `${Math.round(extracted.confidence * 100)}% confianza` : "Confianza desconocida"}
                  </span>
                </div>
                {extracted.merchant && (
                  <div><span className="text-xs text-muted-foreground">Comercio:</span> <strong>{extracted.merchant}</strong></div>
                )}
                {extracted.items?.length > 0 && (
                  <div className="text-xs space-y-0.5 max-h-32 overflow-y-auto p-2 rounded bg-muted/30 border border-border">
                    {extracted.items.slice(0, 10).map((it, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="truncate">{it.name}</span>
                        <span className="font-mono">{Number(it.amount || 0).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="t-amount">Importe (€)</Label>
                <Input
                  id="t-amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-date">Fecha</Label>
                <Input
                  id="t-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="t-desc">Descripción</Label>
              <Input
                id="t-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>¿Con qué cuenta pagaste?</Label>
                <Select
                  value={accountId || "none"}
                  onValueChange={(val) => setAccountId(val === "none" ? "" : val)}
                >
                  <SelectTrigger><SelectValue placeholder="Sin cuenta" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin cuenta</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name} ({a.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {accounts.length === 0 && (
                  <p className="text-xs text-muted-foreground">No tienes cuentas. Crea una en Cuentas.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select
                  value={categoryId || "none"}
                  onValueChange={(val) => setCategoryId(val === "none" ? "" : val)}
                >
                  <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin categoría</SelectItem>
                    {expenseCats.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {extracted.suggested_category && (
                  <Badge variant="outline" className="text-[10px]">
                    Sugerida: {extracted.suggested_category}
                  </Badge>
                )}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => { setExtracted(null); setError(null); }}>
                Volver
              </Button>
              <Button onClick={save} disabled={saving} className="gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando…</> : "Guardar transacción"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
