"""
Email Service (Mock)
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)

class EmailService:
    @staticmethod
    async def send_email(to_email: str, subject: str, body: str):
        """
        Mock email sending.
        In production, this would use SMTP or an API like SendGrid/Resend.
        """
        logger.info("==================================================================")
        logger.info(f"MOCK EMAIL SENT TO: {to_email}")
        logger.info(f"SUBJECT: {subject}")
        logger.info(f"BODY:\n{body}")
        logger.info("==================================================================")
        print(f"MOCK EMAIL SENT TO: {to_email} | SUBJECT: {subject}")

    @staticmethod
    async def send_password_reset_email(to_email: str, reset_link: str):
        subject = "Reset Your Password - Tarantuverse"
        body = f"""
Hello,

You have requested to reset your password. Please click the link below to reset it:

{reset_link}

If you did not request this, please ignore this email.
The link will expire in 24 hours.

Best regards,
Tarantuverse Team
        """
        await EmailService.send_email(to_email, subject, body)
