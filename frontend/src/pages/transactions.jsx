import { useState } from "react";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, Target, Wallet, TrendingDown, Info } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function TransactionsPage() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8000/ai/upload-statement", {
        method: "POST",
        body: formData,
      });
      
      const data = await response.json();
      if (data.success) {
        setExtractedData(data.transactions);
        setSummary(data.summary);
      } else {
        setError(data.error || "Error al procesar el archivo.");
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión con el servidor IA.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto pb-24">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Análisis de Capacidad</h1>
          <p className="text-muted-foreground">Sube tu extracto para calcular cuánto puedes invertir este mes en tu plan 80/20.</p>
        </div>

        {!summary && (
          <Card className="border-dashed border-2 border-slate-700 bg-slate-900/20">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mb-4">
                <UploadCloud className="text-indigo-400 w-8 h-8" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Sube tu extracto bancario</h3>
              <p className="text-sm text-slate-400 mb-6 text-center max-w-md">
                El sistema calculará automáticamente si has alcanzado tus 500€ de objetivo de inversión tras analizar tus ingresos y gastos.
              </p>
              
              <div className="flex items-center gap-4">
                <input 
                  type="file" 
                  id="file-upload" 
                  className="hidden" 
                  accept=".csv,.txt,.pdf"
                  onChange={handleFileChange}
                />
                <label 
                  htmlFor="file-upload"
                  className="cursor-pointer px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-md text-sm font-medium transition-colors"
                >
                  Seleccionar Archivo
                </label>
                
                {file && (
                  <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-400/10 px-3 py-2 rounded-md">
                    <FileText size={16} />
                    {file.name}
                  </div>
                )}
              </div>

              {file && (
                <Button 
                  className="mt-8 bg-indigo-600 hover:bg-indigo-700 text-white w-48 shadow-lg shadow-indigo-900/20"
                  onClick={handleUpload}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...
                    </>
                  ) : (
                    "Calcular Capacidad"
                  )}
                </Button>
              )}

              {error && (
                <div className="mt-4 flex items-center gap-2 text-rose-400 bg-rose-400/10 px-4 py-3 rounded-md text-sm">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Main Capacity Card */}
            <Card className="md:col-span-2 border-indigo-500/20 bg-indigo-500/5 overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-indigo-300 uppercase tracking-wider">
                  <Target size={16} /> Objetivo de Inversión Mensual
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-4xl font-bold">{summary.investment_capacity.toFixed(2)}€</p>
                    <p className="text-sm text-muted-foreground mt-1">Capacidad real detectada</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-400">Meta: {summary.target}€</p>
                    <Badge className={summary.met_target ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border-rose-500/30"}>
                      {summary.met_target ? "Objetivo Alcanzado" : `Faltan ${summary.remaining_to_target.toFixed(2)}€`}
                    </Badge>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Progreso del ahorro</span>
                    <span>{Math.min(100, (summary.investment_capacity / summary.target) * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={(summary.investment_capacity / summary.target) * 100} className="h-2 bg-slate-800" indicatorClassName="bg-indigo-500" />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-indigo-500/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg"><Wallet className="text-emerald-500" size={20} /></div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">Ingresos</p>
                      <p className="text-lg font-bold text-emerald-400">+{summary.total_income.toFixed(2)}€</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right justify-end">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">Gastos</p>
                      <p className="text-lg font-bold text-slate-300">-{summary.total_expenses.toFixed(2)}€</p>
                    </div>
                    <div className="p-2 bg-rose-500/10 rounded-lg"><TrendingDown className="text-rose-500" size={20} /></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* AI Advisor Card */}
            <Card className="border-slate-800 bg-slate-900/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-purple-400 uppercase tracking-wider">
                  <Info size={16} /> Consejo del Asesor IA
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed text-slate-300 italic">
                  {summary.met_target 
                    ? "¡Excelente gestión! Has superado el objetivo de 500€. Sugerencia: El excedente de " + (summary.investment_capacity - summary.target).toFixed(2) + "€ podrías moverlo al fondo de emergencia o aumentar tu posición en Cripto (el 20%)."
                    : "Aún no llegamos a los 500€. He detectado que tus gastos representan el " + ((summary.total_expenses / summary.total_income) * 100).toFixed(0) + "% de tus ingresos. Revisa los gastos hormiga para liberar esos " + summary.remaining_to_target.toFixed(2) + "€ que faltan."}
                </p>
                <div className="pt-4 space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Plan de hoy</p>
                  <div className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span>80%: {(Math.min(summary.investment_capacity, summary.target) * 0.8).toFixed(2)}€ a S&P 500</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>20%: {(Math.min(summary.investment_capacity, summary.target) * 0.2).toFixed(2)}€ a Trading IA</span>
                  </div>
                </div>
                <Button variant="outline" className="w-full text-xs border-slate-700 hover:bg-slate-800" onClick={() => setSummary(null)}>
                  Subir otro extracto
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {extractedData && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400">
                <FileText size={18} />
                <h2 className="text-lg font-semibold">Detalle de Transacciones</h2>
              </div>
              <Badge variant="outline" className="text-[10px] uppercase font-bold text-slate-500 border-slate-800">
                {extractedData.length} registros detectados
              </Badge>
            </div>
            
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50 backdrop-blur-sm">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] font-bold tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Descripción</th>
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4 text-right">Monto (€)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {extractedData.map((tx, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors group">
                      <td className="px-6 py-4 font-mono text-slate-400 text-xs">{tx.date}</td>
                      <td className="px-6 py-4 font-medium text-slate-200">{tx.description}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                          tx.type === 'INCOME' 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                          : 'bg-slate-800 text-slate-500 border-slate-700'
                        }`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className={`px-6 py-4 text-right font-mono font-bold ${
                        tx.type === 'INCOME' ? 'text-emerald-400' : 'text-slate-300 group-hover:text-white'
                      }`}>
                        {tx.type === 'INCOME' ? '+' : '-'}{parseFloat(tx.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="ghost" className="text-slate-500 hover:text-white" onClick={() => setExtractedData(null)}>Descartar</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white px-8">
                Confirmar y Guardar
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
