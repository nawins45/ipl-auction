const fs = require('fs');

console.log('🧪 TESTING USER-TEAM MAPPING\n');
console.log('='.repeat(80));

// Simulate room assignment
const testUsers = [
    { id: 'user1_socket', username: 'User1', team: { id: 'gt', name: 'GUJARAT TITANS', color: '#1E2D4A' } },
    { id: 'user2_socket', username: 'User2', team: { id: 'srh', name: 'SUNRISERS HYDERABAD', color: '#FF6F3D' } },
    { id: 'user3_socket', username: 'User3', team: { id: 'mi', name: 'MUMBAI INDIANS', color: '#0048A0' } }
];

console.log('📋 TEST USER-TEAM ASSIGNMENTS:');
testUsers.forEach(user => {
    console.log(`  👤 ${user.username}: ${user.team.name} (${user.team.id})`);
});

// Test players.json
try {
    const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
    console.log(`\n📊 Total players: ${playersData.length}`);
    
    // Find team field
    const firstPlayer = playersData[0];
    let teamFieldName = '';
    Object.keys(firstPlayer).forEach(key => {
        if (key.toLowerCase().includes('team')) {
            teamFieldName = key;
        }
    });
    
    console.log(`📌 Team field name: "${teamFieldName}"\n`);
    
    // Test each user
    testUsers.forEach(user => {
        console.log(`🔍 Testing ${user.username} (${user.team.name}):`);
        
        const teamPlayers = playersData.filter(player => {
            if (!teamFieldName || !player[teamFieldName]) return false;
            
            const playerTeam = player[teamFieldName].toString().trim().toUpperCase();
            const userTeam = user.team.name.toUpperCase();
            
            return playerTeam === userTeam || 
                   playerTeam.includes(user.team.id.toUpperCase());
        });
        
        console.log(`   Found ${teamPlayers.length} players`);
        
        if (teamPlayers.length > 0) {
            console.log('   Sample players:');
            teamPlayers.slice(0, 2).forEach((p, i) => {
                const name = p.name || p['player name'] || 'Unknown';
                const team = teamFieldName ? p[teamFieldName] : 'No team';
                console.log(`     ${i+1}. ${name} - Team: "${team}"`);
            });
        }
        console.log();
    });
    
} catch (error) {
    console.log(`❌ Error: ${error.message}`);
}