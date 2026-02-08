/**
 * Texture configuration for solar system
 * Provides URLs and fallback strategies for planetary textures
 */

export interface TextureConfig {
  url: string;
  fallbackColor: string;
  size: '2k' | '4k' | '8k';
  format: 'jpg' | 'png';
  fileSizeMB: number;
}

// Texture download URLs from Solar System Scope (high quality, CC BY 4.0)
// Minimal set: Earth, Mars, and their moons only
export const TEXTURE_URLS: Record<string, string> = {
  // Earth and its textures
  earth_daymap: 'https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg',
  earth_nightmap: 'https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg',
  earth_clouds: 'https://www.solarsystemscope.com/textures/download/2k_earth_clouds.jpg',
  moon: 'https://www.solarsystemscope.com/textures/download/2k_moon.jpg',
  
  // Mars
  mars: 'https://www.solarsystemscope.com/textures/download/2k_mars.jpg',
  phobos: 'https://www.solarsystemscope.com/textures/download/2k_phobos.jpg',
  deimos: 'https://www.solarsystemscope.com/textures/download/2k_deimos.jpg',
};

// Texture metadata - Earth, Mars, and their moons only
export const TEXTURE_CONFIG: Record<string, TextureConfig> = {
  earth_daymap: { url: TEXTURE_URLS.earth_daymap, fallbackColor: '#2233FF', size: '2k', format: 'jpg', fileSizeMB: 1.8 },
  earth_nightmap: { url: TEXTURE_URLS.earth_nightmap, fallbackColor: '#000022', size: '2k', format: 'jpg', fileSizeMB: 1.8 },
  earth_clouds: { url: TEXTURE_URLS.earth_clouds, fallbackColor: '#FFFFFF', size: '2k', format: 'jpg', fileSizeMB: 1.8 },
  moon: { url: TEXTURE_URLS.moon, fallbackColor: '#C0C0C0', size: '2k', format: 'jpg', fileSizeMB: 1.2 },
  mars: { url: TEXTURE_URLS.mars, fallbackColor: '#FF4500', size: '2k', format: 'jpg', fileSizeMB: 1.6 },
  phobos: { url: TEXTURE_URLS.phobos, fallbackColor: '#8B7355', size: '2k', format: 'jpg', fileSizeMB: 0.8 },
  deimos: { url: TEXTURE_URLS.deimos, fallbackColor: '#8B7355', size: '2k', format: 'jpg', fileSizeMB: 0.8 },
};

// Calculate total download size
export function calculateTotalTextureSize(): number {
  return Object.values(TEXTURE_CONFIG).reduce((total, config) => total + config.fileSizeMB, 0);
}

// Get texture URL with fallback
export function getTextureUrl(textureId: string): string {
  const config = TEXTURE_CONFIG[textureId];
  return config?.url || '';
}

// Get fallback color for a texture
export function getFallbackColor(textureId: string): string {
  const config = TEXTURE_CONFIG[textureId];
  return config?.fallbackColor || '#808080';
}

// Check if texture is a ring texture (needs special handling)
export function isRingTexture(textureId: string): boolean {
  return textureId.includes('ring');
}

// Texture loading states
export type TextureLoadState = 'loading' | 'loaded' | 'error';

// Texture cache
const textureCache = new Map<string, HTMLImageElement>();

/**
 * Preload a texture
 */
export function preloadTexture(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (textureCache.has(url)) {
      resolve(textureCache.get(url)!);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      textureCache.set(url, img);
      resolve(img);
    };
    
    img.onerror = () => {
      reject(new Error(`Failed to load texture: ${url}`));
    };
    
    img.src = url;
  });
}

/**
 * Preload all textures in parallel
 */
export async function preloadAllTextures(
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  const urls = Object.values(TEXTURE_URLS);
  const total = urls.length;
  let loaded = 0;

  const promises = urls.map(url => 
    preloadTexture(url)
      .then(() => {
        loaded++;
        onProgress?.(loaded, total);
      })
      .catch(err => {
        console.warn(`Failed to preload texture: ${url}`, err);
        loaded++;
        onProgress?.(loaded, total);
      })
  );

  await Promise.all(promises);
}

/**
 * Create a solid color texture as fallback
 */
export function createColorTexture(color: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 256);
    
    // Add some noise for texture
    for (let i = 0; i < 1000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const alpha = Math.random() * 0.1;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }
  
  return canvas.toDataURL();
}
