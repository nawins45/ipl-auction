const fs = require('fs');

console.log('🚀 QUICK FIX FOR RETENTION ISSUES\n');

// 1. First, let's see what's REALLY in players.json
console.log('1. Reading players.json...\n');
try {
    const rawData = fs.readFileSync('players.json', 'utf8');
    const playersData = JSON.parse(rawData);
    
    console.log(`Total players: ${playersData.length}`);
    
    // Show EXACT field names
    console.log('\nField names in first player:');
    const firstPlayer = playersData[0];
    Object.keys(firstPlayer).forEach(key => {
        console.log(`  "${key}": ${typeof firstPlayer[key]} = "${firstPlayer[key]}"`);
    });
    
    // Create PROPERLY formatted players.json
    console.log('\n2. Creating properly formatted players.json...');
    
    const properlyFormattedPlayers = playersData.map((player, index) => {
        // Find the actual team field
        let actualTeam = '';
        let actualName = '';
        let actualRole = '';
        let actualNationality = '';
        
        // Check all possible field names
        Object.keys(player).forEach(key => {
            const keyLower = key.toLowerCase();
            const value = player[key];
            
            if (keyLower.includes('team')) {
                actualTeam = value;
            }
            if (keyLower.includes('name') && !keyLower.includes('team')) {
                actualName = value;
            }
            if (keyLower.includes('role')) {
                actualRole = value;
            }
            if (keyLower.includes('nation') || keyLower.includes('country')) {
                actualNationality = value;
            }
        });
        
        // Fix team name to UPPERCASE
        if (actualTeam) {
            actualTeam = actualTeam.toUpperCase().trim();
            // Fix common typos
            actualTeam = actualTeam
                .replace('RAAJASTHAN', 'RAJASTHAN')
                .replace('PUNDAB', 'PUNJAB')
                .replace('SUMRISERS', 'SUNRISERS');
                
        }
        
        // Fix nationality
        if (actualNationality) {
            const natLower = actualNationality.toString().toLowerCase().trim();
            if (natLower.includes('ind') || natLower === 'ind' || natLower === 'india') {
                actualNationality = 'Indian';
            }
        } else {
            actualNationality = 'Indian';
        }
        
        return {
            id: player.id || `player_${index + 1}`,
            name: actualName || `Player ${index + 1}`,
            team: actualTeam || 'UNKNOWN TEAM',
            role: actualRole || 'Player',
            nationality: actualNationality,
            basePrice: player.basePrice || player['Base price'] || 2.00,
            // Keep all original data
            originalData: player
        };
    });
    
    // Backup original
    const backupName = `players_original_${Date.now()}.json`;
    fs.writeFileSync(backupName, rawData);
    console.log(`✅ Backed up original to: ${backupName}`);
    
    // Save fixed version (without originalData to keep it clean)
    const cleanPlayers = properlyFormattedPlayers.map(p => ({
        id: p.id,
        name: p.name,
        team: p.team,
        role: p.role,
        nationality: p.nationality,
        basePrice: p.basePrice
    }));
    
    fs.writeFileSync('players.json', JSON.stringify(cleanPlayers, null, 2));
    console.log(`✅ Saved fixed players.json with ${cleanPlayers.length} players`);
    
    // Test the fix
    console.log('\n3. Testing the fix...\n');
    
    // Count by team
    const teamStats = {};
    cleanPlayers.forEach(p => {
        teamStats[p.team] = (teamStats[p.team] || 0) + 1;
    });
    
    console.log('Players per team (after fix):');
    Object.entries(teamStats).forEach(([team, count]) => {
        console.log(`  "${team}": ${count} players`);
    });
    
    // Show Rajasthan Royals players
    const rrPlayers = cleanPlayers.filter(p => p.team.includes('RAJASTHAN'));
    console.log(`\nRAJASTHAN ROYALS players: ${rrPlayers.length}`);
    if (rrPlayers.length > 0) {
        rrPlayers.slice(0, 3).forEach((p, i) => {
            console.log(`  ${i+1}. ${p.name} - ${p.role} (${p.nationality})`);
        });
    }
    
    console.log('\n🎯 FIX COMPLETE! Restart your main server.');
    
} catch (error) {
    console.log(`❌ Error: ${error.message}`);
    
    // Create a fresh players.json if everything fails
    console.log('\n📝 Creating fresh players.json...');
    
    const freshPlayers = [
        {
            "id": "rr_1",
            "name": "Sanju Samson",
            "team": "RAJASTHAN ROYALS",
            "role": "WK-Batsman",
            "nationality": "Indian",
            "basePrice": 14
        },
        {
            "id": "rr_2",
            "name": "Jos Buttler",
            "team": "RAJASTHAN ROYALS",
            "role": "WK-Batsman",
            "nationality": "English",
            "basePrice": 10
        },
        {
            "id": "csk_1",
            "name": "MS Dhoni",
            "team": "CHENNAI SUPER KINGS",
            "role": "WK-Batsman",
            "nationality": "Indian",
            "basePrice": 12
        }
    ];
    
    fs.writeFileSync('players.json', JSON.stringify(freshPlayers, null, 2));
    console.log('✅ Created fresh players.json with 3 sample players');
}