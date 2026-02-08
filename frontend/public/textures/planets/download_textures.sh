#!/bin/bash
# Download Solar System Textures
# This script downloads all required planet textures from Solar System Scope

set -e

BASE_URL="https://www.solarsystemscope.com/textures/download"
OUTPUT_DIR="."

# Planet textures
PLANETS=(
    "2k_sun.jpg:sun.jpg"
    "2k_mercury.jpg:mercury.jpg"
    "2k_venus_surface.jpg:venus_surface.jpg"
    "2k_venus_atmosphere.jpg:venus_atmosphere.jpg"
    "2k_earth_daymap.jpg:earth_daymap.jpg"
    "2k_earth_nightmap.jpg:earth_nightmap.jpg"
    "2k_earth_clouds.jpg:earth_clouds.jpg"
    "2k_moon.jpg:moon.jpg"
    "2k_mars.jpg:mars.jpg"
    "2k_jupiter.jpg:jupiter.jpg"
    "2k_saturn.jpg:saturn.jpg"
    "2k_saturn_ring_alpha.png:saturn_ring_alpha.png"
    "2k_uranus.jpg:uranus.jpg"
    "2k_neptune.jpg:neptune.jpg"
    "2k_pluto.jpg:pluto.jpg"
)

# Moon textures
MOONS=(
    "2k_io.jpg:io.jpg"
    "2k_europa.jpg:europa.jpg"
    "2k_ganymede.jpg:ganymede.jpg"
    "2k_callisto.jpg:callisto.jpg"
    "2k_titan.jpg:titan.jpg"
    "2k_enceladus.jpg:enceladus.jpg"
    "2k_triton.jpg:triton.jpg"
    "2k_charon.jpg:charon.jpg"
    "2k_phobos.jpg:phobos.jpg"
    "2k_deimos.jpg:deimos.jpg"
)

echo "Downloading Solar System Textures..."
echo "Source: Solar System Scope (CC BY 4.0)"
echo "Output: $OUTPUT_DIR"
echo ""

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Download planets
echo "Downloading Planet Textures..."
for texture in "${PLANETS[@]}"; do
    IFS=':' read -r source target <<< "$texture"
    echo -n "  $target... "
    
    if [ -f "$OUTPUT_DIR/$target" ]; then
        echo "Already exists ✓"
    else
        if curl -sL "$BASE_URL/$source" -o "$OUTPUT_DIR/$target" --max-time 60; then
            echo "Downloaded ✓"
        else
            echo "Failed ✗"
        fi
    fi
done

echo ""
echo "Downloading Moon Textures..."
for texture in "${MOONS[@]}"; do
    IFS=':' read -r source target <<< "$texture"
    echo -n "  $target... "
    
    if [ -f "$OUTPUT_DIR/$target" ]; then
        echo "Already exists ✓"
    else
        if curl -sL "$BASE_URL/$source" -o "$OUTPUT_DIR/$target" --max-time 60; then
            echo "Downloaded ✓"
        else
            echo "Failed ✗"
        fi
    fi
done

echo ""
echo "Download complete!"
echo ""
echo "Downloaded textures:"
ls -lh "$OUTPUT_DIR"/*.jpg "$OUTPUT_DIR"/*.png 2>/dev/null | awk '{print $9, $5}'
echo ""
echo "Total size:"
du -sh "$OUTPUT_DIR"
