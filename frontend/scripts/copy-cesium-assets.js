const fs = require('fs');
const path = require('path');

const cesiumSource = path.join(__dirname, '..', 'node_modules', 'cesium', 'Build', 'Cesium');
const publicCesium = path.join(__dirname, '..', 'public', 'cesium');

if (fs.existsSync(cesiumSource)) {
  console.log('Copying Cesium assets to public folder...');

  if (fs.existsSync(publicCesium)) {
    fs.rmSync(publicCesium, { recursive: true, force: true });
  }

  fs.mkdirSync(publicCesium, { recursive: true });

  const copyDir = (src, dest) => {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  };

  copyDir(cesiumSource, publicCesium);

  console.log('Cesium assets copied successfully!');
} else {
  console.log('Cesium source not found, skipping asset copy.');
}
