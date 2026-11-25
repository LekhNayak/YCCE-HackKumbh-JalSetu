"""Pull the newest groundwater telemetry for one district from the National Water Data Portal (nwdp.nwic.gov.in)
and append it to backend/data/wells_nagpur.json. Run by .github/workflows/ingest-nwdp.yml every 6 hours.

The portal is a CKAN site (open, no key). Each agency publishes one CSV per state per period, 6-hourly readings:
  CGWB  dataset 3782ba15-9b12-46a8-ae44-410b1f84020e   ("Ground Water Level CGWB Maharashtra (2026 - 2030) ...")
  GSDA  dataset 3e0f97ab-5bf6-498f-96c5-7b23dfdb9a70   (Maharashtra Ground Water Department, 2026 - 2030)

Quality control (raw telemetry has faults): values must be below ground and above -150 m; +1.000 placeholders are
dropped; a reading more than 5 m from its well's 7-day running median is dropped; then one value per well per day.
Only days after a well's last stored date are added, so earlier (cleaned) history is never rewritten.

Usage: python scripts/ingest_nwdp.py [--agency cgwb gsda] [--district Nagpur]
"""
import argparse
import json
import re
import ssl
from datetime import date
from pathlib import Path

import httpx
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "backend" / "data"
CACHE = ROOT / "backend" / ".cache" / "nwdp"
API = "https://nwdp.nwic.gov.in/api/3/action/package_show"
DATASETS = {"cgwb": "3782ba15-9b12-46a8-ae44-410b1f84020e", "gsda": "3e0f97ab-5bf6-498f-96c5-7b23dfdb9a70"}
PERIOD = "2026 - 2030"
LEVEL = "Groundwater Level Telemetry 6 Hourly (meter)"
UA = {"User-Agent": "jalsetu-ingest/1.0"}
# the portal's certificate chain verifies against the operating system's trust store (not always certifi's bundle)
VERIFY: ssl.SSLContext | bool = ssl.create_default_context()
RECENT_DAYS = 120


def resource(agency: str) -> dict:
    r = httpx.get(API, params={"id": DATASETS[agency]}, headers=UA, timeout=60, verify=VERIFY)
    r.raise_for_status()
    for res in r.json()["result"]["resources"]:
        name = res.get("name") or ""
        if "Maharashtra" in name and PERIOD in name:
            return res
    raise SystemExit(f"no Maharashtra {PERIOD} resource for {agency}")


def download(agency: str) -> Path:
    res = resource(agency)
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{agency}_mh_2026_2030.csv"
    stamp = CACHE / f"{agency}.last_modified"
    modified = res.get("last_modified") or res.get("metadata_modified") or ""
    if f.exists() and stamp.exists() and stamp.read_text() == modified:
        print(f"  {agency}: cached copy is current ({modified})")
        return f
    print(f"  {agency}: downloading ({modified}) ...")
    with httpx.stream("GET", res["url"], headers=UA, timeout=600, follow_redirects=True, verify=VERIFY) as r:
        r.raise_for_status()
        with open(f, "wb") as out:
            for chunk in r.iter_bytes(1 << 20):
                out.write(chunk)
    stamp.write_text(modified)
    return f


def gsda_code(district, station):
    return "GSDA_" + re.sub(r"[^A-Za-z0-9]+", "_", f"{district}_{station}").strip("_")


