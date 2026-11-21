import * as THREE from 'three';
import { ALL_PLOT_IDS, PLOT_META } from '../types/town.ts';

export interface WindUniforms {
  uTime: { value: number };
  uWindStrength: { value: number };
}

export interface WaterUniforms {
  uTime: { value: number };
}

export interface TownDetailsHandle {
  windUniforms: WindUniforms;
  setDensityFactor: (factor: number) => void;
  setLanternShadows: (enabled: boolean) => void;
  dispose: () => void;
}

function createSeededRandom(seedInitial: number): () => number {
  let seed = seedInitial >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function mergeSimpleGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIndices = 0;

  const nonIndexed = geometries.map((g) => {
    const out = g.index ? g.toNonIndexed() : g;
    if (!out.attributes.normal) {
      out.computeVertexNormals();
    }
    const pos = out.attributes.position;
    totalVerts += pos.count;
    totalIndices += pos.count;
    return out;
  });

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalIndices * 3);

  let offset = 0;
  for (const g of nonIndexed) {
    const posArr = g.attributes.position.array as Float32Array;
    const normArr = g.attributes.normal.array as Float32Array;
    positions.set(posArr, offset * 3);
    normals.set(normArr, offset * 3);
    offset += g.attributes.position.count;
    if (!geometries.includes(g)) {
      g.dispose();
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.computeBoundingSphere();
  return merged;
}

export function createWindSwayMaterial(
  params: THREE.MeshStandardMaterialParameters,
  windUniforms: WindUniforms,
  options: { swayScale?: number; heightMin?: number; heightRange?: number } = {},
): THREE.MeshStandardMaterial {
  const swayScale = options.swayScale ?? 0.08;
  const heightMin = options.heightMin ?? 0.0;
  const heightRange = options.heightRange ?? 1.2;

  const mat = new THREE.MeshStandardMaterial(params);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      uniform float uWindStrength;`,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float swayH = clamp((position.y - ${heightMin.toFixed(3)}) / ${heightRange.toFixed(3)}, 0.0, 1.4);
      #ifdef USE_INSTANCING
        vec3 instOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 instOrigin = vec3(0.0);
      #endif
      float windPhase = uTime * 1.85 + instOrigin.x * 0.42 + instOrigin.z * 0.37;
      float gust = sin(windPhase) + 0.35 * sin(windPhase * 2.1 + 0.8);
      transformed.x += gust * swayH * swayH * ${swayScale.toFixed(4)} * uWindStrength;
      transformed.z += cos(windPhase * 0.85) * swayH * swayH * ${(swayScale * 0.65).toFixed(4)} * uWindStrength;`,
    );
  };
  mat.customProgramCacheKey = () => `wind_sway_${swayScale}_${heightMin}_${heightRange}`;
  return mat;
}

