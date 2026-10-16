import * as THREE from 'three';

console.log("Checking stair steps and ceiling cutout...");

const steps = [
    // Flight 1 (Westward, rising from Y = 0.50 to Y = 2.92)
    { x: -3.775, y: 0.42, z: -8.38, hx: 0.325, hy: 0.42, hz: 1.0 },
    { x: -4.425, y: 0.595, z: -8.38, hx: 0.325, hy: 0.595, hz: 1.0 },
    { x: -5.075, y: 0.765, z: -8.38, hx: 0.325, hy: 0.765, hz: 1.0 },
    { x: -5.725, y: 0.94, z: -8.38, hx: 0.325, hy: 0.94, hz: 1.0 },
    { x: -6.375, y: 1.115, z: -8.38, hx: 0.325, hy: 1.115, hz: 1.0 },
    { x: -7.025, y: 1.285, z: -8.38, hx: 0.325, hy: 1.285, hz: 1.0 },
    { x: -7.675, y: 1.46, z: -8.38, hx: 0.325, hy: 1.46, hz: 1.0 },

    // Landing (Mid-height turnaround at Y = 3.26)
    { x: -9.00, y: 1.63, z: -9.38, hx: 1.00, hy: 1.63, hz: 2.0 },

    // Flight 2 (Eastward, rising from Y = 3.26 to Y = 5.68)
    { x: -7.675, y: 1.805, z: -10.38, hx: 0.325, hy: 1.805, hz: 1.0 },
    { x: -7.025, y: 1.975, z: -10.38, hx: 0.325, hy: 1.975, hz: 1.0 },
    { x: -6.375, y: 2.15, z: -10.38, hx: 0.325, hy: 2.15, hz: 1.0 },
    { x: -5.725, y: 2.32, z: -10.38, hx: 0.325, hy: 2.32, hz: 1.0 },
    { x: -5.075, y: 2.495, z: -10.38, hx: 0.325, hy: 2.495, hz: 1.0 },
    { x: -4.425, y: 2.67, z: -10.38, hx: 0.325, hy: 2.67, hz: 1.0 },
    { x: -3.775, y: 2.84, z: -10.38, hx: 0.325, hy: 2.84, hz: 1.0 },
];

console.log("Top surface of each step:");
steps.forEach((s, idx) => {
    const top = s.y + s.hy;
    console.log(`Step ${idx + 1} (center x=${s.x.toFixed(2)}, z=${s.z.toFixed(2)}): top Y = ${top.toFixed(2)}m`);
});
