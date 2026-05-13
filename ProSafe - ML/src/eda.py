"""
Exploratory Data Analysis for the Worker Safety dataset.

Run from project root:
    python src/eda.py

Outputs (all saved to outputs/eda/):
- 01_class_distribution.png        — target class balance
- 02_feature_histograms.png        — distribution of each numeric feature
- 03_correlation_heatmap.png       — Pearson correlations between features
- 04_boxplots_by_risk_level.png    — feature spread per risk class
- summary_statistics.csv           — describe() output for reference

Console output: shape, dtypes, nulls, class counts, and a few sanity checks.
"""

from __future__ import annotations

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from utils import (
    EDA_OUTPUTS_DIR,
    FEATURE_COLUMNS,
    RISK_LEVELS_DISPLAY_ORDER,
    TARGET_COLUMN,
    ensure_dirs,
    load_dataset,
)

# Consistent visual style across all EDA plots
sns.set_theme(style="whitegrid", context="notebook")

# Risk-level palette reused across plots so colors mean the same thing each time.
# Green/amber/red maps to severity intuitively.
RISK_PALETTE = {"Safe": "#2ecc71", "Warning": "#f39c12", "Critical": "#e74c3c"}


def print_basic_info(df: pd.DataFrame) -> None:
    """Print shape, dtypes, null counts, and class balance to console."""
    print("=" * 60)
    print("DATASET OVERVIEW")
    print("=" * 60)
    print(f"Shape: {df.shape[0]:,} rows x {df.shape[1]} columns\n")

    print("Dtypes:")
    print(df.dtypes.to_string())

    nulls = df.isnull().sum()
    print(f"\nNull counts (showing only columns with nulls):")
    nulls_present = nulls[nulls > 0]
    if nulls_present.empty:
        print("  None — dataset is clean.")
    else:
        print(nulls_present.to_string())

    print(f"\nUnique workers: {df['worker_id'].nunique()}")

    print(f"\nClass distribution ({TARGET_COLUMN}):")
    counts = df[TARGET_COLUMN].value_counts()
    pcts = df[TARGET_COLUMN].value_counts(normalize=True).mul(100).round(2)
    dist = pd.DataFrame({"count": counts, "percent": pcts})
    print(dist.to_string())


def plot_class_distribution(df: pd.DataFrame, out_path) -> None:
    """Bar chart of risk_level counts in severity order (Safe→Warning→Critical)."""
    counts = df[TARGET_COLUMN].value_counts().reindex(RISK_LEVELS_DISPLAY_ORDER)

    fig, ax = plt.subplots(figsize=(7, 5))
    bars = ax.bar(
        counts.index,
        counts.values,
        color=[RISK_PALETTE[c] for c in counts.index],
        edgecolor="black",
    )
    # Annotate counts on each bar so the chart is readable without a y-axis grid
    for bar, value in zip(bars, counts.values):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height(),
            f"{value:,}",
            ha="center",
            va="bottom",
            fontweight="bold",
        )

    ax.set_title("Class Distribution — Risk Level")
    ax.set_xlabel("Risk Level")
    ax.set_ylabel("Sample Count")
    plt.tight_layout()
    plt.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close(fig)


def plot_feature_histograms(df: pd.DataFrame, out_path) -> None:
    """One histogram per feature in a 4-col grid, KDE overlaid for shape hints."""
    n = len(FEATURE_COLUMNS)
    ncols = 4
    nrows = (n + ncols - 1) // ncols

    fig, axes = plt.subplots(nrows, ncols, figsize=(ncols * 4, nrows * 3))
    axes = axes.ravel()

    for i, col in enumerate(FEATURE_COLUMNS):
        sns.histplot(df[col], bins=40, kde=True, ax=axes[i], color="steelblue")
        axes[i].set_title(col, fontsize=10)
        axes[i].set_xlabel("")
    # Hide any unused subplots in the last row
    for j in range(n, len(axes)):
        axes[j].axis("off")

    fig.suptitle("Feature Distributions", fontsize=14, y=1.00)
    plt.tight_layout()
    plt.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close(fig)


def plot_correlation_heatmap(df: pd.DataFrame, out_path) -> None:
    """Pearson correlation between features — helps spot redundancy/multicollinearity."""
    corr = df[FEATURE_COLUMNS].corr()

    fig, ax = plt.subplots(figsize=(10, 8))
    sns.heatmap(
        corr,
        annot=True,
        fmt=".2f",
        cmap="coolwarm",
        center=0,
        square=True,
        linewidths=0.5,
        cbar_kws={"shrink": 0.8},
        ax=ax,
    )
    ax.set_title("Feature Correlation Heatmap (Pearson)")
    plt.tight_layout()
    plt.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close(fig)


def plot_boxplots_by_risk(df: pd.DataFrame, out_path) -> None:
    """Boxplot per feature, split by risk_level — visualizes class separability."""
    n = len(FEATURE_COLUMNS)
    ncols = 4
    nrows = (n + ncols - 1) // ncols

    fig, axes = plt.subplots(nrows, ncols, figsize=(ncols * 4, nrows * 3.5))
    axes = axes.ravel()

    for i, col in enumerate(FEATURE_COLUMNS):
        sns.boxplot(
            data=df,
            x=TARGET_COLUMN,
            y=col,
            order=RISK_LEVELS_DISPLAY_ORDER,
            palette=RISK_PALETTE,
            ax=axes[i],
        )
        axes[i].set_title(col, fontsize=10)
        axes[i].set_xlabel("")
    for j in range(n, len(axes)):
        axes[j].axis("off")

    fig.suptitle("Feature Distribution by Risk Level", fontsize=14, y=1.00)
    plt.tight_layout()
    plt.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close(fig)


def main() -> None:
    ensure_dirs()
    df = load_dataset()

    print_basic_info(df)

    print("\nGenerating plots...")
    plot_class_distribution(df, EDA_OUTPUTS_DIR / "01_class_distribution.png")
    plot_feature_histograms(df, EDA_OUTPUTS_DIR / "02_feature_histograms.png")
    plot_correlation_heatmap(df, EDA_OUTPUTS_DIR / "03_correlation_heatmap.png")
    plot_boxplots_by_risk(df, EDA_OUTPUTS_DIR / "04_boxplots_by_risk_level.png")

    # Save numeric summary as CSV for the research paper appendix
    summary_path = EDA_OUTPUTS_DIR / "summary_statistics.csv"
    df[FEATURE_COLUMNS].describe().T.round(3).to_csv(summary_path)

    print(f"\nAll EDA artifacts saved to: {EDA_OUTPUTS_DIR}")
    print("Done.")


if __name__ == "__main__":
    main()
