const EPS = 1e-6;

export class ChargeSimulation {
  constructor({ n = 50, domain = 10, seed = 7 }) {
    this.domain = domain;
    this.maxCharges = 256;
    this._rng = mulberry32(seed);

    this.positions = [];
    this.charges = [];
    this.initialPositions = [];
    this.initialCharges = [];

    for (let i = 0; i < n; i += 1) {
      this.positions.push([
        lerp(-domain, domain, this._rng()),
        lerp(-domain, domain, this._rng()),
      ]);
      this.charges.push(this._rng() < 0.5 ? -1 : 1);
    }

    this.totalEnergy = this.computeTotalEnergy();
    this.energyHistory = [this.totalEnergy];
    this.acceptedMoves = 0;
    this.totalMoves = 0;
    this.saveInitialState();
  }

  count() {
    return this.positions.length;
  }

  saveInitialState() {
    this.initialPositions = this.positions.map((p) => [p[0], p[1]]);
    this.initialCharges = [...this.charges];
  }

  resetRandom(n = 50) {
    this.positions = [];
    this.charges = [];
    for (let i = 0; i < n; i += 1) {
      this.positions.push([
        lerp(-this.domain, this.domain, this._rng()),
        lerp(-this.domain, this.domain, this._rng()),
      ]);
      this.charges.push(this._rng() < 0.5 ? -1 : 1);
    }
    this.totalEnergy = this.computeTotalEnergy();
    this.energyHistory = [this.totalEnergy];
    this.acceptedMoves = 0;
    this.totalMoves = 0;
    this.saveInitialState();
  }

  computeTotalEnergy() {
    let energy = 0;
    const n = this.positions.length;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const dx = this.positions[i][0] - this.positions[j][0];
        const dy = this.positions[i][1] - this.positions[j][1];
        const r = Math.hypot(dx, dy) + EPS;
        energy += (this.charges[i] * this.charges[j]) / r;
      }
    }
    return energy;
  }

  interactionEnergy(index, trialPos = null) {
    let e = 0;
    const p = trialPos ?? this.positions[index];
    const qi = this.charges[index];

    for (let j = 0; j < this.positions.length; j += 1) {
      if (j === index) continue;
      const dx = p[0] - this.positions[j][0];
      const dy = p[1] - this.positions[j][1];
      const r = Math.hypot(dx, dy) + EPS;
      e += (qi * this.charges[j]) / r;
    }
    return e;
  }

  stepMonteCarlo(delta, anneal = false, temperature = 0.1) {
    if (this.positions.length < 2) return;

    this.totalMoves += 1;

    const idx = Math.floor(this._rng() * this.positions.length);
    const dx = lerp(-delta, delta, this._rng());
    const dy = lerp(-delta, delta, this._rng());

    const candidate = [
      this.positions[idx][0] + dx,
      this.positions[idx][1] + dy,
    ];

    if (
      candidate[0] < -this.domain ||
      candidate[0] > this.domain ||
      candidate[1] < -this.domain ||
      candidate[1] > this.domain
    ) {
      this.energyHistory.push(this.totalEnergy);
      return;
    }

    const oldLocal = this.interactionEnergy(idx);
    const newLocal = this.interactionEnergy(idx, candidate);
    const dU = newLocal - oldLocal;

    let accept = dU < 0;
    if (!accept && anneal) {
      const p = Math.exp(-dU / Math.max(temperature, 1e-6));
      accept = this._rng() < p;
    }

    if (accept) {
      this.positions[idx] = candidate;
      this.totalEnergy += dU;
      this.acceptedMoves += 1;
    }

    this.energyHistory.push(this.totalEnergy);
    if (this.energyHistory.length > 2500) {
      this.energyHistory.shift();
    }
  }

  clampInDomain(index) {
    this.positions[index][0] = Math.max(-this.domain, Math.min(this.domain, this.positions[index][0]));
    this.positions[index][1] = Math.max(-this.domain, Math.min(this.domain, this.positions[index][1]));
    this.totalEnergy = this.computeTotalEnergy();
    this.energyHistory.push(this.totalEnergy);
  }

  addCharge(x, y, q) {
    if (this.positions.length >= this.maxCharges) return false;
    if (x < -this.domain || x > this.domain || y < -this.domain || y > this.domain) return false;

    this.positions.push([x, y]);
    this.charges.push(q >= 0 ? 1 : -1);
    this.totalEnergy = this.computeTotalEnergy();
    this.energyHistory.push(this.totalEnergy);
    return true;
  }

  removeCharge(index) {
    if (index < 0 || index >= this.positions.length || this.positions.length <= 1) return;
    this.positions.splice(index, 1);
    this.charges.splice(index, 1);
    this.totalEnergy = this.computeTotalEnergy();
    this.energyHistory.push(this.totalEnergy);
  }

  toggleChargeSign(index) {
    if (index < 0 || index >= this.positions.length) return;
    this.charges[index] *= -1;
    this.totalEnergy = this.computeTotalEnergy();
    this.energyHistory.push(this.totalEnergy);
  }

  acceptanceRate() {
    if (this.totalMoves === 0) return 0;
    return this.acceptedMoves / this.totalMoves;
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
