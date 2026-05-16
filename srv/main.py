import os

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from srv.core.config import settings
from srv.routers import account, ai, auth, backtest, card, category, entity, holding, liability, markets, smart_money, strategy, strategy_cron, subscription, telegram, transaction

app = FastAPI(
    title="Personal Finance Dashboard API",
    version="0.1.0",
    debug=settings.debug,
)

default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://ai-finance-frontend-six.vercel.app",
    "https://ai-finance-frontend.vercel.app",
]
extra_origins = [
    o.strip() for o in os.environ.get("EXTRA_CORS_ORIGINS", "").split(",") if o.strip()
]
origins = list(dict.fromkeys(default_origins + extra_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://ai-finance-frontend(-[a-z0-9-]+)?\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")
api.include_router(auth.router)
api.include_router(category.router)
api.include_router(transaction.router)
api.include_router(entity.router)
api.include_router(account.router)
api.include_router(card.router)
api.include_router(subscription.router)
api.include_router(liability.router)
api.include_router(markets.router)
api.include_router(smart_money.router)
api.include_router(backtest.router)
api.include_router(telegram.router)
api.include_router(ai.router)
api.include_router(strategy.router)
api.include_router(strategy_cron.router)
api.include_router(holding.router)
app.include_router(api)


@app.get("/api")
def api_root():
    return {"status": "ok", "service": "ai-finance-backend", "version": "0.1.0"}


@app.get("/api/health")
def health():
    return {"status": "ok"}
