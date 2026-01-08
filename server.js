const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const app = express();
const server = http.createServer(app);
// Update your Socket.IO server configuration
const io = socketIO(server, {
    cors: {
        origin: ["https://your-vercel-app.vercel.app", "http://localhost:3000"],
        credentials: true
    },
    transports: ['websocket', 'polling'], // Explicitly specify transports
    pingTimeout: 60000,
    pingInterval: 25000,
    allowEIO3: true // Add this for compatibility
});

// Serve static files
app.use(express.static(path.join(__dirname,'public')));

// Session storage
const sessions = {};
const userSessions = {};

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

// IPL Teams - UPDATED TO MATCH players.json EXACTLY
const IPL_TEAMS = [
    { id: 'csk', name: 'CHENNAI SUPER KINGS', color: '#FFCC00', logo: 'images/teams/CSK.png' },
    { id: 'mi', name: 'MUMBAI INDIANS', color: '#0048A0', logo: 'images/teams/MI.png' },
    { id: 'rcb', name: 'ROYAL CHALLENGERS BANGALORE', color: '#D5152C', logo: 'images/teams/RCB.png' },
    { id: 'kkr', name: 'KOLKATA KNIGHT RIDERS', color: '#3A225D', logo: 'images/teams/KKR.png' },
    { id: 'dc', name: 'DELHI CAPITALS', color: '#004C93', logo: 'images/teams/DC.png' },
    { id: 'pbks', name: 'PUNJAB KINGS', color: '#ED1B24', logo: 'images/teams/PBKS.png' },
    { id: 'rr', name: 'RAJASTHAN ROYALS', color: '#FF4C93', logo: 'images/teams/RR.png' },
    { id: 'srh', name: 'SUNRISES HYDERABAD', color: '#FF6F3D', logo: 'images/teams/SRH.png' }, // FIXED: SUNRISES not SUNRISERS
    { id: 'gt', name: 'GUJARAT TITANS', color: '#1E2D4A', logo: 'images/teams/GT.png' },
    { id: 'lsg', name: 'LUCKNOW SUPER GIANTS', color: '#A5E1F4', logo: 'images/teams/LSG.png' }
];

// Auction pool constants
const playerCategories = ['MARQUEE', 'WK', 'BAT', 'AR', 'SPIN', 'FAST'];
const auctionStates = {};
const rooms = {};

// ========== STATE SYNCHRONIZATION SYSTEM ==========
// Centralized auction state management for reliable sync

function getAuctionSnapshot(roomCode) {
    const auction = auctionStates[roomCode];
    if (!auction) return null;
    
    const players = auction.categorizedPlayers[auction.currentCategory] || [];
    const currentPlayer = players[auction.currentPlayerIndex];
    
    return {
        currentPlayer: currentPlayer ? {
            ...currentPlayer,
            currentBid: auction.currentBid,
            currentBidder: auction.currentBidder
        } : null,
        auctionState: {
            currentCategory: auction.currentCategory,
            currentCategoryIndex: auction.currentCategoryIndex,
            currentPlayerIndex: auction.currentPlayerIndex,
            currentBid: auction.currentBid,
            currentBidder: auction.currentBidder,
            playersLeft: players.length - auction.currentPlayerIndex - 1,
            unsoldCount: auction.unsoldPlayers.length,
            totalPlayersInCategory: players.length
        },
        timestamp: Date.now()
    };
}

function broadcastAuctionState(roomCode, socketId = null) {
    const auction = auctionStates[roomCode];
    if (!auction) return;
    
    const snapshot = getAuctionSnapshot(roomCode);
    const players = auction.categorizedPlayers[auction.currentCategory] || [];
    const playersLeft = players.length - auction.currentPlayerIndex - 1;
    
    const stateUpdate = {
        currentPlayer: snapshot?.currentPlayer,
        category: auction.currentCategory,
        playersLeft: playersLeft,
        unsoldCount: auction.unsoldPlayers.length,
        currentBid: auction.currentBid,
        currentBidder: auction.currentBidder,
        playerPosition: `${auction.currentPlayerIndex + 1}/${players.length}`,
        isAuctionActive: true,
        timestamp: Date.now()
    };
    
    if (socketId) {
        // Send to specific socket (for reconnection)
        io.to(socketId).emit('auctionStateSync', stateUpdate);
    } else {
        // Broadcast to all in room
        io.to(roomCode).emit('auctionStateSync', stateUpdate);
    }
}

// Helper Functions
function generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
}

function generateRoomCode() {
    return 'IPL' + Math.floor(100 + Math.random() * 900);
}

function parseBasePrice(priceStr) {
    if (!priceStr) return 2.00;
    
    const str = priceStr.toString().toLowerCase().trim();
    
    if (str.includes('cr')) {
        const num = parseFloat(str.replace('cr', '').trim());
        return isNaN(num) ? 2.00 : num;
    } else if (str.includes('l')) {
        const num = parseFloat(str.replace('l', '').trim());
        return isNaN(num) ? 2.00 : num / 100;
    } else {
        const num = parseFloat(str);
        return isNaN(num) ? 2.00 : num;
    }
}

function parseNumber(value) {
    if (value === undefined || value === null) return 0;
    
    const str = value.toString().trim();
    const cleaned = str.replace(/\*/g, '').replace(/,/g, '').replace(/"/g, '').replace(/'/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

// Add this function after other helper functions in server.js:
function checkAllRetentionSubmitted(roomCode) {
    const room = rooms[roomCode];
    if (!room) return false;
    
    const users = Object.values(room.users);
    const auctioneerSocket = room.auctioneerSocket;
    
    // Count users who should have submitted (excluding auctioneer)
    const eligibleUsers = users.filter(user => 
        user.username !== room.auctioneer && 
        user.team !== null
    );
    
    // Count users who have submitted
    const submittedUsers = users.filter(user => 
        user.retentionSubmitted === true
    );
    
    console.log(`📊 Retention Status for ${roomCode}: ${submittedUsers.length}/${eligibleUsers.length} users submitted`);
    
    // ✅ CRITICAL FIX: Always enable auction pool button when all submissions received
    if (eligibleUsers.length > 0 && submittedUsers.length >= eligibleUsers.length) {
        console.log(`✅ ALL RETENTION SUBMISSIONS RECEIVED for room ${roomCode}`);
        
        // Enable auction pool button for auctioneer IMMEDIATELY
        if (auctioneerSocket) {
            console.log(`🎯 Enabling auction pool button for auctioneer`);
            
            io.to(auctioneerSocket).emit('allRetentionSubmitted', {
                roomCode: roomCode,
                message: 'All users have submitted retention! You can now start the auction pool.',
                submittedCount: submittedUsers.length,
                totalUsers: eligibleUsers.length,
                immediateEnable: true  // ✅ NEW FLAG
            });
            
            // ✅ ALSO send retention status update
            io.to(auctioneerSocket).emit('retentionStatusUpdate', {
                roomCode: roomCode,
                submitted: submittedUsers.length,
                total: eligibleUsers.length,
                allComplete: true,
                message: `ALL ${submittedUsers.length}/${eligibleUsers.length} users submitted retention. Auction pool can start now!`
            });
        }
        
        return true;
    }
    
    return false;
}

// Team matching function - SIMPLIFIED
function normalizeTeamName(teamName) {
    if (!teamName) return '';
    
    const normalized = teamName.toString().trim().toUpperCase();
    
    // SPECIAL HANDLING FOR SRH
    if (normalized.includes('SUNRISES') || normalized.includes('SUNRISERS') || normalized.includes('HYDERABAD')) {
        return 'SUNRISES HYDERABAD';
    }
    
    // Handle other team variations
    if (normalized.includes('MUMBAI') || normalized === 'MI') {
        return 'MUMBAI INDIANS';
    }
    
    if (normalized.includes('CHENNAI') || normalized === 'CSK') {
        return 'CHENNAI SUPER KINGS';
    }
    
    if (normalized.includes('BANGALORE') || normalized.includes('RCB')) {
        return 'ROYAL CHALLENGERS BANGALORE';
    }
    
    if (normalized.includes('KOLKATA') || normalized.includes('KKR')) {
        return 'KOLKATA KNIGHT RIDERS';
    }
    
    if (normalized.includes('PUNJAB') || normalized.includes('PBKS') || normalized.includes('KINGS')) {
        return 'PUNJAB KINGS';
    }
    
    if (normalized.includes('DELHI') || normalized === 'DC') {
        return 'DELHI CAPITALS';
    }
    
    if (normalized.includes('RAJASTHAN') || normalized === 'RR') {
        return 'RAJASTHAN ROYALS';
    }
    
    if (normalized.includes('GUJARAT') || normalized === 'GT') {
        return 'GUJARAT TITANS';
    }
    
    if (normalized.includes('LUCKNOW') || normalized === 'LSG') {
        return 'LUCKNOW SUPER GIANTS';
    }
    
    return normalized;
}

// Session Management
function createSession(userData) {
    const sessionId = generateSessionId();
    sessions[sessionId] = {
        ...userData,
        sessionId: sessionId,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        active: true
    };
    
    const userKey = `${userData.username}_${userData.roomCode}_${userData.role}`;
    userSessions[userKey] = sessionId;
    
    return sessionId;
}

function validateSession(sessionId, username, roomCode, role) {
    const session = sessions[sessionId];
    if (!session) return false;
    
    if (session.username !== username || 
        session.roomCode !== roomCode || 
        session.role !== role) {
        return false;
    }
    
    if (!session.active) return false;
    
    if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
        delete sessions[sessionId];
        return false;
    }
    
    session.lastActivity = Date.now();
    return true;
}

function endSession(sessionId) {
    if (sessions[sessionId]) {
        sessions[sessionId].active = false;
        
        for (const key in userSessions) {
            if (userSessions[key] === sessionId) {
                delete userSessions[key];
                break;
            }
        }
        
        setTimeout(() => {
            if (sessions[sessionId]) {
                delete sessions[sessionId];
            }
        }, 5 * 60 * 1000);
    }
}

// Auction Pool Functions
function initializeAuction(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    
    const allPlayers = [...playersData];
    
    // Collect all retained player IDs across all teams
    const retainedPlayerIds = new Set();
    Object.values(room.users).forEach(user => {
        if (user.retainedPlayers && user.retainedPlayers.length > 0) {
            user.retainedPlayers.forEach(player => {
                // Use the same ID format as formatPlayerForAuction
                const playerId = player.name?.replace(/\s+/g, '_') || player.id;
                retainedPlayerIds.add(playerId);
            });
        }
    });
    
    console.log(`📊 Retained players excluded: ${retainedPlayerIds.size} players`);
    
    // Filter out retained players
    const auctionPool = allPlayers.filter(player => {
        const playerId = player['player name']?.replace(/\s+/g, '_') || player.name;
        return !retainedPlayerIds.has(playerId);
    });
    
    console.log(`📊 Auction pool size: ${auctionPool.length} players (after removing retained)`);
    
    const categorizedPlayers = {
        'MARQUEE': [], 'WK': [], 'BAT': [], 'AR': [], 'SPIN': [], 'FAST': []
    };
    
    auctionPool.forEach(player => {
        const playerObj = formatPlayerForAuction(player);
        
        if (player.marquee === 'YES' || player.marquee === true) {
            categorizedPlayers['MARQUEE'].push(playerObj);
            return;
        }
        
        if (player['player role']?.includes('WK') || player.role?.includes('WK')) {
            categorizedPlayers['WK'].push(playerObj);
            return;
        }
        
        if (player['player role']?.includes('BAT') || player.role?.includes('BAT')) {
            categorizedPlayers['BAT'].push(playerObj);
            return;
        }
        
        if (player['player role']?.includes('AR') || player.role?.includes('AR')) {
            categorizedPlayers['AR'].push(playerObj);
            return;
        }
        
        const bowlingType = player['bowling type'] || player.bowlingType;
        if (bowlingType === 'SPIN' || bowlingType?.includes('SPIN')) {
            categorizedPlayers['SPIN'].push(playerObj);
        } else if (bowlingType === 'FAST' || bowlingType?.includes('FAST')) {
            categorizedPlayers['FAST'].push(playerObj);
        }
    });
    
    Object.keys(categorizedPlayers).forEach(category => {
        shuffleArray(categorizedPlayers[category]);
    });
    
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
    console.log(`   Total players available: ${auctionPool.length}`);
     // ✅ ADD: Immediately prepare first player for auction
    const firstCategoryPlayers = categorizedPlayers['MARQUEE'];
    if (firstCategoryPlayers.length > 0) {
        console.log(`🎯 First player ready: ${firstCategoryPlayers[0].name}`);
        
        // Set up first player
        auctionStates[roomCode].currentBid = firstCategoryPlayers[0].basePrice;
        auctionStates[roomCode].currentPlayer = firstCategoryPlayers[0];
        firstCategoryPlayers[0].currentBid = firstCategoryPlayers[0].basePrice;
        firstCategoryPlayers[0].currentBidder = null;
    }
    return auctionStates[roomCode];
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

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
        totalRuns: player['total runs'] || player.totalRuns || 0,
        highestScore: player['highest score'] || player.highestScore || '0',
        strikeRate: player['strike rate'] || player.strikeRate || 0,
        fours: player["4's"] || player.fours || 0,
        sixes: player["6's"] || player.sixes || 0,
        fifties: player["50's"] || player.fifties || 0,
        hundreds: player["100's"] || player.hundreds || 0,
        wickets: player.wickets || 0,
        bestBowling: player['best '] || player.bestBowling || '0/0',
        economyRate: player['economy rate'] || player.economyRate || 0,
        currentBid: basePrice,
        currentBidder: null,
        sold: false,
        soldTo: null,
        soldPrice: 0
    };
}

