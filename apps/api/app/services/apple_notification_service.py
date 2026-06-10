"""Apple App Store Server Notifications (V2) — signature verification.

Apple POSTs a JSON body {"signedPayload": "<JWS>"} to our endpoint for
subscription lifecycle events (DID_RENEW, EXPIRED, REFUND, ...). The
payload is a JWS whose x5c certificate chain must be verified against
Apple's pinned root certificates — otherwise anyone could POST a forged
renewal and grant themselves premium.

Verification uses Apple's official `app-store-server-library`. Root
certificates live in app/certs/apple/*.cer (downloaded from
https://www.apple.com/certificateauthority/ and committed to the repo).

One endpoint serves both environments: we try the PRODUCTION verifier
first, then fall back to SANDBOX (App Store Connect lets you configure
both URLs to the same address; sandbox is also what App Review uses).
"""
import logging
import os
from typing import List, Optional, Tuple

from app.config import settings

logger = logging.getLogger(__name__)

_CERTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "certs", "apple"
)


class AppleNotificationError(Exception):
    """Raised when a notification cannot be verified or decoded."""


def _load_root_certificates() -> List[bytes]:
    certs: List[bytes] = []
    if not os.path.isdir(_CERTS_DIR):
        return certs
    for name in sorted(os.listdir(_CERTS_DIR)):
        if name.lower().endswith((".cer", ".der", ".pem")):
            with open(os.path.join(_CERTS_DIR, name), "rb") as f:
                certs.append(f.read())
    return certs


_verifiers = None  # lazily built [(env_name, SignedDataVerifier), ...]


def _get_verifiers():
    """Build (and cache) verifiers for production + sandbox.

    Production verification requires the app's numeric Apple ID
    (settings.APPLE_APP_APPLE_ID). If it isn't configured we still
    verify sandbox notifications and log loudly about production.
    """
    global _verifiers
    if _verifiers is not None:
        return _verifiers

    try:
        from appstoreserverlibrary.signed_data_verifier import SignedDataVerifier
        from appstoreserverlibrary.models.Environment import Environment
    except ImportError as exc:
        raise AppleNotificationError(
            "app-store-server-library is not installed — add it to requirements.txt"
        ) from exc

    roots = _load_root_certificates()
    if not roots:
        raise AppleNotificationError(
            f"No Apple root certificates found in {_CERTS_DIR}. Download them "
            "from https://www.apple.com/certificateauthority/ (see deploy notes)."
        )

    verifiers = []

    if settings.APPLE_APP_APPLE_ID:
        verifiers.append((
            "production",
            SignedDataVerifier(
                roots,
                True,  # enable_online_checks (OCSP revocation)
                Environment.PRODUCTION,
                settings.APPLE_BUNDLE_ID,
                settings.APPLE_APP_APPLE_ID,
            ),
        ))
    else:
        logger.warning(
            "APPLE_APP_APPLE_ID not set — production App Store notifications "
            "cannot be verified, only sandbox. Set it before going live."
        )

    verifiers.append((
        "sandbox",
        SignedDataVerifier(
            roots,
            True,
            Environment.SANDBOX,
            settings.APPLE_BUNDLE_ID,
            None,
        ),
    ))

    _verifiers = verifiers
    return _verifiers


def decode_notification(signed_payload: str) -> Tuple[str, Optional[str], object, str]:
    """Verify + decode a V2 notification.

    Returns (notification_type, subtype, transaction_payload, environment)
    where transaction_payload is the decoded JWSTransactionDecodedPayload
    (or None for notifications without transaction info).

    Raises AppleNotificationError if no verifier accepts the payload.
    """
    last_error: Optional[Exception] = None

    for env_name, verifier in _get_verifiers():
        try:
            payload = verifier.verify_and_decode_notification(signed_payload)

            transaction = None
            if payload.data and payload.data.signedTransactionInfo:
                transaction = verifier.verify_and_decode_signed_transaction(
                    payload.data.signedTransactionInfo
                )

            # rawNotificationType/rawSubtype keep the original strings even
            # if Apple adds types this library version doesn't know about.
            notification_type = payload.rawNotificationType or ""
            subtype = payload.rawSubtype

            return notification_type, subtype, transaction, env_name
        except Exception as exc:  # VerificationException et al.
            last_error = exc
            continue

    raise AppleNotificationError(f"Signature verification failed: {last_error}")


