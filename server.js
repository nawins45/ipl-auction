const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static('public'));

// Load players data SAFELY
let playersData = [];
try {
    const rawData = fs.readFileSync('players.json', 'utf8');
    playersData = JSON.parse(rawData);
    console.log(`✅ Loaded ${playersData.length} players from players.json`);
} catch (error) {
    console.error('⚠️ Error loading players.json, using empty array:', error.message);
    playersData = [];
}

// IPL Teams
const IPL_TEAMS = [
    { id: 'csk', name: 'CHENNAI SUPER KINGS', color: '#FFCC00', logo: 'images/teams/CSK.png' },
    { id: 'mi', name: 'MUMBAI INDIANS', color: '#0048A0', logo: 'images/teams/MI.png' },
    { id: 'rcb', name: 'ROYAL CHALLENGERS BANGALORE', color: '#D5152C', logo: 'images/teams/RCB.png' },
    { id: 'kkr', name: 'KOLKATA KNIGHT RIDERS', color: '#3A225D', logo: 'images/teams/KKR.png' },
    { id: 'dc', name: 'DELHI CAPITALS', color: '#004C93', logo: 'images/teams/DC.png' },
    { id: 'pbks', name: 'PUNJAB KINGS', color: '#ED1B24', logo: 'images/teams/PBKS.png' },
    { id: 'rr', name: 'RAJASTHAN ROYALS', color: '#FF4C93', logo: 'images/teams/RR.png' },
    { id: 'srh', name: 'SUNRISERS HYDERABAD', color: '#FF6F3D', logo: 'images/teams/SRH.png' },
    { id: 'gt', name: 'GUJARAT TITANS', color: '#1E2D4A', logo: 'images/teams/GT.png' },
    { id: 'lsg', name: 'LUCKNOW SUPER GIANTS', color: '#A5E1F4', logo: 'images/teams/LSG.png' }
];

// ========== AUCTION POOL CONSTANTS ==========
const playerCategories = [
    'MARQUEE',
    'WK',
    'BAT',
    'AR',
    'SPIN',
    'FAST',
    'UNSOLD'
];

// Auction state storage
const auctionStates = {};
const rooms = {};

// Generate room code
function generateRoomCode() {
    return 'IPL' + Math.floor(100 + Math.random() * 900);
}

// Find team field name in players data
function findTeamFieldName() {
    if (playersData.length === 0) return 'team';
    
    const firstPlayer = playersData[0];
    for (const key in firstPlayer) {
        if (key.toLowerCase().includes('team')) {
            return key;
        }
    }
    return 'team';
}

// Normalize team name for matching
function normalizeTeamName(teamName) {
    if (!teamName) return null;
    
    const upper = teamName.toString().toUpperCase().trim();
    
    // Handle common variations
    if (upper === 'SRH' || upper.includes('SUNRISERS')) {
        return 'SUNRISERS HYDERABAD';
    }
    if (upper === 'MI' || upper.includes('MUMBAI')) {
        return 'MUMBAI INDIANS';
    }
    if (upper === 'CSK' || upper.includes('CHENNAI')) {
        return 'CHENNAI SUPER KINGS';
    }
    if (upper === 'RCB' || upper.includes('ROYAL')) {
        return 'ROYAL CHALLENGERS BANGALORE';
    }
    if (upper === 'KKR' || upper.includes('KOLKATA')) {
        return 'KOLKATA KNIGHT RIDERS';
    }
    if (upper === 'DC' || upper.includes('DELHI')) {
        return 'DELHI CAPITALS';
    }
    if (upper === 'PBKS' || upper.includes('PUNJAB')) {
        return 'PUNJAB KINGS';
    }
    if (upper === 'RR' || upper.includes('RAJASTHAN')) {
        return 'RAJASTHAN ROYALS';
    }
    if (upper === 'GT' || upper.includes('GUJARAT')) {
        return 'GUJARAT TITANS';
    }
    if (upper === 'LSG' || upper.includes('LUCKNOW')) {
        return 'LUCKNOW SUPER GIANTS';
    }
    
    return upper;
}

// ========== AUCTION POOL FUNCTIONS ==========

// Initialize auction for room
function initializeAuction(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    
    // Get all players from players.json
    const allPlayers = [...playersData];
    
    // Get retained players
    const retainedPlayers = [];
    Object.values(room.users).forEach(user => {
        if (user.retainedPlayers && user.retainedPlayers.length > 0) {
            retainedPlayers.push(...user.retainedPlayers.map(p => p.id || p.name));
        }
    });
    
    // Filter out retained players
    const auctionPool = allPlayers.filter(player => {
        const playerId = player['player name']?.replace(/\s+/g, '_') || player.name;
        return !retainedPlayers.includes(playerId);
    });
    
    // Categorize players
    const categorizedPlayers = {
        'MARQUEE': [],
        'WK': [],
        'BAT': [],
        'AR': [],
        'SPIN': [],
        'FAST': [],
        'UNSOLD': []
    };
    
    auctionPool.forEach(player => {
        const playerObj = formatPlayerForAuction(player);
        
        // Marquee players
        if (player.marquee === 'YES' || player.marquee === true) {
            categorizedPlayers['MARQUEE'].push(playerObj);
            return;
        }
        
        // Wicket Keepers
        if (player['player role']?.includes('WK') || player.role?.includes('WK')) {
            categorizedPlayers['WK'].push(playerObj);
            return;
        }
        
        // Batsmen
        if (player['player role']?.includes('BAT') || player.role?.includes('BAT')) {
            categorizedPlayers['BAT'].push(playerObj);
            return;
        }
        
        // All-Rounders
        if (player['player role']?.includes('AR') || player.role?.includes('AR')) {
            categorizedPlayers['AR'].push(playerObj);
            return;
        }
        
        // Bowlers
        const bowlingType = player['bowling type'] || player.bowlingType;
        if (bowlingType === 'SPIN' || bowlingType?.includes('SPIN')) {
            categorizedPlayers['SPIN'].push(playerObj);
        } else if (bowlingType === 'FAST' || bowlingType?.includes('FAST')) {
            categorizedPlayers['FAST'].push(playerObj);
        }
    });
    
    // Initialize auction state
    auctionStates[roomCode] = {
        categorizedPlayers,
        currentCategory: 'MARQUEE',
        currentCategoryIndex: 0,
        currentPlayerIndex: 0,
        unsoldPlayers: [],
        currentBid: 0,
        currentBidder: null,
        bidHistory: []
    };
    
    console.log(`✅ Auction initialized for room ${roomCode}`);
    console.log(`📊 Players by category:`);
    Object.entries(categorizedPlayers).forEach(([cat, players]) => {
        console.log(`   ${cat}: ${players.length} players`);
    });
    
    return auctionStates[roomCode];
}

