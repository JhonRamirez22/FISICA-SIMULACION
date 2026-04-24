# ElectroSim 2D (WebGL)

Aplicación interactiva para minimización de energía electrostática con Monte Carlo y visualización en tiempo real.

## Abrir en navegador

### Opción 1 (recomendada)
Servir carpeta `webapp` con un servidor estático:

```powershell
Set-Location "c:\Users\JHON\Desktop\FISICA\webapp"
python -m http.server 8080
```

Luego abrir `http://localhost:8080`.

### Opción 2
Abrir `index.html` directamente (puede depender de políticas del navegador/CDN).

## Controles
- Start/Stop simulación
- Reset
- Guardar inicial + toggle de comparación
- Sliders: Δ movimiento, velocidad, temperatura
- Toggles: potencial, campo, annealing
- Interacción directa sobre cargas (arrastrar/crear/eliminar/cambiar signo)
