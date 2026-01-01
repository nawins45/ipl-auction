const fs = require('fs');

console.log('🧪 FINAL TEST - Verifying fixed players.json\n');

try {
    const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
    
    console.log(`Total players: ${playersData.length}\n`);
    
    // Find Rajasthan Royals players
    const rrPlayers = playersData.filter(p => 
        p.team && p.team.toUpperCase().includes('RAJASTHAN')
    );
    
    console.log(`RAJASTHAN ROYALS players: ${rrPlayers.length}`);
    
    if (rrPlayers.length > 0) {
        console.log('\nSample Rajasthan Royals players:');
        rrPlayers.slice(0, 3).forEach((player, i) => {
            console.log(`\n${i + 1}. ${player.name}`);
            console.log(`   Role: ${player.role}`);
            console.log(`   Nationality: ${player.nationality}`);
            console.log(`   Is Indian: ${player.nationality.toLowerCase() === 'indian' ? '✅ YES' : '❌ NO'}`);
            console.log(`   Base Price: ₹${player.basePrice} Cr`);
        });
    }
    
    // Check field names
    console.log('\n🔍 VERIFYING FIELD NAMES:');
    const sample = playersData[0];
    const requiredFields = ['name', 'team', 'role', 'nationality', 'basePrice'];
    
    requiredFields.forEach(field => {
        if (sample[field]) {
            console.log(`✅ ${field}: "${sample[field]}"`);
        } else {
            console.log(`❌ ${field}: MISSING`);
        }
    });
    
    // Check Indian vs Overseas
    console.log('\n🌍 INDIAN VS OVERSEAS COUNT:');
    let indianCount = 0;
    let overseasCount = 0;
    
    playersData.forEach(player => {
        const nat = (player.nationality || '').toString().toLowerCase().trim();
        if (nat === 'indian' || nat === 'india' || nat === 'ind') {
            indianCount++;
        } else {
            overseasCount++;
        }
    });
    
    console.log(`Indian players: ${indianCount}`);
    console.log(`Overseas players: ${overseasCount}`);
    console.log(`Total: ${indianCount + overseasCount}`);
    
} catch (error) {
    console.log(`❌ Error: ${error.message}`);
}