import google.generativeai as genai
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.models.transaction import Transaction
from app.core.config import settings
import os

router = APIRouter(prefix="/ai", tags=["AI"])

# Initialize Gemini
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

@router.get("/analyze")
def analyze_finances(db: Session = Depends(get_db)):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")

    # Fetch last 50 transactions
    transactions = db.query(Transaction).order_by(Transaction.date.desc()).limit(50).all()
    
    if not transactions:
        return {"insight": "No hay transacciones suficientes para analizar. ¡Empieza subiendo tu extracto bancario!"}

    # Format for Gemini
    tx_data = "\n".join([
        f"- {tx.date.strftime('%Y-%m-%d')}: {tx.description} ({tx.type}) {tx.amount} EUR" 
        for tx in transactions
    ])

    prompt = f"""
    Eres un experto en finanzas personales y gestión de patrimonio. 
    Analiza las siguientes transacciones y proporciona:
    1. Un resumen de los gastos más importantes.
    2. Una recomendación de ahorro para llegar a los 500€ mensuales de inversión.
    3. Una sugerencia de inversión basada en el perfil de 'Riesgo Inteligente'.

    Transacciones:
    {tx_data}
    """

    model = genai.GenerativeModel('gemini-pro')
    response = model.generate_content(prompt)

    return {
        "insight": response.text,
        "transactions_analyzed": len(transactions)
    }

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import json

@router.post("/upload-statement")
async def upload_statement(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")

    content = await file.read()
    text_content = content.decode('utf-8', errors='ignore')

    # Truncate if too large to save tokens
    if len(text_content) > 10000:
        text_content = text_content[:10000]

    prompt = f"""
    Eres un experto contable con superpoderes de extracción de datos.
    Analiza el siguiente texto extraído de un extracto bancario (puede ser CSV o texto sucio) y extrae las transacciones.
    
    Devuelve ÚNICAMENTE un JSON con esta estructura (no incluyas markdown ni comillas invertidas, solo el JSON puro):
    [
      {{
        "amount": 100.50,
        "type": "EXPENSE",
        "description": "Supermercado",
        "date": "2026-05-01"
      }}
    ]

    Reglas:
    - Transacciones con valores positivos son INCOME, negativos son EXPENSE (siempre pon amount en positivo absoluto).
    - Infiere la descripción (nombre del comercio/concepto).
    - Formato de fecha: YYYY-MM-DD.

    Texto del extracto:
    {text_content}
    """

    model = genai.GenerativeModel('gemini-pro')
    response = model.generate_content(prompt)
    
    try:
        # Clean response text in case Gemini wraps it in ```json
        cleaned_response = response.text.replace("```json", "").replace("```", "").strip()
        extracted_txs = json.loads(cleaned_response)
        
        # Calculate summary metrics
        total_income = sum(tx['amount'] for tx in extracted_txs if tx['type'] == 'INCOME')
        total_expenses = sum(tx['amount'] for tx in extracted_txs if tx['type'] == 'EXPENSE')
        capacity = total_income - total_expenses
        target = 500.0
        met_target = capacity >= target

        summary = {
            "total_income": total_income,
            "total_expenses": total_expenses,
            "investment_capacity": capacity,
            "target": target,
            "met_target": met_target,
            "remaining_to_target": max(0, target - capacity) if not met_target else 0
        }
        
        return {"success": True, "transactions": extracted_txs, "summary": summary}
    except Exception as e:
        print("Error parsing Gemini response:", e)
        print("Raw response:", response.text)
        return {"success": False, "error": "No se pudo parsear el extracto. Por favor, revisa el formato."}

@router.post("/execute-trade")
async def execute_trade(symbol: str, amount_eur: float, dry_run: bool = True):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")
    
    # Simulation logic for now
    # In production, this would import BinanceTrader from our LLM-TradeBot
    
    # 1. Ask Committee for confirmation one last time
    prompt = f"El usuario quiere invertir {amount_eur} EUR en {symbol}. ¿Es una decisión segura según los datos de hoy? Responde solo con un JSON: {{\"decision\": \"EXECUTE\" | \"CANCEL\", \"reason\": \"motivo corto\"}}"
    model = genai.GenerativeModel('gemini-pro')
    response = model.generate_content(prompt)
    
    try:
        cleaned_response = response.text.replace("```json", "").replace("```", "").strip()
        verdict = json.loads(cleaned_response)
    except:
        verdict = {"decision": "CANCEL", "reason": "Error en el consenso de seguridad."}

    if verdict["decision"] == "CANCEL":
        return {"success": False, "message": f"Inversión cancelada por el Comité: {verdict['reason']}"}

    # 2. Execute (Simulated)
    status = "SIMULATED_SUCCESS" if dry_run else "LIVE_EXECUTED"
    
    return {
        "success": True,
        "status": status,
        "execution_details": {
            "symbol": symbol,
            "amount": amount_eur,
            "broker": "Binance",
            "mode": "Dry Run" if dry_run else "Live",
            "verdict": verdict["reason"]
        },
        "message": f"Se ha {'simulado' if dry_run else 'ejecutado'} la compra de {symbol} por valor de {amount_eur}€."
    }

@router.post("/trade-committee")
def investment_debate(symbol: str = "BTC"):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")

    # Mock committee logic (to be expanded with real data from OpenBB/TradingAgents)
    prompt = f"""
    Actúa como un Comité de Inversión compuesto por 3 expertos:
    - Agente 1 (Técnico): Mira tendencias y medias móviles.
    - Agente 2 (Sentimiento): Mira noticias y redes sociales.
    - Agente 3 (Gestor de Riesgos): Decide cuánto capital asignar.

    Debate sobre la compra de {symbol} el día de hoy. 
    Al final, toma una decisión unánime de COMPRA, VENTA o MANTENER.
    """

    model = genai.GenerativeModel('gemini-pro')
    response = model.generate_content(prompt)

    return {
        "symbol": symbol,
        "debate": response.text
    }
