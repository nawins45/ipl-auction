const fs = require('fs');
const path = require('path');

console.log('🔄 Normalizing players.json team names...\n');

try {
    const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
    
    // Team mapping from FULL CAPS to standard format
    const teamMapping = {
        'CHENNAI SUPER KINGS': 'Chennai Super Kings',
        'MUMBAI INDIANS': 'Mumbai Indians',
        'ROYAL CHALLENGERS BANGALORE': 'Royal Challengers Bangalore',
        'KOLKATA KNIGHT RIDERS': 'Kolkata Knight Riders',
        'DELHI CAPITALS': 'Delhi Capitals',
        'PUNJAB KINGS': 'Punjab Kings',
        'RAJASTHAN ROYALS': 'Rajasthan Royals',
        'SUNRISERS HYDERABAD': 'Sunrisers Hyderabad',
        'GUJARAT TITANS': 'Gujarat Titans',
        'LUCKNOW SUPER GIANTS': 'Lucknow Super Giants'
    };
    
    let updatedCount = 0;
    
    // Normalize team names
    const updatedPlayers = playersData.map(player => {
        if (player.team) {
            const originalTeam = player.team;
            const normalizedTeam = teamMapping[originalTeam.toUpperCase().trim()];
            
            if (normalizedTeam && normalizedTeam !== originalTeam) {
                updatedCount++;
                console.log(`   ${originalTeam} → ${normalizedTeam}`);
                return {
                    ...player,
                    team: normalizedTeam
                };
            }
        }
        return player;
    });
    
    // Save updated file
    fs.writeFileSync('players.json', JSON.stringify(updatedPlayers, null, 2));
    
    console.log(`\n✅ Normalized ${updatedCount} player team names`);
    console.log(`📁 Saved to players.json`);
    
    // Show statistics
    console.log('\n📊 Team distribution:');
    const teamStats = {};
    updatedPlayers.forEach(player => {
        if (player.team) {
            teamStats[player.team] = (teamStats[player.team] || 0) + 1;
        }
    });
    
    Object.entries(teamStats).forEach(([team, count]) => {
        console.log(`   ${team}: ${count} players`);
    });
    
} catch (error) {
    console.log(`❌ Error: ${error.message}`);
    
    // Show current team names in file
    console.log('\n🔍 Checking current team names in players.json...');
    try {
        const currentData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
        const uniqueTeams = [...new Set(currentData.map(p => p.team).filter(Boolean))];
        
        console.log('Current team names found:');
        uniqueTeams.forEach(team => {
            console.log(`   "${team}"`);
        });
    } catch (e) {
        console.log('Cannot read players.json');
    }
}