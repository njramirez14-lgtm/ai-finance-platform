import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, CheckCircle2, AlertCircle, Copy, ExternalLink, Loader2, Trash2 } from "lucide-react";
import api from "@/api/axios";

export default function TelegramConnect() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/telegram/status");
      setStatus(data);
    } catch (err) {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { data } = await api.post("/telegram/link/generate");
      setCode(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Error generando código");
    } finally {
      setGenerating(false);
    }
  };

  const unlink = async () => {
    if (!window.confirm("¿Desvincular Telegram? Tendrás que volver a conectar para mandar tickets.")) return;
    try {
      await api.delete("/telegram/link");
      await load();
      setCode(null);
    } catch (err) {
      setError(err.response?.data?.detail || "Error desvinculando");
    }
  };

  const copyCode = () => {
    if (!code?.code) return;
    navigator.clipboard?.writeText(`/start ${code.code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="h-12 bg-muted/50 rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const linked = status?.linked;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send size={18} className="text-sky-400" /> Conectar Telegram
          {linked && <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Conectado</Badge>}
        </CardTitle>
        <CardDescription>
          Manda fotos de tickets al bot y se guardan automáticamente como gastos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status?.bot_configured && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <strong>Bot no configurado en el servidor.</strong> Crea un bot en @BotFather y pídele al admin que añada
              <code className="ml-1 px-1 rounded bg-background/50">TELEGRAM_BOT_TOKEN</code> y
              <code className="ml-1 px-1 rounded bg-background/50">TELEGRAM_BOT_USERNAME</code> en el backend.
            </div>
          </div>
        )}

        {linked ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
              <CheckCircle2 className="text-emerald-400" size={24} />
              <div className="flex-1">
                <div className="font-semibold">Vinculado a Telegram</div>
                <div className="text-sm text-muted-foreground">
                  {status.first_name && <>{status.first_name} </>}
                  {status.username && <span className="text-sky-400">@{status.username}</span>}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={unlink} className="gap-1 text-rose-400 hover:text-rose-500">
                <Trash2 size={14} /> Desvincular
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              Manda una foto de un ticket al bot y te preguntará con qué cuenta y categoría guardarlo.
              También funciona texto: <code className="px-1 rounded bg-muted">12.50 Mercadona</code>.
            </div>
          </div>
        ) : code ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-sky-500/30 bg-sky-500/5 space-y-3">
              <div className="text-xs uppercase tracking-wider text-sky-400">
                Código de vinculación · caduca en {code.ttl_minutes} minutos
              </div>
              <div className="font-mono text-2xl font-bold tracking-widest">{code.code}</div>

              <div className="flex flex-wrap gap-2">
                {code.deep_link && (
                  <a href={code.deep_link} target="_blank" rel="noreferrer">
                    <Button className="gap-2" variant="default">
                      <ExternalLink size={14} /> Abrir Telegram y vincular
                    </Button>
                  </a>
                )}
                <Button onClick={copyCode} variant="outline" className="gap-2">
                  <Copy size={14} /> {copied ? "Copiado" : `Copiar "/start ${code.code}"`}
                </Button>
              </div>
            </div>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li><strong>1.</strong> Abre Telegram y busca el bot{status?.bot_username && <> <code className="px-1 rounded bg-muted">@{status.bot_username}</code></>}.</li>
              <li><strong>2.</strong> Mándale el comando <code className="px-1 rounded bg-muted">/start {code.code}</code></li>
              <li><strong>3.</strong> Después puedes mandar fotos de tickets y los guardará como gastos.</li>
            </ol>
            <Button variant="ghost" size="sm" onClick={() => { setCode(null); load(); }}>
              ¿Ya lo has hecho? Refresca el estado
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Genera un código de vinculación, mándalo al bot en Telegram una sola vez y listo.
            </p>
            <Button onClick={generate} disabled={generating || !status?.bot_configured} className="gap-2">
              {generating ? <><Loader2 size={14} className="animate-spin" /> Generando…</> : <><Send size={14} /> Generar código</>}
            </Button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
