import * as THREE from "three";

export function createLand(scene) {
    const planeSize = 500;
    const geometry = new THREE.PlaneGeometry(planeSize, planeSize);
    geometry.rotateX(-Math.PI / 2);
    // Duplicate UV channel for ambient occlusion mapping
    geometry.attributes.uv2 = geometry.attributes.uv;

    const textureLoader = new THREE.TextureLoader();
    const basePath = "/texture/brick_pavement_02_1k/textures/";

    const diffTexture = textureLoader.load(`${basePath}brick_pavement_02_diff_1k.jpg`);
    const norTexture = textureLoader.load(`${basePath}brick_pavement_02_nor_gl_1k.jpg`);
    const roughTexture = textureLoader.load(`${basePath}brick_pavement_02_rough_1k.jpg`);
    const aoTexture = textureLoader.load(`${basePath}brick_pavement_02_ao_1k.jpg`);

    // Scale repeating pattern to match real-world cobblestone scale (~2.5m per tile)
    const repeatCount = 200;

    [diffTexture, norTexture, roughTexture, aoTexture].forEach((tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatCount, repeatCount);
        tex.anisotropy = 2;
    });

    diffTexture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshStandardMaterial({
        map: diffTexture,
        normalMap: norTexture,
        normalScale: new THREE.Vector2(1, 1),
        roughnessMap: roughTexture,
        roughness: 0.9,
        metalness: 0.05,
        aoMap: aoTexture,
        aoMapIntensity: 1.0,
    });

    const land = new THREE.Mesh(geometry, material);
    land.name = "Main_Ground_Plane";
    land.position.y = 0;
    land.receiveShadow = true;

    scene.add(land);

    return land;
}
