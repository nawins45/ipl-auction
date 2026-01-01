const fs = require('fs');

console.log('🔍 VERIFYING ALL TEAM NAME MATCHES\n');
console.log('='.repeat(80));

// Server team names
const SERVER_TEAMS = [
    { id: 'csk', name: 'CHENNAI SUPER KINGS' },
    { id: 'mi', name: 'MUMBAI INDIANS' },
    { id: 'rcb', name: 'ROYAL CHALLENGERS BANGALORE' },
    { id: 'kkr', name: 'KOLKATA KNIGHT RIDERS' },
    { id: 'dc', name: 'DELHI CAPITALS' },
    { id: 'pbks', name: 'PUNJAB KINGS' },
    { id: 'rr', name: 'RAJASTHAN ROYALS' },
    { id: 'srh', name: 'SUNRISERS HYDERABAD' }, // Server has "SUNRISERS"
    { id: 'gt', name: 'GUJARAT TITANS' },
    { id: 'lsg', name: 'LUCKNOW SUPER GIANTS' }
];

try {
    const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
    
    console.log(`📊 Total players: ${playersData.length}\n`);
    
    // Find team field
    const firstPlayer = playersData[0];
    let teamFieldName = '';
    Object.keys(firstPlayer).forEach(key => {
        if (key.toLowerCase().includes('team')) {
            teamFieldName = key;
        }
    });
    
    console.log(`📌 Team field: "${teamFieldName}"\n`);
    
    // Test each server team
    SERVER_TEAMS.forEach(serverTeam => {
        console.log(`🔍 Testing: ${serverTeam.name} (${serverTeam.id})`);
        
        // Find players that should match this team
        const matchingPlayers = playersData.filter(player => {
            if (!player[teamFieldName]) return false;
            
            const playerTeam = player[teamFieldName].toString().trim().toUpperCase();
            const serverTeamUpper = serverTeam.name.toUpperCase();
            
            // Various matching strategies
            return (
                playerTeam === serverTeamUpper ||
                playerTeam.includes(serverTeam.id.toUpperCase()) ||
                serverTeamUpper.includes(playerTeam) ||
                playerTeam.includes(serverTeamUpper.split(' ')[0])
            );
        });
        
        console.log(`   Found: ${matchingPlayers.length} players`);
        
        if (matchingPlayers.length === 0) {
            console.log(`   ❌ NO PLAYERS FOUND!`);
            
            // Show what team names actually exist
            const similarTeams = [];
            playersData.forEach(p => {
                if (p[teamFieldName]) {
                    const team = p[teamFieldName].toString().trim().toUpperCase();
                    if (team.includes(serverTeam.id.toUpperCase()) || 
                        serverTeam.name.toUpperCase().includes(team.split(' ')[0])) {
                        if (!similarTeams.includes(team)) similarTeams.push(team);
                    }
                }
            });
            
            if (similarTeams.length > 0) {
                console.log(`   Similar names found: ${similarTeams.join(', ')}`);
            }
        } else {
            console.log(`   Sample players:`);
            matchingPlayers.slice(0, 2).forEach((p, i) => {
                const name = p.name || p['player name'] || 'Unknown';
                const team = p[teamFieldName];
                console.log(`     ${i+1}. ${name} - "${team}"`);
            });
        }
        
        console.log();
    });
    
    // Special check for SRH/Sunrisers issue
    console.log('\n' + '='.repeat(80));
    console.log('🔍 SPECIAL CHECK: SRH/SUNRISERS ISSUE\n');
    
    const srhVariations = ['SRH', 'SUNRISERS', 'SUNRISES', 'SUNRISE', 'HYDERABAD'];
    
    srhVariations.forEach(variation => {
        const players = playersData.filter(p => {
            if (!p[teamFieldName]) return false;
            return p[teamFieldName].toString().toUpperCase().includes(variation);
        });
        
        console.log(`Searching for "${variation}": ${players.length} players`);
        
        if (players.length > 0) {
            players.slice(0, 2).forEach((p, i) => {
                console.log(`  ${i+1}. ${p.name || 'Unknown'} - Team: "${p[teamFieldName]}"`);
            });
        }
    });
    
} catch (error) {
    console.log(`❌ Error: ${error.message}`);
}