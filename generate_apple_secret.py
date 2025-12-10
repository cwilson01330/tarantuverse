#!/usr/bin/env python3
"""
Generate Apple Client Secret for Sign in with Apple
This creates a JWT token signed with your Apple private key
"""

import jwt
import time

# Your Apple Developer credentials
TEAM_ID = "G872A6667J"
CLIENT_ID = "com.tarantuverse.signin"  # Your Services ID
KEY_ID = "4Z78PDSVTY"

# Your private key (from the .p8 file)
PRIVATE_KEY = """-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgCeA7qTloBx21Gua2
xc3ZaxueKQZCLs7NcjEIz2EiadWgCgYIKoZIzj0DAQehRANCAATZOgZCycKnGBsZ
UQCxnBMQnumf4Q8UilB+v37NpgfjCb+j1SL7nkSlGOGNfHXibK7iHmSL3ntQYzdF
MnzuZ+E6
-----END PRIVATE KEY-----"""

def generate_apple_client_secret():
    """Generate Apple Client Secret JWT"""

    # Token is valid for 6 months (maximum allowed by Apple)
    issued_at = int(time.time())
    expiration = issued_at + (86400 * 180)  # 180 days (6 months)

    headers = {
        "alg": "ES256",
        "kid": KEY_ID
    }

    payload = {
        "iss": TEAM_ID,
        "iat": issued_at,
        "exp": expiration,
        "aud": "https://appleid.apple.com",
        "sub": CLIENT_ID
    }

    # Generate the JWT token
    client_secret = jwt.encode(
        payload,
        PRIVATE_KEY,
        algorithm="ES256",
        headers=headers
    )

    return client_secret

if __name__ == "__main__":
    print("=" * 70)
    print("Apple Sign in with Apple - Client Secret Generator")
    print("=" * 70)
    print()
    print(f"Team ID:     {TEAM_ID}")
    print(f"Client ID:   {CLIENT_ID}")
    print(f"Key ID:      {KEY_ID}")
    print()
    print("Generating client secret (valid for 6 months)...")
    print()

    try:
        client_secret = generate_apple_client_secret()

        print("✅ SUCCESS! Your Apple Client Secret:")
        print()
        print("-" * 70)
        print(client_secret)
        print("-" * 70)
        print()
        print("📋 Add these to your environment variables:")
        print()
        print(f"APPLE_CLIENT_ID={CLIENT_ID}")
        print(f"APPLE_CLIENT_SECRET={client_secret}")
        print()
        print("⚠️  Note: This token expires in 6 months. Regenerate it before then!")
        print()

    except Exception as e:
        print(f"❌ ERROR: {e}")
        print()
        print("Make sure you have PyJWT installed:")
        print("  pip install pyjwt cryptography")