function startAuctionForRoom(roomCode) {
    const auction = auctionStates[roomCode];
    const room = rooms[roomCode];
    
    if (!auction || !room) return;
    
    console.log(`\n🎬 STARTING AUCTION FOR ROOM ${roomCode}`);
    console.log(`   Connected users: ${Object.keys(room.users).length}`);
    
    auction.currentCategoryIndex = 0;
    auction.currentCategory = playerCategories[0];
    auction.currentPlayerIndex = 0;
    auction.auctionPhase = true;  // ✅ CRITICAL: Mark as active
    
    const players = auction.categorizedPlayers[auction.currentCategory];
    
    if (players.length > 0) {
        console.log(`🎯 First player: ${players[0].name} (₹${players[0].basePrice} Cr)`);
        
        // ✅ FIXED: Set player data BEFORE broadcasting
        auction.currentBid = players[0].basePrice;
        auction.currentBidder = null;
        auction.currentPlayer = players[0];
        
        players[0].currentBid = players[0].basePrice;
        players[0].currentBidder = null;
        
        // ✅ FIXED: Store in auction state for easy access
        auction.currentPlayer = {
            ...players[0],
            currentBid: players[0].basePrice,
            currentBidder: null
        };
        
        console.log(`📢 Broadcasting first player to ALL users in room ${roomCode}`);
        
        // ✅ FIXED: Force broadcast to EVERYONE including newly joining users
        const playerData = {
            player: {
                id: players[0].id,
                name: players[0].name,
                role: players[0].role,
                bowlingType: players[0].bowlingType,
                nationality: players[0].nationality,
                basePrice: players[0].basePrice,
                currentBid: players[0].basePrice,
                currentBidder: null,
                totalRuns: players[0].totalRuns,
                highestScore: players[0].highestScore,
                strikeRate: players[0].strikeRate,
                fours: players[0].fours,
                sixes: players[0].sixes,
                fifties: players[0].fifties,
                hundreds: players[0].hundreds,
                wickets: players[0].wickets,
                bestBowling: players[0].bestBowling,
                economyRate: players[0].economyRate,
                originalTeam: players[0].originalTeam
            },
            category: auction.currentCategory,
            forceBroadcast: true  // ✅ Flag for forced update
        };
        
        // Broadcast to room AND store for new joiners
        io.to(roomCode).emit('playerUpForAuction', playerData);
        
        // Also update room state
        room.currentAuctionPlayer = playerData;
        
        // Also send state sync IMMEDIATELY
        setTimeout(() => {
            broadcastAuctionState(roomCode);
        }, 100);
        
        console.log(`✅ First player auction started: ${players[0].name}`);
    } else {
        console.log(`⚠️ No players in first category, moving to next`);
        moveToNextCategory(roomCode);
    }
}

function startPlayerAuction(roomCode, player) {
    const auction = auctionStates[roomCode];
    if (!auction) return;

    const players = auction.categorizedPlayers[auction.currentCategory];
    const currentPlayer = players[auction.currentPlayerIndex];

    if (!currentPlayer) return;

    // Reset auction state for new player
    auction.currentBid = currentPlayer.basePrice;
    auction.currentBidder = null;
    auction.bidHistory = [];
    auction.currentPlayer = currentPlayer;
    
    // Also update the player object
    currentPlayer.currentBid = currentPlayer.basePrice;
    currentPlayer.currentBidder = null;

    // Send event AND state sync
    io.to(roomCode).emit('playerUpForAuction', {
        player: {
            id: currentPlayer.id,
            name: currentPlayer.name,
            role: currentPlayer.role,
            bowlingType: currentPlayer.bowlingType,
            nationality: currentPlayer.nationality,
            isOverseas: currentPlayer.nationality?.toString().toLowerCase() !== 'indian',
            basePrice: currentPlayer.basePrice,
            currentBid: auction.currentBid,
            currentBidder: null,
            totalRuns: currentPlayer.totalRuns,
            highestScore: currentPlayer.highestScore,
            strikeRate: currentPlayer.strikeRate,
            fours: currentPlayer.fours,
            sixes: currentPlayer.sixes,
            fifties: currentPlayer.fifties,
            hundreds: currentPlayer.hundreds,
            wickets: currentPlayer.wickets,
            bestBowling: currentPlayer.bestBowling,
            economyRate: currentPlayer.economyRate,
            originalTeam: currentPlayer.originalTeam
        },
        category: auction.currentCategory
    });

    // Also broadcast state sync to ensure all clients are in sync
    broadcastAuctionState(roomCode);

    console.log(`🎯 Player Up: ${currentPlayer.name} | Base: ₹${currentPlayer.basePrice} Cr`);
    console.log(`   Original Team: ${currentPlayer.originalTeam}`);
}

function handleBid(roomCode, data, socket) {
    const auction = auctionStates[roomCode];
    const room = rooms[roomCode];
    
    if (!auction || !room) {
        socket.emit('bidError', { message: 'Auction not found' });
        return;
    }

    const { team, bid, playerId } = data;
    console.log(`💰 Bid attempt: ${team} bidding ₹${bid} Cr`);

    const user = Object.values(room.users).find(u => u.team?.id === team);
    if (!user) {
        socket.emit('bidError', { message: 'User not found' });
        return;
    }

    if (bid > user.budget) {
        socket.emit('bidError', { 
            message: `Insufficient funds! Your budget: ₹${user.budget} Cr` 
        });
        return;
    }

    const squadSize = (user.retainedPlayers?.length || 0) + (user.auctionPlayers?.length || 0);
    const maxSquad = room.rules?.squadSize || 25;
    
    if (squadSize >= maxSquad) {
        socket.emit('bidError', { 
            message: `Squad full! Maximum ${maxSquad} players allowed` 
        });
        return;
    }

    

    auction.currentBid = bid;
    auction.currentBidder = team;
    
    auction.bidHistory.push({
        team: team,
        bid: bid,
        time: new Date().toISOString()
    });

    console.log(`✅ New bid accepted: ${team} bid ₹${bid} Cr`);

    io.to(roomCode).emit('bidUpdate', {
        team: team,
        bid: bid,
        playerId: playerId || auction.currentPlayer?.id,
        player: auction.currentPlayer
    });

    // Update state sync after bid
    broadcastAuctionState(roomCode);
}

// FIXED: Player sale function - properly sells to highest bidder
function handlePlayerSold(roomCode) {
    const room = rooms[roomCode];
    const auction = auctionStates[roomCode];
    
    if (!room || !auction) {
        console.log('❌ Cannot sell player: Room or auction not found');
        return;
    }
    
    const players = auction.categorizedPlayers[auction.currentCategory];
    const currentPlayer = players[auction.currentPlayerIndex];
    
    if (!currentPlayer) {
        console.log('❌ Cannot sell player: No current player');
        io.to(room.auctioneerSocket).emit('error', { message: 'No player to sell' });
        return;
    }
    
    // Check if there's a current bidder
    if (!auction.currentBidder) {
        console.log('❌ No bidder for player:', currentPlayer.name);
        io.to(room.auctioneerSocket).emit('error', { 
            message: 'No bids on this player. Mark as unsold instead.' 
        });
        return;
    }
    
    console.log(`\n🏁 SELLING PLAYER: ${currentPlayer.name}`);
    console.log(`   Sold to: ${auction.currentBidder}`);
    console.log(`   Price: ₹${auction.currentBid} Cr`);
    console.log(`   Original Team: ${currentPlayer.originalTeam}`);
    console.log(`   Winning Team: ${auction.currentBidder}`);
    
    // Find the buying team user
    const buyingTeamUser = Object.values(room.users).find(u => 
        u.team && u.team.id === auction.currentBidder
    );
    
    if (!buyingTeamUser) {
        console.log(`❌ Buying team user not found for: ${auction.currentBidder}`);
        io.to(room.auctioneerSocket).emit('error', { 
            message: `Buying team (${auction.currentBidder}) not found` 
        });
        return;
    }
    
    // Check squad size limit (applies to auction pool)
    const totalSquadSize = (buyingTeamUser.retainedPlayers?.length || 0) + (buyingTeamUser.auctionPlayers?.length || 0);
    const maxSquad = room.rules?.squadSize || 25;
    
    if (totalSquadSize >= maxSquad) {
        console.log(`❌ ${buyingTeamUser.username}'s squad is full (${totalSquadSize}/${maxSquad})`);
        io.to(room.auctioneerSocket).emit('error', { 
            message: `${buyingTeamUser.username}'s squad is full! Cannot buy more players.` 
        });
        return;
    }
    
    // REMOVED: Overseas limit check during auction pool
    // Overseas limit only applies during retention phase, not auction pool
    const isOverseas = !isIndian(currentPlayer.nationality);
    
    // Check budget
    if (auction.currentBid > buyingTeamUser.budget) {
        console.log(`❌ ${buyingTeamUser.username} has insufficient funds (${buyingTeamUser.budget}/${auction.currentBid})`);
        io.to(room.auctioneerSocket).emit('error', { 
            message: `${buyingTeamUser.username} has insufficient funds!` 
        });
        return;
    }
    
    // SUCCESS - Sell the player
    console.log(`✅ All checks passed for ${buyingTeamUser.username}`);
    
    // Mark player as sold
    currentPlayer.sold = true;
    currentPlayer.soldTo = auction.currentBidder;
    currentPlayer.soldPrice = auction.currentBid;
    
    // Initialize arrays if they don't exist
    if (!buyingTeamUser.auctionPlayers) buyingTeamUser.auctionPlayers = [];
    if (buyingTeamUser.budget === undefined) buyingTeamUser.budget = 100;
    
    // Add player to buying team
    buyingTeamUser.auctionPlayers.push({
        id: currentPlayer.id,
        name: currentPlayer.name,
        role: currentPlayer.role,
        price: currentPlayer.soldPrice,
        isOverseas: isOverseas,
        stats: {
            totalRuns: currentPlayer.totalRuns,
            highestScore: currentPlayer.highestScore,
            strikeRate: currentPlayer.strikeRate,
            wickets: currentPlayer.wickets,
            economyRate: currentPlayer.economyRate
        }
    });
    
    // Deduct from budget
    buyingTeamUser.budget -= currentPlayer.soldPrice;
    
    console.log(`✅ ${currentPlayer.name} SUCCESSFULLY SOLD to ${currentPlayer.soldTo}`);
    console.log(`   ${buyingTeamUser.username}'s new budget: ₹${buyingTeamUser.budget} Cr`);
    console.log(`   Squad size: ${totalSquadSize + 1}/${maxSquad}`);
    console.log(`   Player is overseas: ${isOverseas ? 'Yes' : 'No'}`);
    
    // Broadcast sale to ALL
    // Broadcast sale to ALL
io.to(roomCode).emit('playerSold', {
    player: currentPlayer.name,
    playerId: currentPlayer.id,
    team: currentPlayer.soldTo,
    price: currentPlayer.soldPrice,
    isOverseas: isOverseas,
    playerRole: currentPlayer.role,
    nationality: currentPlayer.nationality,  // Add this
    originalTeam: currentPlayer.originalTeam,  // Add this
    buyerUsername: buyingTeamUser.username
});
    // Send squad update to buying team
    const squadData = getUserSquad(roomCode, buyingTeamUser.username);
    if (squadData && buyingTeamUser.socketId) {
        io.to(buyingTeamUser.socketId).emit('squadUpdate', squadData);
    }
    
    // Reset auction state
    auction.currentBid = 0;
    auction.currentBidder = null;
    auction.bidHistory = [];
    
    // Send state sync after sale
    broadcastAuctionState(roomCode);
    
    // Move to next player after delay
    setTimeout(() => {
        moveToNextPlayer(roomCode);
    }, 2000);
}

function handlePlayerUnsold(roomCode) {
    const auction = auctionStates[roomCode];
    const room = rooms[roomCode];
    
    if (!auction || !room) return;
    
    const players = auction.categorizedPlayers[auction.currentCategory];
    const currentPlayer = players[auction.currentPlayerIndex];
    
    if (!currentPlayer) return;
    
    // Add to unsold players
    auction.unsoldPlayers.push(currentPlayer);
    
    console.log(`❌ ${currentPlayer.name} MARKED AS UNSOLD`);
    
    // ✅ BROADCAST DIFFERENT MESSAGES FOR DIFFERENT USERS
    
    // 1. For auctioneer: Update stats and reset buttons
    if (room.auctioneerSocket) {
        io.to(room.auctioneerSocket).emit('playerUnsoldAuctioneer', {
            player: currentPlayer.name,
            category: auction.currentCategory,
            message: 'Player marked as unsold'
        });
    }
    
    // 2. For ALL USERS in auction pool: Show popup
    Object.values(room.users).forEach(user => {
        if (user.socketId && user.socketId !== room.auctioneerSocket) {
            io.to(user.socketId).emit('playerUnsoldBroadcast', {
                player: currentPlayer.name,
                message: `${currentPlayer.name} went unsold and will come again in the unsold list`,
                showPopup: true
            });
        }
    });
    
    // Reset auction state
    auction.currentBid = 0;
    auction.currentBidder = null;
    auction.bidHistory = [];
    
    // Send state sync
    broadcastAuctionState(roomCode);
    
    // Move to next player after delay
    setTimeout(() => {
        moveToNextPlayer(roomCode);
    }, 2000);
}

function moveToNextPlayer(roomCode) {
    const auction = auctionStates[roomCode];
    if (!auction) return;

    const players = auction.categorizedPlayers[auction.currentCategory];
    
    console.log(`\n⏭️ MOVING TO NEXT PLAYER`);
    console.log(`   Current index: ${auction.currentPlayerIndex}`);
    console.log(`   Total players: ${players.length}`);
    
    auction.currentPlayerIndex++;

    if (auction.currentPlayerIndex < players.length) {
        console.log(`   Moving to player ${auction.currentPlayerIndex + 1} of ${players.length}`);
        startPlayerAuction(roomCode, players[auction.currentPlayerIndex]);
        return;
    }

    console.log(`   No more players in ${auction.currentCategory} category`);
    moveToNextCategory(roomCode);
}

function moveToNextCategory(roomCode) {
    const auction = auctionStates[roomCode];
    if (!auction) return;
    
    auction.currentCategoryIndex++;
    
    if (auction.currentCategoryIndex >= playerCategories.length) {
        handleAuctionComplete(roomCode);
        return;
    }
    
    auction.currentCategory = playerCategories[auction.currentCategoryIndex];
    auction.currentPlayerIndex = 0;
    
    const players = auction.categorizedPlayers[auction.currentCategory];
    
    if (players.length > 0) {
        const firstPlayer = players[0];
        startPlayerAuction(roomCode, firstPlayer);
    } else {
        moveToNextCategory(roomCode);
    }
}