// Format player for auction
function formatPlayerForAuction(player) {
    const basePrice = parseFloat(player['Base price']?.replace('cr', '')?.replace('Cr', '') || '2');
    
    return {
        id: player['player name']?.replace(/\s+/g, '_') || player.id,
        name: player['player name'] || player.name,
        role: player['player role'] || player.role,
        bowlingType: player['bowling type'] || player.bowlingType,
        nationality: player.Nationality || player.nationality,
        originalTeam: normalizeTeamName(player['Team name'] || player.team),
        basePrice: basePrice,
        
        // Stats
        totalRuns: player['total runs'] || player.totalRuns || 0,
        strikeRate: player['strike rate'] || player.strikeRate || 0,
        wickets: player.wickets || 0,
        economyRate: player['economy rate'] || player.economyRate || 0,
        highestScore: player['highest score'] || player.highestScore,
        
        // Auction state
        currentBid: basePrice,
        currentBidder: null,
        sold: false,
        soldTo: null,
        soldPrice: 0
    };
}

// Start auction for room
function startAuctionForRoom(roomCode) {
    const auction = auctionStates[roomCode];
    if (!auction) return;
    
    auction.currentCategoryIndex = 0;
    auction.currentCategory = playerCategories[0];
    auction.currentPlayerIndex = 0;
    
    const players = auction.categorizedPlayers[auction.currentCategory];
    if (players.length > 0) {
        startPlayerAuction(roomCode, players[0]);
    } else {
        moveToNextCategory(roomCode);
    }
}

// Start auction for a player
function startPlayerAuction(roomCode, player) {
    const auction = auctionStates[roomCode];
    if (!auction) return;

    const players = auction.categorizedPlayers[auction.currentCategory];
    const currentPlayer = players[auction.currentPlayerIndex];

    if (!currentPlayer) return;

    auction.currentBid = currentPlayer.basePrice;
    auction.currentBidder = null;
    auction.bidHistory = []; // Clear bid history for new player
    auction.currentPlayer = currentPlayer;

    // Emit to ALL users including auctioneer
    io.to(roomCode).emit('playerUpForAuction', {
        player: {
            id: currentPlayer.id,
            name: currentPlayer.name,
            role: currentPlayer.role,
            bowlingType: currentPlayer.bowlingType,
            nationality: currentPlayer.nationality,
            basePrice: currentPlayer.basePrice,
            currentBid: auction.currentBid,
            currentBidder: null,
            totalRuns: currentPlayer.totalRuns || 0,
            strikeRate: currentPlayer.strikeRate || 0,
            wickets: currentPlayer.wickets || 0,
            economyRate: currentPlayer.economyRate || 0,
            originalTeam: currentPlayer.originalTeam
        },
        category: auction.currentCategory
    });

    console.log(`🎯 Player Up: ${currentPlayer.name} | Base: ₹${currentPlayer.basePrice} Cr`);
}

// Handle bid with validation
function handleBid(roomCode, data, socket) {
    const auction = auctionStates[roomCode];
    const room = rooms[roomCode];
    
    if (!auction || !room) {
        console.log('❌ No auction or room found');
        socket.emit('bidError', { message: 'Auction not found' });
        return;
    }

    const { team, bid, playerId } = data;
    
    console.log(`💰 Bid attempt: ${team} bidding ₹${bid} Cr`);
    console.log(`   Current bid: ₹${auction.currentBid} Cr, Current bidder: ${auction.currentBidder}`);

    // Get user data
    const user = Object.values(room.users).find(u => u.team?.id === team);
    if (!user) {
        socket.emit('bidError', { message: 'User not found' });
        return;
    }

    // BUDGET VALIDATION
    if (bid > user.budget) {
        console.log(`❌ Insufficient funds: ${user.budget} < ${bid}`);
        socket.emit('bidError', { 
            message: `Insufficient funds! Your budget: ₹${user.budget} Cr` 
        });
        return;
    }

    // SQUAD SIZE VALIDATION
    const squadSize = (user.retainedPlayers?.length || 0) + (user.auctionPlayers?.length || 0);
    const maxSquad = room.rules?.squadSize || 25;
    
    if (squadSize >= maxSquad) {
        console.log(`❌ Squad full: ${squadSize}/${maxSquad}`);
        socket.emit('bidError', { 
            message: `Squad full! Maximum ${maxSquad} players allowed` 
        });
        return;
    }

    // BID AMOUNT VALIDATION
    if (bid <= auction.currentBid) {
        console.log(`❌ Bid too low: ${bid} <= ${auction.currentBid}`);
        socket.emit('bidError', { 
            message: `Bid must be higher than current bid (₹${auction.currentBid} Cr)` 
        });
        return;
    }

    // Update auction state
    auction.currentBid = bid;
    auction.currentBidder = team;
    
    // Add to bid history
    auction.bidHistory.push({
        team: team,
        bid: bid,
        time: new Date().toISOString()
    });

    console.log(`✅ New bid accepted: ${team} bid ₹${bid} Cr`);
    console.log(`   User budget: ₹${user.budget} Cr, Squad size: ${squadSize}/${maxSquad}`);

    // Update ALL users
    io.to(roomCode).emit('bidUpdate', {
        team: team,
        bid: bid,
        playerId: playerId || auction.currentPlayer?.id,
        player: auction.currentPlayer
    });

    // Send auction update
    const players = auction.categorizedPlayers[auction.currentCategory];
    const playersLeft = players.length - auction.currentPlayerIndex - 1;

    io.to(roomCode).emit('auctionUpdate', {
        currentBid: auction.currentBid,
        currentBidder: auction.currentBidder,
        category: auction.currentCategory,
        playersLeft: playersLeft,
        unsoldCount: auction.unsoldPlayers.length,
        player: auction.currentPlayer
    });
}

