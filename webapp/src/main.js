import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';

import { EnergyPlot } from './energyPlot.js';
import { GPUFieldRenderer } from './gpuFieldRenderer.js';
import { ChargeSimulation } from './simulation.js';

const DOMAIN = 10;
const PICK_RADIUS = 0.6;

const viewport = document.getElementById('viewport');
const overlay = document.getElementById('vectorOverlay');
const octx = overlay.getContext('2d');

const startStopBtn = document.getElementById('startStopBtn');
const resetBtn = document.getElementById('resetBtn');
const resetPositiveBtn = document.getElementById('resetPositiveBtn');
const recordBtn = document.getElementById('recordBtn');
const floatingRecordBtn = document.getElementById('floatingRecordBtn');
const floatingRecordStatus = document.getElementById('floatingRecordStatus');
const saveInitialBtn = document.getElementById('saveInitialBtn');
const exportLogBtn = document.getElementById('exportLogBtn');
const showInitialToggle = document.getElementById('showInitialToggle');
const deltaSlider = document.getElementById('deltaSlider');
const speedSlider = document.getElementById('speedSlider');
const potentialToggle = document.getElementById('potentialToggle');
const fieldToggle = document.getElementById('fieldToggle');
const annealToggle = document.getElementById('annealToggle');
const tempSlider = document.getElementById('tempSlider');
const tempUnit = document.getElementById('tempUnit');
const newChargeSign = document.getElementById('newChargeSign');
const toggleProbeBtn = document.getElementById('toggleProbeBtn');
const probeChargeSign = document.getElementById('probeChargeSign');

const deltaValue = document.getElementById('deltaValue');
const speedValue = document.getElementById('speedValue');
const tempValue = document.getElementById('tempValue');
const energyLabel = document.getElementById('energyLabel');
const acceptanceLabel = document.getElementById('acceptanceLabel');
const countLabel = document.getElementById('countLabel');
const tempStatsLabel = document.getElementById('tempStatsLabel');
const probeLabel = document.getElementById('probeLabel');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x0b0f17, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-DOMAIN, DOMAIN, DOMAIN, -DOMAIN, 0.01, 100);
camera.position.set(0, 0, 10);

const sim = new ChargeSimulation({ n: 0, domain: DOMAIN, seed: 7 });
const gpuField = new GPUFieldRenderer(DOMAIN);
scene.add(gpuField.mesh);

const grid = new THREE.GridHelper(DOMAIN * 2, 20, 0x273146, 0x1f2738);
grid.rotation.x = Math.PI / 2;
grid.position.z = -0.45;
scene.add(grid);

const maxCharges = sim.maxCharges;
const chargeGeometry = new THREE.BufferGeometry();
chargeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxCharges * 3), 3));
chargeGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxCharges * 3), 3));
const chargeMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  vertexColors: true,
  uniforms: {
    uPointSize: { value: 18.0 },
    uAlpha: { value: 0.98 },
    uHalo: { value: 0.40 },
  },
  vertexShader: `
    varying vec3 vColor;
    uniform float uPointSize;
    void main() {
      vColor = color;
      gl_PointSize = uPointSize;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec3 vColor;
    uniform float uAlpha;
    uniform float uHalo;
    void main() {
      vec2 uv = gl_PointCoord * 2.0 - 1.0;
      float r = length(uv);
      if (r > 1.0) discard;

      float disk = 1.0 - smoothstep(0.82, 1.0, r);
      float rim = smoothstep(0.65, 0.94, r);
      float core = 1.0 - smoothstep(0.0, 0.28, r);
      vec3 c = vColor * (0.9 + 0.3 * core) + vec3(1.0) * (0.44 * rim);
      float a = (disk + uHalo * rim) * uAlpha;
      gl_FragColor = vec4(c, a);
    }
  `,
});
const chargePoints = new THREE.Points(chargeGeometry, chargeMaterial);
scene.add(chargePoints);

const initialGeometry = new THREE.BufferGeometry();
initialGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxCharges * 3), 3));
initialGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxCharges * 3), 3));
const initialMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  vertexColors: true,
  uniforms: {
    uPointSize: { value: 11.0 },
    uAlpha: { value: 0.62 },
  },
  vertexShader: `
    varying vec3 vColor;
    uniform float uPointSize;
    void main() {
      vColor = color;
      gl_PointSize = uPointSize;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec3 vColor;
    uniform float uAlpha;
    void main() {
      vec2 uv = gl_PointCoord * 2.0 - 1.0;
      float r = length(uv);
      if (r > 1.0) discard;
      float ring = smoothstep(0.72, 0.9, r) - smoothstep(0.9, 1.0, r);
      float a = ring * uAlpha;
      if (a < 0.01) discard;
      gl_FragColor = vec4(vColor * 1.05, a);
    }
  `,
});
const initialPoints = new THREE.Points(initialGeometry, initialMaterial);
initialPoints.position.z = 0.2;
scene.add(initialPoints);

const energyPlot = new EnergyPlot(document.getElementById('energyCanvas'));

let running = false;
let dragIndex = -1;
let frameCounter = 0;
let tempUnitMode = tempUnit.value;
let currentRecordingStamp = null;
let pendingAfterRecordingExport = null;
let runSession = null;

const probeState = {
  active: false,
  q: -1,
  pos: [0, 0],
  vel: [0, 0],
  path: [],
  distance: 0,
  elapsed: 0,
  maxSpeed: 0,
};

