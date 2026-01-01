const fs = require('fs');

console.log('🔍 Checking players.json structure...\n');

try {
    const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
    
    if (!Array.isArray(playersData)) {
        console.log('❌ players.json should be an ARRAY');
        return;
    }
    
    console.log(`✅ Total players: ${playersData.length}\n`);
    
    if (playersData.length === 0) {
        console.log('❌ File is empty!');
        return;
    }
    
    // Check first player's fields
    const firstPlayer = playersData[0];
    console.log('📋 FIRST PLAYER FIELDS:');
    console.log('='.repeat(50));
    
    Object.keys(firstPlayer).forEach(key => {
        console.log(`"${key}": "${firstPlayer[key]}"`);
    });
    
    // Look for team-related fields
    console.log('\n🔍 LOOKING FOR TEAM FIELDS:');
    console.log('='.repeat(50));
    
    const teamFields = [];
    playersData.slice(0, 5).forEach((player, i) => {
        Object.keys(player).forEach(key => {
            if (key.toLowerCase().includes('team')) {
                if (!teamFields.includes(key)) {
                    teamFields.push(key);
                }
                console.log(`Player ${i+1} has "${key}": "${player[key]}"`);
            }
        });
    });
    
    console.log(`\n📊 Found team fields: ${teamFields.join(', ')}`);
    
    // Check which field is most common
    if (teamFields.length > 0) {
        console.log('\n📈 TEAM FIELD DISTRIBUTION:');
        teamFields.forEach(field => {
            const count = playersData.filter(p => p[field]).length;
            const percentage = (count / playersData.length * 100).toFixed(1);
            console.log(`  ${field}: ${count} players (${percentage}%)`);
        });
        
        // Recommend which field to use
        const mainTeamField = teamFields[0]; // Use first team field found
        console.log(`\n💡 RECOMMENDATION: Use "${mainTeamField}" field in server.js`);
    } else {
        console.log('❌ No team-related fields found!');
    }
    
} catch (error) {
    console.log(`❌ Error: ${error.message}`);
}