import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from srv.core.config import settings
from srv.routers import account, ai, auth, backtest, card, category, entity, liability, markets, strategy, strategy_cron, subscription, telegram, transaction

app = FastAPI(
    title="Personal Finance Dashboard API",
    version="0.1.0",
    debug=settings.debug,
)

# Allowed origins:
# - localhost dev (5173 Vite default, 3000 alternative)
# - production frontend on Vercel
# - any *.vercel.app preview deployment of this project
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

# register routers
app.include_router(auth.router)
app.include_router(category.router)
app.include_router(transaction.router)
app.include_router(entity.router)
app.include_router(account.router)
app.include_router(card.router)
app.include_router(subscription.router)
app.include_router(liability.router)
app.include_router(markets.router)
app.include_router(backtest.router)
app.include_router(telegram.router)
app.include_router(ai.router)
app.include_router(strategy.router)
app.include_router(strategy_cron.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "ai-finance-backend", "version": "0.1.0"}


@app.get("/health")
def health():
    return {"status": "ok"}
