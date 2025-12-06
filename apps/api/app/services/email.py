"""
Email Service (SendGrid)
"""
import asyncio
import logging
from typing import Optional
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Content
from app.config import settings

logger = logging.getLogger(__name__)

class EmailService:
    @staticmethod
    async def send_email(to_email: str, subject: str, content: str):
        """
        Send email using SendGrid (async wrapper)

        Note: SendGrid's Python client is synchronous, so we use asyncio.to_thread()
        to run it in a thread pool without blocking the event loop.
        """
        if not settings.SENDGRID_API_KEY:
            logger.warning("SENDGRID_API_KEY is not set. Falling back to mock email.")
            logger.info("==================================================================")
            logger.info(f"MOCK EMAIL SENT TO: {to_email}")
            logger.info(f"SUBJECT: {subject}")
            logger.info(f"BODY:\n{content}")
            logger.info("==================================================================")
            return

        logger.info(f"Attempting to send email to {to_email} with subject: {subject}")
        logger.info(f"From email: {settings.SENDGRID_FROM_EMAIL}")
        logger.info(f"API Key configured: {settings.SENDGRID_API_KEY[:10]}...")

        message = Mail(
            from_email=settings.SENDGRID_FROM_EMAIL,
            to_emails=to_email,
            subject=subject,
            html_content=content
        )

        try:
            sg = SendGridAPIClient(settings.SENDGRID_API_KEY)

            # Run blocking call in thread pool to avoid blocking event loop
            response = await asyncio.to_thread(sg.send, message)

            # Log full response for debugging
            logger.info(f"SendGrid Response Status Code: {response.status_code}")
            logger.info(f"SendGrid Response Body: {response.body}")
            logger.info(f"SendGrid Response Headers: {response.headers}")

            if response.status_code >= 200 and response.status_code < 300:
                logger.info(f"✅ Email successfully sent to {to_email}")
            else:
                logger.error(f"❌ SendGrid returned non-success status: {response.status_code}")
                logger.error(f"Response body: {response.body}")

        except Exception as e:
            logger.error(f"❌ Failed to send email to {to_email}")
            logger.error(f"Error type: {type(e).__name__}")
            logger.error(f"Error message: {str(e)}")
            logger.error(f"Full exception:", exc_info=True)
            raise e

    @staticmethod
    async def send_password_reset_email(to_email: str, reset_link: str):
        subject = "Reset Your Password - Tarantuverse"
        # Simple HTML template
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Reset Your Password</h2>
            <p>Hello,</p>
            <p>You have requested to reset your password. Please click the button below to reset it:</p>
            <p style="margin: 20px 0;">
                <a href="{reset_link}" style="background-color: #7c3aed; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    Reset Password
                </a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="{reset_link}">{reset_link}</a></p>
            <p>If you did not request this, please ignore this email.</p>
            <p>The link will expire in 24 hours.</p>
            <hr style="margin-top: 20px; border: 0; border-top: 1px solid #eee;" />
            <p style="color: #666; font-size: 12px;">Tarantuverse Team</p>
        </div>
        """
        await EmailService.send_email(to_email, subject, html_content)

    @staticmethod
    async def send_verification_email(to_email: str, verify_link: str):
        subject = "Verify Your Email - Tarantuverse"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Verify Your Email Address</h2>
            <p>Hello,</p>
            <p>Thanks for signing up for Tarantuverse! Please confirm your email address by clicking the button below:</p>
            <p style="margin: 20px 0;">
                <a href="{verify_link}" style="background-color: #7c3aed; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    Verify Email
                </a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="{verify_link}">{verify_link}</a></p>
            <p>If you did not create an account, please ignore this email.</p>
            <hr style="margin-top: 20px; border: 0; border-top: 1px solid #eee;" />
            <p style="color: #666; font-size: 12px;">Tarantuverse Team</p>
        </div>
        """
        await EmailService.send_email(to_email, subject, html_content)
