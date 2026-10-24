"""The API's error texts and the frontend's list of them agree (see error_catalogue.py)."""

import json

from .error_catalogue import CATALOGUE, catalogue


def test_the_frontend_knows_every_error_text_the_api_can_send():
    assert CATALOGUE.exists(), "run `python -m tests.error_catalogue` from backend/"
    listed = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    current = catalogue()
    assert listed == current, (
        "frontend/src/lib/api-errors.json is out of date: run `python -m tests.error_catalogue` "
        "from backend/, then translate the new texts in apiError (frontend/src/lib/i18n.ts)"
    )


def test_the_catalogue_reads_the_texts_it_should():
    texts = catalogue()
    # A literal, a conditional detail, an f-string with a name and with numbers,
    # a validation message and a concatenated one.
    assert "Ride not found" in texts
    assert "Only the driver can add other passengers to this car" in texts
    assert "Ana Petrović already joined this ride" in texts
    assert "Too many attempts; try again in 3 min" in texts
    assert "must be an email address" in texts
    assert "That corporate car is already booked by Ana Petrović from 08:00 to 08:00 that day" in texts
    assert not any("{" in t for t in texts)