// Video recording state
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

function syncRecordButtonsUI() {
  const label = running ? '⏹ Finalizar run' : '⏺ Rec + datos';
  recordBtn.textContent = label;
  floatingRecordBtn.textContent = running ? '⏹ Finalizar run' : '⏺ Grabar video + informe';

  if (isRecording) {
    recordBtn.style.borderColor = '#ff4444';
    floatingRecordBtn.style.borderColor = '#ff4444';
    floatingRecordStatus.textContent = 'Estado: grabando…';
  } else {
    recordBtn.style.borderColor = '';
    floatingRecordBtn.style.borderColor = '';
    floatingRecordStatus.textContent = 'Estado: listo';
  }
}

// --- Video recording via MediaRecorder API ---
function startRecording(stamp) {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder no soportado en este navegador.');
  }

  currentRecordingStamp = stamp;
  // Composite: render a merged frame of WebGL + overlay canvas into an offscreen canvas
  // then stream that. Simpler: stream the WebGL canvas directly (overlay is separate).
  // We use a merged canvas so the field vectors are included in the video.
  const mergedCanvas = document.createElement('canvas');
  mergedCanvas.width = renderer.domElement.width;
  mergedCanvas.height = renderer.domElement.height;
  const mctx = mergedCanvas.getContext('2d');

  // Hook into the animation loop to composite frames into mergedCanvas
  window._recordMerge = function () {
    mergedCanvas.width = renderer.domElement.width;
    mergedCanvas.height = renderer.domElement.height;
    mctx.drawImage(renderer.domElement, 0, 0);
    // Scale overlay (it may have different DPR dimensions)
    mctx.drawImage(overlay, 0, 0, mergedCanvas.width, mergedCanvas.height);
  };

  const stream = mergedCanvas.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `electrosim_video_${currentRecordingStamp ?? makeTimestampTag()}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    window._recordMerge = null;
    isRecording = false;
    currentRecordingStamp = null;
    syncRecordButtonsUI();
    if (pendingAfterRecordingExport) {
      const cb = pendingAfterRecordingExport;
      pendingAfterRecordingExport = null;
      cb();
    }
  };

  mediaRecorder.start(200); // chunk cada 200ms
  isRecording = true;
  syncRecordButtonsUI();
}

function stopRecording(onAfterStop = null) {
  if (onAfterStop) {
    pendingAfterRecordingExport = onAfterStop;
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  } else if (onAfterStop) {
    const cb = pendingAfterRecordingExport;
    pendingAfterRecordingExport = null;
    cb();
  }
}

function buildRunReportMarkdown(summary) {
  return String.raw`# Informe automático de corrida (Start/Stop) — ElectroSim 2D

## 1) Condiciones impuestas al iniciar

- Inicio de corrida: ${summary.startedAt}
- Fin de corrida: ${summary.endedAt}
- Duración: ${summary.durationSec.toFixed(2)} s
- Dominio: $[-L,L]^2$ con $L=${summary.domain}$
- Número de cargas al inicio: ${summary.particleCountStart}
- Número de cargas al final: ${summary.particleCountEnd}

### Control térmico

- Temperatura inicial: ${summary.tempC.toFixed(2)} °C | ${summary.tempF.toFixed(2)} °F | ${summary.tempK.toFixed(2)} K
- Conversión usada:

$$
T_{\mathrm{F}} = \frac{9}{5}T_{\mathrm{C}} + 32,
\qquad
T_{\mathrm{K}} = T_{\mathrm{C}} + 273.15
$$

### Parámetros numéricos

- $\Delta$ movimiento: ${summary.deltaMove.toFixed(3)}
- Pasos por frame: ${summary.stepsPerFrame}
- Annealing: ${summary.annealingEnabled ? 'ON' : 'OFF'}
- Temperatura efectiva del modelo: $T_{modelo}=${summary.modelTemperature.toFixed(4)}$
- Campo visible: ${summary.showField ? 'ON' : 'OFF'}
- Potencial visible: ${summary.showPotential ? 'ON' : 'OFF'}

## 2) Modelo físico y criterio de aceptación

$$
U = \sum_{i<j} \frac{q_i q_j}{\sqrt{(x_i-x_j)^2 + (y_i-y_j)^2}}
$$

$$
V(x,y) = \sum_i \frac{q_i}{\sqrt{(x-x_i)^2 + (y-y_i)^2}},
\qquad
\vec{E}(x,y)=\sum_i q_i\,\frac{(x-x_i,\,y-y_i)}{\left[(x-x_i)^2 + (y-y_i)^2\right]^{3/2}}
$$

$$
\vec{F}=q\,\vec{E},
\qquad
\Delta U = U_{\mathrm{nuevo}} - U_{\mathrm{actual}}
$$

Regla principal:

$$
  ext{aceptar si }\Delta U < 0
$$

Con annealing:

$$
P_{\mathrm{aceptar}}=e^{-\Delta U/T},\quad \Delta U>0
$$

## 3) Resultados de la corrida

- Energía inicial de corrida: $U_{inicio}=${summary.energyStart.toFixed(6)}$
- Energía final de corrida: $U_{fin}=${summary.energyEnd.toFixed(6)}$
- Cambio energético: $\Delta U=${summary.deltaEnergy.toFixed(6)}$
- Mínimo de energía observado: $U_{min}=${summary.energyMin.toFixed(6)}$
- Máximo de energía observado: $U_{max}=${summary.energyMax.toFixed(6)}$

