const express = require('express');
const fs = require('fs');

const app = express();
const PORT = 3002;

app.get('/test-data', (req, res) => {
    try {
        const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
        
        // Simulate what server would send
        const testTeam = 'RAJASTHAN ROYALS';
        const teamPlayers = playersData.filter(player => {
            const playerTeam = (player.team || '').toString().toUpperCase().trim();
            return playerTeam === testTeam || playerTeam.includes('RAJASTHAN');
        });
        
        const formattedPlayers = teamPlayers.map(player => ({
            id: player.id || `test_${Math.random()}`,
            name: player.name || 'Test Player',
            team: player.team || testTeam,
            role: player.role || 'Batsman',
            nationality: player.nationality || 'Indian',
            basePrice: player.basePrice || 5.00
        }));
        
        res.json({
            success: true,
            message: 'Test data simulation',
            team: { id: 'rr', name: testTeam, color: '#FF4C93', logo: 'images/teams/RR.png' },
            rules: { maxIndian: 4, maxOverseas: 3 },
            players: formattedPlayers,
            playerCount: formattedPlayers.length,
            samplePlayer: formattedPlayers[0]
        });
        
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Test endpoint running on http://localhost:${PORT}/test-data`);
});