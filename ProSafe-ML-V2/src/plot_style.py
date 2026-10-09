"""
Presentation chart style (static PNG) built from a validated palette.

* categorical slots in fixed order (validated: adjacent CVD dE >= 9.1);
  slots 3-4 sit below 3:1 contrast, so every bar carries a direct value label;
* Safe / Warning / Critical use the reserved status colours and are always
  named in text -- colour never carries the class alone;
* thin bars, 1 px solid recessive grid, text in ink tokens (never series colour).
"""

from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK_2 = "#52514e"
MUTED = "#898781"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"

SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]  # blue, orange, aqua, yellow
STATUS = {"Safe": "#0ca30c", "Warning": "#fab219", "Critical": "#d03b3b"}
SEQ_BLUE = ["#fcfcfb", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]

FEATURE_SET_COLOR = {"CORE": SERIES[0], "EXTENDED": SERIES[1]}
MODEL_COLOR = {"Logistic Regression": SERIES[0], "Random Forest": SERIES[1], "XGBoost": SERIES[2], "SVM": SERIES[3]}


def apply() -> None:
    plt.rcParams.update({
        "figure.facecolor": SURFACE,
        "axes.facecolor": SURFACE,
        "savefig.facecolor": SURFACE,
        "font.family": ["Segoe UI", "DejaVu Sans", "sans-serif"],
        "font.size": 10.5,
        "text.color": INK,
        "axes.labelcolor": INK_2,
        "axes.edgecolor": AXIS,
        "axes.linewidth": 1.0,
        "axes.titlesize": 13,
        "axes.titleweight": "semibold",
        "axes.titlecolor": INK,
        "axes.titlelocation": "left",
        "axes.titlepad": 26,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": True,
        "grid.color": GRID,
        "grid.linewidth": 1.0,
        "grid.linestyle": "-",
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "xtick.labelcolor": INK_2,
        "ytick.labelcolor": INK_2,
        "legend.frameon": False,
        "legend.labelcolor": INK_2,
    })


def subtitle(ax, text: str) -> None:
    ax.text(0, 1.012, text, transform=ax.transAxes, fontsize=9.5, color=INK_2, va="bottom")


def save(fig, path) -> None:
    fig.tight_layout()
    fig.savefig(path, dpi=160, bbox_inches="tight")
    plt.close(fig)


def grouped_hbar(ax, categories: list[str], series: dict[str, list[float]], colors: dict[str, str],
                 xlim=(0, 1.0), fmt="{:.3f}", bar_h=0.34) -> None:
    """Horizontal grouped bars, value label at each bar tip, 2 px surface gap between neighbours."""
    n = len(series)
    y = np.arange(len(categories))[::-1]
    # first series drawn on top of each group, so the bars read in legend order
    offsets = ((n - 1) / 2 - np.arange(n)) * (bar_h + 0.04)
    for (label, vals), off in zip(series.items(), offsets):
        bars = ax.barh(y + off, vals, height=bar_h, color=colors[label], label=label, edgecolor=SURFACE, linewidth=1.0, zorder=3)
        for b, v in zip(bars, vals):
            if v is None or (isinstance(v, float) and np.isnan(v)):
                continue
            ax.text(b.get_width() + (xlim[1] - xlim[0]) * 0.008, b.get_y() + b.get_height() / 2, fmt.format(v),
                    va="center", ha="left", fontsize=9, color=INK_2, zorder=4)
    ax.set_yticks(y)
    ax.set_yticklabels(categories)
    ax.set_xlim(*xlim)
    ax.grid(axis="y", visible=False)
    ax.tick_params(axis="y", length=0)


def single_hbar(ax, categories: list[str], values: list[float], color: str = SERIES[0], xlim=(0, 1.0),
                fmt="{:.3f}", bar_h=0.5, highlight: int | None = None) -> None:
    y = np.arange(len(categories))[::-1]
    cols = [color] * len(values)
    if highlight is not None:
        cols = [color if i == highlight else "#9ec5f4" for i in range(len(values))]
    bars = ax.barh(y, values, height=bar_h, color=cols, zorder=3)
    for b, v in zip(bars, values):
        ax.text(b.get_width() + (xlim[1] - xlim[0]) * 0.008, b.get_y() + b.get_height() / 2, fmt.format(v),
                va="center", ha="left", fontsize=9.5, color=INK, zorder=4)
    ax.set_yticks(y)
    ax.set_yticklabels(categories)
    ax.set_xlim(*xlim)
    ax.grid(axis="y", visible=False)
    ax.tick_params(axis="y", length=0)
