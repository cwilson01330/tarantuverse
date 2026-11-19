"""Expo answers a SINGLE push message with one ticket object, not a list.

`POST https://exp.host/--/api/v2/push/send` with one message body returns
`{"data": {"status": "ok", "id": "..."}}`; with an array body it returns
`{"data": [{...}, ...]}`. `send_notification` sends one message, so it must
read the object form. Reading `result["data"][0]` on the object raised
KeyError after Expo had already accepted the push (found in Render logs
2026-11-19: every digest push logged "failed: KeyError"), and an error ticket
(e.g. DeviceNotRegistered) was never seen.
"""
import pytest

from app.utils import push_notifications
from app.utils.push_notifications import PushNotificationService

TOKEN = "ExponentPushToken[test-ticket-shape]"


def _fake_client(monkeypatch, body):
    class _Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return body

    class FakeClient:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, url, json=None, headers=None):
            return _Resp()

    monkeypatch.setattr(push_notifications.httpx, "Client", FakeClient)


def test_single_ticket_object_ok_returns_true(monkeypatch):
    _fake_client(monkeypatch, {"data": {"status": "ok", "id": "abc"}})
    assert PushNotificationService.send_notification(TOKEN, "T", "B") is True


def test_single_ticket_object_error_returns_false(monkeypatch):
    _fake_client(
        monkeypatch,
        {"data": {"status": "error", "message": "not registered",
                  "details": {"error": "DeviceNotRegistered"}}},
    )
    assert PushNotificationService.send_notification(TOKEN, "T", "B") is False


def test_list_form_still_understood(monkeypatch):
    _fake_client(monkeypatch, {"data": [{"status": "ok"}]})
    assert PushNotificationService.send_notification(TOKEN, "T", "B") is True
    _fake_client(monkeypatch, {"data": [{"status": "error", "message": "x"}]})
    assert PushNotificationService.send_notification(TOKEN, "T", "B") is False


@pytest.mark.parametrize("body", [{}, {"data": None}, {"data": []}, {"errors": [{"code": "X"}]}])
def test_odd_bodies_never_raise(monkeypatch, body):
    _fake_client(monkeypatch, body)
    # Expo took the request (2xx); an unexpected body is not an exception.
    assert PushNotificationService.send_notification(TOKEN, "T", "B") in (True, False)


def test_logs_never_carry_the_push_address(monkeypatch, caplog):
    _fake_client(
        monkeypatch,
        {"data": {"status": "error",
                  "message": f'"{TOKEN}" is not a registered push notification recipient',
                  "details": {"error": "DeviceNotRegistered"}}},
    )
    with caplog.at_level("INFO"):
        PushNotificationService.send_notification(TOKEN, "T", "B")
        PushNotificationService.send_notification("not-a-token-secret", "T", "B")
    text = caplog.text
    assert "test-ticket-shape" not in text
    assert "not-a-token-secret" not in text
    assert "DeviceNotRegistered" in text