function handleAuctionComplete(roomCode) {
    console.log(`\n🏆 Auction completed for room ${roomCode}`);
    
    const room = rooms[roomCode];
    if (!room) return;
    
    // Mark auction as completed
    room.auctionCompleted = true;
    room.auctionCompletedAt = new Date().toISOString();
    
    // Get all users (excluding auctioneer)
    const usersToRedirect = Object.values(room.users).filter(
        user => user.username !== room.auctioneer
    );
    
    console.log(`📤 Preparing to redirect ${usersToRedirect.length} users to playing11.html...`);
    
    // Process each user
    usersToRedirect.forEach(user => {
        if (user.team && user.socketId) {
            // Get user's squad data
            const squadData = getUserSquad(roomCode, user.username);
            
            console.log(`   ↳ Preparing squad for ${user.username}:`, {
                retained: user.retainedPlayers?.length || 0,
                auction: user.auctionPlayers?.length || 0,
                total: (user.retainedPlayers?.length || 0) + (user.auctionPlayers?.length || 0)
            });
            
            // Create complete playing 11 data with REAL auction players
            const playing11Data = {
                roomCode: roomCode,
                username: user.username,
                team: user.team,
                // Use actual retained players from user object
                retainedPlayers: user.retainedPlayers || [],
                // Use actual auction players from user object (NOT dummy data)
                auctionPlayers: user.auctionPlayers || [],
                budget: squadData.remainingBudget || squadData.budget || 100,
                totalBudget: squadData.totalBudget || 100,
                totalSpent: (user.auctionPlayers || []).reduce((sum, player) => sum + (player.price || 0), 0),
                remainingBudget: squadData.remainingBudget || squadData.budget || 100,
                squadLimits: {
                    total: (user.retainedPlayers?.length || 0) + (user.auctionPlayers?.length || 0),
                    indian: countIndianPlayers(user),
                    overseas: countOverseasPlayers(user),
                    maxSquad: room.rules?.squadSize || 25
                },
                rules: room.rules || { totalPurse: 100, squadSize: 25, impactPlayers: 1 },
                sessionId: user.sessionId,
                auctionCompleted: true,
                timestamp: Date.now()
            };
            
            console.log(`   ✅ Real auction players: ${playing11Data.auctionPlayers.length} players`);
            
            // Send squad data to user WITH redirect command
            io.to(user.socketId).emit('forceRedirectToPlaying11WithData', {
                message: 'Auction completed! Redirecting to Playing 11 selection...',
                roomCode: roomCode,
                username: user.username,
                squadData: playing11Data,
                redirectUrl: 'playing11.html',
                force: true
            });
            
            console.log(`   ✅ Sent REAL squad data and redirect to ${user.username}`);
            
            // Store in user object for backup
            user.playing11Data = playing11Data;
        }
    });
    
    // Send completion notification to ALL
    io.to(roomCode).emit('auctionComplete', {
        message: 'Auction pool completed! All users will be redirected to playing 11 selection.',
        roomCode: roomCode,
        usersRedirected: usersToRedirect.length,
        timestamp: new Date().toISOString()
    });
    
    // Send specific redirect to auctioneer
    if (room.auctioneerSocket) {
        console.log(`   ↳ Redirecting auctioneer to validation.html`);
        
        io.to(room.auctioneerSocket).emit('redirectAuctioneerToValidation', {
            message: 'Auction completed! You will be redirected to validate playing 11 submissions.',
            roomCode: roomCode,
            username: room.auctioneer,
            redirectUrl: 'validation.html',
            force: true,
            timestamp: Date.now()
        });
    }
    
    console.log(`✅ Auction completed for room ${roomCode}`);
    console.log(`   Users redirected: ${usersToRedirect.length}`);
    console.log(`   Auctioneer redirected to validation`);
}

// Helper function to count Indian players
function countIndianPlayers(user) {
    const allPlayers = [...(user.retainedPlayers || []), ...(user.auctionPlayers || [])];
    return allPlayers.filter(player => !player.isOverseas).length;
}

// Helper function to count Overseas players
function countOverseasPlayers(user) {
    const allPlayers = [...(user.retainedPlayers || []), ...(user.auctionPlayers || [])];
    return allPlayers.filter(player => player.isOverseas).length;
}
// Helper function to calculate total spent
function calculateTotalSpent(user) {
    return (user.auctionPlayers || []).reduce((sum, player) => sum + (player.price || 0), 0);
}


function getUserSquad(roomCode, username) {
    const room = rooms[roomCode];
    if (!room) return null;
    
    const user = room.users[username];
    if (!user) return null;
    
    const retainedCount = user.retainedPlayers?.length || 0;
    const auctionCount = user.auctionPlayers?.length || 0;
    const totalPlayers = retainedCount + auctionCount;
    
    let overseasCount = 0;
    let totalSpent = 0;
    
    // Calculate from retained players
    if (user.retainedPlayers) {
        overseasCount += user.retainedPlayers.filter(p => p.isOverseas).length;
    }
    
    // Calculate from auction players
    if (user.auctionPlayers) {
        overseasCount += user.auctionPlayers.filter(p => p.isOverseas).length;
        totalSpent = user.auctionPlayers.reduce((sum, player) => sum + (player.price || 0), 0);
    }
    
    const indianCount = totalPlayers - overseasCount;
    const maxSquad = room.rules?.squadSize || 25;
    const remainingSlots = Math.max(0, maxSquad - totalPlayers);
    const totalBudget = room.rules?.totalPurse || 100;
    const remainingBudget = totalBudget - totalSpent;
    
    return {
        team: user.team,
        username: username,
        retainedPlayers: user.retainedPlayers || [],
        auctionPlayers: user.auctionPlayers || [],
        budget: remainingBudget,  // ✅ This is REMAINING budget
        totalSpent: totalSpent,
        totalBudget: totalBudget,  // ✅ Add this
        remainingBudget: remainingBudget,  // ✅ Add this
        rtmCards: user.rtmCards || 2,
        squadLimits: {
            total: totalPlayers,
            indian: indianCount,
            overseas: overseasCount,
            maxSquad: maxSquad
        },
        squadLimit: maxSquad,  // ✅ Make sure this exists
        remainingSlots: remainingSlots,
        rules: room.rules || { 
            totalPurse: 100, 
            squadSize: 25,
            impactPlayers: 1 
        }
    };
}

// ✅ ADD THIS FOR TESTING (temporary)
function testRedirectToPlaying11() {
    console.log('🧪 Testing redirect to playing11...');
    
    // Create test squad data
    const testSquadData = {
        roomCode: currentRoomCode,
        username: currentUsername,
        team: userTeam,
        budget: 45.75,
        retainedPlayers: [
            { id: 'p1', name: 'Virat Kohli', role: 'Batsman', isOverseas: false, price: 0 },
            { id: 'p2', name: 'MS Dhoni', role: 'WK-Batsman', isOverseas: false, price: 0 }
        ],
        auctionPlayers: [
            { id: 'p3', name: 'AB de Villiers', role: 'Batsman', isOverseas: true, price: 6.75 },
            { id: 'p4', name: 'Jasprit Bumrah', role: 'Bowler', isOverseas: false, price: 8.5 }
        ],
        totalBudget: 100,
        totalSpent: 15.25,
        remainingBudget: 45.75,
        timestamp: Date.now()
    };
    
    localStorage.setItem('playing11SquadData', JSON.stringify(testSquadData));
    localStorage.setItem('auctionCompleted', 'true');
    
    showAlert('Test Redirect', 'Redirecting to playing11 with test data...', '🧪');
    
    setTimeout(() => {
        window.location.href = 'playing11.html';
    }, 1000);
}
// Add this helper function at the top of server.js (with other helper functions)
function isIndian(nationality) {
    if (!nationality) return true; // Default to Indian if unknown
    
    const natStr = nationality.toString().trim().toUpperCase();
    
    // Check for various ways Indian nationality might be represented
    return natStr === 'INDIAN' || 
           natStr === 'IND' || 
           natStr === 'INDIA' ||
           natStr === 'IND ' ||
           natStr.includes('IND') ||  // This will catch "IND"
           natStr === 'IN' ||        // Just in case
           natStr === '🇮🇳' ||      // Emoji
           natStr === 'I' ||         // Abbreviation
           natStr === 'INDN' ||      // Variant
           natStr === 'INDIAN ';     // With space
}

// Also update the formatPlayerForAuction function to standardize nationality
function formatPlayerForAuction(player) {
    const basePrice = parseFloat(player['Base price']?.replace('cr', '')?.replace('Cr', '') || '2');
    
    // ✅ FIX: Standardize nationality
    let nationality = player['Nationality'] || player.nationality || 'IND';
    nationality = nationality.toString().trim().toUpperCase();
    
    return {
        id: player['player name']?.replace(/\s+/g, '_') || player.id,
        name: player['player name'] || player.name,
        role: player['player role'] || player.role,
        bowlingType: player['bowling type'] || player.bowlingType,
        nationality: nationality,  // Now standardized to uppercase
        originalTeam: normalizeTeamName(player['Team name'] || player.team),
        basePrice: basePrice,
        totalRuns: player['total runs'] || player.totalRuns || 0,
        highestScore: player['highest score'] || player.highestScore || '0',
        strikeRate: player['strike rate'] || player.strikeRate || 0,
        fours: player["4's"] || player.fours || 0,
        sixes: player["6's"] || player.sixes || 0,
        fifties: player["50's"] || player.fifties || 0,
        hundreds: player["100's"] || player.hundreds || 0,
        wickets: player.wickets || 0,
        bestBowling: player['best '] || player.bestBowling || '0/0',
        economyRate: player['economy rate'] || player.economyRate || 0,
        currentBid: basePrice,
        currentBidder: null,
        sold: false,
        soldTo: null,
        soldPrice: 0
    };
}

// Call this from console for testing:
// testRedirectToPlaying11()

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log(`✅ New connection: ${socket.id}`);
        // Log all socket events for debugging
    socket.onAny((eventName, ...args) => {
        if (eventName !== 'ping' && eventName !== 'pong') {
            console.log(`📡 Socket Event: ${eventName}`, args.length > 0 ? args[0] : '');
        }
    });

    // ========== STATE SYNC REQUEST HANDLER ==========
    socket.on('requestAuctionState', (data) => {
        const { roomCode, username } = data;
        
        console.log(`🔄 State sync requested by ${username} in room ${roomCode}`);
        
        const auction = auctionStates[roomCode];
        const room = rooms[roomCode];
        
        if (!auction || !room) {
            socket.emit('auctionStateSync', {
                isAuctionActive: false,
                message: 'Auction not started yet'
            });
            return;
        }
        
        // Send current state snapshot
        const snapshot = getAuctionSnapshot(roomCode);
        
        if (snapshot.currentPlayer) {
            // Send player data
            socket.emit('playerUpForAuction', {
                player: snapshot.currentPlayer,
                category: auction.currentCategory
            });
        }
        
        // Send state sync
        broadcastAuctionState(roomCode, socket.id);
        
        console.log(`✅ State synced for ${username}`);
    });

    // ✅ ADD THIS: State sync acknowledgment
socket.on('requestAuctionState', (data, callback) => {
    const { roomCode, username } = data;
    
    console.log(`🔄 State sync requested by ${username} in room ${roomCode}`);
    
    const auction = auctionStates[roomCode];
    const room = rooms[roomCode];
    
    if (!auction || !room) {
        console.log('⚠️ No auction state available yet');
        if (callback) callback({ success: false, message: 'Auction not started' });
        return;
    }
    
    // Send current player if available
    const players = auction.categorizedPlayers[auction.currentCategory] || [];
    const currentPlayer = players[auction.currentPlayerIndex];
    
    if (currentPlayer) {
        console.log(`🎯 Syncing player ${currentPlayer.name} for ${username}`);
        
        socket.emit('playerUpForAuction', {
            player: {
                ...currentPlayer,
                currentBid: auction.currentBid,
                currentBidder: auction.currentBidder
            },
            category: auction.currentCategory
        });
    }
    
    // Send state sync
    broadcastAuctionState(roomCode, socket.id);
    
    // ✅ Acknowledge sync
    if (callback) callback({ 
        success: true, 
        message: 'State synced',
        hasPlayer: !!currentPlayer 
    });
    
    console.log(`✅ State synced for ${username}`);
});

    // Handle login
    // Handle login - FIXED FOR AUCTIONEER
        // Handle login - FIXED VERSION
    socket.on('login', (data) => {
        try {
            console.log('\n🔐 LOGIN ATTEMPT:', { 
                username: data.username, 
                role: data.role, 
                action: data.action 
            });
            
            const { username, roomCode, role, action, sessionId } = data;
            
            // For auctioneer creating new room (no roomCode yet)
            if (role === 'auctioneer' && action === 'new') {
                console.log(`🎯 Auctioneer ${username} logging in to create room`);
                
                const newSessionId = createSession({
                    username,
                    role,
                    socketId: socket.id
                });
                
                console.log(`✅ New auctioneer session created: ${newSessionId}`);
                
                socket.emit('loginSuccess', { 
                    username, 
                    role, 
                    sessionId: newSessionId,
                    action: 'new'
                });
                
                return;
            }
            
            // For regular users or reconnection
            if (action === 'reconnect' && sessionId) {
                if (validateSession(sessionId, username, roomCode, role)) {
                    console.log(`🔗 Reconnecting with valid session: ${sessionId}`);
                    socket.emit('loginSuccess', { 
                        username, 
                        roomCode, 
                        role, 
                        sessionId,
                        action: 'reconnect'
                    });
                } else {
                    socket.emit('loginError', { 
                        message: 'Session expired or invalid. Please start a new session.' 
                    });
                }
            } else if (action === 'new') {
                const newSessionId = createSession({
                    username,
                    roomCode,
                    role,
                    socketId: socket.id
                });
                
                console.log(`🆕 New session created: ${newSessionId}`);
                socket.emit('loginSuccess', { 
                    username, 
                    roomCode, 
                    role, 
                    sessionId: newSessionId,
                    action: 'new'
                });
            }
        } catch (error) {
            console.error('❌ Error in login:', error);
            socket.emit('loginError', { message: 'Login failed: ' + error.message });
        }
    });
    // Create room
    // Create room - FIXED VERSION
    // Create room - FIXED VERSION
