"""Telegram bot integration: link account, photograph tickets, save as transactions."""
from __future__ import annotations

import asyncio
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import google.generativeai as genai
import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.account import Account
from srv.models.category import Category
from srv.models.telegram import (
    TelegramLink,
    TelegramLinkCode,
    TelegramPendingTicket,
)
from srv.models.transaction import Transaction, TransactionType

router = APIRouter(prefix="/telegram", tags=["telegram"])

TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TG_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()
TG_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "").strip()  # without @
TG_API = "https://api.telegram.org"

GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY", "").strip()
DEFAULT_MODEL = "gemini-flash-latest"
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

LINK_CODE_TTL_MIN = 15


# -------- helpers --------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _gen_code(n: int = 8) -> str:
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(n))


async def tg_call(method: str, payload: dict, files: dict | None = None) -> dict:
    if not TG_TOKEN:
        raise HTTPException(500, "Telegram bot token no configurado")
    url = f"{TG_API}/bot{TG_TOKEN}/{method}"
    async with httpx.AsyncClient(timeout=20) as client:
        if files:
            r = await client.post(url, data=payload, files=files)
        else:
            r = await client.post(url, json=payload)
        return r.json()


async def tg_send_message(chat_id: int, text: str, reply_markup: dict | None = None, parse_mode: str | None = "HTML") -> dict:
    payload = {"chat_id": chat_id, "text": text}
    if parse_mode:
        payload["parse_mode"] = parse_mode
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    return await tg_call("sendMessage", payload)


async def tg_edit_message(chat_id: int, message_id: int, text: str, reply_markup: dict | None = None) -> dict:
    payload = {
        "chat_id": chat_id,
        "message_id": message_id,
        "text": text,
        "parse_mode": "HTML",
    }
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    return await tg_call("editMessageText", payload)


async def tg_answer_callback(callback_id: str, text: str | None = None) -> None:
    payload = {"callback_query_id": callback_id}
    if text:
        payload["text"] = text
    await tg_call("answerCallbackQuery", payload)


async def tg_get_file_url(file_id: str) -> str | None:
    res = await tg_call("getFile", {"file_id": file_id})
    if not res.get("ok"):
        return None
    file_path = res["result"]["file_path"]
    return f"{TG_API}/file/bot{TG_TOKEN}/{file_path}"


async def tg_download_file(file_id: str) -> tuple[bytes, str] | None:
    url = await tg_get_file_url(file_id)
    if not url:
        return None
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url)
    if r.status_code != 200:
        return None
    mime = r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
    return r.content, mime


def _user_for_chat(db: Session, chat_id: int) -> tuple[int, TelegramLink] | None:
    link = db.query(TelegramLink).filter(TelegramLink.chat_id == chat_id).first()
    if not link:
        return None
    return link.user_id, link


def _accounts_keyboard(accounts: list[Account], pending_id: int) -> dict:
    rows = []
    for a in accounts:
        rows.append([{
            "text": f"{a.name} ({a.type})",
            "callback_data": f"acc:{pending_id}:{a.id}",
        }])
    rows.append([{"text": "Sin cuenta", "callback_data": f"acc:{pending_id}:none"}])
    rows.append([{"text": "❌ Cancelar", "callback_data": f"cancel:{pending_id}"}])
    return {"inline_keyboard": rows}


def _categories_keyboard(cats: list[Category], pending_id: int) -> dict:
    rows = []
    # 2 per row
    cur: list[dict] = []
    for c in cats:
        cur.append({"text": c.name, "callback_data": f"cat:{pending_id}:{c.id}"})
        if len(cur) == 2:
            rows.append(cur)
            cur = []
    if cur:
        rows.append(cur)
    rows.append([{"text": "Sin categoría", "callback_data": f"cat:{pending_id}:none"}])
    rows.append([{"text": "❌ Cancelar", "callback_data": f"cancel:{pending_id}"}])
    return {"inline_keyboard": rows}


def _format_extracted_summary(ex: dict) -> str:
    amount = ex.get("amount")
    merchant = ex.get("merchant") or ex.get("description") or "—"
    date = ex.get("date") or "—"
    suggested = ex.get("suggested_category") or "—"
    conf = ex.get("confidence")
    conf_str = f"{int(conf * 100)}%" if conf else "—"
    items = ex.get("items") or []
    items_block = ""
    if items:
        items_block = "\n\n<b>Items:</b>\n" + "\n".join(
            f"• {it.get('name', '?')} — {Decimal(str(it.get('amount', 0))):.2f}€" for it in items[:8]
        )
    return (
        f"🧾 <b>Ticket detectado</b>\n\n"
        f"<b>Importe:</b> {amount:.2f}€\n"
        f"<b>Comercio:</b> {merchant}\n"
        f"<b>Fecha:</b> {date}\n"
        f"<b>Categoría sugerida:</b> {suggested}\n"
        f"<b>Confianza:</b> {conf_str}"
        f"{items_block}\n\n"
        f"¿Con qué cuenta pagaste?"
    )


