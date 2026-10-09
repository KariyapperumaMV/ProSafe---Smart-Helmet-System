"""
Preprocessing parity: does the ONLINE StreamingPreprocessor reproduce the
OFFLINE features stored in the ML-ready training files?

Two replays are run per worker.

A. Exact-parity replay (the assertion)
   The CSV timestamps have minute resolution, so a row's second-offset is
   only known inside a FULL minute (60 rows). Each maximal run of consecutive
   full minutes is replayed as its own stream. A feature is compared only where
   its entire look-back window lies inside that run:
     raw / deviation / gas-ratio .......... every row
     rolling + trend (window W) ........... rows >= W-1 s into the run
     exposure counters + noise dose ....... rows >= 60 s into the run; their
         unbounded history (episode start / workday dose) is restored from the
         offline row at second 59 -- exactly what a backend does when it
         restores persisted WorkerState after a restart.
   The session gas baseline and the worker HR/BT baselines are injected (the
   baseline *lookup* is an input; the gas-baseline *estimator* cannot be
   parity-tested because the offline calibration rows were removed).

B. End-to-end replay (reported, not asserted)
   The whole stream is replayed once, un-seeded, with the real online gas
   calibration and the gate active (partial minutes get approximate seconds).
   This measures how far realistic online features drift from offline ones
   (look-ahead gas baseline, rows the offline pipeline later dropped, gaps).

Run:
    python tests/test_preprocessing_parity.py              # development workers (assertions only)
    python tests/test_preprocessing_parity.py --report     # also write the parity report to outputs/
    python tests/test_preprocessing_parity.py --include-external   # + W_002 report (W_002 already evaluated)
The last reports are archived in archive/old_outputs/preprocessing_parity_*.
"""

from __future__ import annotations

import argparse
import sys
import unittest
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from preprocessing import EXPOSURE_RULES, ROLLING_SPECS, TREND_SPECS, RawReading  # noqa: E402
from streaming_preprocessor import StreamingPreprocessor, WorkerProfile  # noqa: E402
from utils import (  # noqa: E402
    DEV_WORKERS,
    DEVIATION_COLUMNS,
    EXPOSURE_COLUMNS,
    EXTENDED_FEATURE_COLUMNS,
    OUTPUTS_DIR,
    RAW_SENSOR_COLUMNS,
    load_development_data,
    load_external_test_data,
)

SEED_POS = 59          # restore counters / dose after this many seconds of a run
ATOL = 1.01e-4         # CSV values are rounded to 4 decimals
RTOL = 1e-6

CATEGORY: dict[str, tuple[str, int]] = {}
for c in RAW_SENSOR_COLUMNS:
    CATEGORY[c] = ("raw sensor", 0)
for c in DEVIATION_COLUMNS:
    CATEGORY[c] = ("deviation", 0)
CATEGORY["gas_ratio_to_baseline"] = ("gas ratio", 0)
for s in ROLLING_SPECS:
    CATEGORY[s.feature] = ("rolling", s.window_s - 1)
for s in TREND_SPECS:
    CATEGORY[s.feature] = ("trend", s.window_s - 1)
CATEGORY["noise_dose_pct"] = ("noise dose", SEED_POS + 1)
for c in EXPOSURE_COLUMNS:
    CATEGORY[c] = ("exposure counter", SEED_POS + 1)


def _sessions(g: pd.DataFrame) -> pd.Series:
    """Session index per row: a jump of > 10 min between minute stamps starts a new session."""
    return (g["ts_minute"].diff().dt.total_seconds().fillna(0) > 600).cumsum()


def implied_baselines(g: pd.DataFrame) -> tuple[float, float, dict]:
    hr = float((g["heart_rate"] - g["hr_deviation_bpm"]).median())
    bt = float((g["body_temperature"] - g["body_temp_deviation_c"]).round(4).median())
    # implied from 4-dp ratios; the true session baselines are 3-dp values (e.g. 8.125)
    gas = (g["gas"] / g["gas_ratio_to_baseline"]).groupby(g["session"]).median().round(3).to_dict()
    return hr, bt, gas


def _reading(wid: str, t: float, row, day: str, hour: int) -> RawReading:
    def v(c):
        x = getattr(row, c)
        return None if pd.isna(x) else float(x)
    return RawReading(worker_id=wid, timestamp=t, heart_rate=v("heart_rate"), body_temperature=v("body_temperature"),
                      ambient_temperature=v("ambient_temperature"), uv_index=v("uv_index"), gas=v("gas"),
                      noise=v("noise"), local_date=day, local_hour=hour)


