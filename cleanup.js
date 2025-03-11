const fs = require('fs');
const path = require('path');

// List of files to delete
const filesToDelete = [
  // Custom components we created that are no longer needed
  path.join(__dirname, 'src', 'components', 'FaviconLinks.tsx'),
  path.join(__dirname, 'src', 'components', 'MetamaskFavicon.tsx'),
  path.join(__dirname, 'src', 'utils', 'directSiwe.ts'),
  
  // Custom HTML file we created that is not needed
  path.join(__dirname, 'public', 'index.html'),
  
  // This cleanup script itself
  __filename
];

// Delete each file
filesToDelete.forEach(file => {
  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`Deleted: ${file}`);
    } else {
      console.log(`File not found: ${file}`);
    }
  } catch (err) {
    console.error(`Error deleting ${file}:`, err);
  }
});

console.log('Cleanup completed!');
