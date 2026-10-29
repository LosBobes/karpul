from contextlib import contextmanager
from urllib.parse import unquote
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, select

from app import geo, ratelimit
from app.auth import start_session
from app.database import begin_write, get_session, make_engine
from app.main import app
from app.models import User
from app.seed import seed_corporate_cars
from app.services import new_calendar_token, norm_name


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    """Never inherit admins from the developer's shell, and start every test
    with fresh rate-limit counters."""
    monkeypatch.delenv("KARPUL_ADMINS", raising=False)
    monkeypatch.delenv("KARPUL_SENTRY_DSN", raising=False)
    monkeypatch.delenv("KARPUL_ALLOWED_COUNTRIES", raising=False)
    # No test ever asks the public geocoder or a router; tests that want one
    # set the address and replace geo.fetch_json.
    monkeypatch.setenv("KARPUL_GEOCODER_URL", "")
    monkeypatch.delenv("KARPUL_ROUTER_URL", raising=False)
    monkeypatch.delenv("KARPUL_MAP_TILES", raising=False)
    # The maps for everyone, unless a test is about who has them.
    monkeypatch.setenv("KARPUL_MAPS", "everyone")
    geo.cache.clear()
    ratelimit.reset_all()


@pytest.fixture()
def engine():
    # Same pragmas and transaction control as production (app.database), on one
    # shared in-memory connection.
    target = make_engine("sqlite://", poolclass=StaticPool)
    SQLModel.metadata.create_all(target)
    with Session(target) as s:
        seed_corporate_cars(s)
    return target


@pytest.fixture()
def session_factory(engine):
    """A session on the same in-memory database the client is using, for a test
    that wants to look at (or reach into) the rows behind an endpoint."""

    @contextmanager
    def open_session():
        with Session(engine) as session:
            yield session

    return open_session


def make_person(engine, name: str, *, admin: bool = False) -> tuple[User, str]:
    """An account going by `name` (made on first use) and a fresh session token for it.

    Safe to call from many threads at once for the same name (the concurrency
    tests do): the loser of the race to create the account finds the winner's.
    """
    for _ in range(5):
        with Session(engine) as session:
            # The write lock first, as the routers take it: two threads making
            # accounts would otherwise deadlock upgrading their read transactions.
            begin_write(session)
            user = session.exec(select(User).where(User.name_key == norm_name(name))).first()
            if user is None:
                first, _, last = " ".join(name.split()).partition(" ")
                user = User(
                    username=f"u{uuid4().hex[:12]}",
                    first_name=first,
                    last_name=last,
                    name_key=norm_name(name),
                    password_hash="!",
                    calendar_token=new_calendar_token(),
                )
            if admin:
                user.is_admin = True
            session.add(user)
            try:
                session.flush()
            except IntegrityError:
                continue
            token, _ = start_session(session, user)
            session.commit()
            session.refresh(user)
            return user, token
    raise RuntimeError(f"could not make an account for {name}")


class BoardClient(TestClient):
    """A `TestClient` that can act as people by name, the way most tests think.

    The API only knows bearer tokens, so a request is signed in as an account
    made for the name on first use (`make_person`):

    * `headers={"X-User-Name": "Ana"}` acts as Ana (percent-encoded works too);
    * with no identity at all, adding a ride acts as its `driver_name` and
      getting in acts as the `passenger_name`, and anything else as a
      bystander, "Test Viewer"; except `/api/auth/...`, the door itself, which
      goes as it is unless a test signs it in.

    A request that already carries an `Authorization` header is left alone.
    `client.anon` is a plain client that sends nothing, for the tests about
    being signed out.
    """

    def __init__(self, app, engine):
        super().__init__(app)
        self.engine = engine
        self._tokens: dict[str, str] = {}
        self.anon = TestClient(app)

    def token_for(self, name: str) -> str:
        key = norm_name(name)
        if key not in self._tokens:
            self._tokens[key] = make_person(self.engine, name)[1]
        return self._tokens[key]

    def auth(self, name: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token_for(name)}"}

    def _implied(self, method: str, url: str, body) -> str:
        path = str(url).split("?")[0].rstrip("/")
        if isinstance(body, dict):
            if method == "POST" and path == "/api/rides" and body.get("driver_name"):
                return body["driver_name"]
            if method == "POST" and path.endswith("/bookings") and body.get("passenger_name"):
                return body["passenger_name"]
        return "Test Viewer"

    def request(self, method, url, *args, **kwargs):
        headers = dict(kwargs.pop("headers", None) or {})
        name = headers.pop("X-User-Name", None)
        if "Authorization" not in headers:
            if name is not None:
                headers["Authorization"] = f"Bearer {self.token_for(unquote(name))}"
            elif not str(url).startswith("/api/auth/"):
                actor = self._implied(method.upper(), url, kwargs.get("json"))
                headers["Authorization"] = f"Bearer {self.token_for(actor)}"
        return super().request(method, url, *args, headers=headers, **kwargs)

    def websocket_connect(self, url, *args, as_name: str = "Test Viewer", **kwargs):
        """A board socket that has already said who it is (routers/live.py)."""
        return _AuthedSocket(super().websocket_connect(url, *args, **kwargs), self.token_for(as_name))


class _AuthedSocket:
    def __init__(self, inner, token):
        self._inner = inner
        self._token = token

    def __enter__(self):
        ws = self._inner.__enter__()
        ws.send_json({"type": "auth", "token": self._token})
        return ws

    def __exit__(self, *exc):
        return self._inner.__exit__(*exc)


@pytest.fixture()
def client(engine):
    def override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override
    # No context manager: lifespan is skipped so the on-disk DB is never touched.
    yield BoardClient(app, engine)
    app.dependency_overrides.clear()


@pytest.fixture()
def admin_auth(engine):
    """Headers for an admin account, "Ada Admin"."""
    _, token = make_person(engine, "Ada Admin", admin=True)
    return {"Authorization": f"Bearer {token}"}
