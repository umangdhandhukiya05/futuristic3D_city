
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

export function createScene(container) {
    const scene = new THREE.Scene();

    scene.background = new THREE.Color("#08111f");
    scene.fog = new THREE.Fog("#08111f", 200, 650);

    const camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1500
    );

    camera.position.set(35, 25, 40);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    container.appendChild(renderer.domElement);

    // Load modern evening street HDRI for realistic IBL reflections
    const hdrLoader = new HDRLoader();
    hdrLoader.load("/hdris/modern_evening_street_1k.hdr", (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
    });

    // General ambient illumination
    const ambientLight = new THREE.HemisphereLight(
        0xb8d6ff,
        0x253044,
        1.2
    );
    scene.add(ambientLight);

    // Primary sunlight with shadow casting
    const sunlight = new THREE.DirectionalLight(0xffffff, 3);
    sunlight.position.set(60, 100, 40);
    sunlight.castShadow = true;

    // Enlarge shadow camera frustum to cover entire city, extended roads and plane boundaries
    const shadowBound = 260;
    sunlight.shadow.camera.left = -shadowBound;
    sunlight.shadow.camera.right = shadowBound;
    sunlight.shadow.camera.top = shadowBound;
    sunlight.shadow.camera.bottom = -shadowBound;
    sunlight.shadow.camera.near = 10;
    sunlight.shadow.camera.far = 850;
    sunlight.shadow.bias = -0.0003;
    sunlight.shadow.normalBias = 0.05;
    sunlight.shadow.mapSize.width = 2048;
    sunlight.shadow.mapSize.height = 2048;

    scene.add(sunlight);
    scene.add(sunlight.target);

    // Secondary subtle moonlight for nocturnal illumination (non-shadow casting to maximize performance)
    const moonlight = new THREE.DirectionalLight(0x9cc8ff, 0.0);
    moonlight.position.set(-60, 100, -40);
    moonlight.castShadow = false;
    scene.add(moonlight);
    scene.add(moonlight.target);

    return { scene, camera, renderer, sunlight, ambientLight, moonlight };
}