export function createRipplingWaterMaterial(
  waterUniforms: WaterUniforms,
): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.14,
    roughness: 0.12,
    metalness: 0.1,
    clearcoat: 0.92,
    clearcoatRoughness: 0.08,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      varying float vRippleCrest;`,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float radialDist = length(position.xz);
      float ringWave = sin(radialDist * 13.5 - uTime * 3.8);
      float crossWave = cos(position.x * 5.2 + uTime * 2.1) * sin(position.z * 5.2 - uTime * 1.9);
      float fadeEdge = smoothstep(1.9, 0.2, radialDist);
      float disp = (ringWave * 0.02 + crossWave * 0.008) * fadeEdge;
      transformed.y += disp;
      vRippleCrest = clamp((ringWave * 0.5 + 0.5) * fadeEdge, 0.0, 1.0);`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying float vRippleCrest;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec3 crestFoam = vec3(0.78, 0.95, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, crestFoam, pow(vRippleCrest, 3.0) * 0.42);`,
    );
  };
  mat.customProgramCacheKey = () => 'alderbrook_water_ripples_v1';
  return mat;
}

function isNearRoadOrBuilding(x: number, z: number, minPlotClearance = 3.1): boolean {
  const distCenter = Math.hypot(x, z);
  if (distCenter < 5.6) return true;
  // North-South path (x in [-1.6, 1.6], z in [-13.5, 13.5])
  if (Math.abs(x) < 1.85 && Math.abs(z) < 13.5) return true;
  // East-West path (z around -0.5, x in [-13.5, 13.5])
  if (Math.abs(z + 0.5) < 1.85 && Math.abs(x) < 13.5) return true;
  // Cardinal Landmarks
  if (Math.hypot(x, z + 10.5) < 4.5) return true; // Town Hall
  if (Math.hypot(x - 10.5, z + 0.5) < 4.2) return true; // Workshop
  if (Math.hypot(x + 10.5, z + 0.5) < 4.2) return true; // Market
  if (Math.hypot(x, z - 10.2) < 4.4) return true; // Park

  for (const plotId of ALL_PLOT_IDS) {
    const pm = PLOT_META[plotId];
    if (Math.hypot(x - pm.x, z - pm.z) < minPlotClearance) {
      return true;
    }
  }
  return false;
}

export function buildScatteredTownDetails(
  scene: THREE.Scene,
  lanternMaterials: THREE.MeshStandardMaterial[],
  windUniforms: WindUniforms,
): TownDetailsHandle {
  const group = new THREE.Group();
  group.name = 'town:instanced_details';
  const rand = createSeededRandom(20261120);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const disposables: Array<{ dispose: () => void }> = [];

  // -------------------------------------------------------------------------
  // 1. Procedural Cobblestones around Square & Path Borders (140 instances)
  // -------------------------------------------------------------------------
  const cobbleGeo = new THREE.CylinderGeometry(0.18, 0.23, 0.06, 6);
  const cobbleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.03,
  });
  disposables.push(cobbleGeo, cobbleMat);

  const cobbleCoords: Array<{ x: number; z: number; s: number; rot: number; hex: number }> = [];
  const cobblePalette = [0xa8a29e, 0x94a3b8, 0xcbd5e1, 0xb8a99a];

  // Ring around central cobble plaza
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2 + (rand() - 0.5) * 0.08;
    const r = 4.65 + (rand() - 0.5) * 0.55;
    cobbleCoords.push({
      x: Math.cos(angle) * r,
      z: Math.sin(angle) * r,
      s: 0.8 + rand() * 0.55,
      rot: rand() * Math.PI,
      hex: cobblePalette[i % cobblePalette.length],
    });
  }
  // Borders along the 4 cardinal paths
  for (let i = 0; i < 104; i++) {
    const axis = i % 2;
    const side = (i % 4 < 2 ? -1 : 1) * (1.22 + rand() * 0.25);
    const along = (rand() - 0.5) * 18.2;
    const x = axis === 0 ? side : along;
    const z = axis === 0 ? along : -0.5 + side;
    if (Math.hypot(x, z) < 4.5) continue;
    cobbleCoords.push({
      x,
      z,
      s: 0.72 + rand() * 0.58,
      rot: rand() * Math.PI,
      hex: cobblePalette[i % cobblePalette.length],
    });
  }

  const cobbleMax = cobbleCoords.length;
  const cobbleMesh = new THREE.InstancedMesh(cobbleGeo, cobbleMat, cobbleMax);
  cobbleMesh.receiveShadow = true;
  cobbleCoords.forEach((c, idx) => {
    dummy.position.set(c.x, 0.025, c.z);
    dummy.rotation.set(0, c.rot, 0);
    dummy.scale.set(c.s, 0.85, c.s * (0.8 + rand() * 0.35));
    dummy.updateMatrix();
    cobbleMesh.setMatrixAt(idx, dummy.matrix);
    color.setHex(c.hex);
    cobbleMesh.setColorAt(idx, color);
  });
  cobbleMesh.instanceMatrix.needsUpdate = true;
  if (cobbleMesh.instanceColor) cobbleMesh.instanceColor.needsUpdate = true;
  cobbleMesh.computeBoundingSphere();
  group.add(cobbleMesh);

  // -------------------------------------------------------------------------
  // 2. Stylized Grass Tufts with Wind Sway (180 instances)
  // -------------------------------------------------------------------------
  const blade1 = new THREE.ConeGeometry(0.06, 0.34, 4);
  blade1.translate(0, 0.17, 0);
  const blade2 = new THREE.ConeGeometry(0.055, 0.28, 4);
  blade2.rotateZ(0.26);
  blade2.translate(0.07, 0.14, 0.03);
  const blade3 = new THREE.ConeGeometry(0.055, 0.26, 4);
  blade3.rotateZ(-0.24);
  blade3.rotateY(0.9);
  blade3.translate(-0.06, 0.13, -0.04);
  const grassGeo = mergeSimpleGeometries([blade1, blade2, blade3]);
  blade1.dispose();
  blade2.dispose();
  blade3.dispose();

  const grassMat = createWindSwayMaterial(
    { color: 0xffffff, roughness: 0.88, metalness: 0.0 },
    windUniforms,
    { swayScale: 0.075, heightMin: 0.02, heightRange: 0.34 },
  );
  disposables.push(grassGeo, grassMat);

  const grassMax = 180;
  const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, grassMax);
  const grassPalette = [0x65a30d, 0x4d7c0f, 0x84cc16, 0x5c8d46];
  let gIdx = 0;
  let attempts = 0;
  while (gIdx < grassMax && attempts < 1400) {
    attempts++;
    const angle = rand() * Math.PI * 2;
    const radius = 5.8 + rand() * 16.5;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isNearRoadOrBuilding(x, z, 2.7)) continue;

    const s = 0.8 + rand() * 0.55;
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(s, s * (0.85 + rand() * 0.35), s);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(gIdx, dummy.matrix);
    color.setHex(grassPalette[gIdx % grassPalette.length]);
    grassMesh.setColorAt(gIdx, color);
    gIdx++;
  }
  grassMesh.count = gIdx;
  grassMesh.instanceMatrix.needsUpdate = true;
  if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  grassMesh.computeBoundingSphere();
  group.add(grassMesh);

  // -------------------------------------------------------------------------
  // 3. Wildflowers (Stems + Blossoms with Wind Sway, 110 instances)
  // -------------------------------------------------------------------------
  const stemGeo = new THREE.CylinderGeometry(0.018, 0.024, 0.24, 5);
  stemGeo.translate(0, 0.12, 0);
  const stemMat = createWindSwayMaterial(
    { color: 0x4d7c0f, roughness: 0.85 },
    windUniforms,
    { swayScale: 0.08, heightMin: 0.0, heightRange: 0.28 },
  );
  const bloomGeo = new THREE.DodecahedronGeometry(0.075, 0);
  bloomGeo.translate(0, 0.25, 0);
  const bloomMat = createWindSwayMaterial(
    { color: 0xffffff, roughness: 0.62, metalness: 0.02 },
    windUniforms,
    { swayScale: 0.08, heightMin: 0.0, heightRange: 0.28 },
  );
  disposables.push(stemGeo, stemMat, bloomGeo, bloomMat);

  const flowerMax = 110;
  const stemMesh = new THREE.InstancedMesh(stemGeo, stemMat, flowerMax);
  const bloomMesh = new THREE.InstancedMesh(bloomGeo, bloomMat, flowerMax);
  const flowerPalette = [0xf43f5e, 0xfbbf24, 0xfb923c, 0xa78bfa, 0xfef3c7];

  let fIdx = 0;
  attempts = 0;
  while (fIdx < flowerMax && attempts < 1200) {
    attempts++;
    const angle = rand() * Math.PI * 2;
    const radius = 5.8 + rand() * 14.5;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isNearRoadOrBuilding(x, z, 2.65)) continue;

    const s = 0.85 + rand() * 0.4;
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    stemMesh.setMatrixAt(fIdx, dummy.matrix);
    bloomMesh.setMatrixAt(fIdx, dummy.matrix);
    color.setHex(flowerPalette[fIdx % flowerPalette.length]);
    bloomMesh.setColorAt(fIdx, color);
    fIdx++;
  }
  stemMesh.count = fIdx;
  bloomMesh.count = fIdx;
  stemMesh.instanceMatrix.needsUpdate = true;
  bloomMesh.instanceMatrix.needsUpdate = true;
  if (bloomMesh.instanceColor) bloomMesh.instanceColor.needsUpdate = true;
  stemMesh.computeBoundingSphere();
  bloomMesh.computeBoundingSphere();
  group.add(stemMesh, bloomMesh);

  // -------------------------------------------------------------------------
  // 4. Stylized Wooden Fences (Merged post+rail geometry, 20 instances)
  // -------------------------------------------------------------------------
  const postL = new THREE.BoxGeometry(0.1, 0.62, 0.1);
  postL.translate(-0.75, 0.31, 0);
  const postR = new THREE.BoxGeometry(0.1, 0.62, 0.1);
  postR.translate(0.75, 0.31, 0);
  const railTop = new THREE.BoxGeometry(1.62, 0.07, 0.06);
  railTop.translate(0, 0.48, 0);
  const railMid = new THREE.BoxGeometry(1.62, 0.07, 0.06);
  railMid.translate(0, 0.27, 0);
  const fenceGeo = mergeSimpleGeometries([postL, postR, railTop, railMid]);
  postL.dispose();
  postR.dispose();
  railTop.dispose();
  railMid.dispose();

  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.85 });
  disposables.push(fenceGeo, fenceMat);

  const fencePlacements: Array<[number, number, number]> = [];
  // Outer meadow & park accent segments positioned safely outside plots & roads
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2 + 0.14;
    // Leave openings along N, S, E, W approach axes
    if (
      Math.abs(Math.cos(angle)) < 0.18 ||
      Math.abs(Math.sin(angle)) < 0.18
    ) {
      continue;
    }
    const r = 16.0;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    if (isNearRoadOrBuilding(x, z, 2.7)) continue;
    fencePlacements.push([x, z, Math.atan2(x, z) + Math.PI / 2]);
  }

  const fenceMax = Math.max(fencePlacements.length, 1);
  const fenceMesh = new THREE.InstancedMesh(fenceGeo, fenceMat, fenceMax);
  fenceMesh.castShadow = true;
  fenceMesh.receiveShadow = true;
  fencePlacements.forEach(([x, z, rotY], idx) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    fenceMesh.setMatrixAt(idx, dummy.matrix);
  });
  fenceMesh.count = fencePlacements.length;
  fenceMesh.instanceMatrix.needsUpdate = true;
  fenceMesh.computeBoundingSphere();
  group.add(fenceMesh);

  // -------------------------------------------------------------------------
  // 5. Glowing Street Lanterns around Square & Paths (12 instances)
  // -------------------------------------------------------------------------
  const lBase = new THREE.CylinderGeometry(0.08, 0.12, 0.25, 6);
  lBase.translate(0, 0.125, 0);
  const lPole = new THREE.CylinderGeometry(0.045, 0.06, 1.85, 6);
  lPole.translate(0, 1.12, 0);
  const lCap = new THREE.ConeGeometry(0.24, 0.18, 6);
  lCap.translate(0, 2.34, 0);
  const lanternFrameGeo = mergeSimpleGeometries([lBase, lPole, lCap]);
  lBase.dispose();
  lPole.dispose();
  lCap.dispose();

  const lanternFrameMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.42,
    metalness: 0.75,
  });
  const lanternBulbGeo = new THREE.OctahedronGeometry(0.16, 0);
  lanternBulbGeo.translate(0, 2.13, 0);
  const lanternBulbMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.35,
    roughness: 0.22,
  });
  lanternMaterials.push(lanternBulbMat);
  disposables.push(lanternFrameGeo, lanternFrameMat, lanternBulbGeo, lanternBulbMat);

  const lanternCoords: Array<[number, number]> = [
    [-3.5, -3.5],
    [3.5, -3.5],
    [-3.5, 3.5],
    [3.5, 3.5],
    [-1.45, -6.2],
    [1.45, -6.2],
    [-1.45, 5.8],
    [1.45, 5.8],
    [-6.2, -1.95],
    [-6.2, 0.95],
    [6.2, -1.95],
    [6.2, 0.95],
  ];

  const lanternFrameMesh = new THREE.InstancedMesh(
    lanternFrameGeo,
    lanternFrameMat,
    lanternCoords.length,
  );
  lanternFrameMesh.castShadow = true;
  const lanternBulbMesh = new THREE.InstancedMesh(
    lanternBulbGeo,
    lanternBulbMat,
    lanternCoords.length,
  );

  lanternCoords.forEach(([x, z], idx) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, idx * 0.4, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lanternFrameMesh.setMatrixAt(idx, dummy.matrix);
    lanternBulbMesh.setMatrixAt(idx, dummy.matrix);
  });
  lanternFrameMesh.instanceMatrix.needsUpdate = true;
  lanternBulbMesh.instanceMatrix.needsUpdate = true;
  lanternFrameMesh.computeBoundingSphere();
  lanternBulbMesh.computeBoundingSphere();
  group.add(lanternFrameMesh, lanternBulbMesh);

  // -------------------------------------------------------------------------
  // 6. Cozy Torch Braziers flanking Landmarks (6 instances)
  // -------------------------------------------------------------------------
  const tStand = new THREE.CylinderGeometry(0.09, 0.14, 0.85, 6);
  tStand.translate(0, 0.425, 0);
  const tBowl = new THREE.CylinderGeometry(0.22, 0.12, 0.2, 6);
  tBowl.translate(0, 0.92, 0);
  const torchStandGeo = mergeSimpleGeometries([tStand, tBowl]);
  tStand.dispose();
  tBowl.dispose();

  const torchFlameGeo = new THREE.ConeGeometry(0.14, 0.34, 6);
  torchFlameGeo.translate(0, 1.15, 0);
  const torchFlameMat = new THREE.MeshStandardMaterial({
    color: 0xfde047,
    emissive: 0xf97316,
    emissiveIntensity: 0.45,
    roughness: 0.25,
  });
  lanternMaterials.push(torchFlameMat);
  disposables.push(torchStandGeo, torchFlameGeo, torchFlameMat);

  const torchCoords: Array<[number, number]> = [
    [-2.4, -7.8],
    [2.4, -7.8],
    [7.8, -2.3],
    [7.8, 1.3],
    [-7.8, -2.3],
    [-7.8, 1.3],
  ];

  const torchStandMesh = new THREE.InstancedMesh(
    torchStandGeo,
    lanternFrameMat,
    torchCoords.length,
  );
  torchStandMesh.castShadow = true;
  const torchFlameMesh = new THREE.InstancedMesh(
    torchFlameGeo,
    torchFlameMat,
    torchCoords.length,
  );
  torchCoords.forEach(([x, z], idx) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, idx * 0.5, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    torchStandMesh.setMatrixAt(idx, dummy.matrix);
    torchFlameMesh.setMatrixAt(idx, dummy.matrix);
  });
  torchStandMesh.instanceMatrix.needsUpdate = true;
  torchFlameMesh.instanceMatrix.needsUpdate = true;
  torchStandMesh.computeBoundingSphere();
  torchFlameMesh.computeBoundingSphere();
  group.add(torchStandMesh, torchFlameMesh);

  scene.add(group);

  const totalGrass = gIdx;
  const totalFlowers = fIdx;
  const totalFences = fencePlacements.length;

  return {
    windUniforms,
    setDensityFactor: (factor: number) => {
      const f = Math.max(0.35, Math.min(1, factor));
      cobbleMesh.count = Math.max(24, Math.round(cobbleMax * f));
      grassMesh.count = Math.max(30, Math.round(totalGrass * f));
      const fCount = Math.max(20, Math.round(totalFlowers * f));
      stemMesh.count = fCount;
      bloomMesh.count = fCount;
      fenceMesh.count = Math.max(4, Math.round(totalFences * f));
    },
    setLanternShadows: (enabled: boolean) => {
      fenceMesh.castShadow = enabled;
      lanternFrameMesh.castShadow = enabled;
      torchStandMesh.castShadow = enabled;
    },
    dispose: () => {
      for (const mat of [lanternBulbMat, torchFlameMat]) {
        const idx = lanternMaterials.indexOf(mat);
        if (idx !== -1) lanternMaterials.splice(idx, 1);
      }
      scene.remove(group);
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}
