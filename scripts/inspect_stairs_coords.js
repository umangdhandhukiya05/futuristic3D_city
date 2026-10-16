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

// Wrapper params for common-house:
// scale = 0.25
// wrapper offset = [72.00, 0.28, -3.25]
const scale = 0.25;
const offset = new THREE.Vector3(72.00, 0.28, -3.25);

const node43 = gltf.nodes[43]; // NormalHouse_Stairs_Steps
const mesh43 = gltf.meshes[node43.mesh];
const prim = mesh43.primitives[0];
const posInfo = getBuffer(prim.attributes.POSITION);
const pos = new Float32Array(posInfo.buffer.buffer, posInfo.buffer.byteOffset, posInfo.accessor.count * 3);

// World transform for node 43:
// Node 43 translation: [-51.8, 0, 0]
// Pre-multiplied by scale 0.25:
const nodeMat = new THREE.Matrix4().compose(
    new THREE.Vector3(...node43.translation),
    new THREE.Quaternion(),
    new THREE.Vector3(1, 1, 1)
);
const worldMat = nodeMat.clone().premultiply(new THREE.Matrix4().makeScale(scale, scale, scale));

console.log("Analyzing stairs steps geometry...");
const vertices = [];
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (let i = 0; i < posInfo.accessor.count; i++) {
    const v = new THREE.Vector3(pos[i*3], pos[i*3+1], pos[i*3+2]).applyMatrix4(worldMat).add(offset);
    vertices.push(v);
    if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
    if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
}

console.log(`Stairs Steps in wrapper coords:
  X: [${minX.toFixed(3)}, ${maxX.toFixed(3)}] (width: ${(maxX - minX).toFixed(3)}m)
  Y: [${minY.toFixed(3)}, ${maxY.toFixed(3)}] (height: ${(maxY - minY).toFixed(3)}m)
  Z: [${minZ.toFixed(3)}, ${maxZ.toFixed(3)}] (length: ${(maxZ - minZ).toFixed(3)}m)
`);

// Let's find distinct step heights or planes
const stepYs = new Set();
vertices.forEach(v => stepYs.add(v.y.toFixed(2)));
console.log("Distinct Y levels on stairs:", Array.from(stepYs).sort((a,b)=>Number(a)-Number(b)));

// Also check Node 41: NormalHouse_Stairs_Cutter (which cut the stairwell in the ceiling!)
const node41 = gltf.nodes[41];
if (node41) {
    const mesh41 = gltf.meshes[node41.mesh];
    const posInfo41 = getBuffer(mesh41.primitives[0].attributes.POSITION);
    const pos41 = new Float32Array(posInfo41.buffer.buffer, posInfo41.buffer.byteOffset, posInfo41.accessor.count * 3);
    const box41 = new THREE.Box3();
    for (let i = 0; i < posInfo41.accessor.count; i++) {
        const v = new THREE.Vector3(pos41[i*3], pos41[i*3+1], pos41[i*3+2]).applyMatrix4(worldMat).add(offset);
        box41.expandByPoint(v);
    }
    console.log("Stair Cutter (hole in ceiling) in wrapper coords:", {
        min: [box41.min.x.toFixed(2), box41.min.y.toFixed(2), box41.min.z.toFixed(2)],
        max: [box41.max.x.toFixed(2), box41.max.y.toFixed(2), box41.max.z.toFixed(2)],
    });
}