// Handle player sold
function handlePlayerSold(roomCode) {
    const room = rooms[roomCode];
    const auction = auctionStates[roomCode];
    
    if (!room || !auction) return;
    
    const players = auction.categorizedPlayers[auction.currentCategory];
    const currentPlayer = players[auction.currentPlayerIndex];
    
    if (!currentPlayer || !auction.currentBidder) {
        // Mark as unsold
        handlePlayerUnsold(roomCode);
        return;
    }
    
    // Update player state
    currentPlayer.sold = true;
    currentPlayer.soldTo = auction.currentBidder;
    currentPlayer.soldPrice = auction.currentBid;
    
    // Update team data
    const buyingTeam = auction.currentBidder;
    const user = Object.values(room.users).find(u => u.team?.id === buyingTeam);
    
    if (user) {
        // Initialize arrays if not exists
        if (!user.auctionPlayers) user.auctionPlayers = [];
        if (user.budget === undefined) user.budget = 100;
        if (user.rtmCards === undefined) user.rtmCards = room.rules?.rtmCards || 2;
        
        const isOverseas = currentPlayer.nationality?.toString().toLowerCase() !== 'indian';
        
        // Add player to auction purchases
        user.auctionPlayers.push({
            id: currentPlayer.id,
            name: currentPlayer.name,
            role: currentPlayer.role,
            price: currentPlayer.soldPrice,
            isOverseas: isOverseas
        });
        
        // Deduct from budget
        user.budget -= currentPlayer.soldPrice;
        
        console.log(`💰 PURSE UPDATE: ${user.username} (${buyingTeam})`);
        console.log(`   Budget: ₹${user.budget} Cr (Deducted: ₹${currentPlayer.soldPrice} Cr)`);
        
        // Send squad update to buying team
        const squadData = getUserSquad(roomCode, user.username);
        if (squadData) {
            io.to(user.socketId).emit('squadUpdate', squadData);
        }
    }
    
    // Broadcast sale to ALL
    io.to(roomCode).emit('playerSold', {
        player: currentPlayer.name,
        team: buyingTeam,
        price: currentPlayer.soldPrice,
        isOverseas: currentPlayer.nationality?.toString().toLowerCase() !== 'indian',
        buyerUsername: user?.username || 'Unknown'
    });
    
    console.log(`✅ ${currentPlayer.name} SOLD to ${buyingTeam} for ₹${currentPlayer.soldPrice} Cr`);
    
    // Check for RTM - ONLY if player has original team and it's different from buying team
    if (currentPlayer.originalTeam && 
        normalizeTeamName(currentPlayer.originalTeam) !== buyingTeam) {
        
        // Find original team's user
        const originalTeam = currentPlayer.originalTeam;
        const originalTeamUser = Object.values(room.users).find(u => 
            u.team && normalizeTeamName(u.team.name) === originalTeam
        );
        
        if (originalTeamUser && (originalTeamUser.rtmCards || 0) > 0) {
            // Trigger RTM after 3 seconds
            setTimeout(() => {
                triggerRTM(roomCode, currentPlayer, auction.currentBid);
            }, 3000);
            return; // Wait for RTM decision
        }
    }
    
    // No RTM, move to next player after delay
    setTimeout(() => {
        moveToNextPlayer(roomCode);
    }, 3000);
}

// Handle player unsold
function handlePlayerUnsold(roomCode) {
    const auction = auctionStates[roomCode];
    if (!auction) return;
    
    const players = auction.categorizedPlayers[auction.currentCategory];
    const currentPlayer = players[auction.currentPlayerIndex];
    
    if (!currentPlayer) return;
    
    // Add to unsold players
    auction.unsoldPlayers.push(currentPlayer);
    
    // Broadcast unsold
    io.to(roomCode).emit('playerUnsold', {
        player: currentPlayer.name,
        category: auction.currentCategory
    });
    
    console.log(`❌ ${currentPlayer.name} UNSOLD`);
    
    // Move to next player after delay
    setTimeout(() => {
        moveToNextPlayer(roomCode);
    }, 2000);
}

// Move to next player
function moveToNextPlayer(roomCode) {
    const auction = auctionStates[roomCode];
    if (!auction) return;

    const players = auction.categorizedPlayers[auction.currentCategory];
    
    auction.currentPlayerIndex++;

    // If players remain in same category
    if (auction.currentPlayerIndex < players.length) {
        startPlayerAuction(roomCode, players[auction.currentPlayerIndex]);
        return;
    }

    // Otherwise move to next category
    moveToNextCategory(roomCode);
}

// Move to next category
function moveToNextCategory(roomCode) {
    const auction = auctionStates[roomCode];
    if (!auction) return;
    
    auction.currentCategoryIndex++;
    
    if (auction.currentCategoryIndex >= playerCategories.length) {
        // All categories done, auction complete
        handleAuctionComplete(roomCode);
        return;
    }
    
    auction.currentCategory = playerCategories[auction.currentCategoryIndex];
    auction.currentPlayerIndex = 0;
    
    const players = auction.categorizedPlayers[auction.currentCategory];
    
    // If category has players, start auction
    if (players.length > 0) {
        // Add unsold players from previous category
        if (auction.currentCategory === 'UNSOLD' && auction.unsoldPlayers.length > 0) {
            auction.categorizedPlayers['UNSOLD'] = [...auction.unsoldPlayers];
            auction.unsoldPlayers = [];
        }
        
        const firstPlayer = players[0];
        startPlayerAuction(roomCode, firstPlayer);
    } else {
        // Empty category, move to next
        moveToNextCategory(roomCode);
    }
}

// Trigger RTM
function triggerRTM(roomCode, player, winningBid) {
    const room = rooms[roomCode];
    if (!room) return;
    
    // Find original team's user
    const originalTeam = player.originalTeam;
    const originalTeamUser = Object.values(room.users).find(u => 
        u.team && normalizeTeamName(u.team.name) === originalTeam
    );
    
    if (!originalTeamUser || (originalTeamUser.rtmCards || 0) <= 0) {
        console.log(`⚠️ No RTM possible for ${player.name}`);
        moveToNextPlayer(roomCode);
        return;
    }
    
    console.log(`🔄 RTM triggered for ${player.name}. Original team: ${originalTeam}`);
    
    // Send RTM trigger to original team ONLY
    io.to(originalTeamUser.socketId).emit('rtmTriggered', {
        player: player.name,
        playerId: player.id,
        originalTeam: originalTeam,
        winningBid: winningBid,
        winningTeam: player.soldTo,
        timeout: 30 // 30 seconds to decide
    });
    
    // Set RTM timeout (30 seconds to decide)
    const rtmTimeout = setTimeout(() => {
        console.log(`⏰ RTM timeout for ${player.name}`);
        // Auto-reject if no decision
        handleRTMDecision(roomCode, {
            playerId: player.id,
            rtmAmount: 0,
            accept: false
        }, { id: originalTeamUser.socketId });
    }, 30000);
    
    // Store timeout reference
    player.rtmTimeout = rtmTimeout;
}

