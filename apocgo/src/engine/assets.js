// Image loader. Resolves to { name: HTMLImageElement }; a missing file resolves to
// null so the game can fall back to procedural sprites instead of crashing.

export function loadImages(names, base = './assets/', onProgress = () => {}) {
  let done = 0;
  const entries = names.map((name) => new Promise((resolve) => {
    const img = new Image();
    const finish = (value) => {
      onProgress(++done, names.length);
      resolve([name, value]);
    };
    img.onload = () => finish(img);
    img.onerror = () => {
      console.warn(`[assets] failed to load ${name}`);
      finish(null);
    };
    img.src = `${base}${name}.png`;
  }));
  return Promise.all(entries).then(Object.fromEntries);
}
