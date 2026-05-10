import { useEffect, useRef, useState } from "react";
import Layout from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Loader2, AlertCircle, Receipt, PiggyBank, LineChart, MessageCircle, Send, Trash2, BookOpen,
} from "lucide-react";
import api from "@/api/axios";

const PERSONAS = [
  {
    id: "fiscal",
    title: "Asesor Fiscal",
    description: "IRPF, IVA, autónomos, modelos 130/303",
    icon: Receipt,
    accent: "text-amber-400 border-amber-500/30 bg-amber-500/5",
    suggestions: [
      "¿Qué obligaciones fiscales tengo este trimestre?",
      "¿Me conviene ser autónomo o crear una S.L.?",
      "¿Cómo deduzco gastos del coche en mi actividad?",
    ],
  },
  {
    id: "savings",
    title: "Coach de Ahorro",
    description: "Encuentra fugas, propone recortes",
    icon: PiggyBank,
    accent: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
    suggestions: [
      "¿Dónde se va mi dinero este mes?",
      "Dame un plan de 30 días para ahorrar 500€",
      "¿Qué gastos hormiga tengo?",
    ],
  },
  {
    id: "invest",
    title: "Asesor de Inversión",
    description: "Estrategia equilibrada y largo plazo",
    icon: LineChart,
    accent: "text-indigo-400 border-indigo-500/30 bg-indigo-500/5",
    suggestions: [
      "¿Qué porcentaje debería invertir en indexados?",
      "Tengo 10.000€ ahorrados, ¿qué hago?",
      "¿Necesito fondo de emergencia primero?",
    ],
  },
  {
    id: "general",
    title: "Asistente General",
    description: "Cualquier pregunta sobre tus finanzas",
    icon: MessageCircle,
    accent: "text-slate-300 border-slate-500/30 bg-slate-500/5",
    suggestions: [
      "Resume mi situación financiera",
      "¿En qué he gastado más esta semana?",
      "Dame 3 acciones para mejorar mi mes",
    ],
  },
];

export default function AdvisorPage() {
  const [persona, setPersona] = useState(PERSONAS[0]);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [memory, setMemory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const loadHistory = async (pid) => {
    setLoadingHistory(true);
    setError(null);
    try {
      const { data } = await api.get(`/ai/chats/${pid}`);
      setMessages(data.messages || []);
      setMemory(data.summary || null);
    } catch (err) {
      setMessages([]);
      setMemory(null);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => { loadHistory(persona.id); }, [persona.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const ask = async (q) => {
    const text = (q ?? question).trim();
    setSending(true);
    setError(null);
    // Optimistic: add user message immediately
    const tempUser = { id: `temp-u-${Date.now()}`, role: "user", content: text || "(pregunta abierta)", created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, tempUser]);
    setQuestion("");
    try {
      const { data } = await api.post(`/ai/advisor/${persona.id}`, { question: text || null });
      // Reload to pick up server-side persisted messages with real ids
      await loadHistory(persona.id);
    } catch (err) {
      setError(err.response?.data?.detail || "Error consultando al asesor");
      // Remove the optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempUser.id));
    } finally {
      setSending(false);
    }
  };

  const clearHistory = async () => {
    if (!window.confirm(`¿Borrar todo el historial con ${persona.title}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/ai/chats/${persona.id}`);
      setMessages([]);
      setMemory(null);
    } catch (err) {
      setError(err.response?.data?.detail || "Error borrando historial");
    }
  };

  const Icon = persona.icon;

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Sparkles size={22} className="text-purple-400" /> Asesor IA
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cuatro asesores con memoria. Recuerdan tus decisiones e inversiones entre sesiones.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {PERSONAS.map((p) => {
            const PIcon = p.icon;
            const active = p.id === persona.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { setPersona(p); setError(null); }}
                className={`text-left p-4 rounded-lg border transition-all ${
                  active ? `${p.accent} border-2` : "border-border hover:border-border/80 bg-card/50"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <PIcon size={18} />
                  <span className="text-sm font-semibold">{p.title}</span>
                </div>
                <p className="text-xs text-muted-foreground">{p.description}</p>
              </button>
            );
          })}
        </div>

        {memory && (
          <Card className="border-purple-500/30 bg-purple-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BookOpen size={14} className="text-purple-400" /> Memoria del asesor
              </CardTitle>
              <CardDescription>Resumen de conversaciones anteriores que el asesor recuerda.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{memory}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Icon size={18} /> {persona.title}
              </CardTitle>
              <CardDescription>{persona.description}</CardDescription>
            </div>
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearHistory} className="gap-1 text-muted-foreground hover:text-rose-400">
                <Trash2 size={14} /> Borrar historial
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              ref={scrollRef}
              className="rounded-lg border border-border bg-muted/10 p-4 max-h-[55vh] min-h-[200px] overflow-y-auto space-y-4"
            >
              {loadingHistory ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  <Loader2 className="inline animate-spin mr-2" size={14} /> Cargando historial…
                </div>
              ) : messages.length === 0 && !sending ? (
                <div className="text-center py-8 space-y-3">
                  <Icon className="mx-auto text-muted-foreground" size={28} />
                  <p className="text-sm text-muted-foreground">
                    Empieza una conversación con {persona.title}.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {persona.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => ask(s)}
                        disabled={sending}
                        className="text-xs px-3 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((m) => (
                    <ChatBubble key={m.id} message={m} personaTitle={persona.title} />
                  ))}
                  {sending && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />
                      <span>{persona.title} está pensando…</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-2">
              <Input
                placeholder={`Pregunta a ${persona.title}…`}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !sending && question.trim()) ask(); }}
                disabled={sending}
              />
              <Button onClick={() => ask()} disabled={sending || !question.trim()} className="gap-2">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Enviar
              </Button>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="text-xs text-muted-foreground italic pt-1">
              El asesor recuerda hasta las últimas {10} conversaciones y mantiene un resumen automático del resto. Información, no consejo profesional.
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function ChatBubble({ message, personaTitle }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
          isUser
            ? "bg-indigo-500/15 border border-indigo-500/30"
            : "bg-card border border-border"
        }`}
      >
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          {isUser ? "Tú" : personaTitle}
        </div>
        <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
      </div>
    </div>
  );
}
