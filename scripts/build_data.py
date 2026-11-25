"""Build JalSetu's real-data files (backend/data/*.json) from the groundwater research data on this machine.

Everything here is REAL data. Community inputs (supply logs, tanker trips, leaks...) are not built here; they live in
the database and the demo copies are seeded by backend/app/seed.py with is_demo=1.

Usage:  python scripts/build_data.py [--source "C:/Users/Nayak/Desktop/Major Project"]
"""
import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "backend" / "data"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_forecast import build as build_forecast  # noqa: E402

DISTRICT = "Nagpur"
RECENT_DAYS = 120


def r3(x):
    return None if pd.isna(x) else round(float(x), 3)


def dump(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {name} ({(OUT / name).stat().st_size / 1024:.0f} KB)")


def gsda_code(district, station):
    return "GSDA_" + re.sub(r"[^A-Za-z0-9]+", "_", f"{district}_{station}").strip("_")


def build_wells(src: Path):
    daily = pd.read_csv(src / "data_merge_gsda_2026_11/data/clean/groundwater_station_daily.csv",
                        usecols=["stationCode", "district", "date", "value"], parse_dates=["date"])
    daily = daily[daily["district"] == DISTRICT]
    daily = daily.groupby(["stationCode", "date"], as_index=False)["value"].mean()
    last_day = daily["date"].max()

    meta = {}
    stations = json.loads((src / "dev/backend/data/stations.json").read_text(encoding="utf-8"))["stations"]
    geo = json.loads((src / "data/clean/groundwater_stations.geojson").read_text(encoding="utf-8"))
    names = {f["properties"]["stationCode"]: f["properties"] for f in geo["features"]}
    for s in stations:
        if s["district"] == DISTRICT and s.get("lat") is not None:
            p = names.get(s["code"], {})
            meta[s["code"]] = {"agency": "CGWB", "name": p.get("stationName") or s["code"],
                               "village": p.get("village"), "tehsil": p.get("tehsil"), "lat": s["lat"], "lon": s["lon"]}
    cols = ["Station", "District", "Tehsil", "Village", "Latitude", "Longitude"]
    parts = []
    for f in ("nwdp_gsda_mh_2026_2030.csv", "nwdp_gsda_mh_2021_2025.csv"):     # newest location first
        for chunk in pd.read_csv(src / "data_merge_gsda_2026_11/new_sources" / f, usecols=cols, chunksize=500_000):
            parts.append(chunk[chunk["District"] == DISTRICT].drop_duplicates("Station"))
    raw = pd.concat(parts).drop_duplicates("Station")
    for r in raw.itertuples():
        meta[gsda_code(r.District, r.Station)] = {"agency": "GSDA", "name": r.Station, "village": r.Village,
                                                  "tehsil": r.Tehsil, "lat": float(r.Latitude), "lon": float(r.Longitude)}

    wells, missing = [], []
    for code, g in daily.groupby("stationCode"):
        m = meta.get(code)
        if m is None:
            missing.append(code)
            continue
        s = g.set_index("date")["value"].sort_index()
        wk = s.resample("W").mean().dropna()
        recent = s[s.index > last_day - pd.Timedelta(days=RECENT_DAYS)]
        wells.append({"code": code, **m, "first": s.index.min().date().isoformat(),
                      "last": s.index.max().date().isoformat(), "n_days": int(s.size),
                      "latest_m": r3(s.iloc[-1]),
                      "weekly": [[d.date().isoformat(), r3(v)] for d, v in wk.items()],
                      "daily_recent": [[d.date().isoformat(), r3(v)] for d, v in recent.items()]})
    if missing:
        print(f"  note: {len(missing)} wells without coordinates skipped: {missing[:5]}")
    return {"district": DISTRICT, "last_date": last_day.date().isoformat(),
            "units": "metres relative to ground (negative = below ground)",
            "source": "CGWB + GSDA telemetry (National Water Data Portal / India-WRIS), cleaned daily values",
            "wells": sorted(wells, key=lambda w: w["code"])}


def build_district(src: Path):
    d = pd.read_csv(src / "data_merge_gsda_2026_11/data/clean/groundwater_clean.csv", parse_dates=["date"])
    d = d[d["district"] == DISTRICT].set_index("date").sort_index()
    lvl = d["gwl_mean"]
    last = lvl.dropna().index.max()
    recent = d[d.index > last - pd.Timedelta(days=RECENT_DAYS)]
    return {"district": DISTRICT, "data_version": "CGWB + GSDA wells (merged), to " + last.date().isoformat(),
            "last_date": last.date().isoformat(), "level_m": r3(lvl.loc[last]),
            "weekly": [[k.date().isoformat(), r3(v)] for k, v in lvl.resample("W").mean().dropna().items()],
            "daily_recent": [[k.date().isoformat(), r3(v), int(n) if not pd.isna(n) else None]
                             for k, v, n in zip(recent.index, recent["gwl_mean"], recent["n_active"])]}


def build_rain(src: Path):
    r = pd.read_csv(src / "data_merge_gsda_2026_11/data/clean/rainfall_clean.csv", parse_dates=["date"])
    r = r[r["district"] == DISTRICT].set_index("date").sort_index()["rainfall_mm"]
    monthly = r.resample("MS").sum()
    years = {y.year: round(float(v), 1) for y, v in r.resample("YS").sum().items() if y.year in (2023, 2024, 2025)}
    return {"district": DISTRICT, "source": "CHIRPS daily rainfall, district mean",
            "monthly": [[k.strftime("%Y-%m"), round(float(v), 1)] for k, v in monthly.items()],
            "annual_mm": years, "default_annual_mm": round(sum(years.values()) / len(years)),
            "last_date": r.index.max().date().isoformat()}


# --- district priority map: the same transparent rules as the forecasting project's government view ---
FLAG_WEIGHTS = {"no_monitoring": 3, "insufficient_data": 2, "single_well": 1, "extraction_critical": 3,
                "extraction_semi_critical": 2, "forecast_decline": 2, "deeper_than_usual": 1, "reliability_limited": 1}


def direction(h):
    if not h:
        return None
    if h.get("change_q90_m") is not None and h["change_q90_m"] < 0:
        return "falling"
    if h.get("change_q10_m") is not None and h["change_q10_m"] > 0:
        return "rising"
    if h.get("change_m") is not None and abs(h["change_m"]) < 0.1:
        return "steady"
    return "uncertain"


def build_priority(src: Path):
    recs = json.loads((src / "dev/backend/data/districts.json").read_text(encoding="utf-8"))["districts"]
    rows = []
    for rec in recs:
        flags = []
        st = rec["status"]
        if st == "no_data":
            flags.append("no_monitoring")
        elif st == "insufficient_data":
            flags.append("insufficient_data")
        mon = rec.get("monitoring") or {}
        if st == "forecast" and mon.get("single_well"):
            flags.append("single_well")
        ext = rec.get("extraction") or {}
        stage = ext.get("stage_pct")
        if stage is not None and stage >= 90:
            flags.append("extraction_critical")
        elif stage is not None and stage >= 70:
            flags.append("extraction_semi_critical")
        fc = rec.get("forecast") or {}
        h30 = (fc.get("horizons") or {}).get("t+30")
        if h30 and direction(h30) == "falling" and h30["change_m"] <= -0.5:
            flags.append("forecast_decline")
        gw = rec.get("groundwater") or {}
        if gw.get("vs_usual") == "deeper":
            flags.append("deeper_than_usual")
        if ((rec.get("reliability") or {}).get("t+30") or {}).get("label") == "limited":
            flags.append("reliability_limited")
        rows.append({"district": rec["district"], "slug": rec["slug"], "status": st,
                     "score": sum(FLAG_WEIGHTS[f] for f in flags), "flags": flags,
                     "wells": mon.get("wells"), "depth_m": gw.get("depth_m"), "vs_usual_m": gw.get("vs_usual_m"),
                     "last_reading": gw.get("last_reading"), "stage_pct": stage, "category": ext.get("category"),
                     "forecast_issue": fc.get("issue_date"), "forecast_t30_change_m": (h30 or {}).get("change_m"),
                     "forecast_t30_direction": direction(h30)})
    rows.sort(key=lambda x: (-x["score"], x["district"]))
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    return {"weights": FLAG_WEIGHTS, "districts": rows,
            "note": "Rule-based priority from real district data; forecast part issued "
                    + (next((r["forecast_issue"] for r in rows if r["forecast_issue"]), "n/a"))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, default=Path("C:/Users/Nayak/Desktop/Major Project"))
    a = ap.parse_args()
    src = a.source
    OUT.mkdir(parents=True, exist_ok=True)
    print("building wells ...")
    wells = build_wells(src)
    dump("wells_nagpur.json", wells)
    print("building district series ...")
    dist = build_district(src)
    dump("district_nagpur.json", dist)
    print("building rain ...")
    rain = build_rain(src)
    dump("rain_nagpur.json", rain)
    print("building district priority map ...")
    pri = build_priority(src)
    dump("priority.json", pri)
    geo = json.loads((src / "dev/backend/data/geo_districts.json").read_text(encoding="utf-8"))
    dump("geo_districts.json", geo)
    print("importing forecast (June 2026 run; re-run import_forecast.py after the November Colab run) ...")
    run = build_forecast(src / "04_results/tft_v4_3/dashboard_export", src / "data/clean/groundwater_clean.csv",
                         "CGWB wells to 4 Jun 2026")
    dump("forecast_run.json", run)
    dump("manifest.json", {
        "built": date.today().isoformat(),
        "wells": {"count": len(wells["wells"]), "cgwb": sum(w["agency"] == "CGWB" for w in wells["wells"]),
                  "gsda": sum(w["agency"] == "GSDA" for w in wells["wells"]), "last_date": wells["last_date"]},
        "district_series_last_date": dist["last_date"],
        "rain": {"last_date": rain["last_date"], "default_annual_mm": rain["default_annual_mm"]},
        "forecast": {"issue_date": run["issue_date"], "data_version": run["data_version"]},
        "sources": ["CGWB and GSDA groundwater telemetry via the National Water Data Portal (nwdp.nwic.gov.in) and India-WRIS",
                    "CHIRPS daily rainfall (UCSB Climate Hazards Center)",
                    "CGWB Dynamic Ground Water Resources assessment (extraction stage)",
                    "District boundaries: Maharashtra district polygons"],
    })


if __name__ == "__main__":
    main()
