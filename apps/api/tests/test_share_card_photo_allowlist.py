from app.services.share_card import allowed_photo_url

BASE = "https://pub.example.r2.dev"


def test_on_base_kept():
    u = BASE + "/photos/a.jpg"
    assert allowed_photo_url(u, BASE) == u


def test_off_base_dropped():
    assert allowed_photo_url("https://evil.example/photos/a.jpg", BASE) is None
    assert allowed_photo_url(BASE + ".evil.com/x.jpg", BASE) is None
    assert allowed_photo_url("http://169.254.169.254/latest", BASE) is None


def test_no_base_or_empty():
    assert allowed_photo_url(BASE + "/a.jpg", "") is None
    assert allowed_photo_url(None, BASE) is None
