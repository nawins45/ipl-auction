const fs = require('fs');

console.log('🔧 FIXING TEAM NAME MISMATCHES\n');
console.log('='.repeat(80));

try {
    const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
    
    console.log(`📊 Total players: ${playersData.length}\n`);
    
    // Find the team field name
    const firstPlayer = playersData[0];
    let teamFieldName = '';
    
    Object.keys(firstPlayer).forEach(key => {
        if (key.toLowerCase().includes('team')) {
            teamFieldName = key;
            console.log(`📌 Team field found: "${teamFieldName}"`);
        }
    });
    
    if (!teamFieldName) {
        console.log('❌ No team field found!');
        return;
    }
    
    // Show all unique team names BEFORE fix
    console.log('\n🔍 CURRENT TEAM NAMES IN players.json:');
    const currentTeams = {};
    playersData.forEach(player => {
        if (player[teamFieldName]) {
            const team = player[teamFieldName].toString().trim();
            currentTeams[team] = (currentTeams[team] || 0) + 1;
        }
    });
    
    Object.entries(currentTeams).forEach(([team, count]) => {
        console.log(`  "${team}": ${count} players`);
    });
    
    // Team name mapping - CORRECT VERSION
    const teamMapping = {
        // Common misspellings to correct names
        'SUNRISES HYDERABAD': 'SUNRISERS HYDERABAD', // Missing R
        'Sunrises Hyderabad': 'SUNRISERS HYDERABAD',
        'SUNRISE HYDERABAD': 'SUNRISERS HYDERABAD',
        'SRH': 'SUNRISERS HYDERABAD',
        
        'CHENNAI SUPER KINGS': 'CHENNAI SUPER KINGS',
        'Chennai Super Kings': 'CHENNAI SUPER KINGS',
        'CSK': 'CHENNAI SUPER KINGS',
        
        'MUMBAI INDIANS': 'MUMBAI INDIANS',
        'Mumbai Indians': 'MUMBAI INDIANS',
        'MI': 'MUMBAI INDIANS',
        
        'ROYAL CHALLENGERS BANGALORE': 'ROYAL CHALLENGERS BANGALORE',
        'Royal Challengers Bangalore': 'ROYAL CHALLENGERS BANGALORE',
        'RCB': 'ROYAL CHALLENGERS BANGALORE',
        
        'KOLKATA KNIGHT RIDERS': 'KOLKATA KNIGHT RIDERS',
        'Kolkata Knight Riders': 'KOLKATA KNIGHT RIDERS',
        'KKR': 'KOLKATA KNIGHT RIDERS',
        
        'DELHI CAPITALS': 'DELHI CAPITALS',
        'Delhi Capitals': 'DELHI CAPITALS',
        'DC': 'DELHI CAPITALS',
        
        'PUNJAB KINGS': 'PUNJAB KINGS',
        'Punjab Kings': 'PUNJAB KINGS',
        'PBKS': 'PUNJAB KINGS',
        
        'RAJASTHAN ROYALS': 'RAJASTHAN ROYALS',
        'Rajasthan Royals': 'RAJASTHAN ROYALS',
        'RR': 'RAJASTHAN ROYALS',
        
        'GUJARAT TITANS': 'GUJARAT TITANS',
        'Gujarat Titans': 'GUJARAT TITANS',
        'GT': 'GUJARAT TITANS',
        
        'LUCKNOW SUPER GIANTS': 'LUCKNOW SUPER GIANTS',
        'Lucknow Super Giants': 'LUCKNOW SUPER GIANTS',
        'LSG': 'LUCKNOW SUPER GIANTS'
    };
    
    // Fix the team names
    console.log('\n🔄 FIXING TEAM NAMES...');
    let fixedCount = 0;
    
    const fixedPlayers = playersData.map(player => {
        if (!player[teamFieldName]) return player;
        
        const originalTeam = player[teamFieldName].toString().trim();
        const teamUpper = originalTeam.toUpperCase();
        
        // Find correct team name
        let correctTeam = null;
        
        // Check exact match
        if (teamMapping[originalTeam]) {
            correctTeam = teamMapping[originalTeam];
        } else if (teamMapping[teamUpper]) {
            correctTeam = teamMapping[teamUpper];
        } else {
            // Check for partial matches
            const normalized = originalTeam.toUpperCase().replace(/\s+/g, ' ').trim();
            if (teamMapping[normalized]){
                correctTeam = teamMapping[normalized];
            }
        }
        
        if (correctTeam && correctTeam !== originalTeam) {
            fixedCount++;
            console.log(`   "${originalTeam}" → "${correctTeam}"`);
            
            // Create updated player
            const updatedPlayer = { ...player };
            updatedPlayer[teamFieldName] = correctTeam;
            return updatedPlayer;
        }
        
        return player;
    });
    
    // Backup original
    const backupName = `players_backup_${Date.now()}.json`;
    fs.writeFileSync(backupName, JSON.stringify(playersData, null, 2));
    console.log(`\n📦 Backed up original to: ${backupName}`);
    
    // Save fixed version
    fs.writeFileSync('players.json', JSON.stringify(fixedPlayers, null, 2));
    console.log(`✅ Fixed ${fixedCount} team names`);
    
    // Show after fix
    console.log('\n🔍 TEAM NAMES AFTER FIX:');
    const fixedTeams = {};
    fixedPlayers.forEach(player => {
        if (player[teamFieldName]) {
            const team = player[teamFieldName].toString().trim();
            fixedTeams[team] = (fixedTeams[team] || 0) + 1;
        }
    });
    
    Object.entries(fixedTeams).forEach(([team, count]) => {
        console.log(`  "${team}": ${count} players`);
    });
    
} catch (error) {
    console.log(`❌ Error: ${error.message}`);
}