// Persist document settings, never another device's viewport or transient tools.
export function documentAppState(state = {}) {
  return {
    viewBackgroundColor: state.viewBackgroundColor ?? "#ffffff",
    ...(state.gridSize != null ? { gridSize: state.gridSize } : {}),
    ...(state.gridStep != null ? { gridStep: state.gridStep } : {}),
    ...(state.gridModeEnabled != null ? { gridModeEnabled: state.gridModeEnabled } : {}),
  };
}

const elementSignatures = new WeakMap();
const fileSignatures = new WeakMap();

function cachedSignature(cache, value) {
  let signature = cache.get(value);
  if (signature === undefined) {
    signature = JSON.stringify(value);
    cache.set(value, signature);
  }
  return signature;
}

function fileSignature(file) {
  let signature = fileSignatures.get(file);
  if (signature === undefined) {
    // Hash bytes only once per immutable file object, not on every pointer move.
    let hash = 2166136261;
    const data = file.dataURL ?? file.storagePath ?? "";
    for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data.charCodeAt(i), 16777619);
    signature = [file.id, file.mimeType, data.length, hash >>> 0];
    fileSignatures.set(file, signature);
  }
  return signature;
}

export function documentSignature(scene) {
  return JSON.stringify([
    scene.elements.map((element) => element.version != null
      ? [element.id, element.version, element.versionNonce, Boolean(element.isDeleted),
          element.customData ? cachedSignature(elementSignatures, element.customData) : null]
      : cachedSignature(elementSignatures, element)),
    documentAppState(scene.appState),
    Object.keys(scene.files ?? {}).sort().map((id) => [id, fileSignature(scene.files[id])]),
    scene.storyPath ?? [],
  ]);
}
