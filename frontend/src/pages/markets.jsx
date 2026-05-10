import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  TrendingUp, TrendingDown, RefreshCw, Search, Loader2, AlertCircle, Sparkles, LineChart, Bitcoin,
} from "lucide-react";
import api from "@/api/axios";

const fmtMoney = (n, c = "USD") => {
  if (n == null || isNaN(n)) return "—";
  const decimals = Math.abs(n) < 1 ? 4 : 2;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: c,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
};
const fmtPct = (n) => (n == null || isNaN(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
const fmtCompact = (n) => {
  if (!n) return "—";
  return new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 }).format(n);
};

function Sparkline({ data, positive }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 100, H = 30;
  const step = W / (data.length - 1);
  const points = data
    .map((v, i) => `${(i * step).toFixed(2)},${(H - ((v - min) / range) * H).toFixed(2)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-24 h-8" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={positive ? "#10b981" : "#f43f5e"}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}

export default function MarketsPage() {
  const [crypto, setCrypto] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [loadingCrypto, setLoadingCrypto] = useState(true);
  const [loadingStocks, setLoadingStocks] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);

  const loadAll = async () => {
    setLoadingCrypto(true);
    setLoadingStocks(true);
    setError(null);
    try {
      const [c, s] = await Promise.all([
        api.get("/markets/crypto").catch((e) => ({ data: [], error: e })),
        api.get("/markets/stocks").catch((e) => ({ data: [], error: e })),
      ]);
      setCrypto(c.data || []);
      setStocks(s.data || []);
      if ((!c.data || c.data.length === 0) && (!s.data || s.data.length === 0)) {
        setError("No se han podido cargar los precios. Vuelve a intentarlo.");
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Error cargando mercados");
    } finally {
      setLoadingCrypto(false);
      setLoadingStocks(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const { data } = await api.get("/markets/quote", { params: { symbol: search.trim().toUpperCase() } });
      setSearchResult(data);
    } catch (err) {
      setSearchResult({ error: err.response?.data?.detail || "No encontrado" });
    } finally {
      setSearching(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <LineChart size={22} /> Mercados
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Precios en vivo de cripto y acciones para decidir mejor en qué invertir.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/advisor">
              <Button variant="outline" className="gap-2">
                <Sparkles size={16} /> Pregunta al asesor
              </Button>
            </Link>
            <Button onClick={loadAll} variant="ghost" className="gap-2" disabled={loadingCrypto || loadingStocks}>
              <RefreshCw size={16} className={(loadingCrypto || loadingStocks) ? "animate-spin" : ""} />
              Actualizar
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Search size={16} /> Buscar ticker</CardTitle>
            <CardDescription>Prueba con AAPL, MSFT, BTC-USD, ETH-EUR, ^GSPC, GC=F (oro)…</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                placeholder="Ej. NVDA"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button type="submit" disabled={searching} className="gap-2">
                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Buscar
              </Button>
            </form>

            {searchResult && (
              <div className="mt-4">
                {searchResult.error ? (
                  <div className="p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    {searchResult.error}
                  </div>
                ) : (
                  <StockRow item={searchResult} />
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="crypto">
          <TabsList>
            <TabsTrigger value="crypto" className="gap-2"><Bitcoin size={14} /> Cripto</TabsTrigger>
            <TabsTrigger value="stocks" className="gap-2"><LineChart size={14} /> Acciones e índices</TabsTrigger>
          </TabsList>

          <TabsContent value="crypto" className="space-y-3">
            {loadingCrypto ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-lg bg-muted/50 animate-pulse" />)}
              </div>
            ) : crypto.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No hay datos de cripto disponibles.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {crypto.map((c) => <CryptoRow key={c.id} item={c} />)}
              </div>
            )}
            <p className="text-xs text-muted-foreground italic pt-2">
              Datos: CoinGecko · Variación de 24h y sparkline de 7 días.
            </p>
          </TabsContent>

          <TabsContent value="stocks" className="space-y-3">
            {loadingStocks ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />)}
              </div>
            ) : stocks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No hay datos de acciones disponibles.</p>
            ) : (
              <div className="space-y-2">
                {stocks.map((s) => <StockRow key={s.symbol} item={s} />)}
              </div>
            )}
            <p className="text-xs text-muted-foreground italic pt-2">
              Datos: Yahoo Finance · Precio del último cierre · ^GSPC = S&P 500, ^IXIC = Nasdaq, GC=F = Oro.
            </p>
          </TabsContent>
        </Tabs>

        <Card>
          <CardContent className="py-6 flex items-start gap-3">
            <Sparkles size={20} className="text-purple-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold">¿No sabes en qué invertir?</div>
              <p className="text-sm text-muted-foreground mt-1">
                Pregunta al <strong>Asesor de Inversión IA</strong>. Ve tus transacciones y te puede dar una opinión razonable según tu situación.
              </p>
            </div>
            <Link to="/advisor">
              <Button variant="outline">Abrir asesor</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function CryptoRow({ item }) {
  const positive = (item.change_24h_pct ?? 0) >= 0;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors">
      {item.image && (
        <img src={item.image} alt={item.symbol} className="w-8 h-8 rounded-full" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{item.name}</span>
          <Badge variant="outline" className="text-[10px]">{item.symbol}</Badge>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          Cap: {fmtCompact(item.market_cap)} {item.currency}
        </div>
      </div>
      <Sparkline data={item.sparkline} positive={positive} />
      <div className="text-right min-w-[110px]">
        <div className="font-semibold tabular-nums">{fmtMoney(item.price, item.currency)}</div>
        <div className={`text-xs flex items-center gap-1 justify-end ${positive ? "text-emerald-400" : "text-rose-400"}`}>
          {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {fmtPct(item.change_24h_pct)}
        </div>
      </div>
    </div>
  );
}

function StockRow({ item }) {
  const positive = (item.change_pct ?? 0) >= 0;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors">
      <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-xs">
        {item.symbol.replace(/[^A-Z0-9]/gi, "").slice(0, 4)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold truncate">{item.name || item.symbol}</span>
          <Badge variant="outline" className="text-[10px]">{item.symbol}</Badge>
          {item.exchange && (
            <span className="text-[10px] text-muted-foreground">{item.exchange}</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          Cierre previo: {fmtMoney(item.prev_close, item.currency)}
        </div>
      </div>
      <Sparkline data={item.sparkline} positive={positive} />
      <div className="text-right min-w-[110px]">
        <div className="font-semibold tabular-nums">{fmtMoney(item.price, item.currency)}</div>
        <div className={`text-xs flex items-center gap-1 justify-end ${positive ? "text-emerald-400" : "text-rose-400"}`}>
          {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {fmtPct(item.change_pct)}
        </div>
      </div>
    </div>
  );
}
