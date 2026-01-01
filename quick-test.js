const fs = require('fs');

console.log('🧪 QUICK TEST OF players.json...\n');

try {
    const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
    
    console.log('First 5 players after fix:');
    console.log('='.repeat(80));
    
    playersData.slice(0, 5).forEach((player, i) => {
        console.log(`\nPlayer ${i + 1}:`);
        console.log(`  Name: "${player.name}"`);
        console.log(`  Nationality: "${player.nationality}"`);
        console.log(`  Role: "${player.role}"`);
        console.log(`  Team: "${player.team}"`);
        
        // Check if recognized as Indian
        const natLower = (player.nationality || '').toString().toLowerCase().trim();
        const isIndian = natLower.includes('ind') || natLower === 'ind' || natLower === 'india' || natLower === 'indian';
        console.log(`  Recognized as Indian: ${isIndian ? '✅ YES' : '❌ NO'}`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 Nationality Statistics:');
    
    const stats = {};
    playersData.forEach(player => {
        const nat = player.nationality || 'Unknown';
        stats[nat] = (stats[nat] || 0) + 1;
    });
    
    Object.entries(stats).forEach(([nat, count]) => {
        console.log(`  ${nat}: ${count} players`);
    });
    
} catch (error) {
    console.log(`❌ Error: ${error.message}`);
}