def clean_daily(df: pd.DataFrame) -> pd.DataFrame:
    df = df[(df["v"] < 0) & (df["v"] > -150)].copy()
    df = df.sort_values(["station", "t"])
    med = df.groupby("station")["v"].transform(lambda s: s.rolling(28, min_periods=4, center=True).median())
    df = df[(df["v"] - med).abs().fillna(0) <= 5]
    df["day"] = df["t"].dt.normalize()
    return df.groupby(["station", "day"], as_index=False).agg(v=("v", "mean"), lat=("lat", "first"), lon=("lon", "first"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--agency", nargs="+", default=["cgwb", "gsda"], choices=list(DATASETS))
    ap.add_argument("--district", default="Nagpur")
    ap.add_argument("--insecure", action="store_true", help="skip TLS verification (only if the runner lacks the CA chain)")
    a = ap.parse_args()
    global VERIFY
    if a.insecure:
        VERIFY = False
    store_path = DATA / "wells_nagpur.json"
    store = json.loads(store_path.read_text(encoding="utf-8"))
    wells = {w["code"]: w for w in store["wells"]}
    added_days, new_wells = 0, 0

    for agency in a.agency:
        f = download(agency)
        cols = {"Station": "station", "District": "district", "Latitude": "lat", "Longitude": "lon",
                "Data Acquisition Time": "t", LEVEL: "v"}
        raw = pd.read_csv(f, usecols=list(cols), dtype={"Station": str, "District": str}).rename(columns=cols)
        raw = raw[raw["district"].str.strip().str.lower() == a.district.lower()]
        raw["t"] = pd.to_datetime(raw["t"], format="%d-%m-%Y %H:%M", errors="coerce")
        raw["v"] = pd.to_numeric(raw["v"], errors="coerce")
        daily = clean_daily(raw.dropna(subset=["t", "v"]))
        print(f"  {agency}: {daily['station'].nunique()} wells, {len(daily)} well-days after QC")

        for st, g in daily.groupby("station"):
            lat, lon = float(g["lat"].iloc[0]), float(g["lon"].iloc[0])
            if agency == "gsda":
                code = gsda_code(a.district, st)
            else:                                   # CGWB names differ from codes: match on location (within ~150 m)
                code = next((c for c, w in wells.items() if w["agency"] == "CGWB"
                             and abs(w["lat"] - lat) < 0.0015 and abs(w["lon"] - lon) < 0.0015), f"CGWB_NWDP_{st}")
            w = wells.get(code)
            if w is None:
                w = wells[code] = {"code": code, "agency": agency.upper(), "name": st, "village": None, "tehsil": None,
                                   "lat": lat, "lon": lon, "first": g["day"].min().date().isoformat(), "last": "0000-00-00",
                                   "n_days": 0, "latest_m": None, "weekly": [], "daily_recent": []}
                new_wells += 1
            new = g[g["day"] > pd.Timestamp(w["last"] if w["last"] != "0000-00-00" else "1900-01-01")]
            if new.empty:
                continue
            pts = [[d.date().isoformat(), round(float(v), 3)] for d, v in zip(new["day"], new["v"])]
            w["daily_recent"] = (w["daily_recent"] + pts)
            w["last"], w["latest_m"] = pts[-1][0], pts[-1][1]
            w["n_days"] += len(pts)
            added_days += len(pts)
            s = pd.Series([p[1] for p in pts], index=pd.to_datetime([p[0] for p in pts]))
            wk = s.resample("W").mean().dropna()
            weekly = {d: v for d, v in w["weekly"]}
            weekly.update({d.date().isoformat(): round(float(v), 3) for d, v in wk.items()})
            w["weekly"] = sorted([[d, v] for d, v in weekly.items()])

    last = max(w["last"] for w in wells.values())
    cutoff = (pd.Timestamp(last) - pd.Timedelta(days=RECENT_DAYS)).date().isoformat()
    for w in wells.values():
        w["daily_recent"] = [p for p in w["daily_recent"] if p[0] > cutoff]
    store["wells"] = sorted(wells.values(), key=lambda w: w["code"])
    store["last_date"] = last
    store["source"] = "CGWB + GSDA telemetry (National Water Data Portal / India-WRIS), cleaned daily values; " \
                      f"updated from NWDP on {date.today().isoformat()}"
    store_path.write_text(json.dumps(store, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    man = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    man["wells"].update({"count": len(wells), "last_date": last})
    man["wells_updated"] = date.today().isoformat()
    (DATA / "manifest.json").write_text(json.dumps(man, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"added {added_days} well-days ({new_wells} new wells); newest reading {last}")


if __name__ == "__main__":
    main()
