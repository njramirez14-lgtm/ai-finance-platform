import { useState } from "react";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Brain, ShieldAlert, Zap, MessageSquare, ShieldCheck, Play, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import api from "@/api/axios";

export default function TradingPage() {
  const [symbol, setSymbol] = useState("BTC");
  const [debate, setDebate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [executionResult, setExecutionStatus] = useState(null);
  const [executing, setExecuting] = useState(false);

  const startDebate = async () => {
    setLoading(true);
    setExecutionStatus(null);
    try {
      const { data } = await api.post(`/ai/trade-committee?symbol=${symbol}`);
      setDebate(data.debate);
    } catch (error) {
      console.error("Debate failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async (dryRun = true) => {
    setExecuting(true);
    try {
      const { data } = await api.post(`/ai/execute-trade?symbol=${symbol}&amount_eur=100&dry_run=${dryRun}`);
      setExecutionStatus(data);
    } catch (error) {
      console.error("Execution failed:", error);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">AI Trading Committee</h1>
            <p className="text-muted-foreground">Tus agentes debaten antes de que tú inviertas.</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1">
              Active Strategy: 80/20
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="text-amber-500" size={16} /> Configuración de Trading
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground">Activo (Símbolo)</label>
                <input 
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Ej: BTC, ETH, NVDA..."
                />
              </div>
              <Button 
                onClick={startDebate} 
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {loading ? "Reuniendo al comité..." : "Iniciar Debate IA"}
              </Button>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="text-indigo-400" size={16} /> Transcripción del Debate
              </CardTitle>
              <CardDescription>Análisis en tiempo real por agentes expertos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {debate ? (
                <>
                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                    {debate}
                  </div>
                  
                  <div className="flex gap-4 p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-indigo-300">Acción Recomendada</p>
                      <p className="text-xs text-slate-400">Basado en el consenso del comité para ese 20% (100€).</p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        className="border-slate-700 text-xs h-9 px-4"
                        onClick={() => handleExecute(true)}
                        disabled={executing}
                      >
                        Simular (Dry Run)
                      </Button>
                      <Button 
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 px-4 gap-2"
                        onClick={() => handleExecute(false)}
                        disabled={executing}
                      >
                        {executing ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
                        Invertir 100€ Ya
                      </Button>
                    </div>
                  </div>

                  {executionResult && (
                    <div className={`p-4 rounded-xl border flex items-start gap-3 animate-in zoom-in-95 duration-300 ${
                      executionResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    }`}>
                      {executionResult.success ? <ShieldCheck size={20} className="shrink-0" /> : <ShieldAlert size={20} className="shrink-0" />}
                      <div>
                        <p className="text-sm font-bold">{executionResult.success ? "Ejecución Completada" : "Inversión Denegada"}</p>
                        <p className="text-xs opacity-80">{executionResult.message}</p>
                        {executionResult.success && (
                          <p className="text-[10px] mt-2 font-mono uppercase tracking-tighter opacity-60">ID: {executionResult.status} | Broker: Binance</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-slate-800 rounded-lg">
                  <Brain size={48} className="opacity-20 mb-4" />
                  <p>Selecciona un activo y pulsa "Iniciar Debate"</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Expert Team */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ExpertCard 
            icon={<TrendingUp className="text-blue-400" />} 
            name="Agente Técnico" 
            specialty="RSI, MACD, Medias Móviles" 
          />
          <ExpertCard 
            icon={<Brain className="text-purple-400" />} 
            name="Agente de Sentimiento" 
            specialty="Twitter, Reddit, Noticias" 
          />
          <ExpertCard 
            icon={<ShieldAlert className="text-rose-400" />} 
            name="Gestor de Riesgos" 
            specialty="Stop Loss, Capital Allocation" 
          />
        </div>
      </div>
    </Layout>
  );
}

function ExpertCard({ icon, name, specialty }) {
  return (
    <Card className="bg-slate-900/40 border-slate-800">
      <CardContent className="p-4 flex items-center gap-4">
        <div className="p-2 bg-slate-800 rounded-lg">{icon}</div>
        <div>
          <p className="text-sm font-bold">{name}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-tight">{specialty}</p>
        </div>
      </CardContent>
    </Card>
  );
}
