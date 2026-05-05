import re
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.core.config import settings


def _html_to_text(html: str) -> str:
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _send_via_resend(to: list[str], subject: str, html: str, plain: str,
                     attachments: Optional[list[tuple[str, bytes]]]) -> None:
    import resend
    resend.api_key = settings.resend_api_key
    params: dict = {
        "from": f"{settings.smtp_from_name} <{settings.smtp_user}>",
        "to": to,
        "subject": subject,
        "html": html,
        "text": plain,
    }
    if attachments:
        params["attachments"] = [
            {"filename": filename, "content": list(data)}
            for filename, data in attachments
        ]
    resend.Emails.send(params)


def _send_via_smtp(to: list[str], subject: str, html: str, plain: str,
                   attachments: Optional[list[tuple[str, bytes]]]) -> None:
    if not settings.smtp_password:
        raise RuntimeError("SMTP_PASSWORD não configurado no servidor.")

    alternative = MIMEMultipart("alternative")
    alternative.attach(MIMEText(plain, "plain", "utf-8"))
    alternative.attach(MIMEText(html, "html", "utf-8"))

    if attachments:
        msg: MIMEMultipart = MIMEMultipart("mixed")
        msg.attach(alternative)
        for filename, data in attachments:
            part = MIMEApplication(data, Name=filename)
            part["Content-Disposition"] = f'attachment; filename="{filename}"'
            msg.attach(part)
    else:
        msg = alternative

    msg["Subject"] = subject
    msg["From"]    = f"{settings.smtp_from_name} <{settings.smtp_user}>"
    msg["To"]      = ", ".join(to)

    if settings.smtp_port == 465:
        smtp = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port)
    else:
        smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
    smtp.login(settings.smtp_user, settings.smtp_password)
    with smtp:
        smtp.sendmail(settings.smtp_user, to, msg.as_string())


def send_html(
    to: list[str],
    subject: str,
    html: str,
    attachments: Optional[list[tuple[str, bytes]]] = None,
) -> None:
    if not to:
        return
    plain = _html_to_text(html)
    if settings.resend_api_key:
        _send_via_resend(to, subject, html, plain, attachments)
    else:
        _send_via_smtp(to, subject, html, plain, attachments)