- Iteraciones Monte Carlo en corrida: ${summary.movesDelta}
- Movimientos aceptados en corrida: ${summary.acceptedDelta}
- Tasa de aceptación en corrida: ${summary.acceptanceRunPct.toFixed(3)}%

### Medida de partícula de prueba

- Estado de prueba al inicio: ${summary.probeWasActive ? 'activa' : 'inactiva'}
- Tipo de prueba: ${summary.probeCharge > 0 ? 'protón (+1)' : 'electrón (-1)'}
- Desplazamiento acumulado durante corrida: ${summary.probeDistanceDelta.toFixed(5)} u
- Velocidad máxima durante corrida: ${summary.probeMaxSpeedRun.toFixed(5)} u/s

## 4) Observación rápida

Si $\Delta U<0$ global y la tasa de aceptación es moderada, el sistema avanzó hacia estados más estables bajo las condiciones impuestas.

---

Archivo generado automáticamente al presionar Start/Stop en ElectroSim 2D.
`;
}

function buildRunSummary(session) {
  const historySlice = sim.energyHistory.slice(session.energyHistoryStartIndex);
  const energyStart = session.energyStart;
  const energyEnd = sim.totalEnergy;
  const energyMin = historySlice.length ? Math.min(...historySlice) : energyEnd;
  const energyMax = historySlice.length ? Math.max(...historySlice) : energyEnd;
  const acceptedDelta = sim.acceptedMoves - session.acceptedStart;
  const movesDelta = sim.totalMoves - session.movesStart;
  const durationSec = Math.max((performance.now() - session.startPerf) / 1000, 1e-6);

  return {
    startedAt: session.startedAt,
    endedAt: new Date().toISOString(),
    durationSec,
    domain: DOMAIN,
    particleCountStart: session.particleCountStart,
    particleCountEnd: sim.count(),
    tempC: session.tempC,
    tempF: session.tempF,
    tempK: session.tempK,
    modelTemperature: session.modelTemperature,
    deltaMove: session.deltaMove,
    stepsPerFrame: session.stepsPerFrame,
    annealingEnabled: session.annealingEnabled,
    showField: session.showField,
    showPotential: session.showPotential,
    energyStart,
    energyEnd,
    deltaEnergy: energyEnd - energyStart,
    energyMin,
    energyMax,
    acceptedDelta,
    movesDelta,
    acceptanceRunPct: movesDelta > 0 ? (100 * acceptedDelta) / movesDelta : 0,
    probeWasActive: session.probeWasActive,
    probeCharge: session.probeCharge,
    probeDistanceDelta: Math.max(0, probeState.distance - session.probeDistanceStart),
    probeMaxSpeedRun: Math.max(0, probeState.maxSpeed - session.probeMaxSpeedStart),
  };
}

function beginRunSession() {
  const stamp = makeTimestampTag();
  const tempC = getTempCelsius();
  const tempF = celsiusToFahrenheit(tempC);
  const tempK = tempC + 273.15;
  const modelTemperature = getTempForModel();

  runSession = {
    stamp,
    startedAt: new Date().toISOString(),
    startPerf: performance.now(),
    particleCountStart: sim.count(),
    energyStart: sim.totalEnergy,
    energyHistoryStartIndex: sim.energyHistory.length,
    acceptedStart: sim.acceptedMoves,
    movesStart: sim.totalMoves,
    tempC,
    tempF,
    tempK,
    modelTemperature,
    deltaMove: Number(deltaSlider.value),
    stepsPerFrame: Number(speedSlider.value),
    annealingEnabled: annealToggle.checked,
    showField: fieldToggle.checked,
    showPotential: potentialToggle.checked,
    probeWasActive: probeState.active,
    probeCharge: probeState.q,
    probeDistanceStart: probeState.distance,
    probeMaxSpeedStart: probeState.maxSpeed,
  };

  try {
    startRecording(stamp);
  } catch {
    isRecording = false;
    syncRecordButtonsUI();
  }
}

function endRunSessionAndExport() {
  if (!runSession) return;
  const summary = buildRunSummary(runSession);
  const report = buildRunReportMarkdown(summary);
  const filename = `electrosim_informe_run_${runSession.stamp}.md`;

  const exportMarkdown = () => {
    downloadTextFile(filename, report, 'text/markdown;charset=utf-8');
  };

  if (isRecording) {
    stopRecording(exportMarkdown);
  } else {
    exportMarkdown();
  }

  runSession = null;
}

function makeTimestampTag() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function downloadTextFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildSimulationLog() {
  const c = getTempCelsius();
  const f = celsiusToFahrenheit(c);
  return {
    meta: {
      savedAt: new Date().toISOString(),
      domain: DOMAIN,
      particleCount: sim.count(),
    },
    controls: {
      deltaMove: Number(deltaSlider.value),
      speedStepsPerFrame: Number(speedSlider.value),
      annealingEnabled: annealToggle.checked,
      annealingTemperatureC: c,
      annealingTemperatureF: f,
      annealingTemperatureK: c + 273.15,
      temperatureDisplayUnit: tempUnitMode,
      showPotential: potentialToggle.checked,
      showField: fieldToggle.checked,
    },
    stats: {
      totalEnergy: sim.totalEnergy,
      acceptedMoves: sim.acceptedMoves,
      totalMoves: sim.totalMoves,
      acceptanceRate: sim.acceptanceRate(),
    },
    probe: {
      active: probeState.active,
      charge: probeState.q,
      elapsed: probeState.elapsed,
      distance: probeState.distance,
      maxSpeed: probeState.maxSpeed,
      finalPosition: [probeState.pos[0], probeState.pos[1]],
      finalVelocity: [probeState.vel[0], probeState.vel[1]],
    },
    initialState: {
      positions: sim.initialPositions.map((p) => [p[0], p[1]]),
      charges: [...sim.initialCharges],
    },
    finalState: {
      positions: sim.positions.map((p) => [p[0], p[1]]),
      charges: [...sim.charges],
    },
    energyHistory: [...sim.energyHistory],
  };
}

function exportSimulationRecord() {
  const stamp = makeTimestampTag();
  const log = buildSimulationLog();

  const json = JSON.stringify(log, null, 2);
  downloadTextFile(`electrosim_log_${stamp}.json`, json, 'application/json;charset=utf-8');

  const csvHeader = 'step,energy';
  const csvRows = sim.energyHistory.map((e, i) => `${i},${e}`);
  const csv = `${csvHeader}\n${csvRows.join('\n')}`;
  downloadTextFile(`electrosim_energy_${stamp}.csv`, csv, 'text/csv;charset=utf-8');

  const report = buildMathReport(log);
  downloadTextFile(`electrosim_reporte_${stamp}.md`, report, 'text/markdown;charset=utf-8');
}

function computeSampledFieldStats(sampleN = 24) {
  let eSum = 0;
  let eMax = 0;
  let vSum = 0;
  let count = 0;

  for (let iy = 0; iy < sampleN; iy += 1) {
    for (let ix = 0; ix < sampleN; ix += 1) {
      const x = -DOMAIN + (2 * DOMAIN * ix) / (sampleN - 1);
      const y = -DOMAIN + (2 * DOMAIN * iy) / (sampleN - 1);

      let ex = 0;
      let ey = 0;
      let v = 0;

      for (let i = 0; i < sim.positions.length; i += 1) {
        const dx = x - sim.positions[i][0];
        const dy = y - sim.positions[i][1];
        const r2 = dx * dx + dy * dy + 1e-4;
        const invR = 1 / Math.sqrt(r2);
        const invR3 = invR * invR * invR;
        const q = sim.charges[i];
        v += q * invR;
        ex += q * dx * invR3;
        ey += q * dy * invR3;
      }

      const eMag = Math.hypot(ex, ey);
      eSum += eMag;
      vSum += Math.abs(v);
      eMax = Math.max(eMax, eMag);
      count += 1;
    }
  }

  return {
    avgE: count ? eSum / count : 0,
    maxE: eMax,
    avgAbsV: count ? vSum / count : 0,
  };
}

function buildMathReport(log) {
  const n = log.meta.particleCount;
  const qPlus = log.finalState.charges.filter((q) => q > 0).length;
  const qMinus = n - qPlus;
  const e0 = log.energyHistory.length ? log.energyHistory[0] : 0;
  const ef = log.stats.totalEnergy;
  const deltaE = ef - e0;
  const relDrop = Math.abs(e0) > 1e-12 ? ((e0 - ef) / Math.abs(e0)) * 100 : 0;
  const fields = computeSampledFieldStats(24);
  const tc = log.controls.annealingTemperatureC;
  const tf = log.controls.annealingTemperatureF;
  const tk = log.controls.annealingTemperatureK;

  return String.raw`# Reporte matemático de simulación electrostática (2D)