// Handle RTM decision
function handleRTMDecision(roomCode, data, socket) {
    const { playerId, rtmAmount, accept } = data;
    const room = rooms[roomCode];
    const auction = auctionStates[roomCode];
    
    if (!room || !auction) return;
    
    // Find player
    let player = null;
    for (const category of playerCategories) {
        const players = auction.categorizedPlayers[category];
        const found = players.find(p => p.id === playerId);
        if (found) {
            player = found;
            break;
        }
    }
    
    if (!player) return;
    
    // Clear RTM timeout
    if (player.rtmTimeout) {
        clearTimeout(player.rtmTimeout);
        delete player.rtmTimeout;
    }
    
    const originalTeam = player.originalTeam;
    const originalTeamUser = Object.values(room.users).find(u => 
        u.team && normalizeTeamName(u.team.name) === originalTeam
    );
    
    if (!originalTeamUser) {
        moveToNextPlayer(roomCode);
        return;
    }
    
    if (accept && rtmAmount >= player.soldPrice && Number.isInteger(rtmAmount)) {
        // RTM ACCEPTED - Validate budget
        if (rtmAmount > originalTeamUser.budget) {
            socket.emit('rtmError', { 
                message: `Insufficient funds! Your budget: ₹${originalTeamUser.budget} Cr` 
            });
            moveToNextPlayer(roomCode);
            return;
        }
        
        // Validate RTM cards
        if ((originalTeamUser.rtmCards || 0) <= 0) {
            socket.emit('rtmError', { message: 'No RTM cards remaining' });
            moveToNextPlayer(roomCode);
            return;
        }
        
        // RTM accepted - Process
        originalTeamUser.rtmCards = (originalTeamUser.rtmCards || 2) - 1;
        
        // Update player sale
        player.soldTo = originalTeamUser.team.id;
        player.soldPrice = rtmAmount;
        
        // Update original team data
        if (!originalTeamUser.auctionPlayers) originalTeamUser.auctionPlayers = [];
        const isOverseas = player.nationality?.toString().toLowerCase() !== 'indian';
        originalTeamUser.auctionPlayers.push({
            id: player.id,
            name: player.name,
            role: player.role,
            price: rtmAmount,
            isOverseas: isOverseas
        });
        
        // Deduct from budget
        originalTeamUser.budget -= rtmAmount;
        
        // Remove from winning team and refund
        const winningTeamUser = Object.values(room.users).find(u => 
            u.team?.id === player.soldTo
        );
        if (winningTeamUser && winningTeamUser.auctionPlayers) {
            winningTeamUser.auctionPlayers = winningTeamUser.auctionPlayers.filter(
                p => p.id !== player.id
            );
            winningTeamUser.budget += player.soldPrice;
            
            // Update winning team's squad
            const winningSquad = getUserSquad(roomCode, winningTeamUser.username);
            if (winningSquad) {
                io.to(winningTeamUser.socketId).emit('squadUpdate', winningSquad);
            }
        }
        
        // Broadcast RTM result to ALL
        io.to(roomCode).emit('rtmResult', {
            success: true,
            player: player.name,
            originalTeam: originalTeamUser.team.name,
            rtmAmount: rtmAmount,
            previousTeam: winningTeamUser?.team?.name || 'Unknown'
        });
        
        // Send squad update to original team
        const originalSquad = getUserSquad(roomCode, originalTeamUser.username);
        if (originalSquad) {
            io.to(originalTeamUser.socketId).emit('squadUpdate', originalSquad);
        }
        
        console.log(`✅ ${player.name} retained by ${originalTeam} via RTM for ₹${rtmAmount} Cr`);
    } else {
        // RTM rejected
        io.to(roomCode).emit('rtmResult', {
            success: false,
            player: player.name,
            originalTeam: originalTeamUser.team.name,
            winningTeam: player.soldTo
        });
        
        console.log(`🔄 ${player.name} goes to ${player.soldTo} (RTM rejected)`);
    }
    
    // Move to next player after RTM decision
    setTimeout(() => {
        moveToNextPlayer(roomCode);
    }, 2000);
}

// Send auction update to all
function sendAuctionUpdate(roomCode) {
    const auction = auctionStates[roomCode];
    if (!auction) return;
    
    const players = auction.categorizedPlayers[auction.currentCategory];
    const playersLeft = players.length - auction.currentPlayerIndex - 1;
    
    io.to(roomCode).emit('auctionUpdate', {
        category: auction.currentCategory,
        playersLeft: playersLeft,
        unsoldCount: auction.unsoldPlayers.length,
        currentBid: auction.currentBid,
        currentBidder: auction.currentBidder
    });
}

// Handle auction complete
function handleAuctionComplete(roomCode) {
    console.log(`🏆 Auction complete for room ${roomCode}`);
    
    io.to(roomCode).emit('auctionComplete', {
        message: 'Auction pool completed! Redirecting to playing 11 selection...'
    });
    
    // Redirect all users to playing 11
    setTimeout(() => {
        io.to(roomCode).emit('redirectToPlaying11', {
            roomCode: roomCode
        });
    }, 3000);
    
    // Clean up auction state
    delete auctionStates[roomCode];
}

