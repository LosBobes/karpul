"""Download DB-IP's free IP-to-country database for app/geofence.py.

Run at image build time (see the Dockerfile): `python fetch_geoip.py OUT`.
DB-IP Lite is CC BY 4.0 (https://db-ip.com) and comes out monthly; this
month's may not be out yet on the 1st, so last month's is the fallback. Exits
non-zero when neither can be had, so a build never ships without one.
"""

import datetime
import gzip
import pathlib
import sys
import urllib.request

URL = "https://download.db-ip.com/free/dbip-country-lite-{month}.mmdb.gz"


def main(out: pathlib.Path) -> int:
    today = datetime.date.today()
    last_month = today.replace(day=1) - datetime.timedelta(days=1)
    out.parent.mkdir(parents=True, exist_ok=True)
    for month in (today.strftime("%Y-%m"), last_month.strftime("%Y-%m")):
        url = URL.format(month=month)
        try:
            # DB-IP turns away Python's default User-Agent with a 403.
            request = urllib.request.Request(url, headers={"User-Agent": "karpul-build (+https://www.karpul.dev)"})
            with urllib.request.urlopen(request, timeout=60) as response:
                out.write_bytes(gzip.decompress(response.read()))
        except Exception as e:
            print(f"geoip: no {url} ({e})")
            continue
        print(f"geoip: {url} -> {out}")
        return 0
    print("geoip: could not download the country database", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main(pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/app/geoip/country.mmdb")))
