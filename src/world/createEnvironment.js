import * as THREE from "three";

export function createEnvironment(scene) {
  const grid = new THREE.GridHelper(
    300,
    60,
    0x36c9ff,
    0x263d52
  );

  grid.position.y = 0.02;
  grid.name = "Development_Grid";

  scene.add(grid);

  return grid;
}
