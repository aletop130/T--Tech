# Solar System Textures

This directory contains high-quality 2K textures for all planets and major moons in the solar system.

## Source

All textures are from **Solar System Scope** (https://www.solarsystemscope.com/textures/)
- Licensed under **CC BY 4.0** (free for commercial use)
- Resolution: 2048x1024 pixels (2K)
- Format: JPG (PNG for transparency/alpha)
- Total size: ~18 MB

## Required Files

### Core Planets (Required)
1. `sun.jpg` - Solar surface texture
2. `mercury.jpg` - Mercury surface
3. `venus_surface.jpg` - Venus surface (radar mapped)
4. `venus_atmosphere.jpg` - Venus cloud layer
5. `earth_daymap.jpg` - Earth daytime
6. `earth_nightmap.jpg` - Earth night lights
7. `earth_clouds.jpg` - Earth cloud layer
8. `moon.jpg` - Lunar surface
9. `mars.jpg` - Mars surface
10. `jupiter.jpg` - Jupiter atmosphere
11. `saturn.jpg` - Saturn atmosphere
12. `saturn_ring_alpha.png` - Saturn ring system (alpha channel)
13. `uranus.jpg` - Uranus atmosphere
14. `neptune.jpg` - Neptune atmosphere
15. `pluto.jpg` - Pluto surface

### Major Moons (Required)
16. `io.jpg` - Io (Jupiter moon)
17. `europa.jpg` - Europa (Jupiter moon)
18. `ganymede.jpg` - Ganymede (Jupiter moon)
19. `callisto.jpg` - Callisto (Jupiter moon)
20. `titan.jpg` - Titan (Saturn moon)
21. `enceladus.jpg` - Enceladus (Saturn moon)
22. `triton.jpg` - Triton (Neptune moon)
23. `charon.jpg` - Charon (Pluto moon)
24. `phobos.jpg` - Phobos (Mars moon)
25. `deimos.jpg` - Deimos (Mars moon)

## Manual Download Instructions

If automatic download fails, manually download from:

### Base URL
```
https://www.solarsystemscope.com/textures/download/
```

### Direct Download Links

#### Planets
- Sun: `2k_sun.jpg`
- Mercury: `2k_mercury.jpg`
- Venus Surface: `2k_venus_surface.jpg`
- Venus Atmosphere: `2k_venus_atmosphere.jpg`
- Earth Day: `2k_earth_daymap.jpg`
- Earth Night: `2k_earth_nightmap.jpg`
- Earth Clouds: `2k_earth_clouds.jpg`
- Moon: `2k_moon.jpg`
- Mars: `2k_mars.jpg`
- Jupiter: `2k_jupiter.jpg`
- Saturn: `2k_saturn.jpg`
- Saturn Ring: `2k_saturn_ring_alpha.png`
- Uranus: `2k_uranus.jpg`
- Neptune: `2k_neptune.jpg`
- Pluto: `2k_pluto.jpg`

#### Major Moons
- Io: `2k_io.jpg`
- Europa: `2k_europa.jpg`
- Ganymede: `2k_ganymede.jpg`
- Callisto: `2k_callisto.jpg`
- Titan: `2k_titan.jpg`
- Enceladus: `2k_enceladus.jpg`
- Triton: `2k_triton.jpg`
- Charon: `2k_charon.jpg`
- Phobos: `2k_phobos.jpg`
- Deimos: `2k_deimos.jpg`

## Installation

1. Download all 25 texture files
2. Place them in this directory: `frontend/public/textures/planets/`
3. Ensure filenames match exactly (case-sensitive)

## Fallback Behavior

If textures are missing, the application will:
- Use solid colors defined in `data.ts`
- Log warnings to console
- Continue functioning with colored ellipsoids

## Quality Notes

- **2K resolution** balances quality vs performance
- **Earth**: Highest detail - Blue Marble data, ~2MB each
- **Mars**: High detail - Multiple rover/orbiter data
- **Jupiter/Saturn**: Good detail - Juno/Cassini imagery
- **Uranus/Neptune**: Lower detail - Voyager 2 data from 1980s
- **Pluto**: Moderate detail - New Horizons flyby 2015
- **Moons**: Varies by exploration missions

## Alternative Sources

If Solar System Scope is unavailable:

1. **NASA 3D Resources**: https://nasa3d.arc.nasa.gov/
2. **JPL Photojournal**: https://photojournal.jpl.nasa.gov/
3. **USGS Astrogeology**: https://astrogeology.usgs.gov/
4. **Planet Pixel Emporium**: http://planetpixelemporium.com/

## Performance Tips

- Textures load on-demand via HTTP
- First load may take 5-10 seconds for all textures
- Subsequent loads use browser cache
- Consider implementing texture LOD for mobile devices

## File Sizes (Approximate)

```
sun.jpg                    ~2.1 MB
mercury.jpg                ~1.2 MB
venus_surface.jpg          ~1.1 MB
venus_atmosphere.jpg       ~1.1 MB
earth_daymap.jpg           ~1.8 MB
earth_nightmap.jpg         ~1.8 MB
earth_clouds.jpg           ~1.8 MB
moon.jpg                   ~1.2 MB
mars.jpg                   ~1.6 MB
jupiter.jpg                ~1.4 MB
saturn.jpg                 ~1.3 MB
saturn_ring_alpha.png      ~0.5 MB
uranus.jpg                 ~0.9 MB
neptune.jpg                ~0.9 MB
pluto.jpg                  ~0.9 MB
Major moons (10 files)     ~9.0 MB
----------------------------------
TOTAL                      ~18.0 MB
```

## Troubleshooting

### Textures not loading
- Check browser DevTools Network tab
- Verify CORS headers on server
- Ensure files are in correct directory
- Check file permissions

### Poor performance
- Reduce texture resolution to 1K
- Enable texture compression
- Use CDN for texture hosting
- Implement progressive loading

### Missing textures warning
- Download files from alternative sources
- Use provided fallback colors
- Check for typos in filenames