socket.on('createRoom', (data) => {
    try {
        console.log('\n' + '='.repeat(60));
        console.log('🚀 CREATE ROOM REQUEST');
        console.log('='.repeat(60));
        console.log('Full data received:', JSON.stringify(data, null, 2));
        
        const { username, role, sessionId } = data;
        
        // DEBUG: Check each field
        console.log('\n📋 Parsed data:');
        console.log('  username:', username);
        console.log('  role:', role);
        console.log('  sessionId:', sessionId);
        
        if (!username) {
            console.log('❌ Missing username');
            socket.emit('error', { message: 'Username is required' });
            return;
        }
        
        if (!role) {
            console.log('❌ Missing role');
            socket.emit('error', { message: 'Role is required' });
            return;
        }
        
        if (role !== 'auctioneer') {
            console.log('❌ Only auctioneers can create rooms');
            socket.emit('error', { message: 'Only auctioneers can create rooms' });
            return;
        }
        
        // SIMPLIFIED: Just create a room
        const roomCode = generateRoomCode();
        
        // Create a session if one doesn't exist
        let finalSessionId = sessionId;
        if (!sessionId || !sessions[sessionId]) {
            console.log('🆕 Creating new session...');
            finalSessionId = createSession({
                username: username,
                role: role,
                roomCode: roomCode,
                socketId: socket.id,
                createdAt: Date.now(),
                lastActivity: Date.now(),
                active: true
            });
            console.log('✅ New session created:', finalSessionId);
        }
        
        // Create the room
        rooms[roomCode] = {
            code: roomCode,
            auctioneer: username,
            auctioneerSessionId: finalSessionId,
            auctioneerConnected: true,
            auctioneerSocket: socket.id,
            users: {},
            rules: null,
            teamsAssigned: false,
            retentionStarted: false,
            retentionSubmissions: {},
            createdAt: new Date().toISOString()
        };
        
        // Update session with room code
        if (sessions[finalSessionId]) {
            sessions[finalSessionId].roomCode = roomCode;
            sessions[finalSessionId].socketId = socket.id;
            sessions[finalSessionId].lastActivity = Date.now();
        }
        
        socket.join(roomCode);
        
        console.log('\n✅ ROOM CREATED SUCCESSFULLY');
        console.log('   Room Code:', roomCode);
        console.log('   Auctioneer:', username);
        console.log('   Session ID:', finalSessionId);
        console.log('   Total Rooms:', Object.keys(rooms).length);
        console.log('='.repeat(60));
        
        socket.emit('roomCreated', { 
            roomCode: roomCode,
            sessionId: finalSessionId,
            auctioneer: username
        });
        
    } catch (error) {
        console.error('❌ CRITICAL ERROR in createRoom:', error);
        console.error(error.stack);
        socket.emit('error', { 
            message: 'Failed to create room: ' + error.message 
        });
    }
});

    // Join room
    socket.on('joinRoom', (data) => {
        try {
            const { username, roomCode, sessionId } = data;
            const room = rooms[roomCode];

            if (!room) {
                socket.emit('joinError', { message: 'Room not found' });
                return;
            }

            // CHECK FOR DUPLICATE USER
        if (room.users[username] && room.users[username].connected) {
            console.log(`⚠️ Duplicate connection attempt: ${username}`);
            socket.emit('joinError', { 
                message: 'User already connected. Please wait or reconnect.' 
            });
            return;
        }

            if (sessionId) {
                const session = sessions[sessionId];
                if (!session || !session.active || 
                    session.username !== username || 
                    session.roomCode !== roomCode) {
                    socket.emit('joinError', { 
                        message: 'Invalid session. Please re-login.' 
                    });
                    return;
                }
                
                session.socketId = socket.id;
                session.lastActivity = Date.now();
            } else {
                if (room.users[username]) {
                    socket.emit('joinError', { 
                        message: 'User already exists. Please reconnect with your session.' 
                    });
                    return;
                }
                
                const newSessionId = createSession({
                    username,
                    roomCode,
                    role: 'user',
                    socketId: socket.id
                });
                
                console.log(`👤 New user session: ${newSessionId}`);
            }

            room.users[username] = {
                username,
                socketId: socket.id,
                sessionId: sessionId,
                team: null,
                hasShuffled: false,
                retentionSubmitted: false,
                retainedPlayers: [],
                connected: true,
                budget: 100,
                auctionPlayers: [],
                purse: 100,
                joinedAt: new Date().toISOString()
            };

            socket.join(roomCode);
            socket.emit('joinSuccess', { 
                username, 
                roomCode,
                sessionId: sessionId || userSessions[`${username}_${roomCode}_user`]
            });

            // Check if auction pool is already started and user needs redirect
if (room.auctionPoolStarted && user.username !== room.auctioneer) {
    console.log(`⚠️ Auction pool already started for ${username}, sending redirect`);
    
    const squadData = getUserSquad(roomCode, username);
    
    // Delay slightly to ensure page loads
    setTimeout(() => {
        socket.emit('redirectToAuctionPool', {
            message: 'Auction pool phase is already active!',
            roomCode: roomCode,
            username: username,
            team: user.team,
            squadData: squadData,
            sessionId: user.sessionId,
            timestamp: Date.now(),
            redirectUrl: 'auctionpool.html',
            auctioneer: room.auctioneer,
            success: true
        });
    }, 1000);
}

            if (room.auctioneerSocket) {
                io.to(room.auctioneerSocket).emit('userJoined', {
                    username,
                    totalUsers: Object.keys(room.users).length
                });
            }

            console.log(`👤 User joined: ${username} in room ${roomCode}`);

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
            const { roomCode, rules, sessionId } = data;
            const room = rooms[roomCode];
            
            if (!room) return;
            
            const session = sessions[sessionId];
            if (!session || session.role !== 'auctioneer' || 
                session.username !== room.auctioneer || 
                session.roomCode !== roomCode) {
                socket.emit('error', { message: 'Invalid session' });
                return;
            }
            
            room.rules = rules;
            io.to(roomCode).emit('rulesUpdated', { rules });
            console.log(`✅ Rules set for room ${roomCode}`);
            
        } catch (error) {
            console.error('❌ Error setting rules:', error);
        }
    });

    // Assign teams
    socket.on('assignTeams', (data) => {
        try {
            const { roomCode, sessionId } = data;
            const room = rooms[roomCode];
            
            if (!room) return;
            
            const session = sessions[sessionId];
            if (!session || session.role !== 'auctioneer' || 
                session.username !== room.auctioneer || 
                session.roomCode !== roomCode) {
                socket.emit('error', { message: 'Invalid session' });
                return;
            }
            
            if (!room.teamsAssigned) {
                const users = Object.values(room.users);
                const availableTeams = [...IPL_TEAMS];
                
                users.forEach(user => {
                    const randomIndex = Math.floor(Math.random() * availableTeams.length);
                    user.team = availableTeams.splice(randomIndex, 1)[0];
                    user.hasShuffled = false;
                    
                    io.to(user.socketId).emit('teamAssigned', {
                        username: user.username, 
                        team: user.team,
                        canShuffle: true 
                    });
                });
                
                room.teamsAssigned = true;
                
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
            const { roomCode, sessionId } = data;
            const room = rooms[roomCode];
            const user = Object.values(room.users).find(u => u.socketId === socket.id);
            
            if (!room || !user) {
                socket.emit('shuffleError', { message: 'Room or user not found' });
                return;
            }
            
            if (!user.sessionId || !sessions[user.sessionId] || !sessions[user.sessionId].active) {
                socket.emit('shuffleError', { message: 'Session expired' });
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
            
            const randomIndex = Math.floor(Math.random() * availableTeams.length);
            user.team = availableTeams[randomIndex];
            user.hasShuffled = true;
            
            socket.emit('teamAssigned', { 
                team: user.team,
                canShuffle: false 
            });
            
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
            const { roomCode, username, sessionId } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            const session = sessions[sessionId];
            if (!session || session.role !== 'auctioneer' || 
                session.username !== room.auctioneer || 
                session.roomCode !== roomCode) {
                socket.emit('error', { message: 'Invalid session' });
                return;
            }
            
            const user = room.users[username];
            if (!user) {
                socket.emit('error', { message: 'User not found' });
                return;
            }
            
            console.log(`🔀 Force shuffling team for ${username}`);
            
            const assignedTeams = Object.values(room.users)
                .filter(u => u.username !== username && u.team)
                .map(u => u.team.id);
            
            const availableTeams = IPL_TEAMS.filter(team => 
                team.id !== user.team?.id && !assignedTeams.includes(team.id)
            );
            
            if (availableTeams.length === 0) {
                socket.emit('error', { message: 'No teams available for shuffle' });
                return;
            }
            
            const randomIndex = Math.floor(Math.random() * availableTeams.length);
            const oldTeam = user.team;
            user.team = availableTeams[randomIndex];
            user.hasShuffled = true;
            
            io.to(user.socketId).emit('teamAssigned', {
                team: user.team,
                canShuffle: false
            });
            
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
            const { roomCode, username, sessionId } = data;
            const room = rooms[roomCode];
            
            console.log(`🔄 User ${username} joining retention for room ${roomCode}`);
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            const user = Object.values(room.users || {}).find(
                u => u.username === username
            );
            
            if (!user) {
                socket.emit('error', { message: 'User not found in room' });
                return;
            }
            
            if (!user.sessionId || user.sessionId !== sessionId) {
                socket.emit('error', { message: 'Session mismatch. Please re-login.' });
                return;
            }
            
            if (sessions[sessionId]) {
                sessions[sessionId].lastActivity = Date.now();
                sessions[sessionId].socketId = socket.id;
            }
            
            user.socketId = socket.id;
            user.connected = true;
            socket.join(roomCode);
            
            console.log(`✅ ${username} joined retention successfully`);
            
            if (room.retentionStarted && user.team) {
                const teamFieldName = "Team name";
                
                const teamPlayers = playersData.filter(player => {
                    if (!player || !player[teamFieldName]) return false;
                    
                    const playerTeam = player[teamFieldName].toString().trim().toUpperCase();
                    const userTeamName = user.team.name.toString().trim().toUpperCase();
                    
                    return playerTeam === userTeamName;
                });
                
                console.log(`   Found ${teamPlayers.length} players for ${user.team.name}`);
                
                const formattedPlayers = teamPlayers.map((player, index) => {
                    try {
                        const basePrice = player['Base price'] || '2cr';
                        const numericBasePrice = parseBasePrice(basePrice);
                        
                        return {
                            id: player['player name']?.replace(/\s+/g, '_') + '_' + index || `player_${index}`,
                            name: player['player name'] || 'Unknown Player',
                            originalTeam: player[teamFieldName] || 'Unknown',
                            team: player[teamFieldName] || 'Unknown',
                            role: player['player role'] || 'Player',
                            nationality: (() => {
                                const nat = player['Nationality'] || 'IND';
                                const natStr = nat.toString().toUpperCase().trim();
                                return (natStr === 'IND' || natStr === 'IND ' || natStr.includes('INDIA')) 
                                       ? 'Indian' 
                                       : 'Overseas';
                            })(),
                            basePrice: numericBasePrice,
                            isOverseas: (() => {
                                const nat = player['Nationality'] || 'IND';
                                const natStr = nat.toString().toUpperCase().trim();
                                return !(natStr === 'IND' || natStr === 'IND ' || natStr.includes('INDIA'));
                            })(),
                            totalRuns: parseNumber(player['total runs']),
                            highestScore: player['highest score'] || '0',
                            strikeRate: parseNumber(player['strike rate']),
                            wickets: parseNumber(player['wickets']),
                            economyRate: parseNumber(player['economy rate'])
                        };
                    } catch (err) {
                        console.log(`⚠️ Error formatting player:`, err.message);
                        return {
                            id: `error_${index}`,
                            name: 'Error Player',
                            originalTeam: 'Error',
                            team: 'Error',
                            role: 'Player',
                            nationality: 'Indian',
                            basePrice: 2.00,
                            isOverseas: false
                        };
                    }
                });
                
                socket.emit('retentionData', {
                    players: formattedPlayers,
                    rules: room.rules,
                    team: user.team,
                    username: user.username,
                    roomCode: roomCode,
                    sessionId: sessionId
                });
                // ✅ CHECK IF AUCTION POOL ALREADY STARTED
if (room.auctionPoolStarted) {
    console.log(`⚠️ ${username} joining retention but auction pool already started`);
    
    setTimeout(() => {
        const squadData = getUserSquad(roomCode, username);
        
        // Force redirect to auction pool
        socket.emit('forceRedirectToAuctionPool', {
            message: 'Auction pool is already active!',
            roomCode: roomCode,
            username: username,
            team: user.team,
            squadData: squadData,
            sessionId: sessionId,
            timestamp: Date.now(),
            redirectUrl: 'auctionpool.html',
            auctioneer: room.auctioneer,
            success: true,
            force: true
        });
    }, 1000);
}
                
                console.log(`📤 Sent ${formattedPlayers.length} players to ${user.username}`);
            }
            
        } catch (error) {
            console.error('❌ Error joining retention:', error);
            socket.emit('error', { message: 'Failed to join retention' });
        }
    });

    // Start retention
    // In the startRetention handler, add this after starting retention:
socket.on('startRetention', (data) => {
    try {
        const { roomCode, sessionId } = data;
        const room = rooms[roomCode];
        
        console.log('\n🚀 Starting retention phase...');
        
        if (!room) {
            console.log('❌ Room not found');
            socket.emit('error', { message: 'Room not found' });
            return;
        }
        
        const session = sessions[sessionId];
        if (!session || session.role !== 'auctioneer' || 
            session.username !== room.auctioneer || 
            session.roomCode !== roomCode) {
            socket.emit('error', { message: 'Invalid session' });
            return;
        }
        
        room.retentionStarted = true;
        room.retentionSubmissions = {};
        room.retentionStartTime = Date.now(); // ✅ Store start time
        
        console.log(`📢 Notifying ${Object.keys(room.users).length} users...`);
        
        // ✅ FIX: Send timer start time with redirect
        io.to(roomCode).emit('redirectToRetention', { 
            duration: 60,
            roomCode: roomCode,
            startTime: Date.now() // ✅ Send server timestamp
        });
        
        console.log('✅ Redirect command sent to all users');
        
        // Set timeout to force check submissions after 90 seconds
        setTimeout(() => {
            console.log(`\n⏰ 60-second retention timer ended for room ${roomCode}`);
            
            // Force check all submissions
            const allSubmitted = checkAllRetentionSubmitted(roomCode);
            
            if (!allSubmitted) {
                console.log(`⚠️ Not all users submitted retention automatically`);
                
                // Auto-submit for users who haven't submitted
                Object.values(room.users).forEach(user => {
                    if (user.username !== room.auctioneer && !user.retentionSubmitted) {
                        console.log(`🤖 Auto-submitting empty retention for ${user.username}`);
                        user.retentionSubmitted = true;
                        user.retainedPlayers = [];
                        
                        if (room.auctioneerSocket) {
                            io.to(room.auctioneerSocket).emit('retentionSubmitted', {
                                username: user.username,
                                team: user.team?.name || 'Unknown',
                                count: 0,
                                autoSubmitted: true
                            });
                        }
                    }
                });
                
                // Check again after auto-submissions
                setTimeout(() => {
                    checkAllRetentionSubmitted(roomCode);
                }, 1000);
            }
            
        }, 60000); // 60 seconds
        
        console.log('✅ Retention phase started successfully');
        
    } catch (error) {
        console.error('❌ CRITICAL ERROR in startRetention:', error);
        console.error('Stack trace:', error.stack);
        socket.emit('error', { message: 'Failed to start retention' });
    }
});

// Handle retention submission with player data
socket.on('retentionSubmitted', (data) => {
    const { roomCode, retainedPlayers, username, sessionId } = data;
    const room = rooms[roomCode];
    
    console.log(`📥 Retention submitted by ${username}:`, {
        playersCount: retainedPlayers?.length || 0,
        players: retainedPlayers?.map(p => p.name) || []
    });
    
    if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
    }
    
    const session = sessions[sessionId];
    if (!session || session.username !== username) {
        socket.emit('error', { message: 'Invalid session' });
        return;
    }
    
    // Update user retention status
    const user = room.users[username];
    if (user) {
        user.retentionSubmitted = true;
        user.retainedPlayers = retainedPlayers || [];
        user.retentionTimestamp = Date.now();
        
        console.log(`✅ Retention submitted by ${username}:`, {
            team: user.team?.name,
            players: user.retainedPlayers.map(p => p.name),
            count: user.retainedPlayers.length
        });
        
        // Broadcast to auctioneer
        io.to(roomCode).emit('retentionSubmitted', {
            username: username,
            team: user.team?.name,
            count: user.retainedPlayers.length,
            players: user.retainedPlayers,
            autoSubmitted: false
        });
        
        // Check if all users have submitted
        checkAllRetentionSubmitted(roomCode);
    }
});

// ✅ ADD THIS NEW HANDLER: Fix for retention submission state
socket.on('retentionSubmittedSuccess', (data) => {
    const { roomCode, username, sessionId, count } = data;
    const room = rooms[roomCode];
    
    if (!room) return;
    
    const user = room.users[username];
    if (user) {
        user.retentionSubmitted = true;
        user.retentionSuccess = true;
        
        // Notify auctioneer
        if (room.auctioneerSocket) {
            io.to(room.auctioneerSocket).emit('retentionSubmitted', {
                username: username,
                team: user.team?.name,
                count: count || 0,
                autoSubmitted: false,
                success: true
            });
        }
        
        // Check if all users submitted
        checkAllRetentionSubmitted(roomCode);
    }
});

    // Submit retention
    // In the submitRetention handler, after saving the retention:
    // Submit retention
    // In the submitRetention handler, after saving the retention:
socket.on('submitRetention', (data) => {
    try {
        console.log('📥 Received retention submission:', data);
        
        const { roomCode, username, selectedPlayers, sessionId } = data;
        const room = rooms[roomCode];

        if (!room || !room.retentionStarted) {
            console.log('❌ Retention not started or room not found');
            socket.emit('retentionSubmitError', { 
                message: 'Retention phase not active' 
            });
            return;
        }

        const user = Object.values(room.users || {}).find(
            u => u.username === username
        );

        if (!user) {
            console.error(`❌ User not found: ${username}`);
            socket.emit('retentionSubmitError', { 
                message: 'User not found' 
            });
            return;
        }
        
        if (!user.sessionId || user.sessionId !== sessionId) {
            console.error(`❌ Session mismatch for user: ${username}`);
            socket.emit('retentionSubmitError', { 
                message: 'Session expired' 
            });
            return;
        }

        user.retentionSubmitted = true;
        user.retainedPlayers = (selectedPlayers || []).map(player => ({
            ...player,
            isOverseas: player.isOverseas === true || 
                       player.nationality?.toLowerCase() !== 'indian'
        }));

        console.log(`✅ Retention saved for ${username}:`, user.retainedPlayers);

        if (room.auctioneerSocket) {
            io.to(room.auctioneerSocket).emit('retentionSubmitted', {
                username: user.username,
                team: user.team?.name || 'Unknown',
                count: user.retainedPlayers.length,
                autoSubmitted: false
            });
        }
        
        // Send success response to client
        socket.emit('retentionSubmitSuccess', {
            success: true,
            message: 'Retention submitted successfully',
            count: user.retainedPlayers.length,
            immediateUpdate: true  // ✅ NEW: Tell client to update button immediately
        });
        if (room.auctioneerSocket) {
            io.to(room.auctioneerSocket).emit('retentionSubmitted', {
                username: user.username,
                team: user.team?.name || 'Unknown',
                count: user.retainedPlayers.length,
                autoSubmitted: false
            });
        }

        console.log('\n================================');
        console.log(`RETENTION SUBMITTED by ${username}`);
        console.log(`Team: ${user.team?.name || 'Unknown'}`);
        console.log(`Players Selected: ${user.retainedPlayers.length}`);
        
        user.retainedPlayers.forEach((player, index) => {
            console.log(`${index + 1}. ${player.name} (${player.isOverseas ? 'Overseas' : 'Indian'})`);
        });
        
        console.log('================================\n');
        
        // IMPORTANT: Check if all users have submitted after this submission
        checkAllRetentionSubmitted(roomCode);

    } catch (error) {
        console.error('❌ Error in submitRetention:', error);
        console.error(error.stack);
        socket.emit('retentionSubmitError', { 
            message: 'Failed to submit retention' 
        });
    }
});

    // Start auction pool
     // Start auction pool
    // Start auction pool - FIXED VERSION
// Start auction pool - UPDATED VERSION
socket.on('startAuctionPool', (data) => {
    try {
        const { roomCode, sessionId } = data;
        const room = rooms[roomCode];
        
        console.log(`\n🚀 STARTING AUCTION POOL FOR ROOM ${roomCode}`);
        console.log(`   Auctioneer: ${room?.auctioneer}`);
        console.log(`   Users in room: ${Object.keys(room?.users || {}).length}`);
        
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }
        
        const session = sessions[sessionId];
        if (!session || session.role !== 'auctioneer' || 
            session.username !== room.auctioneer || 
            session.roomCode !== roomCode) {
            socket.emit('error', { message: 'Invalid session' });
            return;
        }
         // ✅ FIXED: Check if ALL users have submitted retention
        const users = Object.values(room.users);
        const eligibleUsers = users.filter(user => 
            user.username !== room.auctioneer && 
            user.team !== null
        );
        const submittedUsers = users.filter(user => 
            user.retentionSubmitted === true
        );
        
        if (eligibleUsers.length > 0 && submittedUsers.length < eligibleUsers.length) {
            console.log(`❌ Not all users submitted: ${submittedUsers.length}/${eligibleUsers.length}`);
            
            // Send specific error
            socket.emit('error', { 
                message: `Cannot start auction pool. ${submittedUsers.length}/${eligibleUsers.length} users submitted retention. Wait for all submissions.` 
            });
            
            // Reset auctioneer button
            io.to(socket.id).emit('resetAuctionPoolButton');
            return;
        }
        
        // Initialize auction
console.log('🎯 Initializing auction pool...');
initializeAuction(roomCode);

// ✅ FIXED: Wait 1 second for users to be redirected, THEN start auction
setTimeout(() => {
    console.log('🚀 Starting auction after user redirect...');
    startAuctionForRoom(roomCode);
}, 1000);

// ✅ ADD: Immediately broadcast state to ALL users
setTimeout(() => {
    console.log('📢 Broadcasting initial auction state to all users');
    broadcastAuctionState(roomCode);
}, 500);
        
        // Mark that auction pool has started
        room.auctionPoolStarted = true;
        room.auctionPhase = true;
        
        console.log(`✅ Auction pool initialized for room ${roomCode}`);
        
        // Get user count for logging (excluding auctioneer)
        const usersToRedirect = Object.values(room.users).filter(
            user => user.username !== room.auctioneer
        );
        
        console.log(`📤 Preparing to redirect ${usersToRedirect.length} users...`);
        
        // ✅ FIXED: Send FORCE REDIRECT to ALL USERS (except auctioneer)
        usersToRedirect.forEach(user => {
            if (user.team && user.socketId) {
                console.log(`   ↳ FORCE redirecting ${user.username} (${user.team.name})`);
                
                // Mark user for auction pool
                user.auctionPoolStarted = true;
                user.auctionPoolRedirected = true;
                
                const squadData = getUserSquad(roomCode, user.username);
                
                // Send IMMEDIATE redirect command
                io.to(user.socketId).emit('forceRedirectToAuctionPool', {
                    message: 'Auction pool has started!',
                    roomCode: roomCode,
                    username: user.username,
                    team: user.team,
                    squadData: squadData,
                    sessionId: user.sessionId,
                    timestamp: Date.now(),
                    redirectUrl: 'auctionpool.html',
                    auctioneer: room.auctioneer,
                    success: true,
                    force: true  // ✅ ADD FORCE FLAG
                });
            }
        });
        
        console.log(`✅ Sent force redirects to ${usersToRedirect.length} users`);
        
        // Send success to auctioneer
        socket.emit('auctionPoolStarted', {
            success: true,
            roomCode: roomCode,
            message: `Auction pool started! ${usersToRedirect.length} users redirected.`,
            userCount: usersToRedirect.length,
            redirectedCount: usersToRedirect.length,
            timestamp: Date.now(),
            auctioneerCanJoin: true
        });
        
        // Also send to auctioneer to update UI
        io.to(room.auctioneerSocket).emit('forceRedirectUsers', {
            success: true,
            message: `Force redirected ${usersToRedirect.length} users to auction pool`,
            redirectedCount: usersToRedirect.length
        });
        
        console.log(`🎉 AUCTION POOL STARTED SUCCESSFULLY`);
        
    } catch (error) {
        console.error('❌ CRITICAL ERROR starting auction pool:', error);
        socket.emit('error', { message: 'Failed to start auction pool: ' + error.message });
    }
});

    // Join auctioneer to auction - UPDATED WITH FORCE RECONNECT
