import * as THREE from 'three';
import {
  ALL_PLOT_IDS,
  PLOT_META,
  type BiomeId,
  type GraphicsQuality,
  type PlotId,
  type TownTheme,
} from '../types/town.ts';
import {
  applyThemeToMaterial,
  COBBLE_PALETTES,
  GRASS_TUFT_PALETTES,
  tagThemeMaterial,
  WILDFLOWER_PALETTES,
} from './townThemes.ts';

export interface WindUniforms {
  uTime: { value: number };
  uWindStrength: { value: number };
}

export interface WaterUniforms {
  uTime: { value: number };
}

export interface TownDetailsHandle {
  group: THREE.Group;
  windUniforms: WindUniforms;
  setDensityFactor: (factor: number) => void;
  setLanternShadows: (enabled: boolean) => void;
  applyTheme: (theme: TownTheme) => void;
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

export function createClothWaveMaterial(
  params: THREE.MeshStandardMaterialParameters,
  windUniforms: WindUniforms,
  options: { waveAmp?: number; waveFreq?: number; phaseOffset?: number } = {},
): THREE.MeshStandardMaterial {
  const waveAmp = options.waveAmp ?? 0.085;
  const waveFreq = options.waveFreq ?? 5.5;
  const phaseOffset = options.phaseOffset ?? 0.0;

  const mat = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    ...params,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      uniform float uWindStrength;`,
    );

    // Anchor rigidly at top edge (uv.y == 1.0) and flutter smoothly toward bottom hem (uv.y == 0.0)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float dropFactor = clamp(1.0 - uv.y, 0.0, 1.0);
      float flutter = dropFactor * dropFactor;
      float clothPhase = uTime * 3.4 - uv.y * ${waveFreq.toFixed(2)} + uv.x * 2.2 + ${phaseOffset.toFixed(2)};
      float waveZ = (sin(clothPhase) + 0.35 * sin(clothPhase * 1.9 + 1.1)) * ${waveAmp.toFixed(4)} * flutter * uWindStrength;
      float waveX = cos(clothPhase * 0.75) * ${(waveAmp * 0.38).toFixed(4)} * flutter * uWindStrength;
      transformed.z += waveZ;
      transformed.x += waveX;`,
    );
  };
  mat.customProgramCacheKey = () => `cloth_wave_${waveAmp}_${waveFreq}_${phaseOffset}`;
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
  // Residential Cottages (West & East Meadow)
  if (Math.hypot(x + 13.8, z - 6.2) < 3.4) return true;
  if (Math.hypot(x - 13.8, z - 6.2) < 3.4) return true;
  // The Signal Relay (CLI Agent Hub near Train Station)
  if (Math.hypot(x - 10.6, z - 12.6) < 3.7) return true;
  // Scenic Railway Perimeter & Station Corridor
  if (distCenter > 16.8 && distCenter < 22.8) return true;

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
  const stemMat = tagThemeMaterial(
    createWindSwayMaterial(
      { color: 0x4d7c0f, roughness: 0.85 },
      windUniforms,
      { swayScale: 0.08, heightMin: 0.0, heightRange: 0.28 },
    ),
    'foliage',
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

  const fenceMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.85 }),
    'wood',
  );
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

  const lanternFrameMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.75,
    }),
    'metal',
  );
  const lanternBulbGeo = new THREE.OctahedronGeometry(0.16, 0);
  lanternBulbGeo.translate(0, 2.13, 0);
  const lanternBulbMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.35,
      roughness: 0.22,
    }),
    'lantern',
  );
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
  const torchFlameMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xf97316,
      emissiveIntensity: 0.45,
      roughness: 0.25,
    }),
    'torchFlame',
  );
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
    group,
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
    applyTheme: (theme: TownTheme) => {
      const cPal = COBBLE_PALETTES[theme];
      for (let i = 0; i < cobbleMax; i++) {
        color.setHex(cPal[i % cPal.length]);
        cobbleMesh.setColorAt(i, color);
      }
      if (cobbleMesh.instanceColor) cobbleMesh.instanceColor.needsUpdate = true;

      const gPal = GRASS_TUFT_PALETTES[theme];
      for (let i = 0; i < totalGrass; i++) {
        color.setHex(gPal[i % gPal.length]);
        grassMesh.setColorAt(i, color);
      }
      if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;

      const fPal = WILDFLOWER_PALETTES[theme];
      for (let i = 0; i < totalFlowers; i++) {
        color.setHex(fPal[i % fPal.length]);
        bloomMesh.setColorAt(i, color);
      }
      if (bloomMesh.instanceColor) bloomMesh.instanceColor.needsUpdate = true;

      applyThemeToMaterial(stemMat, theme);
      applyThemeToMaterial(fenceMat, theme);
      applyThemeToMaterial(lanternFrameMat, theme);
      applyThemeToMaterial(lanternBulbMat, theme);
      applyThemeToMaterial(torchFlameMat, theme);
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

// ============================================================================
// Expandable Outer Biomes (Dense Forest, Desert Dunes, Crystal Mountain Cave)
// & Instanced Cobblestone Road Builder (4 GB RAM Mobile-Optimized)
// ============================================================================

export interface TownExpansionHandle {
  group: THREE.Group;
  caveGroup: THREE.Group;
  caveRoofMaterials: THREE.MeshStandardMaterial[];
  caveCrystalMaterials: THREE.MeshStandardMaterial[];
  setUnlockedBiomes: (biomes: BiomeId[]) => void;
  setRoads: (roads: string[]) => void;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  applyTheme: (theme: TownTheme) => void;
  update: (elapsed: number) => void;
  dispose: () => void;
}

export function buildExpandableBiomesAndRoads(
  scene: THREE.Scene,
  lanternMaterials: THREE.MeshStandardMaterial[],
  initialTheme: TownTheme = 'meadow',
): TownExpansionHandle {
  const root = new THREE.Group();
  root.name = 'town_expansions_root';
  const disposables: Array<{ dispose: () => void }> = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // -------------------------------------------------------------------------
  // 1. AI-Built Instanced Cobblestone Roads (Single InstancedMesh, 680 cap)
  // -------------------------------------------------------------------------
  const MAX_ROAD_TILES = 680;
  const roadTileGeo = new THREE.BoxGeometry(1.05, 0.045, 0.74);
  const roadTileMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.03,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const roadMesh = new THREE.InstancedMesh(roadTileGeo, roadTileMat, MAX_ROAD_TILES);
  roadMesh.receiveShadow = true;
  roadMesh.castShadow = false;
  roadMesh.count = 0;
  roadMesh.frustumCulled = false;
  root.add(roadMesh);
  disposables.push(roadTileGeo, roadTileMat);

  let currentRoads: string[] = [];
  let currentTheme: TownTheme = initialTheme;

  const isNearAnyPlot = (x: number, z: number, minClearance = 3.8): boolean => {
    const minSq = minClearance * minClearance;
    for (const pm of Object.values(PLOT_META)) {
      const dx = x - pm.x;
      const dz = z - pm.z;
      if (dx * dx + dz * dz < minSq) return true;
    }
    return false;
  };

  const ROAD_SEGMENTS: Record<string, Array<[number, number]>> = {
    plaza_to_forest: [
      [-8.6, -8.4],
      [-15.0, -14.2],
      [-21.2, -19.4],
      [-24.8, -22.2],
      [-30.5, -17.0],
    ],
    plaza_to_desert: [
      [8.6, 8.2],
      [15.2, 14.0],
      [21.4, 19.2],
      [25.2, 22.4],
      [30.8, 16.8],
    ],
    plaza_to_cave: [
      [8.6, -8.4],
      [14.8, -14.4],
      [20.4, -20.8],
      [25.6, -24.6],
      [21.8, -28.8],
    ],
    plaza_to_spur: [
      [10.5, -0.5],
      [17.5, 0.5],
      [24.5, 1.5],
      [30.6, 2.2],
    ],
  };

  const rebuildRoadInstances = () => {
    const pal = COBBLE_PALETTES[currentTheme] ?? COBBLE_PALETTES.meadow;
    let idx = 0;

    const laySegment = (x0: number, z0: number, x1: number, z1: number) => {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.4) return;
      const angle = Math.atan2(dx, dz);
      const step = 0.88;
      const steps = Math.max(2, Math.floor(dist / step));
      const sideX = -dz / dist;
      const sideZ = dx / dist;

      for (let i = 0; i <= steps && idx < MAX_ROAD_TILES; i++) {
        const t = i / steps;
        const jitter = Math.sin(i * 1.9 + idx * 0.7) * 0.12;
        const bx = x0 + dx * t + sideX * jitter;
        const bz = z0 + dz * t + sideZ * jitter;

        // Primary stone tile
        dummy.position.set(bx, 0.028, bz);
        dummy.rotation.set(0, angle + (i % 2 === 0 ? 0.04 : -0.04), 0);
        dummy.scale.set(0.95 + (i % 3) * 0.08, 1, 0.92 + ((i + 1) % 3) * 0.07);
        dummy.updateMatrix();
        roadMesh.setMatrixAt(idx, dummy.matrix);
        color.setHex(pal[idx % pal.length]);
        roadMesh.setColorAt(idx, color);
        idx++;

        // Secondary flanking stone for cozy cobblestone width
        if (idx < MAX_ROAD_TILES && i % 2 === 0) {
          const offset = i % 4 === 0 ? 0.62 : -0.62;
          dummy.position.set(bx + sideX * offset, 0.025, bz + sideZ * offset);
          dummy.rotation.set(0, angle + 0.14, 0);
          dummy.scale.set(0.68, 0.9, 0.72);
          dummy.updateMatrix();
          roadMesh.setMatrixAt(idx, dummy.matrix);
          color.setHex(pal[(idx + 2) % pal.length]);
          roadMesh.setColorAt(idx, color);
          idx++;
        }
      }
    };

    for (const roadId of currentRoads) {
      if (idx >= MAX_ROAD_TILES) break;
      const preset = ROAD_SEGMENTS[roadId];
      if (preset) {
        for (let s = 0; s < preset.length - 1; s++) {
          laySegment(preset[s][0], preset[s][1], preset[s + 1][0], preset[s + 1][1]);
        }
      } else if (roadId.startsWith('plot:')) {
        const pid = roadId.slice(5) as PlotId;
        const pm = PLOT_META[pid];
        if (pm) {
          // Connect from nearest town axis hub to the plot entrance
          const hubX = Math.abs(pm.x) > 15 ? (pm.x > 0 ? 10.5 : -10.5) : 0;
          const hubZ = Math.abs(pm.z) > 15 ? (pm.z > 0 ? 10.2 : -10.2) : 0;
          laySegment(hubX, hubZ, pm.x * 0.92, pm.z * 0.92);
        }
      }
    }

    roadMesh.count = idx;
    roadMesh.visible = idx > 0;
    roadMesh.instanceMatrix.needsUpdate = true;
    if (roadMesh.instanceColor) roadMesh.instanceColor.needsUpdate = true;
  };

  // -------------------------------------------------------------------------
  // 2. Dense Forest Biome (North-West, centered around -28, -24)
  // -------------------------------------------------------------------------
  const forestGroup = new THREE.Group();
  forestGroup.name = 'biome:forest';
  forestGroup.visible = false;

  const forestGroundGeo = new THREE.CircleGeometry(17.5, 24);
  const forestGroundMat = new THREE.MeshStandardMaterial({
    color: 0x3f6234,
    roughness: 0.96,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const forestGround = new THREE.Mesh(forestGroundGeo, forestGroundMat);
  forestGround.rotation.x = -Math.PI / 2;
  forestGround.position.set(-28.5, 0.015, -22.5);
  forestGround.receiveShadow = true;
  forestGroup.add(forestGround);
  disposables.push(forestGroundGeo, forestGroundMat);

  const pineTrunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.55, 6);
  pineTrunkGeo.translate(0, 0.77, 0);
  const pineCone1 = new THREE.ConeGeometry(1.25, 2.2, 6);
  pineCone1.translate(0, 2.2, 0);
  const pineCone2 = new THREE.ConeGeometry(0.92, 1.85, 6);
  pineCone2.translate(0, 3.35, 0);
  const pineCanopyGeo = mergeSimpleGeometries([pineCone1, pineCone2]);
  pineCone1.dispose();
  pineCone2.dispose();

  const pineTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 });
  const pineCanopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const mossRockGeo = new THREE.DodecahedronGeometry(0.65, 0);
  const mossRockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.92 });
  disposables.push(pineTrunkGeo, pineCanopyGeo, pineTrunkMat, pineCanopyMat, mossRockGeo, mossRockMat);

  const pineCoords: Array<[number, number, number]> = [];
  for (let i = 0; i < 52; i++) {
    const angle = (i * 2.39996) % (Math.PI * 2);
    const rad = 3.2 + ((i * 3.9) % 13.6);
    const px = -28.5 + Math.cos(angle) * rad;
    const pz = -22.5 + Math.sin(angle) * rad;
    // Keep all plots (including outer expansion ring) and inner railway clear
    if (isNearAnyPlot(px, pz, 4.0)) continue;
    if (Math.hypot(px, pz) < 22.8) continue; // Outside railway
    pineCoords.push([px, pz, 0.85 + (i % 5) * 0.14]);
  }
  const pineTrunkMesh = new THREE.InstancedMesh(pineTrunkGeo, pineTrunkMat, Math.max(1, pineCoords.length));
  const pineCanopyMesh = new THREE.InstancedMesh(pineCanopyGeo, pineCanopyMat, Math.max(1, pineCoords.length));
  const pinePalette = [0x166534, 0x15803d, 0x14532d, 0x1e6b3a];
  pineCoords.forEach(([x, z, s], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, i * 0.9, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    pineTrunkMesh.setMatrixAt(i, dummy.matrix);
    pineCanopyMesh.setMatrixAt(i, dummy.matrix);
    color.setHex(pinePalette[i % pinePalette.length]);
    pineCanopyMesh.setColorAt(i, color);
  });
  pineTrunkMesh.count = pineCoords.length;
  pineCanopyMesh.count = pineCoords.length;
  pineTrunkMesh.instanceMatrix.needsUpdate = true;
  pineCanopyMesh.instanceMatrix.needsUpdate = true;
  if (pineCanopyMesh.instanceColor) pineCanopyMesh.instanceColor.needsUpdate = true;
  pineTrunkMesh.computeBoundingSphere();
  pineCanopyMesh.computeBoundingSphere();
  forestGroup.add(pineTrunkMesh, pineCanopyMesh);

  const rockCount = 14;
  const forestRockMesh = new THREE.InstancedMesh(mossRockGeo, mossRockMat, rockCount);
  for (let i = 0; i < rockCount; i++) {
    const a = (i / rockCount) * Math.PI * 2 + 0.3;
    const r = 5.5 + (i % 4) * 2.1;
    const rx = -28.0 + Math.cos(a) * r;
    const rz = -22.0 + Math.sin(a) * r;
    dummy.position.set(rx, 0.28, rz);
    dummy.rotation.set(i * 0.5, i * 1.1, 0);
    dummy.scale.set(1.1 + (i % 3) * 0.3, 0.65, 0.95);
    dummy.updateMatrix();
    forestRockMesh.setMatrixAt(i, dummy.matrix);
  }
  forestRockMesh.instanceMatrix.needsUpdate = true;
  forestGroup.add(forestRockMesh);
  root.add(forestGroup);

  // -------------------------------------------------------------------------
  // 3. Desert Dunes Biome (South-East, centered around 28, 22)
  // -------------------------------------------------------------------------
  const desertGroup = new THREE.Group();
  desertGroup.name = 'biome:desert';
  desertGroup.visible = false;

  const desertGroundGeo = new THREE.CircleGeometry(17.5, 24);
  const desertGroundMat = new THREE.MeshStandardMaterial({
    color: 0xe6be7a,
    roughness: 0.94,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const desertGround = new THREE.Mesh(desertGroundGeo, desertGroundMat);
  desertGround.rotation.x = -Math.PI / 2;
  desertGround.position.set(28.5, 0.016, 22.5);
  desertGround.receiveShadow = true;
  desertGroup.add(desertGround);
  disposables.push(desertGroundGeo, desertGroundMat);

  // Sculpted sand dunes (InstancedMesh, kept clear of outer plots & outer railway loop)
  const duneGeo = new THREE.SphereGeometry(2.8, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const duneMat = new THREE.MeshStandardMaterial({ color: 0xdcb065, roughness: 0.95 });
  const duneCoords: Array<[number, number, number, number]> = [
    [40.8, 30.2, 1.5, 0.6],
    [39.8, 19.8, 1.3, 0.52],
    [29.8, 32.8, 1.4, 0.58],
    [26.4, 34.4, 1.2, 0.48],
    [40.6, 12.6, 1.1, 0.46],
    [15.8, 28.4, 1.0, 0.42],
  ];
  const duneMesh = new THREE.InstancedMesh(duneGeo, duneMat, duneCoords.length);
  duneCoords.forEach(([x, z, sx, sy], i) => {
    dummy.position.set(x, -0.05, z);
    dummy.rotation.set(0, i * 0.7, 0);
    dummy.scale.set(sx, sy, sx * 0.8);
    dummy.updateMatrix();
    duneMesh.setMatrixAt(i, dummy.matrix);
  });
  duneMesh.instanceMatrix.needsUpdate = true;
  duneMesh.computeBoundingSphere();
  desertGroup.add(duneMesh);
  disposables.push(duneGeo, duneMat);

  // Merged Saguaro Cactus InstancedMesh (1 draw call for all cacti!)
  const cTrunk = new THREE.CylinderGeometry(0.18, 0.22, 2.2, 6);
  cTrunk.translate(0, 1.1, 0);
  const cArmL = new THREE.CylinderGeometry(0.12, 0.13, 0.88, 6);
  cArmL.translate(-0.36, 1.38, 0);
  const cArmLConn = new THREE.BoxGeometry(0.36, 0.2, 0.2);
  cArmLConn.translate(-0.18, 1.02, 0);
  const cArmR = new THREE.CylinderGeometry(0.12, 0.13, 0.78, 6);
  cArmR.translate(0.36, 1.54, 0);
  const cArmRConn = new THREE.BoxGeometry(0.36, 0.2, 0.2);
  cArmRConn.translate(0.18, 1.24, 0);
  const cactusGeo = mergeSimpleGeometries([cTrunk, cArmL, cArmLConn, cArmR, cArmRConn]);
  cTrunk.dispose();
  cArmL.dispose();
  cArmLConn.dispose();
  cArmR.dispose();
  cArmRConn.dispose();

  const cactusMat = new THREE.MeshStandardMaterial({ color: 0x3f8f4e, roughness: 0.86 });
  disposables.push(cactusGeo, cactusMat);

  const cactusCoords: Array<[number, number, number]> = [];
  for (let i = 0; i < 30; i++) {
    const a = (i * 2.39996) % (Math.PI * 2);
    const r = 3.8 + ((i * 3.1) % 13.0);
    const cx = 28.5 + Math.cos(a) * r;
    const cz = 22.5 + Math.sin(a) * r;
    if (isNearAnyPlot(cx, cz, 4.0)) continue;
    if (Math.hypot(cx, cz) < 22.8) continue;
    if (cx > 17 && cx < 37 && cz < 13.5) continue; // Keep East outer railway loop clear
    cactusCoords.push([cx, cz, 0.78 + (i % 4) * 0.16]);
  }
  const cactusMesh = new THREE.InstancedMesh(cactusGeo, cactusMat, Math.max(1, cactusCoords.length));
  cactusCoords.forEach(([x, z, s], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, i * 1.1, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    cactusMesh.setMatrixAt(i, dummy.matrix);
  });
  cactusMesh.count = cactusCoords.length;
  cactusMesh.instanceMatrix.needsUpdate = true;
  cactusMesh.computeBoundingSphere();
  desertGroup.add(cactusMesh);

  // Sandstone Arch Landmark near Desert Dunes edge
  const sandstoneMat = new THREE.MeshStandardMaterial({ color: 0xc27849, roughness: 0.9 });
  const archGeoL = new THREE.BoxGeometry(1.05, 3.2, 1.2);
  const archGeoTop = new THREE.BoxGeometry(4.4, 0.95, 1.35);
  const archPillarL = new THREE.Mesh(archGeoL, sandstoneMat);
  archPillarL.position.set(34.2, 1.6, 23.8);
  const archPillarR = new THREE.Mesh(archGeoL, sandstoneMat);
  archPillarR.position.set(37.4, 1.6, 21.8);
  const archTop = new THREE.Mesh(archGeoTop, sandstoneMat);
  archTop.position.set(35.8, 3.45, 22.8);
  archTop.rotation.y = Math.atan2(2.0, 3.2);
  desertGroup.add(archPillarL, archPillarR, archTop);
  disposables.push(sandstoneMat, archGeoL, archGeoTop);
  root.add(desertGroup);

  // -------------------------------------------------------------------------
  // 4. Crystal Mountain Cave Biome (North-East, centered around 28, -25)
  //    Hollow See-Inside Cavern with Roof Cutaway & Glowing Instanced Crystals
  // -------------------------------------------------------------------------
  const caveGroup = new THREE.Group();
  caveGroup.name = 'biome:cave';
  caveGroup.userData.biomeCave = true;
  caveGroup.visible = false;

  const caveRoofMaterials: THREE.MeshStandardMaterial[] = [];
  const caveCrystalMaterials: THREE.MeshStandardMaterial[] = [];

  const caveGroundGeo = new THREE.CircleGeometry(14.0, 24);
  const caveGroundMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.94,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const caveGround = new THREE.Mesh(caveGroundGeo, caveGroundMat);
  caveGround.rotation.x = -Math.PI / 2;
  caveGround.position.set(27.6, 0.018, -24.6);
  caveGround.receiveShadow = true;
  caveGroup.add(caveGround);
  disposables.push(caveGroundGeo, caveGroundMat);

  // Hollow Rocky Cliff Walls surrounding plot_cave_1 (27.6, -24.6), wide mouth facing SW toward Alderbrook
  const cliffWallMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.92, flatShading: true });
  const cliffRoofMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.88, flatShading: true });
  const snowPeakMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.72, flatShading: true });
  caveRoofMaterials.push(cliffRoofMat, snowPeakMat);
  disposables.push(cliffWallMat, cliffRoofMat, snowPeakMat);

  const wallRockGeo = new THREE.DodecahedronGeometry(2.6, 0);
  const cliffWallCoords: Array<[number, number, number, number, number]> = [
    // Back (North-East) semicircle of cave walls leaving SW entrance wide open
    [27.6, 2.2, -30.2, 1.8, 1.4],
    [32.4, 2.3, -28.6, 1.7, 1.5],
    [33.8, 2.2, -24.2, 1.6, 1.4],
    [31.8, 2.0, -19.8, 1.5, 1.2],
    [23.2, 1.9, -29.2, 1.4, 1.2],
    // Entrance flanking boulders (wide 6-unit walkway opening for villagers)
    [23.0, 1.5, -21.0, 1.0, 0.95],
    [27.8, 1.5, -18.8, 1.05, 0.95],
  ];
  for (const [wx, wy, wz, sx, sy] of cliffWallCoords) {
    const m = new THREE.Mesh(wallRockGeo, cliffWallMat);
    m.position.set(wx, wy, wz);
    m.scale.set(sx, sy, sx * 0.9);
    m.rotation.set(0.2, wx * 0.5, 0.1);
    caveGroup.add(m);
  }
  disposables.push(wallRockGeo);

  // Cutaway Mountain Roof Dome + Snow-Capped Peak (fades to opacity 0.15 on click/zoom!)
  const roofDomeGeo = new THREE.ConeGeometry(8.4, 6.2, 7);
  const roofDome = new THREE.Mesh(roofDomeGeo, cliffRoofMat);
  roofDome.position.set(28.8, 6.4, -25.4);
  roofDome.rotation.y = 0.4;
  const peakCapGeo = new THREE.ConeGeometry(3.2, 2.5, 7);
  const peakCap = new THREE.Mesh(peakCapGeo, snowPeakMat);
  peakCap.position.set(28.8, 8.6, -25.4);
  peakCap.rotation.y = 0.4;
  caveGroup.add(roofDome, peakCap);
  disposables.push(roofDomeGeo, peakCapGeo);

  // Cave Interior Timber Support Beams & Hanging Mining Lantern
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
  const beamPostGeo = new THREE.BoxGeometry(0.26, 3.4, 0.26);
  const beamCrossGeo = new THREE.BoxGeometry(4.4, 0.28, 0.28);
  const bL = new THREE.Mesh(beamPostGeo, beamMat);
  bL.position.set(24.6, 1.7, -21.8);
  const bR = new THREE.Mesh(beamPostGeo, beamMat);
  bR.position.set(27.2, 1.7, -20.2);
  const bTop = new THREE.Mesh(beamCrossGeo, beamMat);
  bTop.position.set(25.9, 3.35, -21.0);
  bTop.rotation.y = -Math.atan2(-1.6, 2.6);
  caveGroup.add(bL, bR, bTop);

  const caveLanternMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  lanternMaterials.push(caveLanternMat);
  const caveLanternGeo = new THREE.OctahedronGeometry(0.24, 0);
  const caveLantern = new THREE.Mesh(caveLanternGeo, caveLanternMat);
  caveLantern.position.set(25.9, 2.95, -21.0);
  caveGroup.add(caveLantern);
  disposables.push(beamMat, beamPostGeo, beamCrossGeo, caveLanternGeo, caveLanternMat);

  // Glowing Crystal Clusters (Single InstancedMesh, 28 spires!)
  const crystalGeo = new THREE.ConeGeometry(0.32, 1.45, 5);
  crystalGeo.translate(0, 0.72, 0);
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x06b6d4,
    emissiveIntensity: 1.15,
    roughness: 0.18,
    metalness: 0.2,
  });
  caveCrystalMaterials.push(crystalMat);
  disposables.push(crystalGeo, crystalMat);

  const crystalCount = 28;
  const crystalMesh = new THREE.InstancedMesh(crystalGeo, crystalMat, crystalCount);
  const crystalColors = [0x22d3ee, 0x67e8f9, 0x38bdf8, 0xfbbf24, 0xc084fc];
  for (let i = 0; i < crystalCount; i++) {
    const a = -Math.PI * 0.82 + (i / crystalCount) * Math.PI * 1.38;
    const rad = 3.2 + (i % 3) * 1.05;
    const cx = 27.6 + Math.cos(a) * rad;
    const cz = -24.6 + Math.sin(a) * rad;
    const s = 0.65 + (i % 4) * 0.34;
    dummy.position.set(cx, 0.05, cz);
    dummy.rotation.set((i % 3 - 1) * 0.28, i * 0.85, ((i + 1) % 3 - 1) * 0.24);
    dummy.scale.set(s * 0.85, s * 1.2, s * 0.85);
    dummy.updateMatrix();
    crystalMesh.setMatrixAt(i, dummy.matrix);
    color.setHex(crystalColors[i % crystalColors.length]);
    crystalMesh.setColorAt(i, color);
  }
  crystalMesh.instanceMatrix.needsUpdate = true;
  if (crystalMesh.instanceColor) crystalMesh.instanceColor.needsUpdate = true;
  caveGroup.add(crystalMesh);

  // Soft interior cyan glow (automatically disabled on 'low' quality)
  const caveLight = new THREE.PointLight(0x22d3ee, 1.35, 13, 1.6);
  caveLight.position.set(27.6, 2.4, -24.6);
  caveLight.castShadow = false;
  caveGroup.add(caveLight);

  root.add(caveGroup);
  scene.add(root);

  let activeQuality: GraphicsQuality = 'medium';

  return {
    group: root,
    caveGroup,
    caveRoofMaterials,
    caveCrystalMaterials,
    setUnlockedBiomes: (biomes: BiomeId[]) => {
      const set = new Set<BiomeId>(biomes);
      forestGroup.visible = set.has('forest');
      desertGroup.visible = set.has('desert');
      caveGroup.visible = set.has('cave');
      caveLight.visible = set.has('cave') && activeQuality !== 'low';
    },
    setRoads: (roads: string[]) => {
      currentRoads = [...roads];
      rebuildRoadInstances();
    },
    setGraphicsQuality: (quality: GraphicsQuality) => {
      activeQuality = quality;
      const factor = quality === 'low' ? 0.5 : quality === 'medium' ? 0.78 : 1.0;
      pineTrunkMesh.count = Math.max(8, Math.round(pineCoords.length * factor));
      pineCanopyMesh.count = pineTrunkMesh.count;
      forestRockMesh.count = Math.max(5, Math.round(rockCount * factor));
      cactusMesh.count = Math.max(8, Math.round(cactusCoords.length * factor));
      crystalMesh.count = Math.max(10, Math.round(crystalCount * factor));
      caveLight.visible = caveGroup.visible && quality !== 'low';
    },
    applyTheme: (theme: TownTheme) => {
      currentTheme = theme;
      rebuildRoadInstances();
      if (theme === 'fantasy_night') {
        forestGroundMat.color.setHex(0x1f3a3d);
        desertGroundMat.color.setHex(0x8c6d46);
        crystalMat.emissive.setHex(0xa855f7);
        caveLight.color.setHex(0xc084fc);
      } else if (theme === 'solarpunk_oasis') {
        forestGroundMat.color.setHex(0x2f7d57);
        desertGroundMat.color.setHex(0xf0c987);
        crystalMat.emissive.setHex(0x14b8a6);
        caveLight.color.setHex(0x2dd4bf);
      } else {
        forestGroundMat.color.setHex(0x3f6234);
        desertGroundMat.color.setHex(0xe6be7a);
        crystalMat.emissive.setHex(0x06b6d4);
        caveLight.color.setHex(0x22d3ee);
      }
    },
    update: (elapsed: number) => {
      if (caveGroup.visible) {
        const pulse = 0.95 + Math.sin(elapsed * 2.2) * 0.25;
        crystalMat.emissiveIntensity = pulse;
        if (activeQuality !== 'low') {
          caveLight.intensity = 1.15 + Math.sin(elapsed * 2.2) * 0.3;
        }
      }
    },
    dispose: () => {
      const idx = lanternMaterials.indexOf(caveLanternMat);
      if (idx !== -1) lanternMaterials.splice(idx, 1);
      scene.remove(root);
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}

