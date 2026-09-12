"""`python -m app.vapid`: print a fresh VAPID key pair for the push notifications.

Put the private key in KARPUL_VAPID_PRIVATE_KEY (and a contact in
KARPUL_VAPID_SUBJECT, a mailto: or https: URL); the public key is derived from
it at runtime and handed to the browsers, so it needs no variable of its own.
"""

from .webpush import Vapid, generate_private_key_b64

if __name__ == "__main__":
    private = generate_private_key_b64()
    print(f"KARPUL_VAPID_PRIVATE_KEY={private}")
    print(f"# public key (derived): {Vapid.from_raw(private, 'mailto:x@example.com').public_key_b64}")
