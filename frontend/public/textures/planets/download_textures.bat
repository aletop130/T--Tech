@echo off
REM Download Solar System Textures for Windows
REM This script downloads all required planet textures from Solar System Scope

echo Downloading Solar System Textures...
echo Source: Solar System Scope (CC BY 4.0)
echo.

set BASE_URL=https://www.solarsystemscope.com/textures/download

REM Planet textures
echo Downloading Planet Textures...

if not exist sun.jpg (
    echo Downloading sun.jpg...
    curl -L %BASE_URL%/2k_sun.jpg -o sun.jpg --max-time 60
) else (
    echo sun.jpg already exists
)

if not exist mercury.jpg (
    echo Downloading mercury.jpg...
    curl -L %BASE_URL%/2k_mercury.jpg -o mercury.jpg --max-time 60
) else (
    echo mercury.jpg already exists
)

if not exist venus_surface.jpg (
    echo Downloading venus_surface.jpg...
    curl -L %BASE_URL%/2k_venus_surface.jpg -o venus_surface.jpg --max-time 60
) else (
    echo venus_surface.jpg already exists
)

if not exist venus_atmosphere.jpg (
    echo Downloading venus_atmosphere.jpg...
    curl -L %BASE_URL%/2k_venus_atmosphere.jpg -o venus_atmosphere.jpg --max-time 60
) else (
    echo venus_atmosphere.jpg already exists
)

if not exist earth_daymap.jpg (
    echo Downloading earth_daymap.jpg...
    curl -L %BASE_URL%/2k_earth_daymap.jpg -o earth_daymap.jpg --max-time 60
) else (
    echo earth_daymap.jpg already exists
)

if not exist earth_nightmap.jpg (
    echo Downloading earth_nightmap.jpg...
    curl -L %BASE_URL%/2k_earth_nightmap.jpg -o earth_nightmap.jpg --max-time 60
) else (
    echo earth_nightmap.jpg already exists
)

if not exist earth_clouds.jpg (
    echo Downloading earth_clouds.jpg...
    curl -L %BASE_URL%/2k_earth_clouds.jpg -o earth_clouds.jpg --max-time 60
) else (
    echo earth_clouds.jpg already exists
)

if not exist moon.jpg (
    echo Downloading moon.jpg...
    curl -L %BASE_URL%/2k_moon.jpg -o moon.jpg --max-time 60
) else (
    echo moon.jpg already exists
)

if not exist mars.jpg (
    echo Downloading mars.jpg...
    curl -L %BASE_URL%/2k_mars.jpg -o mars.jpg --max-time 60
) else (
    echo mars.jpg already exists
)

if not exist jupiter.jpg (
    echo Downloading jupiter.jpg...
    curl -L %BASE_URL%/2k_jupiter.jpg -o jupiter.jpg --max-time 60
) else (
    echo jupiter.jpg already exists
)

if not exist saturn.jpg (
    echo Downloading saturn.jpg...
    curl -L %BASE_URL%/2k_saturn.jpg -o saturn.jpg --max-time 60
) else (
    echo saturn.jpg already exists
)

if not exist saturn_ring_alpha.png (
    echo Downloading saturn_ring_alpha.png...
    curl -L %BASE_URL%/2k_saturn_ring_alpha.png -o saturn_ring_alpha.png --max-time 60
) else (
    echo saturn_ring_alpha.png already exists
)

if not exist uranus.jpg (
    echo Downloading uranus.jpg...
    curl -L %BASE_URL%/2k_uranus.jpg -o uranus.jpg --max-time 60
) else (
    echo uranus.jpg already exists
)

if not exist neptune.jpg (
    echo Downloading neptune.jpg...
    curl -L %BASE_URL%/2k_neptune.jpg -o neptune.jpg --max-time 60
) else (
    echo neptune.jpg already exists
)

if not exist pluto.jpg (
    echo Downloading pluto.jpg...
    curl -L %BASE_URL%/2k_pluto.jpg -o pluto.jpg --max-time 60
) else (
    echo pluto.jpg already exists
)

echo.
echo Downloading Moon Textures...

if not exist io.jpg (
    echo Downloading io.jpg...
    curl -L %BASE_URL%/2k_io.jpg -o io.jpg --max-time 60
) else (
    echo io.jpg already exists
)

if not exist europa.jpg (
    echo Downloading europa.jpg...
    curl -L %BASE_URL%/2k_europa.jpg -o europa.jpg --max-time 60
) else (
    echo europa.jpg already exists
)

if not exist ganymede.jpg (
    echo Downloading ganymede.jpg...
    curl -L %BASE_URL%/2k_ganymede.jpg -o ganymede.jpg --max-time 60
) else (
    echo ganymede.jpg already exists
)

if not exist callisto.jpg (
    echo Downloading callisto.jpg...
    curl -L %BASE_URL%/2k_callisto.jpg -o callisto.jpg --max-time 60
) else (
    echo callisto.jpg already exists
)

if not exist titan.jpg (
    echo Downloading titan.jpg...
    curl -L %BASE_URL%/2k_titan.jpg -o titan.jpg --max-time 60
) else (
    echo titan.jpg already exists
)

if not exist enceladus.jpg (
    echo Downloading enceladus.jpg...
    curl -L %BASE_URL%/2k_enceladus.jpg -o enceladus.jpg --max-time 60
) else (
    echo enceladus.jpg already exists
)

if not exist triton.jpg (
    echo Downloading triton.jpg...
    curl -L %BASE_URL%/2k_triton.jpg -o triton.jpg --max-time 60
) else (
    echo triton.jpg already exists
)

if not exist charon.jpg (
    echo Downloading charon.jpg...
    curl -L %BASE_URL%/2k_charon.jpg -o charon.jpg --max-time 60
) else (
    echo charon.jpg already exists
)

if not exist phobos.jpg (
    echo Downloading phobos.jpg...
    curl -L %BASE_URL%/2k_phobos.jpg -o phobos.jpg --max-time 60
) else (
    echo phobos.jpg already exists
)

if not exist deimos.jpg (
    echo Downloading deimos.jpg...
    curl -L %BASE_URL%/2k_deimos.jpg -o deimos.jpg --max-time 60
) else (
    echo deimos.jpg already exists
)

echo.
echo Download complete!
echo.
dir *.jpg *.png 2>nul | find "File(s)"
echo.
pause
