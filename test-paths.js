const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying image paths...\n');

const baseDir = __dirname;
const imagesDir = path.join(baseDir, 'public', 'images', 'teams');

console.log(`Base directory: ${baseDir}`);
console.log(`Images directory: ${imagesDir}`);

// Check if directory exists
if (!fs.existsSync(imagesDir)) {
    console.log('❌ images/teams directory does not exist!');
    console.log('\nCreating directory structure...');
    
    // Create the directory
    fs.mkdirSync(path.join(baseDir, 'public', 'images', 'teams'), { recursive: true });
    console.log('✅ Created public/images/teams directory');
    
    // List what exists
    console.log('\n📁 Current public/ structure:');
    const publicDir = path.join(baseDir, 'public');
    if (fs.existsSync(publicDir)) {
        const listDirs = (dir, indent = '') => {
            const items = fs.readdirSync(dir);
            items.forEach(item => {
                const itemPath = path.join(dir, item);
                const isDir = fs.statSync(itemPath).isDirectory();
                console.log(`${indent}${isDir ? '📁' : '📄'} ${item}`);
                if (isDir) {
                    listDirs(itemPath, indent + '  ');
                }
            });
        };
        listDirs(publicDir);
    }
} else {
    console.log('✅ images/teams directory exists');
    
    // List all files
    const files = fs.readdirSync(imagesDir);
    console.log(`\n📁 Files in images/teams (${files.length} files):`);
    
    if (files.length === 0) {
        console.log('   No image files found!');
    } else {
        files.forEach(file => {
            const filePath = path.join(imagesDir, file);
            const stats = fs.statSync(filePath);
            console.log(`   ✅ ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
        });
    }
}

// Test URLs
console.log('\n🌐 Test these URLs in your browser:');
const teams = ['CSK', 'MI', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'GT', 'LSG'];
teams.forEach(team => {
    console.log(`   http://localhost:3000/images/teams/${team}.png`);
});