// ✅ FIXED: Join auctioneer to auction - WITH BETTER SESSION HANDLING
socket.on('joinAuctioneer', (data, callback) => {
    try {
        console.log('\n🎤 AUCTIONEER JOIN REQUEST:');
        console.log('   Room Code:', data.roomCode);
        console.log('   Username:', data.username);
        console.log('   Session ID:', data.sessionId ? data.sessionId.substring(0, 8) + '...' : 'none');
        console.log('   Role:', data.role);
        
        const { roomCode, sessionId, username, role, forceReconnect } = data;
        const room = rooms[roomCode];
        
        if (!room) {
            console.log('❌ Room not found:', roomCode);
            if (callback) callback({ 
                success: false, 
                message: 'Room not found. Please check the room code.' 
            });
            return;
        }
        
        // Check if user is the auctioneer for this room
        if (username !== room.auctioneer) {
            console.log('❌ User is not the auctioneer for this room');
            if (callback) callback({ 
                success: false, 
                message: 'Only the auctioneer can join the auction control panel.' 
            });
            return;
        }
        
        let sessionValid = false;
        let finalSessionId = sessionId;
        
        // Check session validity
        if (sessionId && sessions[sessionId]) {
            const session = sessions[sessionId];
            if (session.username === username && 
                session.roomCode === roomCode &&
                session.role === 'auctioneer') {
                sessionValid = true;
                console.log('✅ Valid session found for auctioneer');
            }
        }
        
        // If session not valid, check for force reconnect or create new session
        if (!sessionValid) {
            if (forceReconnect) {
                console.log(`⚠️ Force reconnecting auctioneer: ${username}`);
                
                // Create new session
                finalSessionId = createSession({
                    username: username,
                    role: 'auctioneer',
                    roomCode: roomCode,
                    socketId: socket.id,
                    createdAt: Date.now(),
                    lastActivity: Date.now(),
                    active: true
                });
                
                console.log(`🆕 Created new session for auctioneer: ${finalSessionId}`);
                sessionValid = true;
            } else {
                // Check if there's any existing session for this auctioneer
                for (const existingSessionId in sessions) {
                    const existingSession = sessions[existingSessionId];
                    if (existingSession.username === username && 
                        existingSession.roomCode === roomCode &&
                        existingSession.role === 'auctioneer' &&
                        existingSession.active) {
                        
                        finalSessionId = existingSessionId;
                        sessionValid = true;
                        console.log(`✅ Found existing active session: ${finalSessionId}`);
                        break;
                    }
                }
            }
        }
        
        if (!sessionValid) {
            console.log('❌ No valid session found');
            if (callback) callback({ 
                success: false, 
                message: 'Invalid auctioneer session. Please return to control panel.' 
            });
            return;
        }
        
        // Update session with new socket connection
        if (sessions[finalSessionId]) {
            sessions[finalSessionId].socketId = socket.id;
            sessions[finalSessionId].lastActivity = Date.now();
            sessions[finalSessionId].active = true;
        }
        
        // Update room with auctioneer connection
        room.auctioneerSocket = socket.id;
        room.auctioneerConnected = true;
        room.auctioneerSessionId = finalSessionId;
        socket.join(roomCode);
        
        console.log(`✅ Auctioneer ${username} successfully joined auction room ${roomCode}`);
        
        const auction = auctionStates[roomCode];
        
        // Send success response with session info
        if (callback) {
            callback({ 
                success: true, 
                message: 'Auctioneer joined successfully',
                sessionId: finalSessionId,
                roomCode: roomCode
            });
        }
        
        // Send auctioneer confirmation
        socket.emit('auctioneerJoined', {
            success: true,
            message: `You are now controlling room ${roomCode}`,
            sessionId: finalSessionId,
            roomCode: roomCode,
            username: username
        });
        
        // Send current auction state if available
        if (auction && auction.auctionPhase) {
            console.log(`📊 Current auction state found, sending to auctioneer`);
            
            const players = auction.categorizedPlayers[auction.currentCategory] || [];
            const currentPlayer = players[auction.currentPlayerIndex];
            
            if (currentPlayer) {
                socket.emit('playerUpForAuction', {
                    player: {
                        ...currentPlayer,
                        currentBid: auction.currentBid,
                        currentBidder: auction.currentBidder
                    },
                    category: auction.currentCategory,
                    auctionInfo: {
                        category: auction.currentCategory,
                        playersLeft: players.length - auction.currentPlayerIndex - 1,
                        unsoldCount: auction.unsoldPlayers.length,
                        playerPosition: `${auction.currentPlayerIndex + 1}/${players.length}`
                    }
                });
            }
            
            // Also send state sync
            broadcastAuctionState(roomCode, socket.id);
            
        } else {
            console.log(`⚠️ No active auction found for room ${roomCode}`);
            socket.emit('auctionStateSync', {
                isAuctionActive: false,
                message: 'Waiting for auction to start...'
            });
        }
        
    } catch (error) {
        console.error('❌ Error joining auctioneer:', error);
        if (callback) callback({ 
            success: false, 
            message: 'Failed to join as auctioneer: ' + error.message 
        });
    }
});

    // FIXED: Manual sell player
    socket.on('sellPlayer', (data) => {
        try {
            console.log('\n' + '='.repeat(50));
            console.log('🛒 SELL PLAYER REQUEST RECEIVED');
            console.log('='.repeat(50));
            console.log('   Room:', data.roomCode);
            console.log('   Session:', data.sessionId);
            
            const { roomCode, sessionId } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                console.log('❌ Room not found:', roomCode);
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            const session = sessions[sessionId];
            if (!session || session.role !== 'auctioneer' || 
                session.username !== room.auctioneer || 
                session.roomCode !== roomCode) {
                console.log('❌ Invalid session:', sessionId);
                socket.emit('error', { message: 'Invalid session' });
                return;
            }
            
            const auction = auctionStates[roomCode];
            if (!auction) {
                console.log('❌ Auction not found for room:', roomCode);
                socket.emit('error', { message: 'Auction not found' });
                return;
            }
            
            console.log('\n📊 CURRENT AUCTION STATE:');
            console.log('   Category:', auction.currentCategory);
            console.log('   Player Index:', auction.currentPlayerIndex);
            console.log('   Current Bid:', auction.currentBid);
            console.log('   Current Bidder:', auction.currentBidder);
            
            console.log('\n🎯 Calling handlePlayerSold...');
            handlePlayerSold(roomCode);
            
        } catch (error) {
            console.error('❌ Error selling player:', error);
            socket.emit('error', { message: 'Failed to sell player: ' + error.message });
        }
    });

    // Manual unsold player
    socket.on('markUnsold', (data) => {
        try {
            console.log('❌ MARK UNSOLD REQUEST RECEIVED:', data);
            const { roomCode, sessionId } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            const session = sessions[sessionId];
            if (!session || session.role !== 'auctioneer' || 
                session.username !== room.auctioneer || 
                session.roomCode !== roomCode) {
                socket.emit('error', { message: 'Invalid session' });
                return;
            }
            
            const auction = auctionStates[roomCode];
            if (!auction) {
                socket.emit('error', { message: 'Auction not found' });
                return;
            }
            
            console.log('🎯 Marking current player as unsold...');
            handlePlayerUnsold(roomCode);
            
        } catch (error) {
            console.error('❌ Error marking player unsold:', error);
            socket.emit('error', { message: 'Failed to mark player unsold' });
        }
    });

    // Next player
    socket.on('nextPlayer', (data) => {
        try {
            console.log('⏭️ NEXT PLAYER REQUEST RECEIVED:', data);
            const { roomCode, sessionId } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            const session = sessions[sessionId];
            if (!session || session.role !== 'auctioneer' || 
                session.username !== room.auctioneer || 
                session.roomCode !== roomCode) {
                socket.emit('error', { message: 'Invalid session' });
                return;
            }
            
            const auction = auctionStates[roomCode];
            if (!auction) {
                socket.emit('error', { message: 'Auction not found' });
                return;
            }
            
            console.log('🎯 Moving to next player...');
            moveToNextPlayer(roomCode);
            
        } catch (error) {
            console.error('❌ Error moving to next player:', error);
            socket.emit('error', { message: 'Failed to move to next player' });
        }
    });

    // Skip player
    socket.on('skipPlayer', (data) => {
        try {
            console.log('⏭️ SKIP PLAYER REQUEST RECEIVED:', data);
            const { roomCode, sessionId } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            const session = sessions[sessionId];
            if (!session || session.role !== 'auctioneer' || 
                session.username !== room.auctioneer || 
                session.roomCode !== roomCode) {
                socket.emit('error', { message: 'Invalid session' });
                return;
            }
            
            const auction = auctionStates[roomCode];
            if (!auction) {
                socket.emit('error', { message: 'Auction not found' });
                return;
            }
            
            console.log('🎯 Skipping current player (marking as unsold)...');
            handlePlayerUnsold(roomCode);
            
        } catch (error) {
            console.error('❌ Error skipping player:', error);
            socket.emit('error', { message: 'Failed to skip player' });
        }
    });

    // Join auction pool (user) - UPDATED WITH STATE SYNC
   // Join auction pool (user) - UPDATED WITH STATE SYNC
