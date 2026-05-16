import { useEffect, useState } from "react";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Newspaper, Loader2, AlertCircle, ExternalLink, RefreshCw, Search,
} from "lucide-react";
import api from "@/api/axios";

const timeAgo = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "hace segundos";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
};

function NewsList({ items, loading }) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Newspaper size={28} className="mx-auto mb-2 text-muted-foreground/40" />
        Sin noticias.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((n) => (
        <a
          key={n.id}
          href={n.url}
          target="_blank"
          rel="noreferrer"
          className="block p-3 rounded-lg border border-border hover:border-foreground/30 transition-colors bg-card/50"
        >
          <div className="flex items-start gap-3">
            {n.thumbnail && (
              <img src={n.thumbnail} alt="" className="w-16 h-16 rounded object-cover shrink-0" loading="lazy" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge variant="outline" className="text-[10px]">{n.ticker}</Badge>
                {n.related_tickers?.slice(0, 4).filter((t) => t !== n.ticker).map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px] opacity-60">{t}</Badge>
                ))}
                <span className="text-xs text-muted-foreground">{n.publisher}</span>
                <span className="text-xs text-muted-foreground ml-auto">{timeAgo(n.published_at)}</span>
              </div>
              <div className="font-medium text-sm leading-snug">{n.title}</div>
            </div>
            <ExternalLink size={14} className="text-muted-foreground shrink-0 mt-1" />
          </div>
        </a>
      ))}
    </div>
  );
}

export default function NewsPage() {
  const [portfolioNews, setPortfolioNews] = useState([]);
  const [marketNews, setMarketNews] = useState([]);
  const [searchNews, setSearchNews] = useState([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [error, setError] = useState(null);
  const [portfolioHint, setPortfolioHint] = useState(null);
  const [tickerQuery, setTickerQuery] = useState("");

  const loadPortfolio = async () => {
    setLoadingPortfolio(true);
    setError(null);
    try {
      const { data } = await api.get("/news/portfolio");
      setPortfolioNews(data.items || []);
      setPortfolioHint(data.hint || null);
    } catch (err) {
      setError(err.response?.data?.detail || "Error cargando noticias del portfolio");
    } finally {
      setLoadingPortfolio(false);
    }
  };

  const loadMarket = async () => {
    setLoadingMarket(true);
    try {
      const { data } = await api.get("/news/market");
      setMarketNews(data.items || []);
    } catch (err) {
      // silent — falls back to empty
    } finally {
      setLoadingMarket(false);
    }
  };

  const runSearch = async () => {
    const q = tickerQuery.trim();
    if (!q) return;
    setLoadingSearch(true);
    setError(null);
    try {
      const { data } = await api.get("/news/tickers", { params: { tickers: q } });
      setSearchNews(data.items || []);
    } catch (err) {
      setError(err.response?.data?.detail || "Error buscando noticias");
    } finally {
      setLoadingSearch(false);
    }
  };

  useEffect(() => { loadPortfolio(); loadMarket(); }, []);

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Newspaper size={22} /> Noticias de mercado
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Titulares en directo de Yahoo Finance — agrupados por ticker. Filtra por tu cartera o busca cualquier símbolo.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => { loadPortfolio(); loadMarket(); }}
            disabled={loadingPortfolio || loadingMarket}
            className="gap-2"
          >
            <RefreshCw size={14} className={loadingPortfolio || loadingMarket ? "animate-spin" : ""} />
            Actualizar
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <Tabs defaultValue="portfolio">
          <TabsList>
            <TabsTrigger value="portfolio">Mi cartera</TabsTrigger>
            <TabsTrigger value="market">Mercado</TabsTrigger>
            <TabsTrigger value="search">Buscar</TabsTrigger>
          </TabsList>

          <TabsContent value="portfolio" className="mt-4">
            {portfolioHint && portfolioNews.length === 0 && (
              <div className="mb-3 p-3 rounded-md text-sm bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {portfolioHint}
              </div>
            )}
            <NewsList items={portfolioNews} loading={loadingPortfolio} />
          </TabsContent>

          <TabsContent value="market" className="mt-4">
            <NewsList items={marketNews} loading={loadingMarket} />
          </TabsContent>

          <TabsContent value="search" className="mt-4 space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Tickers separados por coma (AAPL, NVDA, BTC-USD…)"
                value={tickerQuery}
                onChange={(e) => setTickerQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
              <Button onClick={runSearch} disabled={loadingSearch || !tickerQuery.trim()} className="gap-2">
                <Search size={14} /> Buscar
              </Button>
            </div>
            <NewsList items={searchNews} loading={loadingSearch} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
