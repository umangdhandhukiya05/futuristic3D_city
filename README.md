# Futuristic 3D Cyberpunk City

An interactive, high-performance 3D futuristic city simulation built with Three.js, Rapier 3D physics, and Vite.

## Features

- **3D Urban Environment**: High-fidelity architectural buildings, multilane road network with crossroad junctions, street lamps, and animated futuristic glass dome centerpiece.
- **Physical Locomotion**: Rapier 3D kinematic character controller with collision detection, stair traversal, and obstacle boundaries.
- **Dynamic Day / Night Cycle**: 24-hour astronomical sky simulation with procedural sun/moon shaders, volumetric fog, dynamic lighting, and glowing emissive night lights.
- **Interactive Architecture**: Proximity-prompted doors with smooth kinematic swing animations and physics synchronization.
- **Autonomous Traffic**: Dynamic car and bus circuit navigation with collision detection and pedestrian safety avoidance.
- **Perspective Camera System**: Switch between Third-Person (TPP robot character), First-Person (FPP), Top-down, and Isometric camera views.

## Tech Stack

- [Three.js](https://threejs.org/) - 3D WebGL graphics engine
- [@dimforge/rapier3d-compat](https://rapier.rs/) - WebAssembly 3D physics simulation
- [Vite](https://vite.dev/) - Fast frontend development & bundling

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run linter
npm run lint
```
