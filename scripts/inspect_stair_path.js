import fs from 'fs';
import * as THREE from 'three';

const buffer = fs.readFileSync('./public/models/building/common-house.glb');
const chunkLength = buffer.readUInt32LE(12);
const jsonStr = buffer.toString('utf8', 20, 20 + chunkLength);
const gltf = JSON.parse(jsonStr);
const binStart = 20 + chunkLength + 8;

function getBuffer(accessorIdx) {
    const accessor = gltf.accessors[accessorIdx];
    const bufferView = gltf.bufferViews[accessor.bufferView];
    const offset = binStart + (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    return { accessor, buffer: buffer.subarray(offset, offset + bufferView.byteLength) };
}

const scale = 0.25;
const offset = new THREE.Vector3(72.00, 0.28, -3.25);

const node43 = gltf.nodes[43]; // NormalHouse_Stairs_Steps
const mesh43 = gltf.meshes[node43.mesh];
const prim = mesh43.primitives[0];
const posInfo = getBuffer(prim.attributes.POSITION);
const pos = new Float32Array(posInfo.buffer.buffer, posInfo.buffer.byteOffset, posInfo.accessor.count * 3);

const nodeMat = new THREE.Matrix4().compose(
    new THREE.Vector3(...node43.translation),
    new THREE.Quaternion(),
    new THREE.Vector3(1, 1, 1)
);
const worldMat = nodeMat.clone().premultiply(new THREE.Matrix4().makeScale(scale, scale, scale));

const steps = [];
for (let i = 0; i < posInfo.accessor.count; i++) {
    const v = new THREE.Vector3(pos[i*3], pos[i*3+1], pos[i*3+2]).applyMatrix4(worldMat).add(offset);
    steps.push(v);
}

// Find min and max Y vertices and their X, Z
let minY = Infinity, maxY = -Infinity;
let vBottom = null, vTop = null;
steps.forEach(v => {
    if (v.y < minY) { minY = v.y; vBottom = v; }
    if (v.y > maxY) { maxY = v.y; vTop = v; }
});

console.log("Stairs bottom vertex (Y=0.5):", vBottom);
console.log("Stairs top vertex (Y=5.68):", vTop);

// Let's check intermediate steps to see if it turns (e.g. L-shaped or U-shaped or straight)
const yBins = {};
steps.forEach(v => {
    const yKey = (Math.round(v.y * 10) / 10).toFixed(1);
    if (!yBins[yKey]) yBins[yKey] = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    const b = yBins[yKey];
    if (v.x < b.minX) b.minX = v.x; if (v.x > b.maxX) b.maxX = v.x;
    if (v.z < b.minZ) b.minZ = v.z; if (v.z > b.maxZ) b.maxZ = v.z;
});

console.log("\nStep positions at each Y height:");
Object.keys(yBins).sort((a,b)=>Number(a)-Number(b)).forEach(y => {
    const b = yBins[y];
    console.log(`Y=${y}: X:[${b.minX.toFixed(2)}, ${b.maxX.toFixed(2)}], Z:[${b.minZ.toFixed(2)}, ${b.maxZ.toFixed(2)}]`);
});
