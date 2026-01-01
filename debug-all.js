const fs = require('fs');
const path = require('path');

console.log('🔍 COMPREHENSIVE DEBUGGING FOR ALL ISSUES\n');
console.log('='.repeat(80));

// 1. Check players.json
console.log('\n1. PLAYERS.JSON CHECK:\n');
try {
    const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
    console.log(`✅ File exists, ${playersData.length} players`);
    
    // Show first player completely
    console.log('\nFirst player COMPLETE structure:');
    console.log(JSON.stringify(playersData[0], null, 2));
    
    // Check for Rajasthan Royals
    const rrPlayers = playersData.filter(p => 
        (p.team && p.team.toUpperCase().includes('RAJASTHAN')) ||
        (p['Team name'] && p['Team name'].toUpperCase().includes('RAJASTHAN'))
    );
    console.log(`\nRajasthan Royals players found: ${rrPlayers.length}`);
    
} catch (error) {
    console.log(`❌ Error: ${error.message}`);
}

// 2. Check server.js for critical functions
console.log('\n' + '='.repeat(80));
console.log('\n2. SERVER.JS CHECK:\n');

try {
    const serverContent = fs.readFileSync('server.js', 'utf8');
    
    // Check for critical functions
    const checks = {
        'startRetention function': serverContent.includes('socket.on(\'startRetention\'') || 
                                   serverContent.includes("socket.on('startRetention'"),
        'requestShuffle function': serverContent.includes('socket.on(\'requestShuffle\'') || 
                                   serverContent.includes("socket.on('requestShuffle'"),
        'teamAssigned event': serverContent.includes('io.to(user.id).emit(\'teamAssigned\'') || 
                               serverContent.includes('io.to(user.id).emit("teamAssigned"'),
        'IPL_TEAMS array': serverContent.includes('const IPL_TEAMS = [')
    };
    
    Object.entries(checks).forEach(([check, exists]) => {
        console.log(`${exists ? '✅' : '❌'} ${check}`);
    });
    
} catch (error) {
    console.log(`❌ Error: ${error.message}`);
}

// 3. Check HTML files
console.log('\n' + '='.repeat(80));
console.log('\n3. HTML FILES CHECK:\n');

const htmlFiles = ['rules.html', 'retention.html'];
htmlFiles.forEach(file => {
    const filePath = path.join('public', file);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        if (file === 'rules.html') {
            const hasShuffleBtn = content.includes('shuffleBtn') || content.includes('id="shuffleBtn"');
            const hasSocketListeners = content.includes('socket.on(\'teamAssigned\'') || 
                                       content.includes('socket.on("teamAssigned"');
            console.log(`✅ ${file} exists`);
            console.log(`   ${hasShuffleBtn ? '✅' : '❌'} Shuffle button code found`);
            console.log(`   ${hasSocketListeners ? '✅' : '❌'} Socket listeners found`);
        }
        
        if (file === 'retention.html') {
            const hasPlayersGrid = content.includes('playersGrid') || content.includes('id="playersGrid"');
            const hasSocketListeners = content.includes('socket.on(\'retentionStarted\'') || 
                                       content.includes('socket.on("retentionStarted"');
            console.log(`✅ ${file} exists`);
            console.log(`   ${hasPlayersGrid ? '✅' : '❌'} Players grid found`);
            console.log(`   ${hasSocketListeners ? '✅' : '❌'} Socket listeners found`);
        }
    } else {
        console.log(`❌ ${file} not found in public/`);
    }
});

console.log('\n' + '='.repeat(80));
console.log('✅ DEBUG COMPLETE');