from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import imageio.v2 as imageio
import matplotlib.pyplot as plt
import numpy as np

from physics import electric_field_grid, potential_grid


def save_frame(frame_path: Path, positions: np.ndarray, charges: np.ndarray, L: float, title: str) -> None:
    fig, ax = plt.subplots(figsize=(6, 6), dpi=140)

    mask_pos = charges > 0
    mask_neg = ~mask_pos

    ax.scatter(positions[mask_pos, 0], positions[mask_pos, 1], c="red", s=36, label="q=+1", alpha=0.85)
    ax.scatter(positions[mask_neg, 0], positions[mask_neg, 1], c="blue", s=36, label="q=-1", alpha=0.85)

    ax.set_xlim(-L, L)
    ax.set_ylim(-L, L)
    ax.set_aspect("equal", "box")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_title(title)
    ax.legend(loc="upper right", frameon=True)
    ax.grid(alpha=0.2)

    fig.tight_layout()
    fig.savefig(str(frame_path))
    plt.close(fig)


def render_frames(
    frames: list[tuple[int, np.ndarray, float]],
    charges: np.ndarray,
    L: float,
    frames_dir: Path,
) -> list[Path]:
    frames_dir.mkdir(parents=True, exist_ok=True)

    paths: list[Path] = []
    for it, pos, energy in frames:
        path = frames_dir / f"frame_{it:07d}.png"
        save_frame(path, pos, charges, L, f"Iteración {it} | U = {energy:.4f}")
        paths.append(path)
    return paths


def build_video(frame_paths: list[Path], output_file: Path, fps: int = 24) -> None:
    if not frame_paths:
        return

    output_file.parent.mkdir(parents=True, exist_ok=True)
    writer = cast(Any, imageio.get_writer(str(output_file), fps=fps, codec="libx264", macro_block_size=1))
    with writer:
        for frame in frame_paths:
            writer.append_data(imageio.imread(str(frame)))


def plot_energy_curve(energies: np.ndarray, output_file: Path) -> None:
    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=140)
    ax.plot(energies, color="black", lw=1.2)
    ax.set_title("Convergencia de la energía U(t)")
    ax.set_xlabel("Iteración")
    ax.set_ylabel("Energía total")
    ax.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(str(output_file))
    plt.close(fig)


def plot_initial_vs_final(
    initial_positions: np.ndarray,
    final_positions: np.ndarray,
    charges: np.ndarray,
    L: float,
    output_file: Path,
) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(12, 5), dpi=140, sharex=True, sharey=True)

    for ax, pos, name in (
        (axes[0], initial_positions, "Estado inicial"),
        (axes[1], final_positions, "Estado final"),
    ):
        mask_pos = charges > 0
        mask_neg = ~mask_pos
        ax.scatter(pos[mask_pos, 0], pos[mask_pos, 1], c="red", s=32, alpha=0.85)
        ax.scatter(pos[mask_neg, 0], pos[mask_neg, 1], c="blue", s=32, alpha=0.85)
        ax.set_xlim(-L, L)
        ax.set_ylim(-L, L)
        ax.set_aspect("equal", "box")
        ax.set_title(name)
        ax.grid(alpha=0.2)
        ax.set_xlabel("x")

    axes[0].set_ylabel("y")
    fig.tight_layout()
    fig.savefig(str(output_file))
    plt.close(fig)


def plot_potential_map(
    positions: np.ndarray,
    charges: np.ndarray,
    L: float,
    output_file: Path,
    resolution: int = 260,
) -> None:
    grid = np.linspace(-L, L, resolution)
    xg, yg = np.meshgrid(grid, grid)
    V = potential_grid(xg, yg, positions, charges)

    fig, ax = plt.subplots(figsize=(7, 6), dpi=150)
    im = ax.imshow(
        V,
        extent=(-L, L, -L, L),
        origin="lower",
        cmap="coolwarm",
        aspect="equal",
    )
    ax.scatter(positions[charges > 0, 0], positions[charges > 0, 1], c="red", s=10, alpha=0.8)
    ax.scatter(positions[charges < 0, 0], positions[charges < 0, 1], c="blue", s=10, alpha=0.8)
    ax.set_title("Potencial eléctrico V(x,y)")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    fig.colorbar(im, ax=ax, label="V")
    fig.tight_layout()
    fig.savefig(str(output_file))
    plt.close(fig)


def plot_electric_field(
    positions: np.ndarray,
    charges: np.ndarray,
    L: float,
    output_file: Path,
    resolution: int = 220,
    quiver_stride: int = 10,
) -> None:
    grid = np.linspace(-L, L, resolution)
    xg, yg = np.meshgrid(grid, grid)
    ex, ey, emag = electric_field_grid(xg, yg, positions, charges)

    fig, axes = plt.subplots(1, 2, figsize=(13, 5.5), dpi=150)

    im = axes[0].imshow(
        emag,
        extent=(-L, L, -L, L),
        origin="lower",
        cmap="magma",
        aspect="equal",
    )
    axes[0].set_title("Magnitud |E|")
    axes[0].set_xlabel("x")
    axes[0].set_ylabel("y")
    fig.colorbar(im, ax=axes[0], label="|E|")

    sl = slice(None, None, quiver_stride)
    axes[1].quiver(xg[sl, sl], yg[sl, sl], ex[sl, sl], ey[sl, sl], color="black", alpha=0.75, scale=70)
    axes[1].scatter(positions[charges > 0, 0], positions[charges > 0, 1], c="red", s=16)
    axes[1].scatter(positions[charges < 0, 0], positions[charges < 0, 1], c="blue", s=16)
    axes[1].set_xlim(-L, L)
    axes[1].set_ylim(-L, L)
    axes[1].set_aspect("equal", "box")
    axes[1].set_title("Campo eléctrico (quiver)")
    axes[1].set_xlabel("x")
    axes[1].set_ylabel("y")

    fig.tight_layout()
    fig.savefig(str(output_file))
    plt.close(fig)
