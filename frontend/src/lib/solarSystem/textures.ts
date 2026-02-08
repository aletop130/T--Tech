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
export const TEXTURE_URLS: Record<string, string> = {
  // Sun
  sun: 'https://www.solarsystemscope.com/textures/download/2k_sun.jpg',
  
  // Planets
  mercury: 'https://www.solarsystemscope.com/textures/download/2k_mercury.jpg',
  venus_surface: 'https://www.solarsystemscope.com/textures/download/2k_venus_surface.jpg',
  venus_atmosphere: 'https://www.solarsystemscope.com/textures/download/2k_venus_atmosphere.jpg',
  earth_daymap: 'https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg',
  earth_nightmap: 'https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg',
  earth_clouds: 'https://www.solarsystemscope.com/textures/download/2k_earth_clouds.jpg',
  moon: 'https://www.solarsystemscope.com/textures/download/2k_moon.jpg',
  mars: 'https://www.solarsystemscope.com/textures/download/2k_mars.jpg',
  jupiter: 'https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg',
  saturn: 'https://www.solarsystemscope.com/textures/download/2k_saturn.jpg',
  saturn_ring: 'https://www.solarsystemscope.com/textures/download/2k_saturn_ring_alpha.png',
  uranus: 'https://www.solarsystemscope.com/textures/download/2k_uranus.jpg',
  neptune: 'https://www.solarsystemscope.com/textures/download/2k_neptune.jpg',
  pluto: 'https://www.solarsystemscope.com/textures/download/2k_pluto.jpg',
  
  // Moons (using fictional but realistic textures for smaller moons)
  phobos: 'https://www.solarsystemscope.com/textures/download/2k_phobos.jpg',
  deimos: 'https://www.solarsystemscope.com/textures/download/2k_deimos.jpg',
  io: 'https://www.solarsystemscope.com/textures/download/2k_io.jpg',
  europa: 'https://www.solarsystemscope.com/textures/download/2k_europa.jpg',
  ganymede: 'https://www.solarsystemscope.com/textures/download/2k_ganymede.jpg',
  callisto: 'https://www.solarsystemscope.com/textures/download/2k_callisto.jpg',
  titan: 'https://www.solarsystemscope.com/textures/download/2k_titan.jpg',
  enceladus: 'https://www.solarsystemscope.com/textures/download/2k_enceladus.jpg',
  triton: 'https://www.solarsystemscope.com/textures/download/2k_triton.jpg',
  charon: 'https://www.solarsystemscope.com/textures/download/2k_charon.jpg',
};

// Texture metadata
export const TEXTURE_CONFIG: Record<string, TextureConfig> = {
  sun: { url: TEXTURE_URLS.sun, fallbackColor: '#FDB813', size: '2k', format: 'jpg', fileSizeMB: 2.1 },
  mercury: { url: TEXTURE_URLS.mercury, fallbackColor: '#8C8C8C', size: '2k', format: 'jpg', fileSizeMB: 1.2 },
  venus_surface: { url: TEXTURE_URLS.venus_surface, fallbackColor: '#E6E6B8', size: '2k', format: 'jpg', fileSizeMB: 1.1 },
  venus_atmosphere: { url: TEXTURE_URLS.venus_atmosphere, fallbackColor: '#F5F5DC', size: '2k', format: 'jpg', fileSizeMB: 1.1 },
  earth_daymap: { url: TEXTURE_URLS.earth_daymap, fallbackColor: '#2233FF', size: '2k', format: 'jpg', fileSizeMB: 1.8 },
  earth_nightmap: { url: TEXTURE_URLS.earth_nightmap, fallbackColor: '#000022', size: '2k', format: 'jpg', fileSizeMB: 1.8 },
  earth_clouds: { url: TEXTURE_URLS.earth_clouds, fallbackColor: '#FFFFFF', size: '2k', format: 'jpg', fileSizeMB: 1.8 },
  moon: { url: TEXTURE_URLS.moon, fallbackColor: '#C0C0C0', size: '2k', format: 'jpg', fileSizeMB: 1.2 },
  mars: { url: TEXTURE_URLS.mars, fallbackColor: '#FF4500', size: '2k', format: 'jpg', fileSizeMB: 1.6 },
  jupiter: { url: TEXTURE_URLS.jupiter, fallbackColor: '#D4A373', size: '2k', format: 'jpg', fileSizeMB: 1.4 },
  saturn: { url: TEXTURE_URLS.saturn, fallbackColor: '#F4D03F', size: '2k', format: 'jpg', fileSizeMB: 1.3 },
  saturn_ring: { url: TEXTURE_URLS.saturn_ring, fallbackColor: '#D4AF37', size: '2k', format: 'png', fileSizeMB: 0.5 },
  uranus: { url: TEXTURE_URLS.uranus, fallbackColor: '#4FD0E7', size: '2k', format: 'jpg', fileSizeMB: 0.9 },
  neptune: { url: TEXTURE_URLS.neptune, fallbackColor: '#4169E1', size: '2k', format: 'jpg', fileSizeMB: 0.9 },
  pluto: { url: TEXTURE_URLS.pluto, fallbackColor: '#D2B48C', size: '2k', format: 'jpg', fileSizeMB: 0.9 },
  // Moons
  phobos: { url: TEXTURE_URLS.phobos, fallbackColor: '#8B7355', size: '2k', format: 'jpg', fileSizeMB: 0.8 },
  deimos: { url: TEXTURE_URLS.deimos, fallbackColor: '#8B7355', size: '2k', format: 'jpg', fileSizeMB: 0.8 },
  io: { url: TEXTURE_URLS.io, fallbackColor: '#FFFF99', size: '2k', format: 'jpg', fileSizeMB: 1.0 },
  europa: { url: TEXTURE_URLS.europa, fallbackColor: '#F0F8FF', size: '2k', format: 'jpg', fileSizeMB: 1.0 },
  ganymede: { url: TEXTURE_URLS.ganymede, fallbackColor: '#A0A0A0', size: '2k', format: 'jpg', fileSizeMB: 1.0 },
  callisto: { url: TEXTURE_URLS.callisto, fallbackColor: '#696969', size: '2k', format: 'jpg', fileSizeMB: 1.0 },
  titan: { url: TEXTURE_URLS.titan, fallbackColor: '#DAA520', size: '2k', format: 'jpg', fileSizeMB: 0.9 },
  enceladus: { url: TEXTURE_URLS.enceladus, fallbackColor: '#F0F8FF', size: '2k', format: 'jpg', fileSizeMB: 0.9 },
  triton: { url: TEXTURE_URLS.triton, fallbackColor: '#E0E0E0', size: '2k', format: 'jpg', fileSizeMB: 0.9 },
  charon: { url: TEXTURE_URLS.charon, fallbackColor: '#808080', size: '2k', format: 'jpg', fileSizeMB: 0.9 },
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