## 1) Datos de la corrida

- Fecha de exportación: ${log.meta.savedAt}
- Dominio: $[-L,L]^2$ con $L=${log.meta.domain}$
- Número de cargas: $N=${n}$
- Distribución final: $N_+=${qPlus}$, $N_-=${qMinus}$
- Movimientos evaluados: ${log.stats.totalMoves}
- Movimientos aceptados: ${log.stats.acceptedMoves}
- Tasa de aceptación: ${(100 * log.stats.acceptanceRate).toFixed(3)}%
- Temperatura de simulación: ${tc.toFixed(2)} °C | ${tf.toFixed(2)} °F | ${tk.toFixed(2)} K

## 2) Modelo físico usado

Se aplicó superposición electrostática para cargas puntuales ($q_i \in \{+1,-1\}$):

$$
U = \sum_{i<j} \frac{q_i q_j}{\lVert \mathbf{r}_i-\mathbf{r}_j \rVert}
$$

$$
V(\mathbf{r}) = \sum_i \frac{q_i}{\lVert \mathbf{r}-\mathbf{r}_i \rVert}
$$

$$
\mathbf{E}(\mathbf{r}) = \sum_i q_i\,\frac{\mathbf{r}-\mathbf{r}_i}{\lVert \mathbf{r}-\mathbf{r}_i \rVert^3}
\quad\text{y}\quad
\mathbf{E} = -\nabla V
$$

Fuerza eléctrica local sobre una carga de prueba:

$$
\mathbf{F}=q\,\mathbf{E}
$$

## 3) Algoritmo Monte Carlo de minimización

En cada iteración se selecciona una carga aleatoria y se propone un desplazamiento $\Delta\mathbf{r}$.

Regla de aceptación base:

$$
\Delta U = U_{\text{nuevo}}-U_{\text{actual}},\qquad
  ext{aceptar si }\Delta U<0
$$

Cuando annealing está activo:

$$
P_{\text{aceptar}} = e^{-\Delta U/T},\quad \Delta U>0
$$

