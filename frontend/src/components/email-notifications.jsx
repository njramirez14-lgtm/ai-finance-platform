import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Send, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import api from "@/api/axios";

export function EmailNotifications() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/notifications/preferences");
      setPrefs(data);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function save(patch) {
    setSaving(true);
    try {
      const { data } = await api.put("/notifications/preferences", patch);
      setPrefs(data);
    } finally { setSaving(false); }
  }

  async function sendTest() {
    setTesting(true);
    setLastResult(null);
    try {
      const { data } = await api.post("/notifications/test-email");
      setLastResult({ ok: true, msg: `Enviado a ${data.to}` });
    } catch (err) {
      setLastResult({ ok: false, msg: err.response?.data?.detail || "Falló el envío" });
    } finally { setTesting(false); }
  }

  if (loading || !prefs) {
    return (
      <Card><CardContent className="py-6 flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin" /></CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail size={16} /> Notificaciones por email</CardTitle>
        <CardDescription>Resumen diario a las 7:00 con recordatorios, nóminas y documentos por vencer.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!prefs.provider_configured && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <strong>Backend sin proveedor email.</strong> Crea cuenta gratis en <a href="https://resend.com" target="_blank" rel="noreferrer" className="underline">resend.com</a> (100 emails/día gratis), copia la API key y añade <code>RESEND_API_KEY</code> en Vercel → Settings → Environment Variables. Redeploy y vuelve aquí.
            </div>
          </div>
        )}

        <div>
          <Label>Email destinatario</Label>
          <div className="flex gap-2 mt-1">
            <Input
              type="email"
              value={prefs.notify_email || ""}
              onChange={(e) => setPrefs({ ...prefs, notify_email: e.target.value })}
              placeholder="tu@email.com"
            />
            <Button variant="outline" onClick={() => save({ notify_email: prefs.notify_email })} disabled={saving}>Guardar</Button>
          </div>
        </div>

        <div className="space-y-2">
          <Toggle label="Activar emails" checked={prefs.email_alerts_enabled} onChange={(v) => save({ email_alerts_enabled: v })} />
          <Toggle label="Recordatorios próximos (7 días)" checked={prefs.notify_reminders} onChange={(v) => save({ notify_reminders: v })} disabled={!prefs.email_alerts_enabled} />
          <Toggle label="Nóminas próximas (3 días)" checked={prefs.notify_payroll} onChange={(v) => save({ notify_payroll: v })} disabled={!prefs.email_alerts_enabled} />
          <Toggle label="Documentos por caducar (30 días)" checked={prefs.notify_documents} onChange={(v) => save({ notify_documents: v })} disabled={!prefs.email_alerts_enabled} />
          <Toggle label="Alertas de inversión" checked={prefs.notify_investment_alerts} onChange={(v) => save({ notify_investment_alerts: v })} disabled={!prefs.email_alerts_enabled} />
        </div>

        <div className="flex items-center gap-3 pt-2 border-t">
          <Button onClick={sendTest} disabled={testing || !prefs.provider_configured} className="gap-2">
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Enviar email de prueba
          </Button>
          {lastResult && (
            <div className={`text-sm flex items-center gap-1 ${lastResult.ok ? "text-emerald-600" : "text-rose-600"}`}>
              {lastResult.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {lastResult.msg}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <div className={`flex items-center justify-between text-sm ${disabled ? "opacity-50" : ""}`}>
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? "bg-emerald-500" : "bg-muted"}`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
      </button>
    </div>
  );
}
