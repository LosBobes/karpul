"""Profile photos: a person's picture in their avatar instead of the initials.

The browser crops the picture to a square and shrinks it (256 px, WebP where
it can) before it uploads, so the server only checks what arrived: an image
by its first bytes, no bigger than MAX_PHOTO_BYTES. It is stored in the
database (models.ProfilePhoto) and served openly by a random key that changes
with every upload, so an `<img>` can show it without a token and a browser may
keep it for good.

The board knows people by name, so the app asks for the whole list of photos
once (`GET /api/avatars`, signed in) and puts a face to every name it draws;
`photos.changed` on the socket tells every tab to ask again.
"""

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlmodel import Session, select

from .. import audit
from ..admin import require_admin
from ..auth import CredsDep, require_user
from ..database import get_session, get_write_session
from ..events import photos_changed
from ..models import ProfilePhoto, User, utcnow

router = APIRouter(tags=["photos"])

SessionDep = Annotated[Session, Depends(get_session)]
WriteSessionDep = Annotated[Session, Depends(get_write_session)]

# A 256 px square is 10-40 KB as WebP or JPEG; a PNG from a browser that
# cannot encode either is bigger, and this still leaves it room.
MAX_PHOTO_BYTES = 300_000


class PhotoRead(BaseModel):
    user_id: int
    # The account's display name: the board draws avatars by name.
    name: str
    url: str


def photo_url(photo: ProfilePhoto) -> str:
    return f"/api/avatars/{photo.key}"


def sniff(data: bytes) -> str | None:
    """The image type by its signature, or None for anything else."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


async def photo_body(request: Request) -> bytes:
    """The uploaded bytes, read before the write lock is taken and cut off as
    soon as they pass the limit, whatever Content-Length claimed."""
    data = bytearray()
    async for chunk in request.stream():
        data += chunk
        if len(data) > MAX_PHOTO_BYTES:
            raise HTTPException(413, "The photo is too big")
    return bytes(data)


def _read(photo: ProfilePhoto, user: User) -> PhotoRead:
    return PhotoRead(user_id=photo.user_id, name=user.display_name, url=photo_url(photo))


@router.get("/api/avatars", response_model=list[PhotoRead])
def list_photos(session: SessionDep, creds: CredsDep):
    """Everyone who has a photo, by name."""
    require_user(session, creds)
    rows = session.exec(select(ProfilePhoto, User).where(ProfilePhoto.user_id == User.id)).all()
    return [_read(photo, user) for photo, user in rows]


@router.get("/api/avatars/{key}", include_in_schema=False)
def get_photo(key: str, session: SessionDep):
    photo = session.exec(select(ProfilePhoto).where(ProfilePhoto.key == key)).first()
    if photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    return Response(
        photo.data,
        media_type=photo.content_type,
        headers={
            # The key changes with the picture, so this address never shows anything else.
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.put("/api/auth/me/photo", response_model=PhotoRead)
def set_photo(body: Annotated[bytes, Depends(photo_body)], session: WriteSessionDep, creds: CredsDep):
    """Your photo, new or replaced. The old address stops working."""
    user = require_user(session, creds)
    kind = sniff(body)
    if kind is None:
        raise HTTPException(422, "A photo has to be a JPEG, PNG or WebP image")
    photo = session.get(ProfilePhoto, user.id) or ProfilePhoto(user_id=user.id, key="", content_type="", data=b"")  # type: ignore[arg-type]
    photo.key = secrets.token_urlsafe(16)
    photo.content_type = kind
    photo.data = body
    photo.updated_at = utcnow()
    session.add(photo)
    session.commit()
    session.refresh(photo)
    out = _read(photo, user)
    photos_changed()
    return out


@router.delete("/api/auth/me/photo", status_code=status.HTTP_204_NO_CONTENT)
def remove_my_photo(session: WriteSessionDep, creds: CredsDep):
    """Back to the initials. Having no photo already is fine."""
    user = require_user(session, creds)
    photo = session.get(ProfilePhoto, user.id)
    if photo is not None:
        session.delete(photo)
        session.commit()
        photos_changed()


@router.delete("/api/admin/users/{user_id}/photo", status_code=status.HTTP_204_NO_CONTENT)
def remove_photo(user_id: int, session: WriteSessionDep, creds: CredsDep):
    """Admin: take someone's photo down (one that should not be on the board)."""
    admin = require_admin(session, creds)
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    photo = session.get(ProfilePhoto, user_id)
    if photo is not None:
        if user.id != admin.id:
            audit.record(session, admin, "photo_removed", user.display_name)
        session.delete(photo)
        session.commit()
        photos_changed()