## 4) Resultados numéricos de esta corrida

- Energía inicial: $U_0=${e0.toFixed(6)}$
- Energía final: $U_f=${ef.toFixed(6)}$
- Variación: $\Delta U=${deltaE.toFixed(6)}$
- Mejora relativa de energía: ${relDrop.toFixed(3)}%
- Promedio muestral de $|\mathbf{E}|$: ${fields.avgE.toFixed(5)}
- Máximo muestral de $|\mathbf{E}|$: ${fields.maxE.toFixed(5)}
- Promedio muestral de $|V|$: ${fields.avgAbsV.toFixed(5)}
- Partícula de prueba $q_{test}$: ${log.probe.charge > 0 ? '+1 (protón)' : '-1 (electrón)'}
- Desplazamiento acumulado de prueba: ${log.probe.distance.toFixed(5)} u
- Velocidad máxima observada: ${log.probe.maxSpeed.toFixed(5)} u/s

## 5) Interpretación breve

La disminución de $U$ confirma convergencia hacia configuraciones más estables dentro del dominio.
En términos físicos, el sistema evoluciona hacia arreglos donde predominan interacciones atractivas efectivas y separación de pares repulsivos cercanos.

---

Este reporte fue generado automáticamente a partir de la simulación interactiva de ElectroSim 2D.
`;
}

function resize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setSize(w, h, false);
  const aspect = Math.max(w / Math.max(h, 1), 0.1);
  camera.left = -DOMAIN * aspect;
  camera.right = DOMAIN * aspect;
  camera.top = DOMAIN;
  camera.bottom = -DOMAIN;
  camera.updateProjectionMatrix();
  overlay.width = Math.floor(w * dpr);
  overlay.height = Math.floor(h * dpr);
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function celsiusToFahrenheit(c) {
  return (c * 9) / 5 + 32;
}

function fahrenheitToCelsius(f) {
  return ((f - 32) * 5) / 9;
}

function getTempCelsius() {
  const value = Number(tempSlider.value);
  return tempUnitMode === 'C' ? value : fahrenheitToCelsius(value);
}

function getTempForModel() {
  const kelvin = Math.max(getTempCelsius() + 273.15, 1e-6);
  return kelvin / 300;
}

function applyTempSliderByUnit(nextUnit) {
  const currentC = getTempCelsius();
  tempUnitMode = nextUnit;

  if (nextUnit === 'F') {
    tempSlider.min = '-328';
    tempSlider.max = '2192';
    tempSlider.step = '1';
    tempSlider.value = celsiusToFahrenheit(currentC).toFixed(0);
  } else {
    tempSlider.min = '-200';
    tempSlider.max = '1200';
    tempSlider.step = '1';
    tempSlider.value = currentC.toFixed(0);
  }
}

function resetProbe() {
  probeState.active = false;
  probeState.q = Number(probeChargeSign.value);
  probeState.pos = [0, 0];
  probeState.vel = [0, 0];
  probeState.path = [];
  probeState.distance = 0;
  probeState.elapsed = 0;
  probeState.maxSpeed = 0;
  toggleProbeBtn.textContent = 'Iniciar prueba q_test';
}

function toggleProbe() {
  if (!probeState.active) {
    probeState.active = true;
    probeState.q = Number(probeChargeSign.value);
    probeState.pos = [0, 0];
    probeState.vel = [0, 0];
    probeState.path = [[0, 0]];
    probeState.distance = 0;
    probeState.elapsed = 0;
    probeState.maxSpeed = 0;
    toggleProbeBtn.textContent = 'Detener prueba q_test';
  } else {
    resetProbe();
  }
}

function worldFromPointer(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
  const x = THREE.MathUtils.lerp(camera.left, camera.right, (nx + 1) * 0.5);
  const y = THREE.MathUtils.lerp(camera.bottom, camera.top, (ny + 1) * 0.5);
  return [x, y];
}

function nearestCharge(x, y, radius = PICK_RADIUS) {
  let best = -1;
  let bestD2 = radius * radius;
  for (let i = 0; i < sim.positions.length; i += 1) {
    const dx = sim.positions[i][0] - x;
    const dy = sim.positions[i][1] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      best = i;
      bestD2 = d2;
    }
  }
  return best;
}

function updateChargeBuffers() {
  const pos = chargeGeometry.getAttribute('position').array;
  const col = chargeGeometry.getAttribute('color').array;

  for (let i = 0; i < sim.positions.length; i += 1) {
    const k = i * 3;
    pos[k] = sim.positions[i][0];
    pos[k + 1] = sim.positions[i][1];
    pos[k + 2] = 0.18;

    if (sim.charges[i] > 0) {
      col[k] = 1.0;
      col[k + 1] = 0.24;
      col[k + 2] = 0.22;
    } else {
      col[k] = 0.22;
      col[k + 1] = 0.52;
      col[k + 2] = 1.0;
    }
  }

  chargeGeometry.setDrawRange(0, sim.positions.length);
  chargeGeometry.getAttribute('position').needsUpdate = true;
  chargeGeometry.getAttribute('color').needsUpdate = true;

  gpuField.updateCharges(sim.positions, sim.charges);
}

function drawChargeLabels() {
  if (sim.positions.length > 140) return;
  octx.font = 'bold 11px Segoe UI';
  octx.textAlign = 'center';
  octx.textBaseline = 'middle';

  for (let i = 0; i < sim.positions.length; i += 1) {
    const [sx, sy] = worldToScreen(sim.positions[i][0], sim.positions[i][1]);
    const isProton = sim.charges[i] > 0;
    octx.fillStyle = isProton ? 'rgba(255, 221, 221, 0.95)' : 'rgba(220, 235, 255, 0.95)';
    octx.fillText(isProton ? 'p+' : 'e−', sx, sy + 0.5);
  }
}

function stepProbe() {
  if (!probeState.active) return;

  const [ex, ey] = computeFieldAt(probeState.pos[0], probeState.pos[1]);
  const dt = 0.014;
  const damping = 0.992;
  const accelScale = 0.75;

  const ax = probeState.q * ex * accelScale;
  const ay = probeState.q * ey * accelScale;

  probeState.vel[0] = (probeState.vel[0] + ax * dt) * damping;
  probeState.vel[1] = (probeState.vel[1] + ay * dt) * damping;

  const speed = Math.hypot(probeState.vel[0], probeState.vel[1]);
  const vmax = 7.5;
  if (speed > vmax) {
    const s = vmax / speed;
    probeState.vel[0] *= s;
    probeState.vel[1] *= s;
  }

  const oldX = probeState.pos[0];
  const oldY = probeState.pos[1];
  probeState.pos[0] += probeState.vel[0] * dt;
  probeState.pos[1] += probeState.vel[1] * dt;

  if (probeState.pos[0] < -DOMAIN || probeState.pos[0] > DOMAIN) {
    probeState.vel[0] *= -0.65;
    probeState.pos[0] = Math.max(-DOMAIN, Math.min(DOMAIN, probeState.pos[0]));
  }
  if (probeState.pos[1] < -DOMAIN || probeState.pos[1] > DOMAIN) {
    probeState.vel[1] *= -0.65;
    probeState.pos[1] = Math.max(-DOMAIN, Math.min(DOMAIN, probeState.pos[1]));
  }

  const ds = Math.hypot(probeState.pos[0] - oldX, probeState.pos[1] - oldY);
  probeState.distance += ds;
  probeState.elapsed += dt;
  probeState.maxSpeed = Math.max(probeState.maxSpeed, Math.hypot(probeState.vel[0], probeState.vel[1]));

  probeState.path.push([probeState.pos[0], probeState.pos[1]]);
  if (probeState.path.length > 220) probeState.path.shift();
}

function drawProbeOverlay() {
  if (!probeState.active) return;

  if (probeState.path.length > 1) {
    octx.beginPath();
    for (let i = 0; i < probeState.path.length; i += 1) {
      const [sx, sy] = worldToScreen(probeState.path[i][0], probeState.path[i][1]);
      if (i === 0) octx.moveTo(sx, sy);
      else octx.lineTo(sx, sy);
    }
    octx.strokeStyle = probeState.q > 0 ? 'rgba(255, 170, 170, 0.75)' : 'rgba(140, 185, 255, 0.75)';
    octx.lineWidth = 2;
    octx.stroke();
  }

  const [sx, sy] = worldToScreen(probeState.pos[0], probeState.pos[1]);
  octx.beginPath();
  octx.arc(sx, sy, 7, 0, Math.PI * 2);
  octx.fillStyle = probeState.q > 0 ? 'rgba(255,80,80,0.95)' : 'rgba(70,130,255,0.95)';
  octx.fill();
  octx.strokeStyle = 'rgba(255,255,255,0.95)';
  octx.lineWidth = 1.5;
  octx.stroke();

  octx.fillStyle = 'rgba(255,255,255,0.95)';
  octx.font = 'bold 12px Segoe UI';
  octx.textAlign = 'left';
  octx.textBaseline = 'bottom';
  octx.fillText(probeState.q > 0 ? 'q_test = p+' : 'q_test = e−', sx + 10, sy - 8);
}

function drawSimulationConditionsPanel() {
  const c = getTempCelsius();
  const f = celsiusToFahrenheit(c);
  const speedNow = Math.hypot(probeState.vel[0], probeState.vel[1]);
  const lines = [
    'Condiciones de simulación',
    `T: ${c.toFixed(1)} °C | ${f.toFixed(1)} °F`,
    `Δ movimiento: ${Number(deltaSlider.value).toFixed(2)}`,
    `Pasos/frame: ${speedSlider.value}`,
    `Annealing: ${annealToggle.checked ? 'ON' : 'OFF'} | T_model=${getTempForModel().toFixed(3)}`,
    `Visualización: campo ${fieldToggle.checked ? 'ON' : 'OFF'} | potencial ${potentialToggle.checked ? 'ON' : 'OFF'}`,
    `Cargas: ${sim.count()} | Aceptación: ${(sim.acceptanceRate() * 100).toFixed(2)}%`,
    `Prueba q_test: ${probeState.active ? (probeState.q > 0 ? 'protón' : 'electrón') : 'inactiva'} | v=${speedNow.toFixed(3)} u/s`,
  ];

  const x = 12;
  const y = 12;
  const w = 420;
  const h = 22 + lines.length * 18;

  octx.save();
  octx.fillStyle = 'rgba(7, 11, 18, 0.70)';
  octx.strokeStyle = 'rgba(126, 152, 193, 0.46)';
  octx.lineWidth = 1;
  octx.beginPath();
  octx.roundRect(x, y, w, h, 10);
  octx.fill();
  octx.stroke();

  octx.font = '600 12px Segoe UI';
  octx.textAlign = 'left';
  octx.textBaseline = 'top';

  for (let i = 0; i < lines.length; i += 1) {
    octx.fillStyle = i === 0 ? 'rgba(170, 220, 255, 0.98)' : 'rgba(235, 242, 252, 0.95)';
    octx.fillText(lines[i], x + 12, y + 9 + i * 18);
  }

  octx.restore();
}

function updateInitialBuffers() {
  const pos = initialGeometry.getAttribute('position').array;
  const col = initialGeometry.getAttribute('color').array;

  for (let i = 0; i < sim.initialPositions.length; i += 1) {
    const k = i * 3;
    pos[k] = sim.initialPositions[i][0];
    pos[k + 1] = sim.initialPositions[i][1];
    pos[k + 2] = 0;

    if (sim.initialCharges[i] > 0) {
      col[k] = 0.95;
      col[k + 1] = 0.6;
      col[k + 2] = 0.6;
    } else {
      col[k] = 0.6;
      col[k + 1] = 0.75;
      col[k + 2] = 1.0;
    }
  }

  initialGeometry.setDrawRange(0, sim.initialPositions.length);
  initialGeometry.getAttribute('position').needsUpdate = true;
  initialGeometry.getAttribute('color').needsUpdate = true;
}

function computeFieldAt(x, y) {
  let ex = 0;
  let ey = 0;
  for (let i = 0; i < sim.positions.length; i += 1) {
    const dx = x - sim.positions[i][0];
    const dy = y - sim.positions[i][1];
    const r2 = dx * dx + dy * dy + 1e-4;
    const invR = 1 / Math.sqrt(r2);
    const invR3 = invR * invR * invR;
    const q = sim.charges[i];
    ex += q * dx * invR3;
    ey += q * dy * invR3;
  }
  return [ex, ey];
}

function worldToScreen(wx, wy) {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  const x = ((wx - camera.left) / (camera.right - camera.left)) * w;
  const y = (1 - (wy - camera.bottom) / (camera.top - camera.bottom)) * h;
  return [x, y];
}

function drawVectorOverlay() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  octx.clearRect(0, 0, w, h);
  if (fieldToggle.checked) {

    const gridN = 16;
    const step = (2 * DOMAIN) / (gridN - 1);
    octx.lineCap = 'round';
    octx.lineJoin = 'round';

    for (let iy = 0; iy < gridN; iy += 1) {
      for (let ix = 0; ix < gridN; ix += 1) {
      const wx = -DOMAIN + ix * step;
      const wy = -DOMAIN + iy * step;
      const [ex, ey] = computeFieldAt(wx, wy);
      const mag = Math.hypot(ex, ey);
      if (mag < 0.08) continue;

        const ux = ex / mag;
        const uy = ey / mag;
        const scale = Math.min(0.62, 0.10 + Math.pow(mag, 0.55) * 0.07);
      const x2 = wx + ux * scale;
      const y2 = wy + uy * scale;

    const [sx1, sy1] = worldToScreen(wx, wy);
    const [sx2, sy2] = worldToScreen(x2, y2);
    const intensity = Math.min(1, 0.22 + Math.pow(mag, 0.45) * 0.34);
    const hue = 195 - Math.min(85, mag * 8.0);
    const stroke = `hsla(${hue}, 100%, 72%, ${0.30 + 0.55 * intensity})`;
    const ah = 5.5 + 2.5 * intensity;

    octx.strokeStyle = stroke;
    octx.fillStyle = stroke;
    octx.shadowColor = `hsla(${hue}, 95%, 65%, ${0.22 + 0.2 * intensity})`;
    octx.shadowBlur = 5.5 * intensity;
    octx.lineWidth = 0.9 + 1.3 * intensity;

        octx.beginPath();
        octx.moveTo(sx1, sy1);
        octx.lineTo(sx2, sy2);
        octx.stroke();

        const ang = Math.atan2(sy2 - sy1, sx2 - sx1);
        octx.beginPath();
        octx.moveTo(sx2, sy2);
        octx.lineTo(sx2 - ah * Math.cos(ang - Math.PI / 6), sy2 - ah * Math.sin(ang - Math.PI / 6));
        octx.lineTo(sx2 - ah * Math.cos(ang + Math.PI / 6), sy2 - ah * Math.sin(ang + Math.PI / 6));
        octx.closePath();
        octx.fill();
      }
    }
  }

  drawChargeLabels();
  drawProbeOverlay();
  drawSimulationConditionsPanel();
  octx.shadowBlur = 0;
}

function updateStats() {
  const c = getTempCelsius();
  const f = celsiusToFahrenheit(c);
  const k = c + 273.15;

  energyLabel.textContent = `U: ${sim.totalEnergy.toFixed(4)}`;
  acceptanceLabel.textContent = `Aceptación: ${(sim.acceptanceRate() * 100).toFixed(2)}%`;
  countLabel.textContent = `Cargas: ${sim.count()}`;
  deltaValue.textContent = Number(deltaSlider.value).toFixed(2);
  speedValue.textContent = speedSlider.value;
  tempValue.textContent = tempUnitMode === 'C'
    ? `${c.toFixed(1)} °C / ${f.toFixed(1)} °F`
    : `${f.toFixed(1)} °F / ${c.toFixed(1)} °C`;
  tempStatsLabel.textContent = `T: ${c.toFixed(1)} °C | ${f.toFixed(1)} °F | ${k.toFixed(2)} K`;
  if (probeState.active) {
    const speed = Math.hypot(probeState.vel[0], probeState.vel[1]);
    probeLabel.textContent = `Prueba: ${probeState.q > 0 ? 'protón' : 'electrón'} | v=${speed.toFixed(3)} u/s | d=${probeState.distance.toFixed(3)} u | t=${probeState.elapsed.toFixed(2)} s`;
  } else {
    probeLabel.textContent = 'Prueba: inactiva';
  }
}

function runMCFrame() {
  const steps = Number(speedSlider.value);
  const delta = Number(deltaSlider.value);
  const anneal = annealToggle.checked;
  const t0 = getTempForModel();

  for (let i = 0; i < steps; i += 1) {
    const decay = Math.exp(-sim.totalMoves * 0.00002);
    sim.stepMonteCarlo(delta, anneal, t0 * decay);
  }
}

function fullRefresh() {
  updateChargeBuffers();
  updateStats();
  energyPlot.draw(sim.energyHistory);
}

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

renderer.domElement.addEventListener('pointerdown', (ev) => {
  const [x, y] = worldFromPointer(ev);
  const idx = nearestCharge(x, y);

  if (ev.button === 2) {
    if (idx >= 0) {
      sim.removeCharge(idx);
      fullRefresh();
    }
    return;
  }

  if (idx >= 0) {
    dragIndex = idx;
    return;
  }

  const sign = Number(newChargeSign.value);
  if (sim.addCharge(x, y, sign)) {
    fullRefresh();
  }
});

renderer.domElement.addEventListener('pointermove', (ev) => {
  if (dragIndex < 0) return;
  const [x, y] = worldFromPointer(ev);
  sim.positions[dragIndex][0] = x;
  sim.positions[dragIndex][1] = y;
  sim.clampInDomain(dragIndex);
  fullRefresh();
});

window.addEventListener('pointerup', () => {
  dragIndex = -1;
});

renderer.domElement.addEventListener('dblclick', (ev) => {
  const [x, y] = worldFromPointer(ev);
  const idx = nearestCharge(x, y);
  if (idx >= 0) {
    sim.toggleChargeSign(idx);
    fullRefresh();
  }
});

startStopBtn.addEventListener('click', () => {
  running = !running;
  startStopBtn.textContent = running ? 'Stop' : 'Start';
  if (running) {
    beginRunSession();
  } else {
    endRunSessionAndExport();
  }
  syncRecordButtonsUI();
});

resetBtn.addEventListener('click', () => {
  if (running || runSession) {
    running = false;
    endRunSessionAndExport();
  }
  running = false;
  startStopBtn.textContent = 'Start';
  sim.resetRandom(50);
  resetProbe();
  updateInitialBuffers();
  fullRefresh();
  syncRecordButtonsUI();
});

// Etapa 1: reinicia con 50 cargas todas positivas para observar repulsión pura
resetPositiveBtn.addEventListener('click', () => {
  if (running || runSession) {
    running = false;
    endRunSessionAndExport();
  }
  running = false;
  startStopBtn.textContent = 'Start';
  sim.resetPositive(50);
  resetProbe();
  updateInitialBuffers();
  fullRefresh();
  syncRecordButtonsUI();
});

toggleProbeBtn.addEventListener('click', () => {
  toggleProbe();
  updateStats();
});

probeChargeSign.addEventListener('change', () => {
  if (!probeState.active) probeState.q = Number(probeChargeSign.value);
});

tempUnit.addEventListener('change', () => {
  applyTempSliderByUnit(tempUnit.value);
  updateStats();
});

recordBtn.addEventListener('click', () => {
  if (!running) {
    running = true;
    startStopBtn.textContent = 'Stop';
    beginRunSession();
  } else {
    running = false;
    startStopBtn.textContent = 'Start';
    endRunSessionAndExport();
  }
  syncRecordButtonsUI();
});

floatingRecordBtn.addEventListener('click', () => {
  if (!running) {
    running = true;
    startStopBtn.textContent = 'Stop';
    beginRunSession();
  } else {
    running = false;
    startStopBtn.textContent = 'Start';
    endRunSessionAndExport();
  }
  syncRecordButtonsUI();
});

saveInitialBtn.addEventListener('click', () => {
  sim.saveInitialState();
  updateInitialBuffers();
});

exportLogBtn.addEventListener('click', () => {
  exportSimulationRecord();
});

showInitialToggle.addEventListener('change', () => {
  initialPoints.visible = showInitialToggle.checked;
});

potentialToggle.addEventListener('change', () => {
  gpuField.setVisibility(potentialToggle.checked, fieldToggle.checked);
});

fieldToggle.addEventListener('change', () => {
  gpuField.setVisibility(potentialToggle.checked, fieldToggle.checked);
});

function animate() {
  requestAnimationFrame(animate);

  if (running) {
    runMCFrame();
    updateChargeBuffers();
  }

  stepProbe();

  frameCounter += 1;
  if (frameCounter % 2 === 0) {
    updateStats();
    energyPlot.draw(sim.energyHistory);
  }

  drawVectorOverlay();
  renderer.render(scene, camera);
  // Composite WebGL + vector overlay into the recording stream if active
  if (window._recordMerge) window._recordMerge();
}

window.addEventListener('resize', resize);
applyTempSliderByUnit(tempUnitMode);
resetProbe();
syncRecordButtonsUI();
resize();
updateInitialBuffers();
fullRefresh();
gpuField.setVisibility(true, true);
animate();
