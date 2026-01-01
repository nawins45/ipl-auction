const fs = require('fs');

console.log('🔍 ANALYZING AND FIXING players.json...\n');

try {
    const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
    
    console.log(`📊 Found ${playersData.length} players\n`);
    
    // Show raw structure of first player
    console.log('📋 RAW STRUCTURE OF FIRST PLAYER:');
    console.log(JSON.stringify(playersData[0], null, 2));
    
    // Show ALL field names in the data
    console.log('\n🔍 ALL FIELD NAMES FOUND IN DATA:');
    const allFields = new Set();
    playersData.forEach(player => {
        Object.keys(player).forEach(field => allFields.add(field));
    });
    console.log(Array.from(allFields).join(', '));
    
    // Find which fields contain player names
    console.log('\n🔍 FINDING NAME FIELD:');
    const nameFields = ['name', 'Name', 'NAME', 'player_name', 'PlayerName', 'FullName', 'full_name'];
    nameFields.forEach(field => {
        if (playersData[0].hasOwnProperty(field)) {
            console.log(`✅ Name field found: "${field}" = "${playersData[0][field]}"`);
        }
    });
    
    // Find nationality field
    console.log('\n🔍 FINDING NATIONALITY FIELD:');
    const nationalityFields = ['nationality', 'Nationality', 'NATIONALITY', 'country', 'Country', 'COUNTRY', 'Nation'];
    nationalityFields.forEach(field => {
        if (playersData[0].hasOwnProperty(field)) {
            console.log(`✅ Nationality field found: "${field}" = "${playersData[0][field]}"`);
        }
    });
    
    // Find role field
    console.log('\n🔍 FINDING ROLE FIELD:');
    const roleFields = ['role', 'Role', 'ROLE', 'type', 'Type', 'TYPE', 'player_role', 'PlayerRole', 'position', 'Position'];
    roleFields.forEach(field => {
        if (playersData[0].hasOwnProperty(field)) {
            console.log(`✅ Role field found: "${field}" = "${playersData[0][field]}"`);
        }
    });
    
    // Now fix the data
    console.log('\n🔄 FIXING THE DATA...');
    
    let nameField = null;
    let nationalityField = null;
    let roleField = null;
    
    // Determine actual field names
    for (let player of playersData.slice(0, 5)) { // Check first 5 players
        if (!nameField) {
            const found = Object.keys(player).find(key => 
                key.toLowerCase().includes('name') || 
                key.toLowerCase().includes('player')
            );
            if (found) nameField = found;
        }
        
        if (!nationalityField) {
            const found = Object.keys(player).find(key => 
                key.toLowerCase().includes('nation') || 
                key.toLowerCase().includes('country')
            );
            if (found) nationalityField = found;
        }
        
        if (!roleField) {
            const found = Object.keys(player).find(key => 
                key.toLowerCase().includes('role') || 
                key.toLowerCase().includes('type') ||
                key.toLowerCase().includes('position')
            );
            if (found) roleField = found;
        }
    }
    
    console.log(`Detected fields:`);
    console.log(`  Name field: ${nameField || 'NOT FOUND'}`);
    console.log(`  Nationality field: ${nationalityField || 'NOT FOUND'}`);
    console.log(`  Role field: ${roleField || 'NOT FOUND'}`);
    
    // Fix the players data
    const fixedPlayers = playersData.map((player, index) => {
        // Get the actual values
        const actualName = nameField ? player[nameField] : 'Unknown Player';
        const actualNationality = nationalityField ? player[nationalityField] : 'Indian';
        const actualRole = roleField ? player[roleField] : 'Player';
        
        // Standardize nationality (handle "IND", "INDIA", "Indian", etc.)
        let standardizedNationality = actualNationality;
        if (typeof actualNationality === 'string') {
            const natLower = actualNationality.toLowerCase().trim();
            if (natLower.includes('ind') || natLower === 'ind' || natLower === 'indian') {
                standardizedNationality = 'Indian';
            }
        }
        
        // Create fixed player object
        return {
            id: player.id || player.ID || `player_${index + 1}`,
            name: actualName,
            nationality: standardizedNationality,
            role: actualRole,
            team: player.team || player.Team || player.TEAM,
            basePrice: player.basePrice || player.base_price || player.price || 2.00
        };
    });
    
    // Backup original
    const backupName = `players_original_${Date.now()}.json`;
    fs.writeFileSync(backupName, JSON.stringify(playersData, null, 2));
    console.log(`\n📦 Backed up original as: ${backupName}`);
    
    // Save fixed version
    fs.writeFileSync('players.json', JSON.stringify(fixedPlayers, null, 2));
    console.log(`✅ Saved fixed players.json with ${fixedPlayers.length} players`);
    
    // Show sample of fixed data
    console.log('\n📋 SAMPLE OF FIXED PLAYERS (first 3):');
    console.log('='.repeat(60));
    fixedPlayers.slice(0, 3).forEach((player, i) => {
        console.log(`\nPlayer ${i + 1}:`);
        console.log(`  ID: ${player.id}`);
        console.log(`  Name: "${player.name}"`);
        console.log(`  Nationality: "${player.nationality}"`);
        console.log(`  Role: "${player.role}"`);
        console.log(`  Team: "${player.team}"`);
        console.log(`  Is Overseas: ${player.nationality.toLowerCase() !== 'indian'}`);
    });
    console.log('='.repeat(60));
    
    // Show statistics
    console.log('\n📊 STATISTICS AFTER FIX:');
    const nationalityStats = {};
    fixedPlayers.forEach(player => {
        const nat = player.nationality || 'Unknown';
        nationalityStats[nat] = (nationalityStats[nat] || 0) + 1;
    });
    
    Object.entries(nationalityStats).forEach(([nat, count]) => {
        console.log(`  ${nat}: ${count} players`);
    });
    
} catch (error) {
    console.log(`❌ Error: ${error.message}`);
}