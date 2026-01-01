const fs = require('fs');

console.log('🧪 Creating test retention data...\n');

// Create test players
const testPlayers = [
    {
        id: 'rr_1',
        name: 'Sanju Samson',
        team: 'RAJASTHAN ROYALS',
        role: 'WK-Batsman',
        nationality: 'Indian',
        basePrice: 14.00
    },
    {
        id: 'rr_2',
        name: 'Jos Buttler',
        team: 'RAJASTHAN ROYALS',
        role: 'WK-Batsman',
        nationality: 'English',
        basePrice: 10.00
    },
    {
        id: 'rr_3',
        name: 'Yuzvendra Chahal',
        team: 'RAJASTHAN ROYALS',
        role: 'Spinner',
        nationality: 'Indian',
        basePrice: 6.50
    },
    {
        id: 'rr_4',
        name: 'Ravichandran Ashwin',
        team: 'RAJASTHAN ROYALS',
        role: 'All-rounder',
        nationality: 'Indian',
        basePrice: 5.00
    },
    {
        id: 'rr_5',
        name: 'Trent Boult',
        team: 'RAJASTHAN ROYALS',
        role: 'Fast Bowler',
        nationality: 'New Zealand',
        basePrice: 8.00
    }
];

// Save to players.json
fs.writeFileSync('players.json', JSON.stringify(testPlayers, null, 2));
console.log('✅ Created test players.json with 5 Rajasthan Royals players\n');

// Create test HTML file to directly test
const testHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Test Retention</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .player-card { border: 1px solid #ccc; padding: 10px; margin: 5px; cursor: pointer; }
        .selected { background: gold; }
    </style>
</head>
<body class="p-4">
    <h1 class="text-2xl font-bold mb-4">Direct Retention Test</h1>
    
    <div id="playersGrid" class="grid grid-cols-3 gap-4"></div>
    
    <script>
        const players = ${JSON.stringify(testPlayers)};
        const playersGrid = document.getElementById('playersGrid');
        
        players.forEach(player => {
            const card = document.createElement('div');
            card.className = 'player-card rounded p-4 bg-gray-100';
            card.innerHTML = \`
                <h3 class="font-bold">\${player.name}</h3>
                <p>Role: \${player.role}</p>
                <p>Nationality: \${player.nationality}</p>
                <p>Price: ₹\${player.basePrice} Cr</p>
            \`;
            playersGrid.appendChild(card);
        });
        
        console.log('Test players loaded:', players);
        alert('Test page loaded with ' + players.length + ' players');
    </script>
</body>
</html>
`;

fs.writeFileSync('public/test-retention.html', testHTML);
console.log('✅ Created test-retention.html in public folder');
console.log('\n🌐 Open this URL to test: http://localhost:3000/test-retention.html');
console.log('\n📋 Test players include:');
testPlayers.forEach((p, i) => {
    console.log(`  ${i+1}. ${p.name} - ${p.nationality} (${p.role})`);
});