def exact_parity_replay(g: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    wid = g["worker_id"].iloc[0]
    hr_bl, bt_bl, gas_bl = implied_baselines(g)
    n_per_min = g.groupby("ts_minute")["ts_minute"].transform("size")
    full = g[n_per_min == 60].copy()
    full["t_epoch"] = full["ts_minute"].astype("int64") // 10**9 + full.groupby("ts_minute").cumcount()
    full["run_id"] = (full["t_epoch"].diff() != 1).cumsum()
    records, artifacts = [], 0
    for _, run in full.groupby("run_id"):
        if len(run) <= SEED_POS + 1:
            continue
        sess = run["session"].iloc[0]
        pre = StreamingPreprocessor({wid: WorkerProfile(wid, hr_bl, bt_bl, gas_baseline=gas_bl[sess])}, debug_features=True)
        for pos, row in enumerate(run.itertuples(index=False)):
            ts = row.ts_minute
            res = pre.process(_reading(wid, float(row.t_epoch), row, ts.date().isoformat(), ts.hour))
            if pos == SEED_POS:
                ws = pre.get_state(wid)
                ws.noise_dose_pct = float(row.noise_dose_pct)
                for rule in EXPOSURE_RULES:
                    st = ws.session.counters[rule.feature]
                    st.value_s = float(getattr(row, rule.feature))
                    st.active = st.value_s > 0
            rec = {"pos": pos}
            for c in EXTENDED_FEATURE_COLUMNS:
                rec[f"on__{c}"] = res.features[c]
                rec[f"off__{c}"] = getattr(row, c)
            records.append(rec)
        artifacts += sum(cs.artifacts_rejected for cs in pre.get_state(wid).session.channels.values())
    return pd.DataFrame(records), {"artifact_rejections": artifacts, "runs": int(full["run_id"].nunique()),
                                   "rows_in_full_minutes": int(len(full)), "rows_total": int(len(g))}


def compare(rec: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for c in EXTENDED_FEATURE_COLUMNS:
        cat, min_pos = CATEGORY[c]
        sub = rec[rec["pos"] >= min_pos]
        on, off = sub[f"on__{c}"].astype(float), sub[f"off__{c}"].astype(float)
        both = on.notna() & off.notna()
        diff = (on[both] - off[both]).abs()
        ok = diff <= ATOL + RTOL * off[both].abs()
        rows.append({
            "feature": c, "category": cat, "min_seconds_into_run": min_pos,
            "rows_compared": int(both.sum()), "rows_matching": int(ok.sum()),
            "match_rate": float(ok.mean()) if both.any() else np.nan,
            "max_abs_diff": float(diff.max()) if both.any() else np.nan,
            "offline_nan_online_value": int((off.isna() & on.notna()).sum()),
            "online_nan_offline_value": int((on.isna() & off.notna()).sum()),
        })
    return pd.DataFrame(rows)


def end_to_end_replay(g: pd.DataFrame) -> dict:
    """Whole stream, un-seeded, real online gas calibration, gate active."""
    wid = g["worker_id"].iloc[0]
    hr_bl, bt_bl, _ = implied_baselines(g)
    pre = StreamingPreprocessor({wid: WorkerProfile(wid, hr_bl, bt_bl)}, debug_features=True)
    t = g["ts_minute"].astype("int64") // 10**9 + g.groupby("ts_minute").cumcount()
    status, reasons, diffs = Counter(), Counter(), {c: [] for c in ("gas_ratio_to_baseline", *EXPOSURE_COLUMNS, "noise_dose_pct")}
    for ti, row in zip(t, g.itertuples(index=False)):
        ts = row.ts_minute
        res = pre.process(_reading(wid, float(ti), row, ts.date().isoformat(), ts.hour))
        status[res.status.value] += 1
        if not res.model_ready:
            reasons[res.reason] += 1
        else:
            for c in diffs:
                a, b = res.features[c], getattr(row, c)
                if pd.notna(a) and pd.notna(b):
                    diffs[c].append(abs(a - b))
    out = {"worker_id": wid, "rows": int(len(g)), "online_READY": status["READY"], "online_UNCERTAIN": status["UNCERTAIN"]}
    out.update({f"uncertain_reason:{k}": v for k, v in reasons.most_common()})
    for c, d in diffs.items():
        d = np.asarray(d)
        out[f"{c}:share_within_1e-4"] = float((d <= ATOL).mean()) if d.size else np.nan
        out[f"{c}:max_abs_diff"] = float(d.max()) if d.size else np.nan
    return out


def run_parity(include_external: bool = False, write_report: bool = True) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    df = load_development_data()
    if include_external:
        df = pd.concat([df, load_external_test_data()], ignore_index=True)
    all_rec, meta, e2e = [], {}, []
    for wid, g in df.groupby("worker_id", sort=False):
        g = g.reset_index(drop=True).rename(columns={"_ts_minute": "ts_minute"})
        g["session"] = _sessions(g)
        rec, m = exact_parity_replay(g)
        rec["worker_id"] = wid
        all_rec.append(rec)
        meta[wid] = m
        e2e.append(end_to_end_replay(g))
    rec = pd.concat(all_rec, ignore_index=True)
    summary = compare(rec)
    per_worker = pd.concat([compare(r).assign(worker_id=w) for w, r in rec.groupby("worker_id")], ignore_index=True)
    e2e_df = pd.DataFrame(e2e).fillna(0)
    if write_report:
        tag = "with_external" if include_external else "development"
        OUTPUTS_DIR.mkdir(exist_ok=True)
        summary.to_csv(OUTPUTS_DIR / f"preprocessing_parity_{tag}.csv", index=False)
        per_worker.to_csv(OUTPUTS_DIR / f"preprocessing_parity_{tag}_per_worker.csv", index=False)
        e2e_df.to_csv(OUTPUTS_DIR / f"preprocessing_end_to_end_replay_{tag}.csv", index=False)
        cat = summary.groupby("category").agg(features=("feature", "count"), rows_compared=("rows_compared", "sum"),
                                              rows_matching=("rows_matching", "sum"), worst_max_abs_diff=("max_abs_diff", "max"))
        cat["match_rate"] = cat["rows_matching"] / cat["rows_compared"]
        lines = [f"# Preprocessing parity report ({tag})", "",
                 f"Workers: {', '.join(meta)}", "",
                 "## A. Exact-parity replay (contiguous full-minute runs)", "",
                 cat.reset_index().to_markdown(index=False, floatfmt=".6f"), "",
                 summary.to_markdown(index=False, floatfmt=".6f"), "",
                 "Runs / coverage per worker:", "",
                 pd.DataFrame(meta).T.to_markdown(), "",
                 "## B. End-to-end online replay (un-seeded, real gas calibration, gate active)", "",
                 e2e_df.set_index("worker_id").T.to_markdown(floatfmt=".4f"), ""]
        (OUTPUTS_DIR / f"preprocessing_parity_{tag}.md").write_text("\n".join(lines), encoding="utf-8")
    return summary, e2e_df, meta


class PreprocessingParityTest(unittest.TestCase):
    summary: pd.DataFrame
    meta: dict

    @classmethod
    def setUpClass(cls):
        cls.summary, cls.e2e, cls.meta = run_parity(include_external=False, write_report=False)

    def _rate(self, category):
        s = self.summary[self.summary.category == category]
        return s.rows_matching.sum() / s.rows_compared.sum()

    def test_development_workers_only(self):
        self.assertEqual(set(self.meta), set(DEV_WORKERS))

    def test_exact_families(self):
        for cat in ("raw sensor", "deviation", "gas ratio", "rolling", "trend", "noise dose"):
            with self.subTest(category=cat):
                self.assertGreaterEqual(self._rate(cat), 0.999, cat)

    def test_exposure_counters(self):
        # Residual disagreements are float ties exactly at a threshold.
        self.assertGreaterEqual(self._rate("exposure counter"), 0.995)

    def test_every_feature_was_compared(self):
        self.assertTrue((self.summary.rows_compared > 0).all(), self.summary[self.summary.rows_compared == 0])

    def test_artifact_filter_leaves_clean_data_untouched(self):
        self.assertEqual(sum(m["artifact_rejections"] for m in self.meta.values()), 0)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--include-external", action="store_true", help="also replay W_002 (requires frozen config)")
    ap.add_argument("--report", action="store_true", help="write the development parity report to outputs/")
    args, rest = ap.parse_known_args()
    if args.report and not args.include_external:
        s, e, m = run_parity(include_external=False, write_report=True)
        print(s.to_string())
    elif args.include_external:
        s, e, m = run_parity(include_external=True)
        print(s.to_string())
        print(e.T.to_string())
    else:
        unittest.main(argv=[sys.argv[0], *rest], verbosity=2)
