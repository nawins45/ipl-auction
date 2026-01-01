const fs = require('fs');

console.log('🔄 NORMALIZING TEAM NAMES IN players.json\n');

try {
    const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
    
    // Standard team names mapping
    const teamMapping = {
        // Map variations to standard names
        'MUMBAI INDIANS': 'MUMBAI INDIANS',
        'Mumbai Indians': 'MUMBAI INDIANS',
        'MI': 'MUMBAI INDIANS',
        'Mumbai': 'MUMBAI INDIANS',
        
        'CHENNAI SUPER KINGS': 'CHENNAI SUPER KINGS',
        'Chennai Super Kings': 'CHENNAI SUPER KINGS',
        'CSK': 'CHENNAI SUPER KINGS',
        'Chennai': 'CHENNAI SUPER KINGS',
        
        'RAJASTHAN ROYALS': 'RAJASTHAN ROYALS',
        'Rajasthan Royals': 'RAJASTHAN ROYALS',
        'RR': 'RAJASTHAN ROYALS',
        'Rajasthan': 'RAJASTHAN ROYALS',
        
        'ROYAL CHALLENGERS BANGALORE': 'ROYAL CHALLENGERS BANGALORE',
        'Royal Challengers Bangalore': 'ROYAL CHALLENGERS BANGALORE',
        'RCB': 'ROYAL CHALLENGERS BANGALORE',
        'Bangalore': 'ROYAL CHALLENGERS BANGALORE',
        
        'KOLKATA KNIGHT RIDERS': 'KOLKATA KNIGHT RIDERS',
        'Kolkata Knight Riders': 'KOLKATA KNIGHT RIDERS',
        'KKR': 'KOLKATA KNIGHT RIDERS',
        'Kolkata': 'KOLKATA KNIGHT RIDERS',
        
        'DELHI CAPITALS': 'DELHI CAPITALS',
        'Delhi Capitals': 'DELHI CAPITALS',
        'DC': 'DELHI CAPITALS',
        'Delhi': 'DELHI CAPITALS',
        
        'PUNJAB KINGS': 'PUNJAB KINGS',
        'Punjab Kings': 'PUNJAB KINGS',
        'PBKS': 'PUNJAB KINGS',
        'Punjab': 'PUNJAB KINGS',
        
        'SUNRISERS HYDERABAD': 'SUNRISERS HYDERABAD',
        'Sunrisers Hyderabad': 'SUNRISERS HYDERABAD',
        'SRH': 'SUNRISERS HYDERABAD',
        'Hyderabad': 'SUNRISERS HYDERABAD',
        
        'GUJARAT TITANS': 'GUJARAT TITANS',
        'Gujarat Titans': 'GUJARAT TITANS',
        'GT': 'GUJARAT TITANS',
        'Gujarat': 'GUJARAT TITANS',
        
        'LUCKNOW SUPER GIANTS': 'LUCKNOW SUPER GIANTS',
        'Lucknow Super Giants': 'LUCKNOW SUPER GIANTS',
        'LSG': 'LUCKNOW SUPER GIANTS',
        'Lucknow': 'LUCKNOW SUPER GIANTS'
    };
    
    let updatedCount = 0;
    
    const normalizedPlayers = playersData.map(player => {
        // Get current team from any field
        let currentTeam = player.team || player['Team name'] || player.Team;
        
        if (!currentTeam) {
            console.log(`⚠️ Player "${player.name || 'Unknown'}" has no team field`);
            return player;
        }
        
        const originalTeam = currentTeam.toString().trim();
        const teamUpper = originalTeam.toUpperCase();
        
        // Find matching standard team
        let matchedTeam = null;
        
        // Check direct mapping
        if (teamMapping[originalTeam]) {
            matchedTeam = teamMapping[originalTeam];
        } else if (teamMapping[teamUpper]) {
            matchedTeam = teamMapping[teamUpper];
        } else {
            // Check if any mapping key is contained in the team name
            for (const [key, value] of Object.entries(teamMapping)) {
                if (teamUpper.includes(key.toUpperCase()) || key.toUpperCase().includes(teamUpper)) {
                    matchedTeam = value;
                    break;
                }
            }
        }
        
        if (matchedTeam && matchedTeam !== originalTeam) {
            updatedCount++;
            console.log(`   ${originalTeam} → ${matchedTeam}`);
            
            // Update the player object
            return {
                ...player,
                team: matchedTeam, // Standardize to 'team' field
                'Team name': matchedTeam // Also update 'Team name' field
            };
        }
        
        return player;
    });
    
    // Backup original
    const backupName = `players_backup_${Date.now()}.json`;
    fs.writeFileSync(backupName, JSON.stringify(playersData, null, 2));
    console.log(`\n📦 Backed up original to: ${backupName}`);
    
    // Save normalized version
    fs.writeFileSync('players.json', JSON.stringify(normalizedPlayers, null, 2));
    console.log(`✅ Normalized ${updatedCount} team names`);
    
    // Show statistics
    console.log('\n📊 TEAM DISTRIBUTION AFTER NORMALIZATION:');
    const teamStats = {};
    normalizedPlayers.forEach(player => {
        const team = player.team || player['Team name'];
        if (team) {
            teamStats[team] = (teamStats[team] || 0) + 1;
        }
    });
    
    Object.entries(teamStats).forEach(([team, count]) => {
        console.log(`  "${team}": ${count} players`);
    });
    
} catch (error) {
    console.log(`❌ Error: ${error.message}`);
}