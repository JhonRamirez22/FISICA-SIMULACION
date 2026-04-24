from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from physics import SOFTENING, interaction_energy, total_energy


@dataclass(slots=True)
class SimulationConfig:
    n_particles: int = 50
    domain_half_size: float = 10.0
    iterations: int = 100_000
    step_size: float = 0.25
    frame_interval: int = 500
    seed: int = 7
    softening: float = SOFTENING


@dataclass(slots=True)
class SimulationResult:
    initial_positions: np.ndarray
    final_positions: np.ndarray
    charges: np.ndarray
    energies: np.ndarray
    accepted_moves: int
    acceptance_rate: float
    frames: list[tuple[int, np.ndarray, float]]


def run_simulation(config: SimulationConfig) -> SimulationResult:
    rng = np.random.default_rng(config.seed)

    positions = rng.uniform(
        -config.domain_half_size,
        config.domain_half_size,
        size=(config.n_particles, 2),
    )
    charges = rng.choice(np.array([-1.0, 1.0], dtype=np.float64), size=config.n_particles)

    initial_positions = positions.copy()
    energy = total_energy(positions, charges, config.softening)

    energies = np.empty(config.iterations + 1, dtype=np.float64)
    energies[0] = energy

    accepted = 0
    frames: list[tuple[int, np.ndarray, float]] = [(0, positions.copy(), float(energy))]

    for step in range(1, config.iterations + 1):
        idx = int(rng.integers(0, config.n_particles))
        displacement = rng.uniform(-config.step_size, config.step_size, size=2)
        candidate = positions[idx] + displacement

        if (
            candidate[0] < -config.domain_half_size
            or candidate[0] > config.domain_half_size
            or candidate[1] < -config.domain_half_size
            or candidate[1] > config.domain_half_size
        ):
            energies[step] = energy
            continue

        e_old = interaction_energy(positions, charges, idx, softening=config.softening)
        e_new = interaction_energy(positions, charges, idx, trial_pos=candidate, softening=config.softening)
        delta_u = e_new - e_old

        if delta_u < 0.0:
            positions[idx] = candidate
            energy += delta_u
            accepted += 1

        energies[step] = energy

        if step % config.frame_interval == 0 or step == config.iterations:
            frames.append((step, positions.copy(), float(energy)))

    return SimulationResult(
        initial_positions=initial_positions,
        final_positions=positions,
        charges=charges,
        energies=energies,
        accepted_moves=accepted,
        acceptance_rate=accepted / config.iterations,
        frames=frames,
    )
