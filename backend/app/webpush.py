"""Web Push on the wire: RFC 8291 payload encryption and RFC 8292 VAPID.

Written against the `cryptography` package rather than pulling in pywebpush:
its `http-ece` dependency ships as a setup.py-only source package that does not
build on a Debian-patched setuptools, which is what a developer's laptop tends
to run. Everything needed is a few dozen lines: an ECDH agreement with the
browser's key, two HKDF rounds, one AES-128-GCM record, and an ES256 JWT that
tells the push service who we are. `tests/test_push.py` checks the encryption
against the RFC 8291 test vector, byte for byte.
"""

from __future__ import annotations

import base64
import json
import os
import time
from dataclasses import dataclass
from urllib.parse import urlsplit

from cryptography.hazmat.primitives import hashes, hmac
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDFExpand
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

CURVE = ec.SECP256R1()
RECORD_SIZE = 4096


def b64url_decode(text: str) -> bytes:
    text = text.strip()
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def private_key_from_raw(raw: bytes) -> ec.EllipticCurvePrivateKey:
    """A P-256 private key from its 32-byte scalar (the base64url form that
    `web-push generate-vapid-keys` and `python -m app.vapid` print)."""
    if len(raw) != 32:
        raise ValueError("a P-256 private key is 32 bytes")
    return ec.derive_private_key(int.from_bytes(raw, "big"), CURVE)


def public_key_raw(key: ec.EllipticCurvePublicKey) -> bytes:
    """The 65-byte uncompressed point, which is what browsers hand out and take in."""
    return key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)


def _hkdf_extract(salt: bytes, ikm: bytes) -> bytes:
    h = hmac.HMAC(salt, hashes.SHA256())
    h.update(ikm)
    return h.finalize()


def _hkdf_expand(prk: bytes, info: bytes, length: int) -> bytes:
    return HKDFExpand(algorithm=hashes.SHA256(), length=length, info=info).derive(prk)


def encrypt(
    plaintext: bytes,
    ua_public_b64: str,
    auth_b64: str,
    *,
    salt: bytes | None = None,
    server_key: ec.EllipticCurvePrivateKey | None = None,
) -> bytes:
    """Encrypt `plaintext` for the subscription (`p256dh`, `auth`) as one
    aes128gcm record: the body of the POST to the push service.

    `salt` and `server_key` are only injected by the test against the RFC
    vector; a real message gets fresh ones every time.
    """
    ua_public_raw = b64url_decode(ua_public_b64)
    ua_public = ec.EllipticCurvePublicKey.from_encoded_point(CURVE, ua_public_raw)
    auth_secret = b64url_decode(auth_b64)
    server_key = server_key or ec.generate_private_key(CURVE)
    salt = salt or os.urandom(16)
    as_public_raw = public_key_raw(server_key.public_key())

    # RFC 8291 section 3: the shared secret becomes the input keying material.
    ecdh_secret = server_key.exchange(ec.ECDH(), ua_public)
    prk_key = _hkdf_extract(auth_secret, ecdh_secret)
    ikm = _hkdf_expand(prk_key, b"WebPush: info\x00" + ua_public_raw + as_public_raw, 32)

    # RFC 8188: content encryption key and nonce for the (single) record.
    prk = _hkdf_extract(salt, ikm)
    cek = _hkdf_expand(prk, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf_expand(prk, b"Content-Encoding: nonce\x00", 12)

    if len(plaintext) + 1 > RECORD_SIZE - 16:
        raise ValueError("payload too large for one record")
    # The last (and only) record ends with the 0x02 delimiter; no padding needed.
    ciphertext = AESGCM(cek).encrypt(nonce, plaintext + b"\x02", None)
    header = salt + RECORD_SIZE.to_bytes(4, "big") + bytes([len(as_public_raw)]) + as_public_raw
    return header + ciphertext


@dataclass(frozen=True)
class Vapid:
    private_key: ec.EllipticCurvePrivateKey
    subject: str

    @classmethod
    def from_raw(cls, private_b64: str, subject: str) -> "Vapid":
        return cls(private_key_from_raw(b64url_decode(private_b64)), subject)

    @property
    def public_key_b64(self) -> str:
        return b64url_encode(public_key_raw(self.private_key.public_key()))

    def authorization(self, endpoint: str, ttl_s: int = 12 * 3600) -> str:
        """The `Authorization: vapid t=<jwt>, k=<key>` value for `endpoint`."""
        parts = urlsplit(endpoint)
        audience = f"{parts.scheme}://{parts.netloc}"
        header = b64url_encode(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
        claims = {"aud": audience, "exp": int(time.time()) + ttl_s, "sub": self.subject}
        body = b64url_encode(json.dumps(claims, separators=(",", ":")).encode())
        signing_input = f"{header}.{body}".encode("ascii")
        der = self.private_key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
        r, s = decode_dss_signature(der)
        signature = b64url_encode(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
        return f"vapid t={header}.{body}.{signature}, k={self.public_key_b64}"


def generate_private_key_b64() -> str:
    """A fresh VAPID private key, in the form KARPUL_VAPID_PRIVATE_KEY expects."""
    key = ec.generate_private_key(CURVE)
    return b64url_encode(key.private_numbers().private_value.to_bytes(32, "big"))