async def _scan_image_with_gemini(image_bytes: bytes, mime: str) -> dict:
    if not GEMINI_API_KEY:
        raise HTTPException(500, "Gemini API key no configurada")
    prompt = """Eres un experto extractor de datos de tickets de compra.
Devuelve ÚNICAMENTE JSON válido sin markdown:
{
  "amount": 12.34,
  "type": "EXPENSE",
  "description": "Mercadona",
  "date": "2026-05-09",
  "merchant": "Mercadona",
  "suggested_category": "Alimentación",
  "currency": "EUR",
  "confidence": 0.92,
  "items": [{"name": "Pan", "amount": 1.20}]
}
Reglas:
- amount: importe TOTAL pagado positivo.
- type: "EXPENSE" salvo si claramente es ingreso.
- date: YYYY-MM-DD.
- suggested_category en español: Alimentación, Transporte, Restauración, Salud, Hogar, Ocio, Tecnología, Ropa, Otros.
- Si no es un ticket, devuelve {"error":"no_ticket"}."""

    last_exc: Exception | None = None
    for model_name in (DEFAULT_MODEL, "gemini-2.5-flash", "gemini-2.0-flash"):
        try:
            model = genai.GenerativeModel(model_name)
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    model.generate_content,
                    [prompt, {"mime_type": mime, "data": image_bytes}],
                ),
                timeout=45,
            )
            text = (response.text or "").strip().replace("```json", "").replace("```", "").strip()
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                print(f"[gemini] {model_name} returned non-JSON: {text[:300]}")
                return {"error": "parse_failed"}
        except asyncio.TimeoutError as exc:
            print(f"[gemini] {model_name} timeout after 45s")
            last_exc = exc
        except Exception as exc:
            print(f"[gemini] {model_name} failed: {type(exc).__name__}: {exc}")
            last_exc = exc
    raise HTTPException(502, f"Modelo IA no disponible: {last_exc}")


# -------- Webauth endpoints (linking flow from web) --------

