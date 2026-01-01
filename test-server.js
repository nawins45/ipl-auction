const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

app.use(express.static('public'));

// Simple endpoint to test player data
app.get('/api/test-players', (req, res) => {
    try {
        const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));
        
        // Get team from query parameter
        const teamName = req.query.team || 'RAJASTHAN ROYALS';
        
        // Find players for the team
        const teamPlayers = playersData.filter(player => {
            const playerTeam = (player.team || player['Team name'] || '').toUpperCase().trim();
            return playerTeam === teamName.toUpperCase().trim();
        });
        
        res.json({
            success: true,
            teamName: teamName,
            totalPlayers: playersData.length,
            teamPlayersCount: teamPlayers.length,
            teamPlayers: teamPlayers.slice(0, 10), // First 10 only
            allTeams: [...new Set(playersData.map(p => p.team || p['Team name']).filter(Boolean))]
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint to see raw players.json
app.get('/api/raw-players', (req, res) => {
    try {
        const rawData = fs.readFileSync('players.json', 'utf8');
        const playersData = JSON.parse(rawData);
        
        res.json({
            success: true,
            totalPlayers: playersData.length,
            firstPlayer: playersData[0],
            allFieldNames: Object.keys(playersData[0] || {})
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Test server running on http://localhost:${PORT}`);
    console.log(`📊 Test endpoints:`);
    console.log(`   http://localhost:${PORT}/api/test-players`);
    console.log(`   http://localhost:${PORT}/api/test-players?team=CHENNAI SUPER KINGS`);
    console.log(`   http://localhost:${PORT}/api/raw-players`);
});