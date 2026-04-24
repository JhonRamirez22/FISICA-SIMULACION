from __future__ import annotations

import numpy as np

try:
    from numba import njit
except Exception:  # pragma: no cover
    njit = None


SOFTENING = 1e-9


def total_energy(positions: np.ndarray, charges: np.ndarray, softening: float = SOFTENING) -> float:
    """Compute U = sum_{i<j} q_i q_j / |r_i-r_j| with vectorized NumPy."""
    diffs = positions[:, None, :] - positions[None, :, :]
    dist = np.linalg.norm(diffs, axis=-1)
    np.fill_diagonal(dist, np.inf)

    qij = charges[:, None] * charges[None, :]
    upper = np.triu_indices(len(charges), k=1)
    return float(np.sum(qij[upper] / np.maximum(dist[upper], softening)))


def _interaction_energy_numpy(
    positions: np.ndarray,
    charges: np.ndarray,
    idx: int,
    trial_pos: np.ndarray | None = None,
    softening: float = SOFTENING,
) -> float:
    center = positions[idx] if trial_pos is None else trial_pos
    delta = positions - center
    dist = np.linalg.norm(delta, axis=1)
    mask = np.arange(len(charges)) != idx
    return float(
        np.sum(
            (charges[idx] * charges[mask])
            / np.maximum(dist[mask], softening)
        )
    )


if njit is not None:

    @njit(cache=True)
    def _interaction_energy_numba(
        positions: np.ndarray,
        charges: np.ndarray,
        idx: int,
        x: float,
        y: float,
        softening: float,
    ) -> float:
        e = 0.0
        qi = charges[idx]
        n = positions.shape[0]
        for j in range(n):
            if j == idx:
                continue
            dx = positions[j, 0] - x
            dy = positions[j, 1] - y
            d = (dx * dx + dy * dy) ** 0.5
            if d < softening:
                d = softening
            e += (qi * charges[j]) / d
        return e


def interaction_energy(
    positions: np.ndarray,
    charges: np.ndarray,
    idx: int,
    trial_pos: np.ndarray | None = None,
    softening: float = SOFTENING,
) -> float:
    """Energy contribution of particle idx with all others."""
    if njit is None:
        return _interaction_energy_numpy(positions, charges, idx, trial_pos, softening)

    pos = positions[idx] if trial_pos is None else trial_pos
    return float(_interaction_energy_numba(positions, charges, idx, float(pos[0]), float(pos[1]), softening))


def potential_grid(
    x_grid: np.ndarray,
    y_grid: np.ndarray,
    positions: np.ndarray,
    charges: np.ndarray,
    softening: float = SOFTENING,
) -> np.ndarray:
    """V(r)=sum_i q_i/|r-r_i| for full grid."""
    dx = x_grid[..., None] - positions[:, 0]
    dy = y_grid[..., None] - positions[:, 1]
    r = np.sqrt(dx * dx + dy * dy + softening * softening)
    return np.sum(charges / r, axis=-1)


def electric_field_grid(
    x_grid: np.ndarray,
    y_grid: np.ndarray,
    positions: np.ndarray,
    charges: np.ndarray,
    softening: float = SOFTENING,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """E(r)=sum_i q_i(r-r_i)/|r-r_i|^3 over grid."""
    dx = x_grid[..., None] - positions[:, 0]
    dy = y_grid[..., None] - positions[:, 1]
    r2 = dx * dx + dy * dy + softening * softening
    r3 = np.power(r2, 1.5)

    ex = np.sum(charges * dx / r3, axis=-1)
    ey = np.sum(charges * dy / r3, axis=-1)
    emag = np.sqrt(ex * ex + ey * ey)
    return ex, ey, emag
