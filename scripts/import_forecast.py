"""Import a forecast-engine export (the dashboard_export folder) into JalSetu's backend/data/forecast_run.json.

The engine (TFT + LightGBM ensemble) runs on Colab and writes CSVs. This script keeps only what JalSetu shows:
the latest 7/14/30-day forecast, the past forecast tests, the accuracy table and, most importantly, the observed
series from the SAME data version. A forecast is never drawn against a different series: merging GSDA wells moves
Nagpur's district level by metres.

Usage:
  python scripts/import_forecast.py --export <dashboard_export dir> --observed <groundwater_clean.csv> \
         --data-version "CGWB + GSDA wells to 1 Nov 2026" [--district Nagpur]
"""
import argparse
import json
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "backend" / "data" / "forecast_run.json"
HORIZONS = ("t+7", "t+14", "t+30")


def r3(x):
    return None if pd.isna(x) else round(float(x), 3)


def weekly(series: pd.Series):
    """Weekly means (Sunday-ending weeks) as [[date, level], ...]."""
    s = series.dropna()
    w = s.resample("W").mean().dropna()
    return [[d.date().isoformat(), r3(v)] for d, v in w.items()]


def build(export: Path, observed_csv: Path, data_version: str, district: str = "Nagpur") -> dict:
    latest = pd.read_csv(export / "forecast_latest.csv")
    latest = latest[(latest["district"] == district) & (latest["model"] == "Ensemble")]
    if latest.empty:
        raise SystemExit(f"No Ensemble forecast for {district} in {export / 'forecast_latest.csv'}")
    level_now = float(latest["level_now"].iloc[0])
    horizons = {}
    for _, r in latest.iterrows():
        horizons[r["horizon"]] = {
            "target_date": str(r["target_date"])[:10],
            "q10": r3(r["q10"]), "q50": r3(r["q50"]), "q90": r3(r["q90"]),
            "change_m": r3(r["q50"] - level_now),
            "change_q10_m": r3(r["q10"] - level_now),
            "change_q90_m": r3(r["q90"] - level_now),
            "interval": r.get("interval"),
        }

    bt = pd.read_csv(export / "backtest_ensemble.csv", parse_dates=["issue_date", "target_date"])
    bt = bt[bt["district"] == district].sort_values("target_date")
    backtest = {}
    for h in HORIZONS:
        b = bt[bt["horizon"] == h]
        backtest[h] = {"cols": ["issue_date", "target_date", "actual", "q10", "q50", "q90", "no_change", "fold"],
                       "rows": [[r.issue_date.date().isoformat(), r.target_date.date().isoformat(), r3(r.actual),
                                 r3(r.q10), r3(r.q50), r3(r.q90), r3(r.no_change), str(r.fold)]
                                for r in b.itertuples()]}

    met = pd.read_csv(export / "metrics_ensemble_per_district.csv")
    met = met[met["district"] == district]
    metrics = [{"test_set": r["test set"], "horizon": r["Horizon"], "mae_m": r3(r["MAE (m)"]),
                "error_vs_no_change": r3(r["rMAE_P"]), "error_vs_seasonal": r3(r["rMAE_SN"]),
                "coverage_pct": r3(r["Cov (%)"]), "n": int(r["n"])} for _, r in met.iterrows()]

    obs = pd.read_csv(observed_csv, parse_dates=["date"])
    obs = obs[obs["district"] == district].set_index("date").sort_index()
    issue = str(latest["issue_date"].iloc[0])[:10]
    obs = obs[obs.index <= pd.Timestamp(issue)]
    level = obs["gwl_mean"]
    recent = level[level.index > level.index.max() - pd.Timedelta(days=120)].dropna()

    manifest_path = export / "export_manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    return {
        "district": district,
        "engine": "TFT + LightGBM ensemble",
        "run_tag": manifest.get("run_tag"),
        "data_version": data_version,
        "issue_date": issue,
        "level_now_m": round(level_now, 3),
        "horizons": horizons,
        "observed": {"weekly": weekly(level), "daily_recent": [[d.date().isoformat(), r3(v)] for d, v in recent.items()],
                     "last_date": level.dropna().index.max().date().isoformat()},
        "backtest": backtest,
        "metrics": metrics,
        "imported": date.today().isoformat(),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", required=True, type=Path)
    ap.add_argument("--observed", required=True, type=Path)
    ap.add_argument("--data-version", required=True)
    ap.add_argument("--district", default="Nagpur")
    ap.add_argument("--out", type=Path, default=OUT)
    a = ap.parse_args()
    run = build(a.export, a.observed, a.data_version, a.district)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(run, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    h30 = run["horizons"].get("t+30", {})
    print(f"forecast for {run['district']} issued {run['issue_date']} ({run['data_version']}): "
          f"t+30 median {h30.get('q50')} m on {h30.get('target_date')} -> {a.out}")


if __name__ == "__main__":
    main()
