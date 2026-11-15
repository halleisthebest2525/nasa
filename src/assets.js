export async function loadAssets() {
  const assets = {};

  try {
    const response = await fetch('./assets.txt');

    if (!response.ok) {
      throw new Error('Could not load assets.txt');
    }

    const text = await response.text();

    const entries = text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    await Promise.all(entries.map(line => {
      const [name, ...pathParts] = line.split('=');
      const path = pathParts.join('=').trim();

      if (!name || !path) return Promise.resolve();

      return new Promise(resolve => {
        const image = new Image();

        image.onload = () => {
          assets[name.trim()] = image;
          resolve();
        };

        image.onerror = () => {
          console.warn(`Missing image: ${path}`);
          resolve();
        };

        image.src = path;
      });
    }));
  } catch (error) {
    console.warn('Asset loading:', error);
  }

  return assets;
}
