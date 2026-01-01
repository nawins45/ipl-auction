const fs = require('fs');
const path = require('path');

console.log('🔍 COMPLETE RETENTION DEBUGGING SCRIPT\n');
console.log('='.repeat(80));

// 1. Check players.json
console.log('\n1. CHECKING players.json FILE:\n');
try {
    const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
    console.log(`✅ File exists and is valid JSON`);
    console.log(`📊 Total players: ${playersData.length}`);
    
    if (playersData.length === 0) {
        console.log('❌ CRITICAL: players.json is EMPTY!');
    } else {
        // Show first 3 players
        console.log('\n📋 First 3 players:');
        playersData.slice(0, 3).forEach((player, i) => {
            console.log(`\nPlayer ${i + 1}:`);
            console.log(`  ID: ${player.id || 'No ID'}`);
            console.log(`  Name: "${player.name || player['player name'] || 'No name'}"`);
            console.log(`  Team: "${player.team || player['Team name'] || 'No team'}"`);
            console.log(`  Role: "${player.role || player['player role'] || 'No role'}"`);
            console.log(`  Nationality: "${player.nationality || player.Nationality || 'No nationality'}"`);
            
            // Check team name format
            if (player.team || player['Team name']) {
                const teamName = (player.team || player['Team name']).toUpperCase().trim();
                console.log(`  Team (uppercase): "${teamName}"`);
            }
        });
        
        // Check for Rajasthan Royals specifically
        console.log('\n🔍 Looking for RAJASTHAN ROYALS players:');
        const rrPlayers = playersData.filter(p => {
            const teamField = p.team || p['Team name'] || '';
            return teamField.toUpperCase().includes('RAJASTHAN') || 
                   teamField.toUpperCase().includes('RR');
        });
        
        console.log(`Found ${rrPlayers.length} Rajasthan Royals players`);
        if (rrPlayers.length > 0) {
            console.log('Sample RR players:');
            rrPlayers.slice(0, 3).forEach((p, i) => {
                console.log(`  ${i+1}. ${p.name || p['player name']} - Team: "${p.team || p['Team name']}"`);
            });
        }
    }
} catch (error) {
    console.log(`❌ Error reading players.json: ${error.message}`);
}

// 2. Check server.js IPL_TEAMS array
console.log('\n' + '='.repeat(80));
console.log('\n2. CHECKING server.js IPL_TEAMS CONFIGURATION:\n');

try {
    const serverContent = fs.readFileSync('server.js', 'utf8');
    
    // Extract IPL_TEAMS array
    const teamsMatch = serverContent.match(/const IPL_TEAMS = \[[\s\S]*?\];/);
    if (teamsMatch) {
        console.log('✅ IPL_TEAMS array found in server.js');
        
        // Check for Rajasthan Royals
        if (serverContent.includes('RAJASTHAN ROYALS')) {
            console.log('✅ "RAJASTHAN ROYALS" found in IPL_TEAMS');
        } else if (serverContent.includes('RAAJASTHAN ROYALS')) {
            console.log('⚠️ Found "RAAJASTHAN ROYALS" (spelling error)');
        } else {
            console.log('❌ "RAJASTHAN ROYALS" NOT found in IPL_TEAMS');
        }
        
        // Count teams
        const teamCount = (serverContent.match(/{ id:/g) || []).length;
        console.log(`📊 Number of teams configured: ${teamCount}`);
    } else {
        console.log('❌ IPL_TEAMS array NOT found in server.js');
    }
} catch (error) {
    console.log(`❌ Error reading server.js: ${error.message}`);
}

// 3. Check current directory structure
console.log('\n' + '='.repeat(80));
console.log('\n3. CHECKING DIRECTORY STRUCTURE:\n');

const checkDir = (dirPath, indent = '') => {
    try {
        const items = fs.readdirSync(dirPath);
        items.forEach(item => {
            const itemPath = path.join(dirPath, item);
            const isDir = fs.statSync(itemPath).isDirectory();
            console.log(`${indent}${isDir ? '📁' : '📄'} ${item}`);
            if (isDir && item === 'teams') {
                // List team logos
                const logoPath = path.join(dirPath, item);
                const logos = fs.readdirSync(logoPath);
                logos.forEach(logo => {
                    console.log(`${indent}  📄 ${logo}`);
                });
            }
        });
    } catch (error) {
        console.log(`${indent}❌ Cannot read directory: ${dirPath}`);
    }
};

console.log('Current directory:');
checkDir('.');

console.log('\nPublic directory:');
if (fs.existsSync('public')) {
    checkDir('public');
} else {
    console.log('❌ public directory not found!');
}

// 4. Test server-side player matching logic
console.log('\n' + '='.repeat(80));
console.log('\n4. TESTING PLAYER MATCHING LOGIC:\n');

try {
    const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
    
    // Test team names from players.json
    console.log('All unique team names in players.json:');
    const allTeams = [...new Set(playersData.map(p => p.team || p['Team name']).filter(Boolean))];
    allTeams.forEach(team => {
        const count = playersData.filter(p => (p.team || p['Team name']) === team).length;
        console.log(`  "${team}": ${count} players`);
    });
    
    // Test matching for RAJASTHAN ROYALS
    console.log('\n🔍 Testing RAJASTHAN ROYALS matching:');
    const testTeamName = 'RAJASTHAN ROYALS';
    
    const exactMatches = playersData.filter(p => {
        const playerTeam = (p.team || p['Team name'] || '').toUpperCase().trim();
        return playerTeam === testTeamName;
    });
    
    console.log(`Exact match for "${testTeamName}": ${exactMatches.length} players`);
    
    const partialMatches = playersData.filter(p => {
        const playerTeam = (p.team || p['Team name'] || '').toUpperCase().trim();
        return playerTeam.includes('RAJASTHAN') || playerTeam.includes('RR');
    });
    
    console.log(`Partial match (contains "RAJASTHAN" or "RR"): ${partialMatches.length} players`);
    
    if (partialMatches.length > 0) {
        console.log('\nPartial matched players:');
        partialMatches.slice(0, 5).forEach((p, i) => {
            const team = p.team || p['Team name'];
            console.log(`  ${i+1}. ${p.name || p['player name']} - Team: "${team}"`);
        });
    }
    
} catch (error) {
    console.log(`❌ Error in matching test: ${error.message}`);
}

console.log('\n' + '='.repeat(80));
console.log('✅ DEBUGGING COMPLETE');