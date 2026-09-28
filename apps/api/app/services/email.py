"""
Email service backed by Resend.
"""
import logging

import httpx

from app.config import settings
from app.utils.frontend_origin import TARANTUVERSE, Brand

logger = logging.getLogger(__name__)


def _verification_window() -> str:
    """Human wording for the verification-link lifetime, read from the TTL
    itself so the email can never promise a window the server doesn't honor."""
    from app.utils.auth import EMAIL_VERIFICATION_TTL  # lazy: utils.auth imports config

    hours = int(EMAIL_VERIFICATION_TTL.total_seconds() // 3600)
    if hours % 24 == 0 and hours >= 48:
        return f"{hours // 24} days"
    return f"{hours} hours"


class EmailService:
    API_URL = "https://api.resend.com/emails"

    @staticmethod
    async def send_email(to_email: str, subject: str, content: str):
        """
        Send email using Resend, with a log-only fallback when the API key is unset.
        """
        if not settings.RESEND_API_KEY:
            logger.warning("RESEND_API_KEY is not set. Falling back to mock email.")
            logger.info("==================================================================")
            logger.info("MOCK EMAIL SENT TO: %s", to_email)
            logger.info("SUBJECT: %s", subject)
            logger.info("BODY:\n%s", content)
            logger.info("==================================================================")
            return

        logger.info("Attempting to send email to %s with subject: %s", to_email, subject)
        logger.info("From email: %s", settings.RESEND_FROM_EMAIL)

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    EmailService.API_URL,
                    headers={
                        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": settings.RESEND_FROM_EMAIL,
                        "to": [to_email],
                        "subject": subject,
                        "html": content,
                    },
                )

            response.raise_for_status()
            logger.info("Email successfully sent to %s via Resend", to_email)
        except Exception:
            logger.error("Failed to send email to %s via Resend", to_email, exc_info=True)
            raise

    @staticmethod
    async def send_password_reset_email(to_email: str, reset_link: str, brand: "Brand | None" = None):
        brand = brand or TARANTUVERSE
        subject = f"Reset Your Password - {brand.name}"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Reset Your Password</h2>
            <p>Hello,</p>
            <p>You have requested to reset your {brand.name} password. Please click the button below to reset it:</p>
            <p style="margin: 20px 0;">
                <a href="{reset_link}" style="background-color: {brand.button_hex}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    Reset Password
                </a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="{reset_link}">{reset_link}</a></p>
            <p>If you did not request this, please ignore this email.</p>
            <p>The link will expire in 24 hours.</p>
            <hr style="margin-top: 20px; border: 0; border-top: 1px solid #eee;" />
            <p style="color: #666; font-size: 12px;">{brand.name} Team</p>
        </div>
        """
        await EmailService.send_email(to_email, subject, html_content)

    @staticmethod
    async def send_verification_email(to_email: str, verify_link: str, brand: "Brand | None" = None):
        # Named after the app the keeper actually signed up in. Tarantuverse
        # and Herpetoverse share one API; a reptile keeper getting a
        # "Tarantuverse" email that links to tarantuverse.com reasonably
        # assumes it's spam.
        brand = brand or TARANTUVERSE
        subject = f"Verify Your Email - {brand.name}"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Verify Your Email Address</h2>
            <p>Hello,</p>
            <p>Thanks for signing up for {brand.name}! Please confirm your email address by clicking the button below:</p>
            <p style="margin: 20px 0;">
                <a href="{verify_link}" style="background-color: {brand.button_hex}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    Verify Email
                </a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="{verify_link}">{verify_link}</a></p>
            <p>This link works for {_verification_window()}. If it runs out, just try logging in and tap
               <strong>Send a new link</strong>.</p>
            <p>If you did not create an account, please ignore this email.</p>
            <hr style="margin-top: 20px; border: 0; border-top: 1px solid #eee;" />
            <p style="color: #666; font-size: 12px;">{brand.name} Team</p>
        </div>
        """
        await EmailService.send_email(to_email, subject, html_content)
