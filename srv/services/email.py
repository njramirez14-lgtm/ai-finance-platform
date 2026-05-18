"""Lightweight email sender via Resend.

Why Resend: simple REST API, free tier 100/day · 3000/month, no SDK needed,
works on Vercel serverless with zero infra. Get the key at https://resend.com,
add domain (or use onboarding@resend.dev for dev), set env RESEND_API_KEY.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

log = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"
DEFAULT_FROM = os.environ.get("RESEND_FROM", "ai-finance <onboarding@resend.dev>")


def is_configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY"))


def send_email(
    to: str | list[str],
    subject: str,
    html: str,
    text: str | None = None,
    from_addr: str | None = None,
) -> dict[str, Any]:
    """Returns provider response. Raises on transport error.
    Returns {'skipped': True} when RESEND_API_KEY is missing — caller logs."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        log.warning("RESEND_API_KEY not set — skipping send to %s", to)
        return {"skipped": True}

    payload: dict[str, Any] = {
        "from": from_addr or DEFAULT_FROM,
        "to": [to] if isinstance(to, str) else to,
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text

    r = httpx.post(
        RESEND_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=15,
    )
    if r.status_code >= 400:
        log.error("Resend error %s: %s", r.status_code, r.text[:300])
        r.raise_for_status()
    return r.json()


def render_digest(
    user_email: str,
    reminders: list[dict],
    paydays: list[dict],
    expiring_docs: list[dict],
) -> tuple[str, str, str]:
    """Returns (subject, html, text)."""
    sections = []
    counts = []
    if reminders:
        counts.append(f"{len(reminders)} recordatorio{'s' if len(reminders) != 1 else ''}")
        def _row(r):
            cat = r.get("category")
            cat_suffix = f" ({cat})" if cat else ""
            return f"<li><strong>{r['title']}</strong> — vence {r['due']}{cat_suffix}</li>"
        rows = "".join(_row(r) for r in reminders)
        sections.append(f"<h3>Recordatorios próximos</h3><ul>{rows}</ul>")
    if paydays:
        counts.append(f"{len(paydays)} nómina{'s' if len(paydays) != 1 else ''}")
        rows = "".join(
            f"<li><strong>{p['name']}</strong> — {p['amount']} el {p['date']} (en {p['days']} días)</li>"
            for p in paydays
        )
        sections.append(f"<h3>Pagos de nómina próximos</h3><ul>{rows}</ul>")
    if expiring_docs:
        counts.append(f"{len(expiring_docs)} documento{'s' if len(expiring_docs) != 1 else ''} caducando")
        rows = "".join(
            f"<li><strong>{d['title']}</strong> ({d['employee']}) — vence {d['expires']}</li>"
            for d in expiring_docs
        )
        sections.append(f"<h3>Documentos por caducar</h3><ul>{rows}</ul>")

    subject = "AI Finance · " + (", ".join(counts) if counts else "Resumen diario")
    body = "".join(sections) or "<p>Nada urgente hoy. Buen día.</p>"
    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Tu resumen</h2>
      {body}
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #64748b;">
        Recibido como {user_email}. Configura preferencias en Ajustes &gt; Notificaciones.
      </p>
    </div>
    """
    plain_lines = [f"AI Finance · resumen para {user_email}", ""]
    if reminders:
        plain_lines.append("Recordatorios próximos:")
        for r in reminders:
            plain_lines.append(f"  - {r['title']} (vence {r['due']})")
        plain_lines.append("")
    if paydays:
        plain_lines.append("Próximas nóminas:")
        for p in paydays:
            plain_lines.append(f"  - {p['name']}: {p['amount']} el {p['date']}")
        plain_lines.append("")
    if expiring_docs:
        plain_lines.append("Documentos caducando:")
        for d in expiring_docs:
            plain_lines.append(f"  - {d['title']} ({d['employee']}): {d['expires']}")
    return subject, html, "\n".join(plain_lines)
