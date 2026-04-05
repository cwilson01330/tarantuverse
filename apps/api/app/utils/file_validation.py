"""
File validation utilities.

Validates uploaded files by inspecting their magic bytes (file signatures)
rather than trusting the Content-Type header, which is trivially spoofed.
"""

# Magic byte signatures for allowed image types
# Each entry: (signature_bytes, offset, label)
IMAGE_SIGNATURES = [
    (b"\xff\xd8\xff", 0, "image/jpeg"),           # JPEG
    (b"\x89PNG\r\n\x1a\n", 0, "image/png"),        # PNG
    (b"GIF87a", 0, "image/gif"),                    # GIF87a
    (b"GIF89a", 0, "image/gif"),                    # GIF89a
    (b"RIFF", 0, "image/webp"),                     # WebP (RIFF header)
]

# Max bytes we need to read to detect magic
_MAX_MAGIC_BYTES = 12


def detect_image_type(data: bytes) -> str | None:
    """
    Return the MIME type detected from magic bytes, or None if not a known image.
    Only checks the first few bytes so the full file need not be in memory.
    """
    header = data[:_MAX_MAGIC_BYTES]
    for signature, offset, mime in IMAGE_SIGNATURES:
        if header[offset: offset + len(signature)] == signature:
            # Additional check for WebP: bytes 8-11 must be 'WEBP'
            if mime == "image/webp" and header[8:12] != b"WEBP":
                continue
            return mime
    return None


def validate_image_bytes(data: bytes, allowed_types: list[str] | None = None) -> str:
    """
    Validate that `data` is a recognised image type by inspecting magic bytes.

    Args:
        data: Raw file bytes (must include at least the first 12 bytes).
        allowed_types: Optional list of permitted MIME types.
                       Defaults to JPEG, PNG, GIF, WebP.

    Returns:
        The detected MIME type string.

    Raises:
        ValueError: If the file is not a recognised image or not in allowed_types.
    """
    if allowed_types is None:
        allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]

    if len(data) < _MAX_MAGIC_BYTES:
        raise ValueError("File is too small to be a valid image")

    detected = detect_image_type(data)

    if detected is None:
        raise ValueError(
            "File does not appear to be a valid image. "
            "Allowed formats: JPEG, PNG, GIF, WebP."
        )

    if detected not in allowed_types:
        raise ValueError(
            f"Image type '{detected}' is not allowed. "
            f"Allowed types: {', '.join(allowed_types)}"
        )

    return detected