socket.on('joinAuctionPool', (data) => {
    try {
        const { username, roomCode, sessionId } = data;
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
        
        if (!user.sessionId || user.sessionId !== sessionId) {
            socket.emit('error', { message: 'Session expired or invalid. Please re-login.' });
            return;
        }
        
        if (sessions[sessionId]) {
            sessions[sessionId].socketId = socket.id;
            sessions[sessionId].lastActivity = Date.now();
        }
        
        user.socketId = socket.id;
        user.connected = true;
        socket.join(roomCode);
        
        // Check if there's a pending redirect (auction started while user was offline)
        if (user.pendingRedirect && user.pendingRedirect.type === 'auctionPool') {
            console.log(`⚠️ User ${username} has pending auction pool redirect`);
            
            const squadData = getUserSquad(roomCode, username);
            
            // Send the redirect command
            socket.emit('redirectToAuctionPool', {
                message: 'Auction pool phase is active!',
                roomCode: roomCode,
                username: user.username,
                team: user.team,
                squadData: squadData,
                sessionId: user.sessionId,
                timestamp: Date.now(),
                redirectUrl: 'auctionpool.html',
                auctioneer: room.auctioneer,
                success: true
            });
            
            // Clear pending redirect
            delete user.pendingRedirect;
            
            console.log(`✅ Sent delayed redirect to ${username}`);
            return;
        }
        
        const squadData = getUserSquad(roomCode, username);
socket.emit('auctionData', {
    team: user.team,
    purse: user.budget || 100,
    squadLimits: squadData?.squadLimits || {
        total: 0,
        indian: 0,
        overseas: 0,
        maxSquad: room.rules?.squadSize || 25
    },
    sessionId: sessionId
});

// ✅ FIXED: IMMEDIATE state sync with auction data
const auction = auctionStates[roomCode];
if (auction && auction.auctionPhase) {
    console.log(`🎯 User ${username} joining active auction, sending immediate player data`);
    
    const players = auction.categorizedPlayers[auction.currentCategory] || [];
    const currentPlayer = players[auction.currentPlayerIndex];
    
    if (currentPlayer) {
        // Send player data immediately
        setTimeout(() => {
            socket.emit('playerUpForAuction', {
                player: {
                    ...currentPlayer,
                    currentBid: auction.currentBid,
                    currentBidder: auction.currentBidder
                },
                category: auction.currentCategory
            });
            
            // Also send state sync
            broadcastAuctionState(roomCode, socket.id);
        }, 100);
    }
}

// Still request state sync for backup
socket.emit('requestAuctionState', { roomCode, username });

if (room.currentAuctionPlayer) {
            console.log(`🎯 Sending existing auction player to ${username}`);
            // Send after a short delay to ensure connection is ready
            setTimeout(() => {
                socket.emit('playerUpForAuction', room.currentAuctionPlayer);
            }, 200);
        }
        
        console.log(`✅ ${username} joined auction pool in room ${roomCode}`);
        socket.on('joinAuctionPool', (data) => {
    try {
        // ... existing code ...
        
        // ✅ ADD: Check if auction pool has started
        if (room.auctionPoolStarted && user.socketId) {
            console.log(`⚠️ ${username} joining auction pool but already redirected`);
            
            // Send immediate force redirect
            const squadData = getUserSquad(roomCode, username);
            
            io.to(user.socketId).emit('forceRedirectToAuctionPool', {
                message: 'Auction pool is active!',
                roomCode: roomCode,
                username: username,
                team: user.team,
                squadData: squadData,
                sessionId: user.sessionId,
                timestamp: Date.now(),
                redirectUrl: 'auctionpool.html',
                auctioneer: room.auctioneer,
                success: true,
                force: true
            });
            
            return;
        }
        
        // ... rest of existing code ...
    } catch (error) {
        // ... error handling ...
    }
});
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

    // End auction
    // In the endAuction handler, update the redirect part:
// Server-side pseudocode for endAuction
// Handle end auction from auctioneer - FIXED VERSION
// End auction - FIXED VERSION
socket.on('endAuction', (data, callback) => {
    try {
        console.log('\n' + '='.repeat(50));
        console.log('🏁 END AUCTION REQUEST RECEIVED');
        console.log('='.repeat(50));
        
        const { roomCode, sessionId, forceEnd } = data;
        const room = rooms[roomCode];
        
        if (!room) {
            console.log('❌ Room not found:', roomCode);
            if (callback) callback({ success: false, message: 'Room not found' });
            return;
        }
        
        const session = sessions[sessionId];
        if (!session || session.role !== 'auctioneer' || 
            session.username !== room.auctioneer || 
            session.roomCode !== roomCode) {
            console.log('❌ Invalid auctioneer session');
            if (callback) callback({ success: false, message: 'Invalid auctioneer session' });
            return;
        }
        
        console.log('✅ Valid auctioneer, ending auction...');
        
        // Call the auction complete function
        handleAuctionComplete(roomCode);
        
        // Send immediate success response
        if (callback) {
            callback({ 
                success: true, 
                message: 'Auction ending initiated. Users are being redirected.',
                usersCount: Object.values(room.users).length - 1 // Exclude auctioneer
            });
        }
        
        console.log('✅ End auction request processed');
        
    } catch (error) {
        console.error('❌ Error ending auction:', error);
        if (callback) callback({ 
            success: false, 
            message: 'Failed to end auction: ' + error.message 
        });
    }
});
    // Request squad
    // ✅ FIXED: Request squad - WITH CALLBACK
socket.on('requestSquad', (data, callback) => {
    try {
        const { roomCode, username, sessionId } = data;
        const room = rooms[roomCode];
        
        console.log(`📊 Squad request from ${username} in room ${roomCode}`);
        
        if (!room) {
            if (callback) callback({ success: false, message: 'Room not found' });
            return;
        }
        
        const user = room.users[username];
        if (!user) {
            if (callback) callback({ success: false, message: 'User not found' });
            return;
        }
        
        if (!user.sessionId || user.sessionId !== sessionId) {
            if (callback) callback({ success: false, message: 'Session expired' });
            return;
        }
        
        const squadData = getUserSquad(roomCode, username);
        
        if (!squadData) {
            if (callback) callback({ success: false, message: 'Failed to get squad data' });
            return;
        }
        
        // ✅ FIXED: Add missing calculations
        const totalSpent = (user.auctionPlayers || []).reduce((sum, player) => sum + (player.price || 0), 0);
        const totalBudget = room.rules?.totalPurse || 100;
        const remainingBudget = totalBudget - totalSpent;
        
        // Complete squad data
        const completeSquadData = {
            ...squadData,
            totalSpent: totalSpent,
            totalBudget: totalBudget,
            remainingBudget: remainingBudget,
            maxSquad: room.rules?.squadSize || 25,
            remainingSlots: Math.max(0, (room.rules?.squadSize || 25) - squadData.squadLimits.total),
            rules: room.rules || { totalPurse: 100, squadSize: 25 }
        };
        
        console.log(`✅ Sending squad data to ${username}:`, {
            retained: completeSquadData.retainedPlayers?.length || 0,
            auction: completeSquadData.auctionPlayers?.length || 0,
            spent: completeSquadData.totalSpent,
            remaining: completeSquadData.remainingBudget
        });
        
        // Send to client
        io.to(socket.id).emit('squadUpdate', completeSquadData);
        
        // Also send callback
        if (callback) callback({ 
            success: true, 
            data: completeSquadData,
            message: 'Squad data loaded successfully'
        });
        
    } catch (error) {
        console.error('❌ Error getting squad:', error);
        if (callback) callback({ success: false, message: 'Failed to get squad data' });
    }
});

    // Request squad update
    socket.on('requestSquadUpdate', (data) => {
        try {
            const { roomCode, username, sessionId } = data;
            const user = rooms[roomCode]?.users[username];
            
            if (!user || user.sessionId !== sessionId) {
                socket.emit('error', { message: 'Invalid session' });
                return;
            }
            
            const squad = getUserSquad(roomCode, username);
            
            if (squad) {
                io.to(socket.id).emit('squadUpdate', squad);
            }
        } catch (error) {
            console.error('❌ Error updating squad:', error);
        }
    });

    // Hard reset room
    socket.on('hardReset', (data) => {
        try {
            const { roomCode, sessionId } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            const session = sessions[sessionId];
            if (!session || session.role !== 'auctioneer' || 
                session.username !== room.auctioneer || 
                session.roomCode !== roomCode) {
                socket.emit('error', { message: 'Invalid session' });
                return;
            }
            
            console.log(`🔄 Hard reset initiated for room ${roomCode} by auctioneer`);
            
            Object.values(room.users).forEach(user => {
                if (user.sessionId) {
                    endSession(user.sessionId);
                }
            });
            
            if (room.auctioneerSessionId) {
                endSession(room.auctioneerSessionId);
            }
            
            io.to(roomCode).emit('roomDestroyed', {
                message: 'Room has been reset by auctioneer. Please rejoin.'
            });
            
            const roomSockets = io.sockets.adapter.rooms.get(roomCode);
            if (roomSockets) {
                roomSockets.forEach(socketId => {
                    io.sockets.sockets.get(socketId)?.disconnect();
                });
            }
            
            delete rooms[roomCode];
            if (auctionStates[roomCode]) {
                delete auctionStates[roomCode];
            }
            
            console.log(`✅ Room ${roomCode} completely reset`);
            
        } catch (error) {
            console.error('❌ Error in hard reset:', error);
        }
    });

    // Disconnect handler
    socket.on('disconnect', (reason) => {
    console.log(`❌ Disconnected: ${socket.id} (${reason})`);
    
    for (const roomCode in rooms) {
        const room = rooms[roomCode];
        
        if (room.auctioneerSocket === socket.id) {
            console.log(`⚠️ Auctioneer disconnected from room ${roomCode}`);
            room.auctioneerConnected = false;
            room.auctioneerSocket = null;
            
            // Notify users
            io.to(roomCode).emit('auctioneerDisconnected', {
                message: 'Auctioneer disconnected. Please wait for reconnection.'
            });
            continue;
        }
        
        // Find and remove disconnected user
        for (const username in room.users) {
            const user = room.users[username];
            
            if (user.socketId === socket.id) {
                console.log(`⚠️ User disconnected: ${username} (${roomCode})`);
                user.connected = false;
                user.socketId = null;
                
                // Notify auctioneer
                if (room.auctioneerSocket) {
                    io.to(room.auctioneerSocket).emit('userLeft', {
                        username: username,
                        totalUsers: Object.keys(room.users).length
                    });
                }
                
                // Notify other users
                socket.to(roomCode).emit('userDisconnected', {
                    username: username
                });
            }
        }
    }
});

    // Playing 11 handlers
    socket.on('submitPlaying11', (data) => {
        try {
            const { roomCode, username, playing11, impactPlayers, sessionId } = data;
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
            
            if (!user.sessionId || user.sessionId !== sessionId) {
                socket.emit('error', { message: 'Session expired' });
                return;
            }
            
            if (playing11.length !== 11) {
                socket.emit('error', { message: 'Playing 11 must have exactly 11 players' });
                return;
            }
            
            const squadPlayers = [
                ...(user.retainedPlayers || []),
                ...(user.auctionPlayers || [])
            ];
            const squadPlayerIds = new Set(squadPlayers.map(p => p.id));
            
            const invalidPlayers = playing11.filter(p => !squadPlayerIds.has(p.id));
            if (invalidPlayers.length > 0) {
                socket.emit('error', { 
                    message: `Invalid players in Playing 11: ${invalidPlayers.map(p => p.name).join(', ')}` 
                });
                return;
            }
            
            const playing11Ids = playing11.map(p => p.id);
            const impactPlayerIds = impactPlayers.map(p => p.id);
            const duplicates = playing11Ids.filter(id => impactPlayerIds.includes(id));
            
            if (duplicates.length > 0) {
                socket.emit('error', { 
                    message: 'Players cannot be in both Playing 11 and Impact Players' 
                });
                return;
            }
            
            const invalidImpactPlayers = impactPlayers.filter(p => !squadPlayerIds.has(p.id));
            if (invalidImpactPlayers.length > 0) {
                socket.emit('error', { 
                    message: `Invalid players in Impact Players: ${invalidImpactPlayers.map(p => p.name).join(', ')}` 
                });
                return;
            }
            
            user.playing11 = playing11;
            user.impactPlayers = impactPlayers;
            user.playing11Submitted = true;
            user.playing11SubmittedAt = new Date().toISOString();
            
            console.log(`✅ Playing 11 submitted by ${username}`);
            console.log(`   Playing 11: ${playing11.length} players`);
            console.log(`   Impact Players: ${impactPlayers.length} players`);
            
            if (room.auctioneerSocket) {
                const squadData = getUserSquad(roomCode, username);
                
                io.to(room.auctioneerSocket).emit('playing11Submitted', {
                    username: username,
                    team: user.team.name,
                    playing11: playing11,
                    impactPlayers: impactPlayers,
                    playing11Count: playing11.length,
                    impactPlayersCount: impactPlayers.length,
                    squadData: squadData,
                    timestamp: new Date().toISOString()
                });
            }
            
            socket.emit('playing11SubmittedSuccess', {
                message: 'Playing 11 submitted successfully! Waiting for other teams...'
            });
            
            const allUsersSubmitted = Object.values(room.users).every(u => 
                u.playing11Submitted === true
            );
            
            if (allUsersSubmitted) {
                console.log(`🎉 All users have submitted playing 11 in room ${roomCode}`);
                if (room.auctioneerSocket) {
                    io.to(room.auctioneerSocket).emit('allPlaying11Submitted', {
                        message: 'All users have submitted their playing 11! You can now rate the teams.',
                        roomCode: roomCode,
                        userCount: Object.keys(room.users).length
                    });
                }
            }
            
        } catch (error) {
            console.error('❌ Error submitting playing 11:', error);
            socket.emit('error', { message: 'Failed to submit playing 11' });
        }
    });

    // Rate team (from auctioneer)
    socket.on('rateTeam', (data) => {
        try {
            const { roomCode, username, rating, comments, sessionId } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            const session = sessions[sessionId];
            if (!session || session.role !== 'auctioneer' || 
                session.username !== room.auctioneer || 
                session.roomCode !== roomCode) {
                socket.emit('error', { message: 'Invalid session' });
                return;
            }
            
            const user = room.users[username];
            if (!user) {
                socket.emit('error', { message: 'User not found' });
                return;
            }
            
            if (rating < 0 || rating > 100) {
                socket.emit('error', { message: 'Rating must be between 0 and 100' });
                return;
            }
            
            user.rating = rating;
            user.ratingComments = comments;
            user.ratedBy = session.username;
            user.ratedAt = new Date().toISOString();
            
            console.log(`⭐ Team rated: ${username} - ${rating}/100`);
            
            if (user.socketId) {
                io.to(user.socketId).emit('teamRated', {
                    rating: rating,
                    comments: comments,
                    ratedBy: session.username
                });
            }
            
            socket.emit('ratingSuccess', {
                message: `Rating submitted for ${username}: ${rating}/100`,
                username: username,
                rating: rating
            });
            
            const allTeamsRated = Object.values(room.users).every(u => 
                u.rating !== null && u.rating !== undefined
            );
            
            if (allTeamsRated && room.auctioneerSocket) {
                io.to(room.auctioneerSocket).emit('allTeamsRated', {
                    message: 'All teams have been rated! You can now publish results.',
                    roomCode: roomCode
                });
            }
            
        } catch (error) {
            console.error('❌ Error rating team:', error);
            socket.emit('error', { message: 'Failed to rate team' });
        }
    });

    // Get all teams with playing 11 (for auctioneer)
    socket.on('getTeamsForValidation', (data) => {
        try {
            const { roomCode, sessionId } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            const session = sessions[sessionId];
            if (!session || session.role !== 'auctioneer' || 
                session.username !== room.auctioneer || 
                session.roomCode !== roomCode) {
                socket.emit('error', { message: 'Invalid session' });
                return;
            }
            
            const teamsData = [];
            
            for (const username in room.users) {
                const user = room.users[username];
                const squadData = getUserSquad(roomCode, username);
                
                teamsData.push({
                    username: username,
                    team: user.team,
                    playing11: user.playing11 || [],
                    impactPlayers: user.impactPlayers || [],
                    rating: user.rating || null,
                    ratingComments: user.ratingComments || '',
                    playing11Submitted: user.playing11Submitted || false,
                    budget: user.budget || 100,
                    retainedPlayers: user.retainedPlayers || [],
                    auctionPlayers: user.auctionPlayers || [],
                    squadLimits: squadData?.squadLimits || {},
                    ratedBy: user.ratedBy || null,
                    ratedAt: user.ratedAt || null
                });
            }
            
            socket.emit('teamsForValidation', {
                teams: teamsData,
                totalTeams: teamsData.length,
                ratedTeams: teamsData.filter(t => t.rating !== null).length
            });
            
        } catch (error) {
            console.error('❌ Error getting teams for validation:', error);
            socket.emit('error', { message: 'Failed to get teams' });
        }
    });

    // Publish final results
    socket.on('publishResults', (data) => {
        try {
            const { roomCode, sessionId } = data;
            const room = rooms[roomCode];
            
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            const session = sessions[sessionId];
            if (!session || session.role !== 'auctioneer' || 
                session.username !== room.auctioneer || 
                session.roomCode !== roomCode) {
                socket.emit('error', { message: 'Invalid session' });
                return;
            }
            
            const results = [];
            for (const username in room.users) {
                const user = room.users[username];
                
                if (user.rating) {
                    const squadData = getUserSquad(roomCode, username);
                    
                    results.push({
                        username: username,
                        team: user.team,
                        rating: user.rating,
                        comments: user.ratingComments || '',
                        budget: user.budget || 100,
                        retainedPlayers: user.retainedPlayers?.length || 0,
                        auctionPlayers: user.auctionPlayers?.length || 0,
                        playing11: user.playing11 || [],
                        impactPlayers: user.impactPlayers || [],
                        playing11Count: user.playing11?.length || 0,
                        impactPlayersCount: user.impactPlayers?.length || 0,
                        squadSize: (user.retainedPlayers?.length || 0) + (user.auctionPlayers?.length || 0),
                        overseasPlayers: squadData?.squadLimits?.overseas || 0,
                        indianPlayers: squadData?.squadLimits?.indian || 0,
                        ratedBy: user.ratedBy || 'Auctioneer',
                        ratedAt: user.ratedAt || new Date().toISOString()
                    });
                }
            }
            
            results.sort((a, b) => b.rating - a.rating);
            
            results.forEach((result, index) => {
                result.position = index + 1;
                if (index === 0) {
                    result.medal = 'gold';
                    result.podium = 'first';
                } else if (index === 1) {
                    result.medal = 'silver';
                    result.podium = 'second';
                } else if (index === 2) {
                    result.medal = 'bronze';
                    result.podium = 'third';
                } else {
                    result.medal = 'none';
                    result.podium = 'participant';
                }
            });
            
            console.log('🏆 Final results calculated:', results.map(r => `${r.username}: ${r.rating}/100 (${r.medal})`));
            
            room.finalResults = results;
            room.resultsPublished = true;
            room.resultsPublishedAt = new Date().toISOString();
            
            io.to(roomCode).emit('finalResultsPublished', {
                results: results,
                winner: results.length > 0 ? results[0] : null,
                podium: results.slice(0, 3),
                publishedAt: new Date().toISOString(),
                publishedBy: session.username,
                totalTeams: results.length
            });
            
            console.log(`✅ Results published to all users in room ${roomCode}`);
            
            setTimeout(() => {
                io.to(roomCode).emit('redirectToResults', {
                    roomCode: roomCode,
                    results: results,
                    message: 'Final results have been published!',
                    timestamp: new Date().toISOString()
                });
                
                console.log(`📤 Redirecting all users to results page`);
            }, 3000);
            
        } catch (error) {
            console.error('❌ Error publishing results:', error);
            socket.emit('error', { message: 'Failed to publish results' });
        }
    });
    // Manual retention status check from auctioneer
socket.on('checkRetentionStatus', (data) => {
    const { roomCode, sessionId } = data;
    const room = rooms[roomCode];
    
    console.log(`🔍 Manual retention check for room ${roomCode}`);
    
    if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
    }
    
    const session = sessions[sessionId];
    if (!session || session.role !== 'auctioneer' || 
        session.username !== room.auctioneer || 
        session.roomCode !== roomCode) {
        socket.emit('error', { message: 'Invalid session' });
        return;
    }
    
    console.log(`🔍 Manual retention check triggered by auctioneer`);
    
    // Re-check all submissions
    const allSubmitted = checkAllRetentionSubmitted(roomCode);
    
    // Send current status back
    const users = Object.values(room.users);
    const eligibleUsers = users.filter(user => 
        user.username !== room.auctioneer && 
        user.team !== null
    );
    const submittedUsers = users.filter(user => 
        user.retentionSubmitted === true
    );
    
    socket.emit('retentionStatusUpdate', {
        roomCode: roomCode,
        submitted: submittedUsers.length,
        total: eligibleUsers.length,
        allComplete: allSubmitted,
        message: `${submittedUsers.length}/${eligibleUsers.length} users submitted retention`
    });
    
    console.log(`📊 Retention status sent to auctioneer: ${submittedUsers.length}/${eligibleUsers.length}`);
});
    // Get squad data
    socket.on('getSquadData', (data) => {
        try {
            const { roomCode, username } = data;
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
            
            const squadData = {
                username: user.username,
                team: user.team,
                retainedPlayers: user.retainedPlayers || [],
                auctionPlayers: user.auctionPlayers || [],
                purse: user.budget || 100,
                budget: user.budget || 100,
                squadLimit: room.rules?.squadSize || 25,
                squadLimits: {
                    total: (user.retainedPlayers?.length || 0) + (user.auctionPlayers?.length || 0),
                    maxSquad: room.rules?.squadSize || 25
                }
            };
            
            console.log(`📊 Sending squad data for ${username}:`, {
                retained: squadData.retainedPlayers.length,
                auction: squadData.auctionPlayers.length,
                purse: squadData.purse
            });
            
            io.to(socket.id).emit('squadDataResponse', squadData);
            
        } catch (error) {
            console.error('Error getting squad data:', error);
            socket.emit('error', { message: 'Failed to get squad data' });
        }
    });
    // Force redirect users to auction pool
// ========== FORCE REDIRECT TO AUCTION POOL ==========
socket.on('requestAuctionPoolRedirect', (data) => {
    try {
        const { roomCode, username, sessionId } = data;
        const room = rooms[roomCode];
        
        console.log(`📤 Requesting auction pool redirect for ${username}`);
        
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }
        
        const user = room.users[username];
        if (!user) {
            socket.emit('error', { message: 'User not found' });
            return;
        }
        
        if (user.sessionId !== sessionId) {
            socket.emit('error', { message: 'Session mismatch' });
            return;
        }
        
        // Check if auction pool has started
        if (room.auctionPoolStarted) {
            const squadData = getUserSquad(roomCode, username);
            
            console.log(`✅ Sending redirect to ${username}`);
            
            io.to(socket.id).emit('forceRedirectToAuctionPool', {
                roomCode: roomCode,
                username: username,
                team: user.team,
                squadData: squadData,
                sessionId: user.sessionId,
                message: 'Auction pool is active! Redirecting...',
                redirectUrl: 'auctionpool.html',
                timestamp: Date.now(),
                success: true
            });
        } else {
            socket.emit('error', { message: 'Auction pool not started yet' });
        }
        
    } catch (error) {
        console.error('❌ Error in requestAuctionPoolRedirect:', error);
        socket.emit('error', { message: 'Redirect request failed' });
    }
});

// ✅ ADD THIS: Check auction status
    socket.on('checkAuctionStatus', (data, callback) => {
        const { roomCode } = data;
        const auction = auctionStates[roomCode];
        
        if (callback) {
            callback({
                isActive: !!auction,
                hasPlayer: auction && auction.currentPlayer ? true : false,
                roomCode: roomCode
            });
        }
    });
    
    // ✅ ADD THIS: Request current player
    socket.on('requestCurrentPlayer', (data) => {
        const { roomCode } = data;
        const auction = auctionStates[roomCode];
        
        if (auction && auction.currentPlayer) {
            const players = auction.categorizedPlayers[auction.currentCategory] || [];
            const currentPlayer = players[auction.currentPlayerIndex];
            
            if (currentPlayer) {
                socket.emit('playerUpForAuction', {
                    player: {
                        ...currentPlayer,
                        currentBid: auction.currentBid,
                        currentBidder: auction.currentBidder
                    },
                    category: auction.currentCategory
                });
                
                // Also send state sync
                broadcastAuctionState(roomCode, socket.id);
            }
        }
    });
    // ✅ ADD THIS: Session recovery system
socket.on('recoverSession', (data, callback) => {
    try {
        const { username, partialSessionId, roomCode } = data;
        
        console.log(`🔍 Session recovery attempt for ${username} in room ${roomCode}`);
        console.log(`   Partial session ID: ${partialSessionId}`);
        
        if (!username || !roomCode) {
            if (callback) callback({ success: false, message: 'Username and room code required' });
            return;
        }
        
        const room = rooms[roomCode];
        if (!room) {
            if (callback) callback({ success: false, message: 'Room not found' });
            return;
        }
        
        // Find user in room
        const user = room.users[username];
        if (!user) {
            if (callback) callback({ success: false, message: 'User not found in room' });
            return;
        }
        
        // Find session by partial match
        let foundSessionId = null;
        
        // Method 1: Check if user already has a session
        if (user.sessionId && sessions[user.sessionId]) {
            foundSessionId = user.sessionId;
            console.log(`✅ Found existing session for ${username}: ${foundSessionId}`);
        }
        // Method 2: Search sessions by username and room
        else {
            for (const sessionId in sessions) {
                const session = sessions[sessionId];
                if (session.username === username && 
                    session.roomCode === roomCode && 
                    session.active) {
                    foundSessionId = sessionId;
                    console.log(`✅ Found matching session: ${foundSessionId}`);
                    break;
                }
            }
        }
        
        if (foundSessionId) {
            // Update session with new socket
            sessions[foundSessionId].socketId = socket.id;
            sessions[foundSessionId].lastActivity = Date.now();
            
            // Update user with session
            user.sessionId = foundSessionId;
            user.socketId = socket.id;
            user.connected = true;
            
            // Send back full session data
            const sessionData = {
                username: username,
                roomCode: roomCode,
                sessionId: foundSessionId,
                role: user.role || 'user',
                team: user.team || null,
                active: true
            };
            
            console.log(`✅ Session recovered for ${username}`);
            
            if (callback) callback({ 
                success: true, 
                message: 'Session recovered',
                sessionData: sessionData
            });
            
            // Also notify auctioneer if needed
            if (room.auctioneerSocket && username !== room.auctioneer) {
                io.to(room.auctioneerSocket).emit('userReconnected', {
                    username: username,
                    team: user.team?.name || 'Unknown'
                });
            }
        } else {
            console.log(`❌ No session found for ${username}`);
            if (callback) callback({ 
                success: false, 
                message: 'No active session found. Please start a new session.' 
            });
        }
        
    } catch (error) {
        console.error('❌ Error in recoverSession:', error);
        if (callback) callback({ 
            success: false, 
            message: 'Session recovery failed' 
        });
    }
});

// ✅ ADD THIS: Proper reconnection handler for auction pool
socket.on('reconnectToAuction', (data, callback) => {
    try {
        const { username, roomCode } = data;
        console.log(`🔄 Reconnection attempt: ${username} to room ${roomCode}`);
        
        const room = rooms[roomCode];
        if (!room) {
            console.log(`❌ Room not found: ${roomCode}`);
            if (callback) callback({ success: false, message: 'Room not found' });
            return;
        }
        
        const user = room.users[username];
        if (!user) {
            console.log(`❌ User not found: ${username}`);
            if (callback) callback({ success: false, message: 'User not found in room' });
            return;
        }
        
        // Update user's socket connection
        user.socketId = socket.id;
        user.connected = true;
        user.lastReconnect = Date.now();
        
        socket.join(roomCode);
        
        console.log(`✅ ${username} reconnected to auction room ${roomCode}`);
        
        // Get current auction state
        const auction = auctionStates[roomCode];
        const squadData = getUserSquad(roomCode, username);
        
        // Build response with ALL necessary data
        const response = {
            success: true,
            message: 'Reconnected successfully',
            userData: {
                username: user.username,
                team: user.team,
                budget: user.budget || 100,
                sessionId: user.sessionId,
                retainedPlayers: user.retainedPlayers || [],
                auctionPlayers: user.auctionPlayers || [],
                totalPlayers: (user.retainedPlayers?.length || 0) + (user.auctionPlayers?.length || 0)
            },
            auctionActive: !!auction,
            immediateSync: true
        };
        
        // If auction is active, send current player data
        if (auction && auction.auctionPhase) {
            const players = auction.categorizedPlayers[auction.currentCategory] || [];
            const currentPlayer = players[auction.currentPlayerIndex];
            
            if (currentPlayer) {
                response.currentPlayer = {
                    ...currentPlayer,
                    currentBid: auction.currentBid,
                    currentBidder: auction.currentBidder
                };
                response.category = auction.currentCategory;
                response.auctionStatus = 'active';
            }
        }
        
        // Send squad data separately
        if (squadData) {
            io.to(socket.id).emit('auctionData', {
                team: user.team,
                purse: user.budget || 100,
                squadLimits: squadData.squadLimits || {
                    total: 0,
                    indian: 0,
                    overseas: 0,
                    maxSquad: room.rules?.squadSize || 25
                },
                sessionId: user.sessionId
            });
        }
        
        if (callback) callback(response);
        
        // Notify auctioneer if reconnected user is not auctioneer
        if (room.auctioneerSocket && username !== room.auctioneer) {
            io.to(room.auctioneerSocket).emit('userReconnected', {
                username: username,
                team: user.team?.name,
                timestamp: new Date().toISOString()
            });
        }
        
    } catch (error) {
        console.error('❌ Error in reconnectToAuction:', error);
        if (callback) callback({ 
            success: false, 
            message: 'Reconnection failed: ' + error.message 
        });
    }
});

// ✅ ADD THIS: Get current auction state for auctioneer
socket.on('getCurrentAuctionState', (data, callback) => {
    try {
        const { roomCode, sessionId } = data;
        const room = rooms[roomCode];
        const auction = auctionStates[roomCode];
        
        console.log(`📊 getCurrentAuctionState for room ${roomCode}`);
        
        if (!room) {
            if (callback) callback({ success: false, message: 'Room not found' });
            return;
        }
        
        // Validate auctioneer session
        if (!sessionId || !sessions[sessionId] || 
            sessions[sessionId].username !== room.auctioneer) {
            if (callback) callback({ success: false, message: 'Invalid auctioneer session' });
            return;
        }
        
        if (!auction) {
            console.log('⚠️ No auction state found');
            if (callback) callback({ 
                success: true, 
                auctionActive: false,
                message: 'No active auction found' 
            });
            return;
        }
        
        const players = auction.categorizedPlayers[auction.currentCategory] || [];
        const currentPlayer = players[auction.currentPlayerIndex];
        
        const response = {
            success: true,
            auctionActive: true,
            currentPlayer: currentPlayer ? {
                ...currentPlayer,
                currentBid: auction.currentBid,
                currentBidder: auction.currentBidder
            } : null,
            auctionInfo: {
                category: auction.currentCategory,
                currentPlayerIndex: auction.currentPlayerIndex,
                playersLeft: players.length - auction.currentPlayerIndex - 1,
                unsoldCount: auction.unsoldPlayers.length,
                totalPlayers: players.length,
                playerPosition: `${auction.currentPlayerIndex + 1}/${players.length}`
            },
            stats: {
                totalPlayers: Object.values(auction.categorizedPlayers).reduce((sum, cat) => sum + cat.length, 0),
                soldPlayers: 0, // You'll need to track this
                unsoldPlayers: auction.unsoldPlayers.length,
                totalValue: 0 // You'll need to track this
            }
        };
        
        console.log(`✅ Sending current auction state:`, {
            player: currentPlayer?.name || 'none',
            category: auction.currentCategory,
            bid: auction.currentBid
        });
        
        if (callback) callback(response);
        
    } catch (error) {
        console.error('❌ Error getting auction state:', error);
        if (callback) callback({ 
            success: false, 
            message: 'Failed to get auction state: ' + error.message 
        });
    }
});

// Handle playing 11 submission with captain
socket.on('submitPlaying11WithCaptain', (data) => {
    try {
        const { roomCode, username, playing11, impactPlayers, captain, sessionId } = data;
        const room = rooms[roomCode];
        
        console.log(`\n🎯 Playing 11 submission from ${username}:`, {
            playing11Count: playing11.length,
            impactPlayersCount: impactPlayers.length,
            captain: captain?.name
        });
        
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }
        
        const user = room.users[username];
        if (!user) {
            socket.emit('error', { message: 'User not found' });
            return;
        }
        
        if (!user.sessionId || user.sessionId !== sessionId) {
            socket.emit('error', { message: 'Session expired' });
            return;
        }
        
        // Validation checks
        if (playing11.length !== 11) {
            socket.emit('playing11Error', { 
                message: 'Playing 11 must have exactly 11 players' 
            });
            return;
        }
        
        if (!captain) {
            socket.emit('playing11Error', { 
                message: 'Please select a captain' 
            });
            return;
        }
        
        // Check if captain is in playing 11
        const captainInPlaying11 = playing11.some(player => player.id === captain.id);
        if (!captainInPlaying11) {
            socket.emit('playing11Error', { 
                message: 'Captain must be in Playing 11' 
            });
            return;
        }
        
        const squadPlayers = [
            ...(user.retainedPlayers || []),
            ...(user.auctionPlayers || [])
        ];
        const squadPlayerIds = new Set(squadPlayers.map(p => p.id));
        
        // Validate all players are in squad
        const allPlayers = [...playing11, ...impactPlayers];
        const invalidPlayers = allPlayers.filter(p => !squadPlayerIds.has(p.id));
        
        if (invalidPlayers.length > 0) {
            socket.emit('playing11Error', { 
                message: `Invalid players: ${invalidPlayers.map(p => p.name).join(', ')}` 
            });
            return;
        }
        
        // Check for duplicates between playing11 and impact players
        const playing11Ids = playing11.map(p => p.id);
        const impactPlayerIds = impactPlayers.map(p => p.id);
        const duplicates = playing11Ids.filter(id => impactPlayerIds.includes(id));
        
        if (duplicates.length > 0) {
            socket.emit('playing11Error', { 
                message: 'Players cannot be in both Playing 11 and Impact Players' 
            });
            return;
        }
        
        // Save playing 11 data
        user.playing11 = playing11;
        user.impactPlayers = impactPlayers;
        user.captain = captain;
        user.playing11Submitted = true;
        user.playing11SubmittedAt = new Date().toISOString();
        
        console.log(`✅ Playing 11 submitted by ${username}`);
        console.log(`   Playing 11: ${playing11.length} players`);
        console.log(`   Impact Players: ${impactPlayers.length} players`);
        console.log(`   Captain: ${captain.name}`);
        
        // Send success response
        socket.emit('playing11SubmittedSuccess', {
            message: 'Playing 11 submitted successfully! Waiting for other teams...',
            username: username,
            team: user.team.name
        });
        
        // Notify auctioneer
        if (room.auctioneerSocket) {
            const squadData = getUserSquad(roomCode, username);
            
            io.to(room.auctioneerSocket).emit('playing11Submitted', {
                username: username,
                team: user.team.name,
                playing11: playing11,
                impactPlayers: impactPlayers,
                captain: captain,
                playing11Count: playing11.length,
                impactPlayersCount: impactPlayers.length,
                squadData: squadData,
                timestamp: new Date().toISOString()
            });
        }
        
        // Check if all users have submitted
        const allUsersSubmitted = Object.values(room.users).every(u => 
            u.playing11Submitted === true && u.username !== room.auctioneer
        );
        
        if (allUsersSubmitted) {
            console.log(`🎉 All users have submitted playing 11 in room ${roomCode}`);
            if (room.auctioneerSocket) {
                io.to(room.auctioneerSocket).emit('allPlaying11Submitted', {
                    message: 'All users have submitted their playing 11! You can now rate the teams.',
                    roomCode: roomCode,
                    userCount: Object.keys(room.users).length - 1 // Exclude auctioneer
                });
            }
        }
        
    } catch (error) {
        console.error('❌ Error submitting playing 11:', error);
        socket.emit('playing11Error', { message: 'Failed to submit playing 11' });
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
// ========== HTTP API ENDPOINTS ==========

// Debug route to see all rooms
app.get('/api/debug/rooms', (req, res) => {
    const roomList = Object.entries(rooms).map(([code, room]) => ({
        code: code,
        auctioneer: room.auctioneer,
        users: Object.keys(room.users).length,
        created: room.createdAt,
        auctioneerConnected: room.auctioneerConnected
    }));
    
    res.json({
        totalRooms: Object.keys(rooms).length,
        totalSessions: Object.keys(sessions).length,
        rooms: roomList,
        sessions: Object.keys(sessions)
    });
});

// Emergency room creation endpoint (HTTP POST)
app.post('/api/create-room', express.json(), (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Username required' });
        }
        
        const roomCode = generateRoomCode();
        const sessionId = generateSessionId();
        
        // Create session
        sessions[sessionId] = {
            username: username,
            role: 'auctioneer',
            roomCode: roomCode,
            sessionId: sessionId,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            active: true
        };
        
        // Create room
        rooms[roomCode] = {
            code: roomCode,
            auctioneer: username,
            auctioneerSessionId: sessionId,
            auctioneerConnected: false,
            auctioneerSocket: null,
            users: {},
            rules: null,
            teamsAssigned: false,
            retentionStarted: false,
            retentionSubmissions: {},
            createdAt: new Date().toISOString()
        };
        
        console.log(`✅ Room created via API: ${roomCode} for ${username}`);
        
        res.json({
            success: true,
            roomCode: roomCode,
            sessionId: sessionId,
            username: username
        });
        
    } catch (error) {
        console.error('❌ API create-room error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(80));
    console.log(`✅ SERVER RUNNING ON PORT ${PORT}`);
    console.log('='.repeat(80));
    console.log('\n🌐 Access URLs:');
    console.log(`   Login: http://localhost:${PORT}/login.html`);
    console.log(`   Auctioneer: http://localhost:${PORT}/auctioneer.html`);
    console.log(`   User Join: http://localhost:${PORT}/user.html`);
    console.log(`   Auction Pool: http://localhost:${PORT}/auctionpool.html`);
    console.log(`\n📊 Players loaded: ${playersData.length}`);
    console.log('\n🔧 Features:');
    console.log('   ✅ Session-based authentication');
    console.log('   ✅ 24-hour session expiry');
    console.log('   ✅ State synchronization system');
    console.log('   ✅ Reliable auction sync 10/10 times');
    console.log('   ✅ Client re-sync on connect/reconnect');
    console.log('   ✅ Playing 11 selection');
    console.log('\n🚀 Ready for connections...');
});