const fs = require('fs');

console.log('🔧 Fixing player fields based on your actual structure...\n');

try {
    const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
    
    console.log(`📊 Found ${playersData.length} players\n`);
    
    // Show actual structure of first player
    console.log('📋 ACTUAL STRUCTURE OF FIRST PLAYER:');
    const firstPlayer = playersData[0];
    Object.keys(firstPlayer).forEach(key => {
        console.log(`  "${key}": "${firstPlayer[key]}"`);
    });
    
    console.log('\n🔄 Converting to standard field names...');
    
    const fixedPlayers = playersData.map((player, index) => {
        // Map your field names to standard field names
        return {
            id: player.id || `player_${index + 1}`,
            name: player['player name'] || player['Player name'] || player.name || 'Unknown Player',
            team: player['Team name'] || player['team name'] || player.team || player.Team || 'Unknown Team',
            role: player['player role'] || player['Player role'] || player.role || player.Role || 'Player',
            nationality: player.Nationality || player.nationality || player.NATION || 'Indian',
            basePrice: player['Base price'] || player['base price'] || player.basePrice || 2.00,
            
            // Keep other fields for reference
            totalRuns: player['total runs'] || 0,
            highestScore: player['highest score'] || 0,
            strikeRate: player['strike rate'] || 0,
            fours: player["4's"] || player['4s'] || 0,
            sixes: player["6's"] || player['6s'] || 0,
            fifties: player["50's"] || player['50s'] || 0,
            hundreds: player["100's"] || player['100s'] || 0,
            wickets: player.wickets || 0,
            best: player.best || '0/0',
            economyRate: player['economy rate'] || 0,
            status: player.status || 'Available',
            marquee: player.marquee || false,
            bowlingType: player['bowling type'] || 'None'
        };
    });
    
    // Backup original
    const backupName = `players_backup_${Date.now()}.json`;
    fs.writeFileSync(backupName, JSON.stringify(playersData, null, 2));
    console.log(`📦 Backed up original as: ${backupName}`);
    
    // Save fixed version
    fs.writeFileSync('players.json', JSON.stringify(fixedPlayers, null, 2));
    console.log(`✅ Saved fixed players.json with ${fixedPlayers.length} players`);
    
    // Show sample
    console.log('\n📋 SAMPLE OF FIXED DATA (first 3 players):');
    console.log('='.repeat(80));
    fixedPlayers.slice(0, 3).forEach((player, i) => {
        console.log(`\nPlayer ${i + 1}:`);
        console.log(`  Name: "${player.name}"`);
        console.log(`  Team: "${player.team}"`);
        console.log(`  Role: "${player.role}"`);
        console.log(`  Nationality: "${player.nationality}"`);
        console.log(`  Base Price: ₹${player.basePrice} Cr`);
        
        // Check nationality
        const natLower = (player.nationality || '').toString().toLowerCase().trim();
        const isIndian = natLower === 'indian' || natLower === 'india' || natLower === 'ind';
        console.log(`  Is Indian: ${isIndian ? '✅ YES' : '❌ NO (Overseas)'}`);
    });
    
    // Statistics
    console.log('\n' + '='.repeat(80));
    console.log('📊 STATISTICS:');
    
    // Team distribution
    const teamStats = {};
    fixedPlayers.forEach(player => {
        const team = player.team || 'Unknown';
        teamStats[team] = (teamStats[team] || 0) + 1;
    });
    
    console.log('\n🏏 Players per team:');
    Object.entries(teamStats).forEach(([team, count]) => {
        console.log(`  ${team}: ${count} players`);
    });
    
    // Nationality distribution
    const nationalityStats = {};
    fixedPlayers.forEach(player => {
        const nat = player.nationality || 'Unknown';
        nationalityStats[nat] = (nationalityStats[nat] || 0) + 1;
    });
    
    console.log('\n🌍 Nationality distribution:');
    Object.entries(nationalityStats).forEach(([nat, count]) => {
        console.log(`  ${nat}: ${count} players`);
    });
    
    console.log('\n✅ Fix completed! Restart your server.');
    
} catch (error) {
    console.log(`❌ Error: ${error.message}`);
}