// Get squad for user
function getUserSquad(roomCode, username) {
    const room = rooms[roomCode];
    if (!room) return null;
    
    const user = room.users[username];
    if (!user) return null;
    
    // Calculate squad size
    const retainedCount = user.retainedPlayers?.length || 0;
    const auctionCount = user.auctionPlayers?.length || 0;
    const totalPlayers = retainedCount + auctionCount;
    
    // Calculate overseas count
    let overseasCount = 0;
    if (user.retainedPlayers) {
        overseasCount += user.retainedPlayers.filter(p => p.isOverseas).length;
    }
    if (user.auctionPlayers) {
        overseasCount += user.auctionPlayers.filter(p => p.isOverseas).length;
    }
    
    const indianCount = totalPlayers - overseasCount;
    
    return {
        team: user.team,
        retainedPlayers: user.retainedPlayers || [],
        auctionPlayers: user.auctionPlayers || [],
        budget: user.budget || 100,
        rtmCards: user.rtmCards || 2,
        squadLimits: {
            total: totalPlayers,
            indian: indianCount,
            overseas: overseasCount,
            maxSquad: room.rules?.squadSize || 25,
            maxIndian: room.rules?.maxIndian || 4,
            maxOverseas: room.rules?.maxOverseas || 3
        }
    };
}

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log(`✅ New connection: ${socket.id}`);

    // Create room
    socket.on('createRoom', () => {
        try {
            const roomCode = generateRoomCode();
            rooms[roomCode] = {
                code: roomCode,
                auctioneer: socket.id,
                users: {},
                auctioneerSocket: socket.id,
                rules: null,
                teamsAssigned: false,
                retentionStarted: false,
                retentionSubmissions: {}
            };
            socket.join(roomCode);
            socket.emit('roomCreated', { roomCode });
            console.log(`✅ Room created: ${roomCode}`);
        } catch (error) {
            console.error('❌ Error creating room:', error);
            socket.emit('error', { message: 'Failed to create room' });
        }
    });

    // Join room with reconnection logic
    socket.on('joinRoom', (data) => {
        try {
            const { username, roomCode } = data;
            const room = rooms[roomCode];

            // Room must exist
            if (!room) {
                socket.emit('joinError', { message: 'Room not found' });
                return;
            }

            // Check if user already exists (reconnection)
            if (room.users[username]) {
                const user = room.users[username];
                
                // Update socket ID and connection status
                user.socketId = socket.id;
                user.connected = true;
                socket.join(roomCode);
                
                // Send success response
                socket.emit('joinSuccess', { 
                    username, 
                    roomCode,
                    isReconnect: true
                });
                
                // Notify auctioneer
                if (room.auctioneerSocket) {
                    io.to(room.auctioneerSocket).emit('userReconnected', {
                        username,
                        totalUsers: Object.keys(room.users).length
                    });
                }
                
                console.log(`🔁 Reconnected user: ${username} (${roomCode})`);
                
                // Send current room state
                if (room.rules) {
                    socket.emit('rulesUpdated', { rules: room.rules });
                }
                
                if (user.team) {
                    socket.emit('teamAssigned', {
                        team: user.team,
                        canShuffle: !user.hasShuffled
                    });
                }
                
                if (room.retentionStarted) {
                    socket.emit('redirectToRetention', {
                        duration: 90,
                        roomCode: roomCode
                    });
                }
                
                return;
            }

            // NEW USER JOIN
            room.users[username] = {
                username,
                socketId: socket.id,
                team: null,
                hasShuffled: false,
                retentionSubmitted: false,
                retainedPlayers: [],
                connected: true,
                budget: 100,
                rtmCards: 2,
                auctionPlayers: [],
                purse: 100 // Initial purse
            };

            socket.join(roomCode);
            socket.emit('joinSuccess', { username, roomCode });

            // Notify auctioneer
            if (room.auctioneerSocket) {
                io.to(room.auctioneerSocket).emit('userJoined', {
                    username,
                    totalUsers: Object.keys(room.users).length
                });
            }

            console.log(`👤 New user joined: ${username} (${roomCode})`);

        } catch (error) {
            console.error('❌ Error in joinRoom:', error);
            socket.emit('joinError', {
                message: 'Failed to join room'
            });
        }
    });

    // Set rules
    socket.on('setRules', (data) => {
        try {
            const { roomCode, rules } = data;
            const room = rooms[roomCode];
            
            if (room && socket.id === room.auctioneerSocket) {
                room.rules = rules;
                io.to(roomCode).emit('rulesUpdated', { rules });
                console.log(`✅ Rules set for room ${roomCode}`);
            }
        } catch (error) {
            console.error('❌ Error setting rules:', error);
        }
    });

    // Assign teams
    socket.on('assignTeams', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            
            if (room && socket.id === room.auctioneerSocket && !room.teamsAssigned) {
                const users = Object.values(room.users);
                const availableTeams = [...IPL_TEAMS];
                
                // Shuffle teams
                users.forEach(user => {
                    const randomIndex = Math.floor(Math.random() * availableTeams.length);
                    user.team = availableTeams.splice(randomIndex, 1)[0];
                    user.hasShuffled = false;
                    
                    // Notify user
                    io.to(user.socketId).emit('teamAssigned', {
                        username: user.username, 
                        team: user.team,
                        canShuffle: true 
                    });
                });
                
                room.teamsAssigned = true;
                
                // Notify auctioneer
                const teamMapping = users.map(user => ({
                    username: user.username,
                    team: user.team.name
                }));
                io.to(room.auctioneerSocket).emit('teamMapping', { mapping: teamMapping });
                
                console.log(`✅ Teams assigned for room ${roomCode}`);
            }
        } catch (error) {
            console.error('❌ Error assigning teams:', error);
        }
    });

    // Shuffle team
    socket.on('requestShuffle', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            const user = Object.values(room.users).find(u => u.socketId === socket.id);
            
            if (!room || !user) {
                socket.emit('shuffleError', { message: 'Room or user not found' });
                return;
            }
            
            if (user.hasShuffled) {
                socket.emit('shuffleError', { message: 'Already shuffled' });
                return;
            }
            
            if (!room.teamsAssigned) {
                socket.emit('shuffleError', { message: 'Teams not assigned' });
                return;
            }
            
            // Get available teams (excluding current team)
            const assignedTeams = Object.values(room.users)
                .filter(u => u.username !== user.username && u.team)
                .map(u => u.team.id);
            
            const availableTeams = IPL_TEAMS.filter(team => 
                team.id !== user.team.id && !assignedTeams.includes(team.id)
            );
            
            if (availableTeams.length === 0) {
                socket.emit('shuffleError', { message: 'No teams available' });
                return;
            }
            
            // Assign new team
            const randomIndex = Math.floor(Math.random() * availableTeams.length);
            user.team = availableTeams[randomIndex];
            user.hasShuffled = true;
            
            // Notify user
            socket.emit('teamAssigned', { 
                team: user.team,
                canShuffle: false 
            });
            
            // Notify auctioneer
            io.to(room.auctioneerSocket).emit('teamShuffled', {
                username: user.username,
                team: user.team.name
            });
            
        } catch (error) {
            console.error('❌ Error shuffling team:', error);
            socket.emit('shuffleError', { message: 'Shuffle failed' });
        }
    });

    // Force shuffle
    socket.on('forceShuffle', (data) => {
        try {
            const { roomCode, username } = data;
            const room = rooms[roomCode];
            
            if (!room || socket.id !== room.auctioneerSocket) {
                socket.emit('error', { message: 'Only auctioneer can force shuffle' });
                return;
            }
            
            const user = room.users[username];
            if (!user) {
                socket.emit('error', { message: 'User not found' });
                return;
            }
            
            console.log(`🔀 Force shuffling team for ${username}`);
            
            // Get all assigned teams
            const assignedTeams = Object.values(room.users)
                .filter(u => u.username !== username && u.team)
                .map(u => u.team.id);
            
            // Get available teams (excluding current team)
            const availableTeams = IPL_TEAMS.filter(team => 
                team.id !== user.team?.id && !assignedTeams.includes(team.id)
            );
            
            if (availableTeams.length === 0) {
                socket.emit('error', { message: 'No teams available for shuffle' });
                return;
            }
            
            // Assign new random team
            const randomIndex = Math.floor(Math.random() * availableTeams.length);
            const oldTeam = user.team;
            user.team = availableTeams[randomIndex];
            user.hasShuffled = true;
            
            // Notify the user
            io.to(user.socketId).emit('teamAssigned', {
                team: user.team,
                canShuffle: false
            });
            
            // Notify auctioneer
            io.to(room.auctioneerSocket).emit('forceShuffleResult', {
                username: username,
                oldTeam: oldTeam?.name,
                team: user.team.name
            });
            
            console.log(`✅ ${username} shuffled from ${oldTeam?.name} to ${user.team.name}`);
            
        } catch (error) {
            console.error('❌ Error force shuffling:', error);
            socket.emit('error', { message: 'Failed to force shuffle' });
        }
    });

    // Join retention page
    socket.on('joinRetention', (data) => {
        try {
            const { roomCode, username } = data;
            const room = rooms[roomCode];
            
            console.log(`🔄 User ${username} joining retention for room ${roomCode}`);
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            // Find user in room
            const user = Object.values(room.users).find(u => u.username === username);
            if (!user) {
                socket.emit('error', { message: 'User not found in room' });
                return;
            }
            
            // Update socket ID (reconnection)
            user.socketId = socket.id;
            socket.join(roomCode);
            
            console.log(`✅ ${username} joined retention successfully`);
            
            // If retention already started, send data
            if (room.retentionStarted && user.team) {
                const teamFieldName = findTeamFieldName();
                const teamPlayers = playersData.filter(player => {
                    try {
                        if (!player || !player[teamFieldName]) return false;
                        
                        const playerTeam = player[teamFieldName].toString().trim();
                        const normalizedPlayerTeam = normalizeTeamName(playerTeam);
                        const normalizedUserTeam = normalizeTeamName(user.team.name);
                        
                        return normalizedPlayerTeam === normalizedUserTeam;
                    } catch (err) {
                        console.log(`⚠️ Error checking player:`, err.message);
                        return false;
                    }
                });
                
                // Format players for frontend
                const formattedPlayers = teamPlayers.map((player, index) => {
                    try {
                        return {
                            id: player['player name']?.replace(/\s+/g, '_') || `player_${index}`,
                            name: player.name || player['player name'] || 'Unknown Player',
                            team: player[teamFieldName] || 'Unknown',
                            role: player.role || player['player role'] || 'Player',
                            nationality: (() => {
                                const nat = player.nationality || player.Nationality || 'Indian';
                                const natStr = nat.toString().toLowerCase().trim();
                                return (natStr.includes('ind') || natStr === 'ind' || natStr === 'india') 
                                       ? 'Indian' 
                                       : 'Overseas';
                            })(),
                            basePrice: player['Base price'] || player.basePrice || 2.00,
                            isOverseas: (() => {
                                const nat = player.nationality || player.Nationality || 'Indian';
                                const natStr = nat.toString().toLowerCase().trim();
                                return !(natStr.includes('ind') || natStr === 'ind' || natStr === 'india');
                            })()
                        };
                    } catch (err) {
                        console.log(`⚠️ Error formatting player:`, err.message);
                        return {
                            id: `error_${index}`,
                            name: 'Error Player',
                            team: 'Error',
                            role: 'Player',
                            nationality: 'Indian',
                            basePrice: 2.00,
                            isOverseas: false
                        };
                    }
                });
                
                // Send to user
                socket.emit('retentionData', {
                    players: formattedPlayers,
                    rules: room.rules,
                    team: user.team,
                    username: user.username,
                    roomCode: roomCode
                });
                
                console.log(`📤 Sent ${formattedPlayers.length} players to ${user.username}`);
            }
            
        } catch (error) {
            console.error('❌ Error joining retention:', error);
            socket.emit('error', { message: 'Failed to join retention' });
        }
    });

    // Start retention
    socket.on('startRetention', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            
            console.log('\n🚀 Starting retention phase...');
            
            if (!room) {
                console.log('❌ Room not found');
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            if (socket.id !== room.auctioneerSocket) {
                console.log('❌ Not auctioneer');
                socket.emit('error', { message: 'Only auctioneer can start retention' });
                return;
            }
            
            room.retentionStarted = true;
            room.retentionSubmissions = {};
            
            console.log(`📢 Notifying ${Object.keys(room.users).length} users...`);
            
            // Redirect all users to retention.html
            io.to(roomCode).emit('redirectToRetention', { 
                duration: 90,
                roomCode: roomCode
            });
            
            console.log('✅ Redirect command sent to all users');
            
            // Wait 2 seconds for page load, then send player data
            setTimeout(() => {
                const teamFieldName = findTeamFieldName();
                console.log(`📌 Using team field: "${teamFieldName}"`);
                
                Object.values(room.users).forEach(user => {
                    try {
                        if (!user.team) {
                            console.log(`⚠️ User ${user.username} has no team`);
                            return;
                        }
                        
                        console.log(`👤 Processing ${user.username} - Team: ${user.team.name}`);
                        
                        // Find players for this team
                        const teamPlayers = playersData.filter(player => {
                            try {
                                if (!player || !player[teamFieldName]) return false;
                                
                                const playerTeam = player[teamFieldName].toString().trim();
                                const normalizedPlayerTeam = normalizeTeamName(playerTeam);
                                const normalizedUserTeam = normalizeTeamName(user.team.name);
                                
                                return normalizedPlayerTeam === normalizedUserTeam;
                            } catch (err) {
                                console.log(`⚠️ Error checking player:`, err.message);
                                return false;
                            }
                        });
                        
                        console.log(`   Found ${teamPlayers.length} players`);
                        
                        // Format players
                        const formattedPlayers = teamPlayers.map((player, index) => {
                            try {
                                return {
                                    id: player['player name']?.replace(/\s+/g, '_') || `player_${index}`,
                                    name: player.name || player['player name'] || 'Unknown Player',
                                    team: player[teamFieldName] || 'Unknown',
                                    role: player.role || player['player role'] || 'Player',
                                    nationality: (() => {
                                        const nat = player.nationality || player.Nationality || 'Indian';
                                        const natStr = nat.toString().toLowerCase().trim();
                                        return (natStr.includes('ind') || natStr === 'ind' || natStr === 'india') 
                                               ? 'Indian' 
                                               : 'Overseas';
                                    })(),
                                    basePrice: player['Base price'] || player.basePrice || 2.00,
                                    isOverseas: (() => {
                                        const nat = player.nationality || player.Nationality || 'Indian';
                                        const natStr = nat.toString().toLowerCase().trim();
                                        return !(natStr.includes('ind') || natStr === 'ind' || natStr === 'india');
                                    })()
                                };
                            } catch (err) {
                                console.log(`⚠️ Error formatting player:`, err.message);
                                return {
                                    id: `error_${index}`,
                                    name: 'Error Player',
                                    team: 'Error',
                                    role: 'Player',
                                    nationality: 'Indian',
                                    basePrice: 2.00,
                                    isOverseas: false
                                };
                            }
                        });
                        
                        // Send to user
                        if (user.socketId) {
                            io.to(user.socketId).emit('retentionData', {
                                players: formattedPlayers,
                                rules: room.rules,
                                team: user.team,
                                username: user.username,
                                roomCode: roomCode
                            });
                            console.log(`   Sent ${formattedPlayers.length} players to ${user.username}`);
                        }
                        
                    } catch (userError) {
                        console.error(`❌ Error processing user ${user.username}:`, userError);
                    }
                });
                
                console.log('✅ Retention data sent to all users');
                
            }, 2000);
            
            console.log('✅ Retention phase started successfully');
            
        } catch (error) {
            console.error('❌ CRITICAL ERROR in startRetention:', error);
            console.error('Stack trace:', error.stack);
            socket.emit('error', { message: 'Failed to start retention' });
        }
    });

    // Submit retention
    socket.on('submitRetention', (data) => {
        try {
            console.log('📥 Received retention submission:', data);
            
            const { roomCode, username, selectedPlayers } = data;
            const room = rooms[roomCode];

            if (!room || !room.retentionStarted) {
                console.log('❌ Retention not started or room not found');
                return;
            }

            const user = Object.values(room.users || {}).find(
                u => u.username === username
            );

            if (!user) {
                console.error(`❌ User not found: ${username}`);
                return;
            }

            user.retentionSubmitted = true;
            user.retainedPlayers = (selectedPlayers || []).map(player => ({
                ...player,
                isOverseas: player.isOverseas === true || 
                           player.nationality?.toLowerCase() !== 'indian'
            }));

            console.log(`✅ Retention saved for ${username}:`, user.retainedPlayers);

            // Notify auctioneer
            if (room.auctioneerSocket) {
                io.to(room.auctioneerSocket).emit('retentionSubmitted', {
                    username: user.username,
                    team: user.team?.name || 'Unknown',
                    count: user.retainedPlayers.length
                });
            }

            // Log to server console
            console.log('\n================================');
            console.log(`RETENTION SUBMITTED by ${username}`);
            console.log(`Team: ${user.team?.name || 'Unknown'}`);
            console.log(`Players Selected: ${user.retainedPlayers.length}`);
            
            user.retainedPlayers.forEach((player, index) => {
                console.log(`${index + 1}. ${player.name} (${player.isOverseas ? 'Overseas' : 'Indian'})`);
            });
            
            console.log('================================\n');

        } catch (error) {
            console.error('❌ Error in submitRetention:', error);
            console.error(error.stack);
        }
    });

    // ========== AUCTION POOL SOCKET HANDLERS ==========

    // Start auction pool
    socket.on('startAuctionPool', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            
            if (!room || socket.id !== room.auctioneerSocket) {
                socket.emit('error', { message: 'Only auctioneer can start auction' });
                return;
            }
            
            // Initialize auction
            initializeAuction(roomCode);
            
            // Start auction
            startAuctionForRoom(roomCode);
            
            console.log(`🚀 Auction pool started for room ${roomCode}`);
            
            // Notify all users
            io.to(roomCode).emit('auctionStarted', { 
                message: 'Auction pool phase has begun! Redirecting to auction pool...'
            });
            
            // Redirect all users to auction pool page
            setTimeout(() => {
                io.to(roomCode).emit('redirectToAuctionPool', {
                    message: 'Auction pool phase has begun',
                    roomCode: roomCode
                });
            }, 2000);
            
        } catch (error) {
            console.error('❌ Error starting auction pool:', error);
            socket.emit('error', { message: 'Failed to start auction pool' });
        }
    });

    // Join auctioneer to auction
    socket.on('joinAuctioneer', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            // Store auctioneer socket
            room.auctioneerSocket = socket.id;
            socket.join(roomCode);
            
            console.log(`🎤 Auctioneer joined auction room ${roomCode}`);
            
            // Send current auction state if exists
            const auction = auctionStates[roomCode];
            if (auction) {
                const players = auction.categorizedPlayers[auction.currentCategory];
                const player = players[auction.currentPlayerIndex];
                
                if (player) {
                    socket.emit('playerUpForAuction', {
                        player: {
                            ...player,
                            currentBid: auction.currentBid,
                            currentBidder: auction.currentBidder
                        },
                        category: auction.currentCategory
                    });
                }
                
                // Send current auction status
                const playersLeft = players.length - auction.currentPlayerIndex - 1;
                socket.emit('auctionUpdate', {
                    currentBid: auction.currentBid,
                    currentBidder: auction.currentBidder,
                    category: auction.currentCategory,
                    playersLeft: playersLeft,
                    unsoldCount: auction.unsoldPlayers.length
                });
            }
            
        } catch (error) {
            console.error('❌ Error joining auctioneer:', error);
            socket.emit('error', { message: 'Failed to join as auctioneer' });
        }
    });

    // Manual sell player (auctioneer only)
    socket.on('sellPlayer', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            
            if (!room || socket.id !== room.auctioneerSocket) {
                socket.emit('error', { message: 'Only auctioneer can sell players' });
                return;
            }
            
            handlePlayerSold(roomCode);
            
        } catch (error) {
            console.error('❌ Error selling player:', error);
            socket.emit('error', { message: 'Failed to sell player' });
        }
    });

    // Manual unsold player (auctioneer only)
    socket.on('markUnsold', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            
            if (!room || socket.id !== room.auctioneerSocket) {
                socket.emit('error', { message: 'Only auctioneer can mark unsold' });
                return;
            }
            
            handlePlayerUnsold(roomCode);
            
        } catch (error) {
            console.error('❌ Error marking player unsold:', error);
            socket.emit('error', { message: 'Failed to mark player unsold' });
        }
    });

    // Next player (auctioneer only)
    socket.on('nextPlayer', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            
            if (!room || socket.id !== room.auctioneerSocket) {
                socket.emit('error', { message: 'Only auctioneer can move player' });
                return;
            }
            
            moveToNextPlayer(roomCode);
            
        } catch (error) {
            console.error('❌ Error moving to next player:', error);
            socket.emit('error', { message: 'Failed to move to next player' });
        }
    });

    // Join auction pool (user)
    socket.on('joinAuctionPool', (data) => {
        try {
            const { username, roomCode } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            const user = room.users[username];
            if (!user) {
                socket.emit('error', { message: 'User not found in room' });
                return;
            }
            
            // Update socket ID
            user.socketId = socket.id;
            socket.join(roomCode);
            
            // Send auction data with budget and squad info
            const squadData = getUserSquad(roomCode, username);
            socket.emit('auctionData', {
                team: user.team,
                purse: user.budget || 100,
                rtmCards: user.rtmCards || 2,
                squadLimits: squadData?.squadLimits || {
                    total: 0,
                    indian: 0,
                    overseas: 0,
                    maxSquad: room.rules?.squadSize || 25,
                    maxIndian: room.rules?.maxIndian || 4,
                    maxOverseas: room.rules?.maxOverseas || 3
                }
            });
            
            // If auction already started, send current state
            if (auctionStates[roomCode]) {
                const auction = auctionStates[roomCode];
                const players = auction.categorizedPlayers[auction.currentCategory];
                
                if (players && players.length > 0 && auction.currentPlayerIndex < players.length) {
                    const currentPlayer = players[auction.currentPlayerIndex];
                    
                    socket.emit('playerUpForAuction', {
                        player: {
                            ...currentPlayer,
                            currentBid: auction.currentBid,
                            currentBidder: auction.currentBidder
                        },
                        category: auction.currentCategory
                    });
                }
                
                sendAuctionUpdate(roomCode);
            }
            
            console.log(`✅ ${username} joined auction pool in room ${roomCode}`);
            
        } catch (error) {
            console.error('❌ Error joining auction pool:', error);
            socket.emit('error', { message: 'Failed to join auction pool' });
        }
    });

    // Place bid
    socket.on('placeBid', (data) => {
        console.log('🎯 BID RECEIVED FROM CLIENT:');
        console.log('   Room:', data.roomCode);
        console.log('   Team:', data.team);
        console.log('   Bid:', data.bid);
        
        handleBid(data.roomCode, data, socket);
    });

    // End auction (auctioneer only)
    socket.on('endAuction', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            
            if (!room || socket.id !== room.auctioneerSocket) {
                socket.emit('error', { message: 'Only auctioneer can end auction' });
                return;
            }
            
            console.log(`🏁 Auction forcefully ended by auctioneer for room ${roomCode}`);
            
            // Mark auction as complete
            delete auctionStates[roomCode];
            
            // Notify all users
            io.to(roomCode).emit('auctionComplete', {
                message: 'Auction completed by auctioneer. Moving to playing 11 selection...'
            });
            
            // Redirect all users to playing 11 after 3 seconds
            setTimeout(() => {
                io.to(roomCode).emit('redirectToPlaying11', {
                    roomCode: roomCode
                });
            }, 3000);
            
        } catch (error) {
            console.error('❌ Error ending auction:', error);
            socket.emit('error', { message: 'Failed to end auction' });
        }
    });

    // Request squad
    socket.on('requestSquad', (data) => {
        try {
            const { roomCode, username } = data;
            const squad = getUserSquad(roomCode, username);
            
            if (squad) {
                io.to(socket.id).emit('squadUpdate', squad);
            }
        } catch (error) {
            console.error('❌ Error getting squad:', error);
        }
    });

    // Request squad update
    socket.on('requestSquadUpdate', (data) => {
        try {
            const { roomCode, username } = data;
            const squad = getUserSquad(roomCode, username);
            
            if (squad) {
                io.to(socket.id).emit('squadUpdate', squad);
            }
        } catch (error) {
            console.error('❌ Error updating squad:', error);
        }
    });

    // Submit RTM decision
    socket.on('submitRtmDecision', (data) => {
        try {
            const { roomCode, playerId, rtmAmount, accept } = data;
            handleRTMDecision(roomCode, data, socket);
        } catch (error) {
            console.error('❌ Error handling RTM decision:', error);
        }
    });

    // Skip player (auctioneer only)
    socket.on('skipPlayer', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            
            if (!room || socket.id !== room.auctioneerSocket) {
                socket.emit('error', { message: 'Only auctioneer can skip players' });
                return;
            }
            
            handlePlayerUnsold(roomCode);
            
        } catch (error) {
            console.error('❌ Error skipping player:', error);
        }
    });

    // Disconnect handler
    socket.on('disconnect', () => {
        console.log(`❌ Disconnected: ${socket.id}`);
        
        // Update user connection status
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            
            // Check if this was auctioneer
            if (room.auctioneerSocket === socket.id) {
                console.log(`⚠️ Auctioneer disconnected from room ${roomCode}`);
                // Notify all users in room
                io.to(roomCode).emit('roomClosed', { 
                    message: 'Auctioneer has disconnected' 
                });
                continue;
            }
            
            // Check if this was a user
            for (const username in room.users) {
                const user = room.users[username];
                
                if (user.socketId === socket.id) {
                    user.connected = false;
                    console.log(`⚠️ User disconnected: ${username} (${roomCode})`);
                    
                    // Notify auctioneer
                    if (room.auctioneerSocket) {
                        io.to(room.auctioneerSocket).emit('userDisconnected', {
                            username: username
                        });
                    }
                }
            }
        }
    });

    // Playing 11 handlers
    socket.on('submitPlaying11', (data) => {
        try {
            const { roomCode, username, playing11, impactPlayers } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            const user = room.users[username];
            if (!user) {
                socket.emit('error', { message: 'User not found' });
                return;
            }
            
            // Validate playing 11
            if (playing11.length !== 11) {
                socket.emit('error', { message: 'Playing 11 must have exactly 11 players' });
                return;
            }
            
            // Validate no player is in both playing 11 and impact players
            const duplicatePlayers = playing11.filter(player => 
                impactPlayers.some(impact => impact.id === player.id)
            );
            
            if (duplicatePlayers.length > 0) {
                socket.emit('error', { 
                    message: 'Players cannot be in both Playing 11 and Impact Players' 
                });
                return;
            }
            
            // Save playing 11
            user.playing11 = playing11;
            user.impactPlayers = impactPlayers;
            user.playing11Submitted = true;
            
            console.log(`✅ Playing 11 submitted by ${username}`);
            
            // Notify auctioneer
            if (room.auctioneerSocket) {
                io.to(room.auctioneerSocket).emit('playing11Submitted', {
                    username: username,
                    team: user.team.name,
                    playing11Count: playing11.length,
                    impactPlayersCount: impactPlayers.length
                });
            }
            
            socket.emit('playing11SubmittedSuccess', {
                message: 'Playing 11 submitted successfully!'
            });
            
        } catch (error) {
            console.error('❌ Error submitting playing 11:', error);
            socket.emit('error', { message: 'Failed to submit playing 11' });
        }
    });

    // Rate team (auctioneer only)
    socket.on('rateTeam', (data) => {
        try {
            const { roomCode, username, rating, comments } = data;
            const room = rooms[roomCode];
            
            if (!room || socket.id !== room.auctioneerSocket) {
                socket.emit('error', { message: 'Only auctioneer can rate teams' });
                return;
            }
            
            const user = room.users[username];
            if (!user) {
                socket.emit('error', { message: 'User not found' });
                return;
            }
            
            // Validate rating
            if (rating < 1 || rating > 10) {
                socket.emit('error', { message: 'Rating must be between 1 and 10' });
                return;
            }
            
            user.rating = rating;
            user.ratingComments = comments;
            
            console.log(`⭐ Team rated: ${username} - ${rating}/10`);
            
            // Notify user
            if (user.socketId) {
                io.to(user.socketId).emit('teamRated', {
                    rating: rating,
                    comments: comments
                });
            }
            
            socket.emit('ratingSuccess', {
                message: `Rating submitted for ${username}: ${rating}/10`
            });
            
        } catch (error) {
            console.error('❌ Error rating team:', error);
            socket.emit('error', { message: 'Failed to rate team' });
        }
    });

    // Finalize results (auctioneer only)
    socket.on('finalizeResults', (data) => {
        try {
            const { roomCode } = data;
            const room = rooms[roomCode];
            
            if (!room || socket.id !== room.auctioneerSocket) {
                socket.emit('error', { message: 'Only auctioneer can finalize results' });
                return;
            }
            
            // Calculate results
            const results = [];
            for (const username in room.users) {
                const user = room.users[username];
                if (user.rating) {
                    results.push({
                        username: username,
                        team: user.team.name,
                        rating: user.rating,
                        comments: user.ratingComments,
                        budget: user.budget,
                        retainedPlayers: user.retainedPlayers?.length || 0,
                        auctionPlayers: user.auctionPlayers?.length || 0
                    });
                }
            }
            
            // Sort by rating (descending)
            results.sort((a, b) => b.rating - a.rating);
            
            console.log('🏆 Final results calculated:', results);
            
            // Broadcast results to all
            io.to(roomCode).emit('finalResults', {
                results: results,
                winner: results.length > 0 ? results[0] : null
            });
            
        } catch (error) {
            console.error('❌ Error finalizing results:', error);
            socket.emit('error', { message: 'Failed to finalize results' });
        }
    });
});

// Global error handlers
process.on('uncaughtException', (error) => {
    console.error('⚠️ UNCAUGHT EXCEPTION (Server will continue):', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ UNHANDLED REJECTION:', reason);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('\n' + '='.repeat(80));
    console.log(`✅ SERVER RUNNING ON PORT ${PORT}`);
    console.log('='.repeat(80));
    console.log('\n🌐 Access URLs:');
    console.log(`   Auctioneer: http://localhost:${PORT}/auctioneer.html`);
    console.log(`   User Join: http://localhost:${PORT}/user.html`);
    console.log(`   Auction Pool: http://localhost:${PORT}/auctionpool.html`);
    console.log(`\n📊 Players loaded: ${playersData.length}`);
    console.log('\n🚀 Ready for connections...');
});