@router.get("/status")
def telegram_status(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    link = db.query(TelegramLink).filter(TelegramLink.user_id == current_user.id).first()
    return {
        "linked": link is not None,
        "username": link.username if link else None,
        "first_name": link.first_name if link else None,
        "linked_at": link.linked_at if link else None,
        "bot_username": TG_BOT_USERNAME or None,
        "bot_configured": bool(TG_TOKEN),
    }


@router.post("/link/generate")
def generate_link_code(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not TG_TOKEN:
        raise HTTPException(503, "El bot de Telegram aún no está configurado en el servidor.")
    # Invalidate previous unused codes for this user
    db.query(TelegramLinkCode).filter(
        TelegramLinkCode.user_id == current_user.id,
        TelegramLinkCode.used_at.is_(None),
    ).delete()
    code = _gen_code()
    expires = _now() + timedelta(minutes=LINK_CODE_TTL_MIN)
    rec = TelegramLinkCode(user_id=current_user.id, code=code, expires_at=expires)
    db.add(rec)
    db.commit()
    db.refresh(rec)
    deep_link = f"https://t.me/{TG_BOT_USERNAME}?start={code}" if TG_BOT_USERNAME else None
    return {
        "code": code,
        "expires_at": expires,
        "bot_username": TG_BOT_USERNAME or None,
        "deep_link": deep_link,
        "ttl_minutes": LINK_CODE_TTL_MIN,
    }


@router.delete("/link", status_code=status.HTTP_204_NO_CONTENT)
def unlink_telegram(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db.query(TelegramLink).filter(TelegramLink.user_id == current_user.id).delete()
    db.commit()
    return None


# -------- Webhook receiver --------

@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
):
    # Hard-fail if secret not configured. Empty TG_WEBHOOK_SECRET previously
    # meant "allow any caller", which let anyone POST fake updates.
    if not TG_WEBHOOK_SECRET:
        raise HTTPException(503, "Webhook secret not configured")
    if x_telegram_bot_api_secret_token != TG_WEBHOOK_SECRET:
        raise HTTPException(403, "Forbidden")
    if not TG_TOKEN:
        raise HTTPException(503, "Telegram bot token not configured")

    update = await request.json()
    try:
        await _handle_update(db, update)
    except Exception as exc:
        # Log but always 200 OK so Telegram doesn't retry forever
        print(f"[tg_webhook] error handling update: {exc}")
    return {"ok": True}


async def _handle_update(db: Session, update: dict) -> None:
    if "message" in update:
        await _handle_message(db, update["message"])
    elif "callback_query" in update:
        await _handle_callback(db, update["callback_query"])


async def _handle_message(db: Session, msg: dict) -> None:
    chat = msg.get("chat", {})
    chat_id = chat.get("id")
    if chat_id is None:
        return
    text: str = (msg.get("text") or "").strip()
    from_user = msg.get("from", {})

    # /start <code> → link
    if text.startswith("/start"):
        parts = text.split(maxsplit=1)
        if len(parts) == 2:
            code = parts[1].strip()
            await _link_with_code(db, chat_id, code, from_user)
            return
        # Plain /start
        already = _user_for_chat(db, chat_id)
        if already:
            await tg_send_message(
                chat_id,
                "Ya tienes tu cuenta vinculada ✅\n\n"
                "Envíame fotos de tus tickets y los guardaré como gastos. "
                "Comandos: /status /unlink /help",
            )
        else:
            await tg_send_message(
                chat_id,
                "👋 Hola! Para vincular tu cuenta de AI Finance:\n\n"
                "1. Entra en la app → <b>Ajustes</b> → <b>Conectar Telegram</b>\n"
                "2. Genera el código de vinculación\n"
                "3. Mándamelo aquí con <code>/start CÓDIGO</code>",
            )
        return

    if text in ("/help", "/ayuda"):
        await tg_send_message(
            chat_id,
            "<b>AI Finance Bot</b>\n\n"
            "📷 Envía una foto de un ticket → la guardo como gasto.\n"
            "📝 También puedes mandar texto tipo <i>'12.50 Mercadona'</i>.\n\n"
            "Comandos:\n"
            "• /status — estado de la cuenta\n"
            "• /unlink — desvincular\n"
            "• /help — esta ayuda",
        )
        return

    if text == "/status":
        link = _user_for_chat(db, chat_id)
        if not link:
            await tg_send_message(chat_id, "No estás vinculado. Usa /start CÓDIGO.")
        else:
            await tg_send_message(chat_id, "✅ Cuenta vinculada y lista.")
        return

    if text == "/unlink":
        db.query(TelegramLink).filter(TelegramLink.chat_id == chat_id).delete()
        db.commit()
        await tg_send_message(chat_id, "🔌 Cuenta desvinculada. Para volver a conectar usa /start CÓDIGO.")
        return

    # Photo handling (compressed image attached as "photo")
    photos = msg.get("photo")
    if photos:
        await _handle_ticket_photo(db, chat_id, msg, from_user)
        return

    # Document handling: image sent as file ("send as file") preserves quality
    document = msg.get("document")
    if document:
        mime = (document.get("mime_type") or "").lower()
        if mime.startswith("image/"):
            await _handle_ticket_document(db, chat_id, msg, document)
            return
        await tg_send_message(
            chat_id,
            "📎 Solo proceso imágenes. Mándame el ticket como foto o como archivo de imagen (JPG/PNG/WebP).",
        )
        return

    # Free text expense entry: "12.5 Mercadona"
    if text:
        await _handle_text_expense(db, chat_id, text)
        return


async def _link_with_code(db: Session, chat_id: int, code: str, from_user: dict) -> None:
    rec = (
        db.query(TelegramLinkCode)
        .filter(TelegramLinkCode.code == code.upper(), TelegramLinkCode.used_at.is_(None))
        .first()
    )
    if not rec:
        await tg_send_message(chat_id, "❌ Código no válido o ya usado.")
        return
    expires_at = rec.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < _now():
        await tg_send_message(chat_id, "❌ Código caducado. Genera uno nuevo en la app.")
        return
    # Remove any previous link for this user/chat
    db.query(TelegramLink).filter(
        (TelegramLink.user_id == rec.user_id) | (TelegramLink.chat_id == chat_id)
    ).delete()
    link = TelegramLink(
        user_id=rec.user_id,
        chat_id=chat_id,
        username=from_user.get("username"),
        first_name=from_user.get("first_name"),
    )
    db.add(link)
    rec.used_at = _now()
    db.commit()
    await tg_send_message(
        chat_id,
        "✅ <b>Cuenta vinculada</b>\n\n"
        "Ya puedes mandarme fotos de tus tickets y los registraré como gastos automáticamente. "
        "Te preguntaré con qué cuenta pagaste.",
    )


async def _handle_ticket_photo(db: Session, chat_id: int, msg: dict, from_user: dict) -> None:
    user_link = _user_for_chat(db, chat_id)
    if not user_link:
        await tg_send_message(chat_id, "No estás vinculado. Genera un código en la app y mándamelo con /start CÓDIGO.")
        return
    user_id, _ = user_link
    photos = msg.get("photo", [])
    if not photos:
        return
    photo = sorted(photos, key=lambda p: p.get("file_size") or 0)[-1]
    file_id = photo.get("file_id")
    if not file_id:
        return
    await _process_ticket_image(db, chat_id, user_id, file_id)


async def _handle_ticket_document(db: Session, chat_id: int, msg: dict, document: dict) -> None:
    user_link = _user_for_chat(db, chat_id)
    if not user_link:
        await tg_send_message(chat_id, "No estás vinculado. Genera un código en la app y mándamelo con /start CÓDIGO.")
        return
    user_id, _ = user_link
    file_id = document.get("file_id")
    file_size = document.get("file_size") or 0
    if not file_id:
        return
    if file_size > 10 * 1024 * 1024:
        await tg_send_message(chat_id, "⚠️ El archivo es demasiado grande (máx 10 MB).")
        return
    await _process_ticket_image(db, chat_id, user_id, file_id)


async def _process_ticket_image(
    db: Session,
    chat_id: int,
    user_id: int,
    file_id: str,
) -> None:
    """Common pipeline: download image, OCR via Gemini, store pending, ask for account."""
    progress = await tg_send_message(chat_id, "📷 Recibido. Analizando ticket con IA…")
    progress_id = (progress.get("result") or {}).get("message_id") if progress.get("ok") else None

    async def _report_error(text: str) -> None:
        if progress_id:
            try:
                await tg_edit_message(chat_id, progress_id, text)
                return
            except Exception:
                pass
        await tg_send_message(chat_id, text)

    download = await tg_download_file(file_id)
    if not download:
        await _report_error("⚠️ No he podido descargar la imagen. Inténtalo de nuevo.")
        return
    image_bytes, mime = download
    print(f"[tg] downloaded {len(image_bytes)} bytes, mime={mime}")

    try:
        extracted = await _scan_image_with_gemini(image_bytes, mime)
    except HTTPException as exc:
        await _report_error(f"⚠️ Error de la IA: {exc.detail}")
        return
    except Exception as exc:
        print(f"[tg] gemini exception: {type(exc).__name__}: {exc}")
        await _report_error(f"⚠️ Error analizando: {type(exc).__name__}. Prueba de nuevo en unos segundos.")
        return

    if "error" in extracted:
        if extracted["error"] == "no_ticket":
            msg_err = "⚠️ La imagen no parece un ticket o factura."
        elif extracted["error"] == "parse_failed":
            msg_err = "⚠️ La IA respondió pero no pude leer el formato. Prueba con una foto más nítida."
        else:
            msg_err = f"⚠️ Error: {extracted['error']}"
        await _report_error(msg_err)
        return

    # Persist as pending and ask for account
    pending = TelegramPendingTicket(
        user_id=user_id,
        chat_id=chat_id,
        message_id=progress_id,
        state="awaiting_account",
        extracted=extracted,
    )
    db.add(pending)
    db.commit()
    db.refresh(pending)

    accounts = (
        db.query(Account)
        .filter(Account.user_id == user_id)
        .order_by(Account.created_at.asc())
        .all()
    )
    summary = _format_extracted_summary(extracted)
    keyboard = _accounts_keyboard(accounts, pending.id)
    if progress_id:
        await tg_edit_message(chat_id, progress_id, summary, reply_markup=keyboard)
    else:
        await tg_send_message(chat_id, summary, reply_markup=keyboard)


async def _handle_callback(db: Session, cb: dict) -> None:
    cb_id = cb.get("id")
    data: str = cb.get("data") or ""
    msg = cb.get("message") or {}
    chat_id = (msg.get("chat") or {}).get("id")
    message_id = msg.get("message_id")
    if not chat_id or not data:
        await tg_answer_callback(cb_id)
        return

    user_link = _user_for_chat(db, chat_id)
    if not user_link:
        await tg_answer_callback(cb_id, "No vinculado")
        return
    user_id, _ = user_link

    parts = data.split(":")
    action = parts[0]

    if action == "cancel" and len(parts) >= 2:
        pid = int(parts[1])
        db.query(TelegramPendingTicket).filter(
            TelegramPendingTicket.id == pid, TelegramPendingTicket.user_id == user_id
        ).delete()
        db.commit()
        await tg_answer_callback(cb_id, "Cancelado")
        if message_id:
            await tg_edit_message(chat_id, message_id, "❌ Ticket descartado.")
        return

    if action == "acc" and len(parts) >= 3:
        pid = int(parts[1])
        choice = parts[2]
        pending = (
            db.query(TelegramPendingTicket)
            .filter(TelegramPendingTicket.id == pid, TelegramPendingTicket.user_id == user_id)
            .first()
        )
        if not pending:
            await tg_answer_callback(cb_id, "Ticket no encontrado")
            return
        if choice != "none":
            acc = (
                db.query(Account)
                .filter(Account.id == int(choice), Account.user_id == user_id)
                .first()
            )
            if not acc:
                await tg_answer_callback(cb_id, "Cuenta no válida")
                return
            pending.account_id = acc.id
        else:
            pending.account_id = None
        pending.state = "awaiting_category"
        db.commit()

        # Now show categories (EXPENSE only by default)
        cats = (
            db.query(Category)
            .filter(Category.user_id == user_id, Category.type == TransactionType.EXPENSE)
            .order_by(Category.name.asc())
            .limit(20)
            .all()
        )
        keyboard = _categories_keyboard(cats, pid)
        await tg_answer_callback(cb_id)
        if message_id:
            extracted = pending.extracted or {}
            text = _format_extracted_summary(extracted) + "\n\n¿Qué categoría?"
            await tg_edit_message(chat_id, message_id, text, reply_markup=keyboard)
        return

    if action == "cat" and len(parts) >= 3:
        pid = int(parts[1])
        choice = parts[2]
        pending = (
            db.query(TelegramPendingTicket)
            .filter(TelegramPendingTicket.id == pid, TelegramPendingTicket.user_id == user_id)
            .first()
        )
        if not pending:
            await tg_answer_callback(cb_id, "Ticket no encontrado")
            return
        if choice != "none":
            cat = (
                db.query(Category)
                .filter(Category.id == int(choice), Category.user_id == user_id)
                .first()
            )
            if not cat:
                await tg_answer_callback(cb_id, "Categoría no válida")
                return
            pending.category_id = cat.id
        else:
            pending.category_id = None

        # Save the transaction now
        ex = pending.extracted or {}
        amount = ex.get("amount")
        if amount is None:
            await tg_answer_callback(cb_id, "Sin importe")
            return
        type_str = ex.get("type", "EXPENSE")
        type_enum = TransactionType.INCOME if type_str == "INCOME" else TransactionType.EXPENSE
        date_str = ex.get("date")
        try:
            tx_date = datetime.strptime(date_str, "%Y-%m-%d") if date_str else datetime.utcnow()
        except ValueError:
            tx_date = datetime.utcnow()

        tx = Transaction(
            amount=float(amount),
            type=type_enum,
            description=ex.get("description") or ex.get("merchant") or "Ticket",
            date=tx_date,
            user_id=user_id,
            account_id=pending.account_id,
            category_id=pending.category_id,
        )
        db.add(tx)
        db.delete(pending)
        db.commit()

        await tg_answer_callback(cb_id, "Guardado ✅")
        if message_id:
            confirm = (
                f"✅ <b>Guardado</b>\n\n"
                f"<b>{ex.get('merchant') or ex.get('description') or 'Ticket'}</b>\n"
                f"{type_enum.value} · {float(amount):.2f}€ · {tx_date.strftime('%Y-%m-%d')}\n"
            )
            await tg_edit_message(chat_id, message_id, confirm)
        return

    await tg_answer_callback(cb_id)


async def _handle_text_expense(db: Session, chat_id: int, text: str) -> None:
    user_link = _user_for_chat(db, chat_id)
    if not user_link:
        await tg_send_message(chat_id, "Antes vincula tu cuenta. Genera un código en la app.")
        return
    user_id, _ = user_link

    # Try simple formats: "12.50 Mercadona" or "Mercadona 12.50"
    import re
    match = re.search(r"(\d+(?:[.,]\d{1,2})?)", text)
    if not match:
        await tg_send_message(
            chat_id,
            "No he detectado un importe. Prueba con <code>12.50 Mercadona</code> o mándame una foto del ticket.",
        )
        return
    amount = float(match.group(1).replace(",", "."))
    desc = text.replace(match.group(0), "").strip(" -·,") or "Gasto"

    tx = Transaction(
        amount=amount,
        type=TransactionType.EXPENSE,
        description=desc,
        date=datetime.utcnow(),
        user_id=user_id,
    )
    db.add(tx)
    db.commit()
    await tg_send_message(
        chat_id,
        f"✅ Guardado: <b>{desc}</b> — {amount:.2f}€",
    )
