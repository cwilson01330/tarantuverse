"""The rate limiter must key on an address the client can't choose.

Render only appends to X-Forwarded-For, so the leftmost entry is whatever the
client sent (confirmed live 2026-09-29). Keying on it let anyone dodge every
limit by rotating a made-up header.
"""
from types import SimpleNamespace as NS

from starlette.datastructures import Headers

from app.utils.rate_limit import client_ip, limiter


def req(headers=None, peer="10.0.0.1"):
    return NS(headers=Headers(headers or {}), client=NS(host=peer) if peer else None)


def test_a_client_supplied_forwarded_for_is_ignored():
    r = req({"x-forwarded-for": "1.2.3.4, 203.0.113.7"}, peer="1.2.3.4")  # uvicorn would say 1.2.3.4
    assert client_ip(r) == "203.0.113.7"


def test_cloudflare_connecting_ip_wins():
    r = req({"cf-connecting-ip": "198.51.100.9", "x-forwarded-for": "1.2.3.4, 172.64.0.1"})
    assert client_ip(r) == "198.51.100.9"


def test_rotating_the_fake_header_does_not_change_the_key():
    keys = {client_ip(req({"x-forwarded-for": f"9.9.9.{i}, 203.0.113.7"})) for i in range(20)}
    assert keys == {"203.0.113.7"}


def test_falls_back_to_the_socket_peer_without_proxy_headers():
    assert client_ip(req(peer="127.0.0.1")) == "127.0.0.1"
    assert client_ip(req(peer=None)) == "unknown"


def test_the_shared_limiter_uses_it():
    assert limiter._key_func is client_ip