# ==================== APP STORE SERVER API ====================
# Uses the In-App Purchase key (APPLE_IAP_* settings) to talk to
# Apple's server API: real transaction verification for receipts, and
# test-notification round-trips.

_api_clients = None  # lazily built [(env_name, client), ...]


def api_configured() -> bool:
    return bool(
        settings.APPLE_IAP_KEY_ID
        and settings.APPLE_IAP_ISSUER_ID
        and settings.APPLE_IAP_PRIVATE_KEY
    )


def _get_api_clients():
    """Build (and cache) App Store Server API clients, production first."""
    global _api_clients
    if _api_clients is not None:
        return _api_clients

    if not api_configured():
        raise AppleNotificationError(
            "App Store Server API key not configured — set APPLE_IAP_KEY_ID, "
            "APPLE_IAP_ISSUER_ID and APPLE_IAP_PRIVATE_KEY."
        )

    from appstoreserverlibrary.api_client import AppStoreServerAPIClient
    from appstoreserverlibrary.models.Environment import Environment

    key_bytes = settings.APPLE_IAP_PRIVATE_KEY.encode("utf-8")

    _api_clients = [
        (
            env_name,
            AppStoreServerAPIClient(
                key_bytes,
                settings.APPLE_IAP_KEY_ID,
                settings.APPLE_IAP_ISSUER_ID,
                settings.APPLE_BUNDLE_ID,
                environment,
            ),
        )
        for env_name, environment in (
            ("production", Environment.PRODUCTION),
            ("sandbox", Environment.SANDBOX),
        )
    ]
    return _api_clients


def verify_transaction(transaction_id: str):
    """Look up a transaction on Apple's servers and verify its signature.

    Returns (decoded_transaction, environment_name). Tries production
    first, then sandbox (TestFlight / App Review purchases live there).
    Raises AppleNotificationError if the transaction doesn't exist in
    either environment or its signature doesn't verify.
    """
    from appstoreserverlibrary.api_client import APIException

    last_error = None
    for env_name, client in _get_api_clients():
        try:
            response = client.get_transaction_info(transaction_id)
        except APIException as exc:
            last_error = exc
            continue

        # Verify the returned JWS with the matching environment verifier
        for verifier_env, verifier in _get_verifiers():
            if verifier_env == env_name:
                decoded = verifier.verify_and_decode_signed_transaction(
                    response.signedTransactionInfo
                )
                return decoded, env_name

        raise AppleNotificationError(
            f"No signature verifier available for environment {env_name} "
            "(is APPLE_APP_APPLE_ID set?)"
        )

    raise AppleNotificationError(
        f"Transaction {transaction_id} not found on Apple's servers: {last_error}"
    )


def request_test_notification():
    """Ask Apple to send a TEST notification to the configured URL.

    Returns (environment_name, test_notification_token).
    """
    from appstoreserverlibrary.api_client import APIException

    last_error = None
    for env_name, client in _get_api_clients():
        try:
            response = client.request_test_notification()
            return env_name, response.testNotificationToken
        except APIException as exc:
            last_error = exc
            continue

    raise AppleNotificationError(f"Could not request test notification: {last_error}")


def get_test_notification_status(token: str):
    """Check how our server responded to a TEST notification.

    Returns (environment_name, [{'attemptDate': ms, 'result': str}, ...]).
    """
    from appstoreserverlibrary.api_client import APIException

    last_error = None
    for env_name, client in _get_api_clients():
        try:
            response = client.get_test_notification_status(token)
        except APIException as exc:
            last_error = exc
            continue

        attempts = [
            {
                "attemptDate": getattr(attempt, "attemptDate", None),
                "result": getattr(attempt, "rawSendAttemptResult", None)
                or str(getattr(attempt, "sendAttemptResult", None)),
            }
            for attempt in (response.sendAttempts or [])
        ]
        return env_name, attempts

    raise AppleNotificationError(f"Could not fetch test notification status: {last_error}")
