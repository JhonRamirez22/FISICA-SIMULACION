from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from simulation import SimulationConfig, run_simulation
from visualization import (
    build_video,
    plot_electric_field,
    plot_energy_curve,
    plot_initial_vs_final,
    plot_potential_map,
    render_frames,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simulación Monte Carlo de cargas eléctricas en 2D")
    parser.add_argument("--n", type=int, default=50, help="Número de cargas")
    parser.add_argument("--L", type=float, default=10.0, help="Semitamaño del dominio [-L, L]")
    parser.add_argument("--iterations", type=int, default=100_000, help="Iteraciones Monte Carlo")
    parser.add_argument("--step", type=float, default=0.25, help="Desplazamiento máximo por propuesta")
    parser.add_argument("--frame-interval", type=int, default=500, help="Guardar frame cada N iteraciones")
    parser.add_argument("--seed", type=int, default=7, help="Semilla RNG")
    parser.add_argument("--fps", type=int, default=24, help="FPS del video mp4")
    parser.add_argument("--output", type=str, default="outputs", help="Directorio de salida")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output)
    frames_dir = output_dir / "frames"
    output_dir.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)
    for old_frame in frames_dir.glob("frame_*.png"):
        old_frame.unlink(missing_ok=True)

    config = SimulationConfig(
        n_particles=args.n,
        domain_half_size=args.L,
        iterations=args.iterations,
        step_size=args.step,
        frame_interval=args.frame_interval,
        seed=args.seed,
    )

    result = run_simulation(config)

    frame_paths = render_frames(result.frames, result.charges, args.L, frames_dir)
    build_video(frame_paths, output_dir / "simulation.mp4", fps=args.fps)

    plot_energy_curve(result.energies, output_dir / "energy_curve.png")
    plot_initial_vs_final(
        result.initial_positions,
        result.final_positions,
        result.charges,
        args.L,
        output_dir / "initial_vs_final.png",
    )
    plot_potential_map(result.final_positions, result.charges, args.L, output_dir / "potential_map.png", resolution=260)
    plot_electric_field(result.final_positions, result.charges, args.L, output_dir / "electric_field.png", resolution=220)

    np.savetxt(
        output_dir / "energy_trace.csv",
        np.column_stack((np.arange(result.energies.size), result.energies)),
        delimiter=",",
        header="iteration,energy",
        comments="",
    )

    np.savetxt(
        output_dir / "final_state.csv",
        np.column_stack((result.final_positions, result.charges)),
        delimiter=",",
        header="x,y,charge",
        comments="",
    )

    print(f"Energía inicial: {result.energies[0]:.6f}")
    print(f"Energía final:   {result.energies[-1]:.6f}")
    print(f"Movimientos aceptados: {result.accepted_moves}/{config.iterations} ({result.acceptance_rate:.2%})")
    print(f"Outputs en: {output_dir.resolve()}")


if __name__ == "__main__":
    main()
