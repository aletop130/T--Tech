const fs = require('fs');
const path = require('path');

const cesiumSource = path.join(__dirname, '..', 'node_modules', 'cesium', 'Build', 'Cesium');
const publicCesium = path.join(__dirname, '..', 'public', 'cesium');

if (fs.existsSync(cesiumSource)) {
  // Check if assets already exist
  if (fs.existsSync(publicCesium)) {
    const workersDir = path.join(publicCesium, 'Workers');
    if (fs.existsSync(workersDir)) {
      console.log('Cesium assets already exist, skipping copy.');
      process.exit(0);
    }
  }

  console.log('Copying Cesium assets to public folder...');

  // Create destination directory (don't delete if it exists - may be a Docker volume)
  fs.mkdirSync(publicCesium, { recursive: true });

  const copyDir = (src, dest) => {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        copyDir(srcPath, destPath);
      } else {
        try {
          fs.copyFileSync(srcPath, destPath);
        } catch (err) {
          console.warn(`Warning: Could not copy ${entry.name}: ${err.message}`);
        }
      }
    }
  };

  copyDir(cesiumSource, publicCesium);

  console.log('Cesium assets copied successfully!');
} else {
  console.log('Cesium source not found, skipping asset copy.');
}
