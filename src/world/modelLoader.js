import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

let sharedLoader = null;
let dracoLoader = null;
let ktx2Loader = null;

// Returns a shared, singleton GLTFLoader instance pre-configured with:
// 1. DRACOLoader:
// Decodes Google Draco 3D geometry compression (vertices, normals, UVs, indices)
// in multi-threaded WebAssembly web workers off the main UI thread.
// 2. KTX2Loader:
// Transcodes GPU-compressed textures (Basis Universal ETC1S / UASTC)
// directly into the device's native VRAM texture format (BC7 / ASTC / ETC2)
// without expanding into giant uncompressed raw RGBA bitmaps.
export function getModelLoader(renderer) {
  if (!sharedLoader) {
    sharedLoader = new GLTFLoader();

    // Configure Google Draco Geometry Decoder
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/draco/");
    dracoLoader.setDecoderConfig({ type: "wasm" });
    sharedLoader.setDRACOLoader(dracoLoader);

    // Configure Basis Universal / KTX2 Texture Transcoder
    ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath("/basis/");
    if (renderer) {
      ktx2Loader.detectSupport(renderer);
    }
    sharedLoader.setKTX2Loader(ktx2Loader);
  } else if (renderer && ktx2Loader) {
    ktx2Loader.detectSupport(renderer);
  }

  return sharedLoader;
}

export { dracoLoader, ktx2Loader };
