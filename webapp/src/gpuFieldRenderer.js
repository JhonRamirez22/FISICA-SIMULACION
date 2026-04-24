import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';

const MAX_CHARGES = 256;

export class GPUFieldRenderer {
  constructor(domain) {
    this.domain = domain;

    const uniforms = {
      uDomain: { value: domain },
      uChargeCount: { value: 0 },
      uShowPotential: { value: 1.0 },
      uShowField: { value: 1.0 },
      uPositions: { value: Array.from({ length: MAX_CHARGES }, () => new THREE.Vector2(0, 0)) },
      uCharges: { value: new Float32Array(MAX_CHARGES) },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec2 vWorldPos;
        void main() {
          vWorldPos = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;

        const int MAX_CHARGES = ${MAX_CHARGES};
        uniform float uDomain;
        uniform int uChargeCount;
        uniform float uShowPotential;
        uniform float uShowField;
        uniform vec2 uPositions[MAX_CHARGES];
        uniform float uCharges[MAX_CHARGES];

        varying vec2 vWorldPos;

        vec3 potentialColor(float p) {
          float t = 0.5 + 0.5 * tanh(0.5 * p);
          vec3 neg = vec3(0.15, 0.35, 0.95);
          vec3 pos = vec3(0.95, 0.22, 0.18);
          vec3 mid = vec3(0.12, 0.13, 0.16);
          return mix(mix(neg, mid, smoothstep(0.0, 0.5, t)), mix(mid, pos, smoothstep(0.5, 1.0, t)), smoothstep(0.25, 0.75, t));
        }

        void main() {
          vec2 p = vWorldPos;
          float V = 0.0;
          vec2 E = vec2(0.0);

          for (int i = 0; i < MAX_CHARGES; i++) {
            if (i >= uChargeCount) break;

            vec2 d = p - uPositions[i];
            float r2 = dot(d, d) + 1e-4;
            float invR = inversesqrt(r2);
            float invR3 = invR * invR * invR;
            float q = uCharges[i];

            V += q * invR;
            E += q * d * invR3;
          }

          vec3 outColor = vec3(0.02, 0.02, 0.03);
          float alpha = 0.0;

          if (uShowPotential > 0.5) {
            outColor += 0.85 * potentialColor(V);
            alpha = max(alpha, 0.83);
          }

          if (uShowField > 0.5) {
            float Emag = length(E);
            vec2 n = normalize(E + vec2(1e-8));
            float stripes = 0.5 + 0.5 * cos(26.0 * dot(p / uDomain, vec2(-n.y, n.x)));
            float fieldLayer = smoothstep(0.10, 0.95, min(Emag * 0.35, 1.0));
            vec3 fieldColor = mix(vec3(0.0, 0.0, 0.0), vec3(0.95, 0.95, 0.78), stripes * fieldLayer);
            outColor = mix(outColor, fieldColor, 0.55);
            alpha = max(alpha, 0.65);
          }

          gl_FragColor = vec4(outColor, alpha);
        }
      `,
    });

    const geometry = new THREE.PlaneGeometry(domain * 2, domain * 2, 1, 1);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.z = -0.35;
  }

  updateCharges(positions, charges) {
    const count = Math.min(positions.length, MAX_CHARGES);
    this.material.uniforms.uChargeCount.value = count;

    const posUniform = this.material.uniforms.uPositions.value;
    const qUniform = this.material.uniforms.uCharges.value;

    for (let i = 0; i < count; i += 1) {
      posUniform[i].set(positions[i][0], positions[i][1]);
      qUniform[i] = charges[i];
    }

    this.material.uniformsNeedUpdate = true;
  }

  setVisibility(showPotential, showField) {
    this.material.uniforms.uShowPotential.value = showPotential ? 1.0 : 0.0;
    this.material.uniforms.uShowField.value = showField ? 1.0 : 0.0;
  }
}
