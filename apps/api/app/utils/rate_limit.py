"""
Shared rate limiter instance.

Import `limiter` here and in main.py so both share the same object.
Attach it to `app.state.limiter` in main.py and register the 429 handler.

Keying: which address is "the client"?
--------------------------------------
Render (behind Cloudflare) only APPENDS to X-Forwarded-For — it never clears
what the client sent. Uvicorn's proxy-header handling then reports the
LEFTMOST entry as `request.client.host`, which the client controls. Verified
live 2026-09-29: a request carrying `X-Forwarded-For: 1.2.3.4` was logged as
coming from 1.2.3.4. Keying the limiter on that let anyone dodge every limit
(login, register, password reset, invites) by rotating a made-up header.

So `client_ip` ignores `request.client.host` and reads, in order:
  1. CF-Connecting-IP — set by Cloudflare at the edge from the TCP peer, and
     overwritten if a client sends its own.
  2. The RIGHTMOST X-Forwarded-For entry — the one our own proxy appended.
  3. The socket peer, as a last resort (local dev, tests).
"""
from slowapi import Limiter
from starlette.requests import Request

# A few one-line diagnostics per process so the header shape can be confirmed
# from the logs after a deploy, without logging every request.
_DIAG_LEFT = 5


def client_ip(request: Request) -> str:
    global _DIAG_LEFT
    headers = request.headers
    cf = (headers.get("cf-connecting-ip") or "").strip()
    xff = [p.strip() for p in (headers.get("x-forwarded-for") or "").split(",") if p.strip()]
    peer = request.client.host if request.client else ""

    if cf:
        ip, source = cf, "cf-connecting-ip"
    elif xff:
        ip, source = xff[-1], "xff-rightmost"
    else:
        ip, source = peer or "unknown", "peer"

    if _DIAG_LEFT > 0 and (xff or cf):
        _DIAG_LEFT -= 1
        # print, not logger.info: the app configures no logging, so INFO from
        # app modules never reaches Render's logs (same reason [STARTUP] prints).
        print(
            f"[client-ip] key={ip} via={source} xff_hops={len(xff)} "
            f"has_cf={bool(cf)} has_true_client={'true-client-ip' in headers}",
            flush=True,
        )
    return ip


limiter = Limiter(key_func=client_ip, default_limits=["200/minute"])
