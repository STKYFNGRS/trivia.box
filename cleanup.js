// Cleanup script to remove unnecessary files
const fs = require('fs');
const path = require('path');

// Files to delete
const filesToDelete = [
  path.join(__dirname, 'src', 'utils', 'directSiwe.ts'),
  path.join(__dirname, 'src', 'utils', 'simpleSiwe.ts'),
  path.join(__dirname, 'src', 'config', 'directAppkit.ts'),
  path.join(__dirname, 'src', 'components', 'shared', 'DirectConnectButton.tsx')
];

// Delete each file
filesToDelete.forEach(file => {
  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`Deleted: ${file}`);
    } else {
      console.log(`File does not exist: ${file}`);
    }
  } catch (err) {
    console.error(`Error deleting ${file}:`, err);
  }
});

console.log('Cleanup complete!');
