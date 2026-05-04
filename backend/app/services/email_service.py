import smtplib
import ssl
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.core.config import settings


def _build_transport() -> smtplib.SMTP:
    """
    Tenta SMTPS (SSL direto, porta 465) primeiro.
    Se falhar por incompatibilidade SSL, tenta STARTTLS (porta 587).
    """
    ctx = ssl.create_default_context()
    try:
        smtp = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=ctx)
        smtp.login(settings.smtp_user, settings.smtp_password)
        return smtp
    except ssl.SSLError:
        pass

    # Fallback: STARTTLS
    smtp = smtplib.SMTP(settings.smtp_host, 587)
    smtp.ehlo()
    smtp.starttls(context=ctx)
    smtp.ehlo()
    smtp.login(settings.smtp_user, settings.smtp_password)
    return smtp


def send_html(
    to: list[str],
    subject: str,
    html: str,
    attachments: Optional[list[tuple[str, bytes]]] = None,
) -> None:
    """
    Envia e-mail HTML com anexos opcionais.
    attachments: lista de (filename, bytes) — ex.: [("relatorio.pdf", pdf_bytes)]
    """
    if not to:
        return
    if not settings.smtp_password:
        raise RuntimeError("SMTP_PASSWORD não configurado no servidor.")

    if attachments:
        msg: MIMEMultipart = MIMEMultipart("mixed")
        html_part = MIMEMultipart("alternative")
        html_part.attach(MIMEText(html, "html", "utf-8"))
        msg.attach(html_part)
        for filename, data in attachments:
            part = MIMEApplication(data, Name=filename)
            part["Content-Disposition"] = f'attachment; filename="{filename}"'
            msg.attach(part)
    else:
        msg = MIMEMultipart("alternative")
        msg.attach(MIMEText(html, "html", "utf-8"))

    msg["Subject"] = subject
    msg["From"]    = f"{settings.smtp_from_name} <{settings.smtp_user}>"
    msg["To"]      = ", ".join(to)

    with _build_transport() as smtp:
        smtp.sendmail(settings.smtp_user, to, msg.as_string())
