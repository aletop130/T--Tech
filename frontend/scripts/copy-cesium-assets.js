const fs = require('fs');
const path = require('path');

const cesiumSource = path.join(__dirname, '..', 'node_modules', 'cesium', 'Build', 'Cesium');
const publicCesium = path.join(__dirname, '..', 'public', 'cesium');

if (fs.existsSync(cesiumSource)) {
  console.log('Copying Cesium assets to public folder...');

  // Remove old assets if they exist
  if (fs.existsSync(publicCesium)) {
    fs.rmSync(publicCesium, { recursive: true, force: true });
  }

  // Copy assets
  fs.cpSync(cesiumSource, publicCesium, { recursive: true });

  console.log('Cesium assets copied successfully!');
} else {
  console.log('Cesium source not found, skipping asset copy.');
}
