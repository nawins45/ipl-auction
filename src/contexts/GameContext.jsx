import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { doc, setDoc, updateDoc, onSnapshot, collection, query, where, getDocs, writeBatch, serverTimestamp, getDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { useRoom } from './RoomContext';
import { IPL_TEAMS, GAME_PHASES, CATEGORY_ORDER, INDIAN_NATIONALITIES, MAX_OVERSEAS } from '../utils/constants';
import { normalizePlayer, shuffleArray, formatPrice, isIndian } from '../utils/helpers';
import { buildAuctionQueue, validateBid, getNextMinBid } from '../utils/auctionEngine';
import playersRaw from '../data/players.json';

const GameContext = createContext(null);

export function GameProvider({ children }) {
    const { user } = useAuth();
    const { roomId, room, userData, allUsers, advancePhase } = useRoom();

    // Players
    const [allPlayers, setAllPlayers] = useState([]);
    const [auctionQueue, setAuctionQueue] = useState([]);

    // Retention
    const [retentionSelections, setRetentionSelections] = useState({});
    const [myRetention, setMyRetention] = useState([]);

    // Squad
    const [squads, setSquads] = useState({});

    // Playing XI
    const [playingXIData, setPlayingXIData] = useState({});
    const [myPlayingXI, setMyPlayingXI] = useState({ players: [], impactPlayers: [], captainId: null });

    // Scores
    const [scores, setScores] = useState({});

    // Mini-Game
    const [miniGameSelections, setMiniGameSelections] = useState({});

    // Initialize players from JSON
    useEffect(() => {
        const normalized = playersRaw.map((p, i) => normalizePlayer(p, i));
        setAllPlayers(normalized);
    }, []);

    // Listen to retention selections
    useEffect(() => {
        if (!roomId) return;
        const q = query(collection(db, 'retentionSelections'), where('roomId', '==', roomId));
        const unsub = onSnapshot(q, (snap) => {
            const sels = {};
            snap.forEach(d => {
                const data = d.data();
                sels[data.userId] = data;
            });
            setRetentionSelections(sels);
        });
        return () => unsub();
    }, [roomId]);

    // Listen to squads
    useEffect(() => {
        if (!roomId) return;
        const q = query(collection(db, 'squads'), where('roomId', '==', roomId));
        const unsub = onSnapshot(q, (snap) => {
            const sq = {};
            snap.forEach(d => {
                const data = d.data();
                sq[data.userId] = data;
            });
            setSquads(sq);
        });
        return () => unsub();
    }, [roomId]);

    // Listen to playing XI
    useEffect(() => {
        if (!roomId) return;
        const q = query(collection(db, 'playingXI'), where('roomId', '==', roomId));
        const unsub = onSnapshot(q, (snap) => {
            const xi = {};
            snap.forEach(d => {
                const data = d.data();
                xi[data.userId] = data;
            });
            setPlayingXIData(xi);
        });
        return () => unsub();
    }, [roomId]);

    // Listen to scores
    useEffect(() => {
        if (!roomId) return;
        const q = query(collection(db, 'scores'), where('roomId', '==', roomId));
        const unsub = onSnapshot(q, (snap) => {
            const sc = {};
            snap.forEach(d => {
                const data = d.data();
                sc[data.userId] = data;
            });
            setScores(sc);
        });
        return () => unsub();
    }, [roomId]);

    // Listen to mini-game selections
    useEffect(() => {
        if (!roomId) return;
        const q = query(collection(db, 'miniGameSelections'), where('roomId', '==', roomId));
        const unsub = onSnapshot(q, (snap) => {
            const mg = {};
            snap.forEach(d => {
                const data = d.data();
                mg[data.userId] = data;
            });
            setMiniGameSelections(mg);
        });
        return () => unsub();
    }, [roomId]);

    // ── AUTO HEAL STALE PURSE ──
    // For rooms created before the purse bug fix, purseRemaining will be 0.
    useEffect(() => {
        if (!roomId || !room || !userData || userData.role !== 'teamOwner') return;
        if (room.status !== GAME_PHASES.AUCTION && room.status !== GAME_PHASES.PLAYING_XI) return;
        
        if (userData.purseRemaining === 0) {
            const mySquadPlayers = squads[userData.uid]?.players || [];
            const spent = mySquadPlayers.filter(p => p.type === 'bought').reduce((sum, p) => sum + (p.price || 0), 0);
            
            // If they have 0 purse but haven't bought anyone (excluding retentions), it's a bugged room. Heal it!
            if (spent === 0 && mySquadPlayers.length < (room.rules?.maxSquadSize || 25)) {
                console.log('Auto-healing stale purse for', userData.username);
                const totalPurseLakhs = (room.rules?.totalPurse ?? 120) * 100;
                const retainedIds = retentionSelections[userData.uid]?.retainedPlayerIds || [];
                const retentionCost = retainedIds.reduce((sum, pid) => {
                    const player = allPlayers.find(p => p.id === pid);
                    return sum + (player?.basePrice || 0);
                }, 0);
                const startingPurse = Math.max(0, totalPurseLakhs - retentionCost);
                
                updateDoc(doc(db, 'users', userData.uid), {
                    purseRemaining: startingPurse
                }).catch(e => console.error('Auto-heal failed', e));
            }
        }
    }, [roomId, room?.status, room?.rules, userData, squads, retentionSelections, allPlayers]);

    // ============ TEAM ASSIGNMENT ============

    const assignTeams = useCallback(async () => {
        if (!roomId || !room) return;
        const teamOwners = allUsers.filter(u => u.role === 'teamOwner');
        const shuffledTeams = shuffleArray([...IPL_TEAMS]).slice(0, teamOwners.length);
        const assignments = {};
        teamOwners.forEach((owner, i) => {
            assignments[owner.uid] = shuffledTeams[i].name;
        });

        await updateDoc(doc(db, 'rooms', roomId), {
            teamAssignments: assignments,
            shufflesUsed: {},
        });

        // Set purse for each user
        const batch = writeBatch(db);
        teamOwners.forEach(owner => {
            batch.update(doc(db, 'users', owner.uid), {
                assignedTeam: assignments[owner.uid],
                purseRemaining: (room.rules?.totalPurse ?? 120) * 100, // convert cr to lakhs
            });
        });
        await batch.commit();
    }, [roomId, room, allUsers]);

    const shuffleMyTeam = useCallback(async () => {
        if (!roomId || !room || !user) return;
        const assignments = { ...(room.teamAssignments || {}) };
        const shufflesUsed = { ...(room.shufflesUsed || {}) };

        if (shufflesUsed[user.uid]) return; // already used

        const myTeam = assignments[user.uid];
        const usedTeams = Object.values(assignments);
        const availableTeams = IPL_TEAMS.filter(t => !usedTeams.includes(t.name));

        if (availableTeams.length === 0) return;

        const newTeam = shuffleArray(availableTeams)[0].name;
        assignments[user.uid] = newTeam;
        shufflesUsed[user.uid] = true;

        await updateDoc(doc(db, 'rooms', roomId), { teamAssignments: assignments, shufflesUsed });
        await updateDoc(doc(db, 'users', user.uid), { assignedTeam: newTeam });
    }, [roomId, room, user]);

    const forceShuffleTeams = useCallback(async () => {
        await assignTeams();
    }, [assignTeams]);

    const forceShuffleUser = useCallback(async (targetUserId) => {
        if (!roomId || !room) return;
        const assignments = { ...(room.teamAssignments || {}) };
        const usedTeams = Object.values(assignments);
        const availableTeams = IPL_TEAMS.filter(t => !usedTeams.includes(t.name));
        if (availableTeams.length === 0) return;
        const newTeam = shuffleArray(availableTeams)[0].name;
        assignments[targetUserId] = newTeam;
        await updateDoc(doc(db, 'rooms', roomId), { teamAssignments: assignments });
        await updateDoc(doc(db, 'users', targetUserId), { assignedTeam: newTeam });
    }, [roomId, room]);

    // ============ RETENTION ============

    const submitRetention = useCallback(async (selectedPlayerIds) => {
        if (!roomId || !user) throw new Error('Not authenticated');

        const docId = `${roomId}_${user.uid}`;

        // FIX: Write retention and squad in two separate awaited calls to avoid
        // partial writes. Also use merge:true for squads to be safe.
        await setDoc(doc(db, 'retentionSelections', docId), {
            roomId,
            userId: user.uid,
            retainedPlayerIds: selectedPlayerIds,
            submitted: true,
            submittedAt: serverTimestamp(),
        });

        // Add retained players to squad
        const retainedPlayers = allPlayers
            .filter(p => selectedPlayerIds.includes(p.id))
            .map(p => ({
                playerId: p.id,
                playerName: p.playerName,
                type: 'retained',
                price: 0,
            }));

        // Get existing squad to not overwrite bought players (shouldn't exist at retention time but be safe)
        const existingSquadSnap = await getDoc(doc(db, 'squads', docId));
        const existingPlayers = existingSquadSnap.exists() ? (existingSquadSnap.data().players || []) : [];
        // Filter out any old retained entries and replace with new ones
        const nonRetained = existingPlayers.filter(p => p.type !== 'retained');
        const mergedPlayers = [...retainedPlayers, ...nonRetained];

        await setDoc(doc(db, 'squads', docId), {
            roomId,
            userId: user.uid,
            players: mergedPlayers,
            updatedAt: serverTimestamp(),
        });
    }, [roomId, user, allPlayers]);

    // ============ AUCTION ============

    const startAuction = useCallback(async () => {
        if (!roomId || !room) return;

        // Collect all retained player IDs
        const retainedIds = new Set();
        Object.values(retentionSelections).forEach(sel => {
            (sel.retainedPlayerIds || []).forEach(id => retainedIds.add(id));
        });

        // Build queue excluding retained
        const availablePlayers = allPlayers.filter(p => !retainedIds.has(p.id));
        const queue = buildAuctionQueue(availablePlayers);

        // Store queue in room
        const queueData = queue.map(p => p.id);

        await updateDoc(doc(db, 'rooms', roomId), {
            status: GAME_PHASES.AUCTION,
            'currentAuction.queue': queueData,
            'currentAuction.currentIndex': 0,
            'currentAuction.currentPlayerId': queueData.length > 0 ? queueData[0] : null,
            'currentAuction.currentBid': 0,
            'currentAuction.currentBidderId': null,
            'currentAuction.currentBidderName': null,
            'currentAuction.timerEnd': null,
            'currentAuction.status': queueData.length > 0 ? 'bidding' : 'done',
            'currentAuction.soldPlayers': [],
            'currentAuction.unsoldPlayers': [],
            'currentAuction.rtmPending': null,
        });

        // ── Initialize purse for all team owners ──
        // purseRemaining is stored in LAKHS (e.g. 12000 = 120 Cr)
        const purseTeamOwners = allUsers.filter(u => u.role === 'teamOwner');
        const totalPurseLakhs = (room.rules?.totalPurse ?? 120) * 100; // default 120 Cr = 12000 L
        for (const owner of purseTeamOwners) {
            // Deduct retention costs from starting purse
            const retainedIds = retentionSelections[owner.uid]?.retainedPlayerIds || [];
            const retentionCost = retainedIds.reduce((sum, pid) => {
                // Retained players cost their base price
                const player = allPlayers.find(p => p.id === pid);
                return sum + (player?.basePrice || 0);
            }, 0);
            const startingPurse = Math.max(0, totalPurseLakhs - retentionCost);
            await updateDoc(doc(db, 'users', owner.uid), {
                purseRemaining: startingPurse,
            });
        }

        // Initialize RTM data if enabled
        if (room.rules?.rtmEnabled) {
            const rtmEligible = {};
            const teamOwners = allUsers.filter(u => u.role === 'teamOwner');
            teamOwners.forEach(owner => {
                const teamName = room.teamAssignments?.[owner.uid];
                if (!teamName) return;
                const teamPlayers = allPlayers.filter(p => p.teamName === teamName);
                const ownerRetainedIds = new Set(retentionSelections[owner.uid]?.retainedPlayerIds || []);
                teamPlayers.forEach(p => {
                    if (!ownerRetainedIds.has(p.id)) {
                        rtmEligible[p.id] = owner.uid;
                    }
                });
            });

            const rtmCards = {};
            teamOwners.forEach(owner => {
                rtmCards[owner.uid] = room.rules.rtmCardsPerTeam || 2;
            });

            await updateDoc(doc(db, 'rooms', roomId), {
                rtmEligible,
                rtmCards,
            });
        }
    }, [roomId, room, allPlayers, retentionSelections, allUsers]);

    const startBidding = useCallback(async () => {
        if (!roomId || !room) return;
        const timerDuration = room.rules?.bidTimerDuration || 30;
        const timerEnd = new Date(Date.now() + timerDuration * 1000).toISOString();

        // FIX: When starting bidding for a new player (after sold/unsold),
        // always reset bid state so no stale bid remains from previous player.
        const auction = room.currentAuction;
        const isNewPlayer = auction?.status === 'sold' || auction?.status === 'unsold';

        await updateDoc(doc(db, 'rooms', roomId), {
            'currentAuction.timerEnd': timerEnd,
            'currentAuction.status': 'bidding',
            // Always reset bid when starting a new player
            'currentAuction.currentBid': 0,
            'currentAuction.currentBidderId': null,
            'currentAuction.currentBidderName': null,
            'currentAuction.currentBidderTeam': null,
        });
    }, [roomId, room]);

    const placeBid = useCallback(async (bidAmount) => {
        if (!roomId || !room || !user || !userData) {
            throw new Error('Game connection not ready');
        }

        const auction = room.currentAuction;
        if (!auction || auction.status !== 'bidding') {
            throw new Error('Bidding is not active');
        }

        // We removed the strict local-clock timer validation here to prevent Clock Skew bugs.
        // The ultimate control remains with the Auctioneer, who sets the status to 'sold' when time is actually up.

        const currentPlayer = allPlayers.find(p => p.id === auction.currentPlayerId);
        if (!currentPlayer) {
            throw new Error('Player not found');
        }

        const mySquad = squads[user.uid]?.players || [];
        const maxSquadSize = room.rules?.maxSquadSize || 25;
        const minIncrement = room.rules?.minBidIncrement || 25;

        const validation = validateBid(
            bidAmount,
            auction.currentBid || 0,
            currentPlayer.basePrice,
            userData.purseRemaining,
            minIncrement,
            mySquad.length,
            maxSquadSize
        );

        if (!validation.valid) {
            throw new Error(validation.reason);
        }

        const timerDuration = room.rules?.bidTimerDuration || 30;
        const newTimerEnd = new Date(Date.now() + timerDuration * 1000).toISOString();

        const bidderTeam = room?.teamAssignments?.[user.uid] || '';
        await updateDoc(doc(db, 'rooms', roomId), {
            'currentAuction.currentBid': bidAmount,
            'currentAuction.currentBidderId': user.uid,
            'currentAuction.currentBidderName': userData.username,
            'currentAuction.currentBidderTeam': bidderTeam,
            'currentAuction.timerEnd': newTimerEnd,
        });
    }, [roomId, room, user, userData, allPlayers, squads]);

    const markSold = useCallback(async () => {
        if (!roomId || !room) return;

        // Forcefully fetch the absolute latest room state before executing a sale
        const roomDoc = await getDoc(doc(db, 'rooms', roomId));
        if (!roomDoc.exists()) return;
        const currentRoomData = roomDoc.data();
        const auction = currentRoomData.currentAuction;

        // FIX: More robust status check — allow marking sold if bidding OR if timer ended
        if (!auction || !auction.currentBidderId) return;
        if (auction.status !== 'bidding' && auction.status !== 'timerEnd') return;

        const currentPlayer = allPlayers.find(p => p.id === auction.currentPlayerId);
        if (!currentPlayer) return;

        const buyerId = auction.currentBidderId;
        const price = auction.currentBid;
        if (!price || price <= 0) return;

        // Add to buyer's squad
        const squadDocId = `${roomId}_${buyerId}`;
        const squadSnap = await getDoc(doc(db, 'squads', squadDocId));
        const existingPlayers = squadSnap.exists() ? (squadSnap.data().players || []) : [];

        // Check if player is already somehow in a squad to be double safe
        const alreadyInSquad = existingPlayers.some(p => p.playerId === currentPlayer.id);
        if (alreadyInSquad) return;

        existingPlayers.push({
            playerId: currentPlayer.id,
            playerName: currentPlayer.playerName,
            type: 'bought',
            price: price,
        });

        await setDoc(doc(db, 'squads', squadDocId), {
            roomId,
            userId: buyerId,
            players: existingPlayers,
            updatedAt: serverTimestamp(),
        }, { merge: true });

        // Deduct purse atomically to avoid race conditions
        await updateDoc(doc(db, 'users', buyerId), {
            purseRemaining: increment(-price),
        });

        // Update sold list
        const buyerTeam = currentRoomData?.teamAssignments?.[buyerId] || auction.currentBidderTeam || '';
        const soldPlayers = [...(auction.soldPlayers || []), {
            playerId: currentPlayer.id,
            playerName: currentPlayer.playerName,
            buyerId,
            buyerName: auction.currentBidderName,
            buyerTeam,
            price,
        }];

        // Move to next player
        const nextIndex = (auction.currentIndex || 0) + 1;
        const queue = auction.queue || [];

        if (nextIndex < queue.length) {
            await updateDoc(doc(db, 'rooms', roomId), {
                'currentAuction.currentIndex': nextIndex,
                'currentAuction.currentPlayerId': queue[nextIndex],
                'currentAuction.currentBid': 0,
                'currentAuction.currentBidderId': null,
                'currentAuction.currentBidderName': null,
                'currentAuction.currentBidderTeam': null,
                'currentAuction.timerEnd': null,
                'currentAuction.status': 'sold',
                'currentAuction.soldPlayers': soldPlayers,
                'currentAuction.lastSold': {
                    playerId: currentPlayer.id,
                    playerName: currentPlayer.playerName,
                    buyerName: auction.currentBidderName,
                    buyerTeam: buyerTeam,
                    price,
                },
            });
        } else {
            await updateDoc(doc(db, 'rooms', roomId), {
                'currentAuction.status': 'done',
                'currentAuction.soldPlayers': soldPlayers,
                'currentAuction.currentBid': 0,
                'currentAuction.currentBidderId': null,
                'currentAuction.currentBidderName': null,
                'currentAuction.timerEnd': null,
                'currentAuction.lastSold': {
                    playerId: currentPlayer.id,
                    playerName: currentPlayer.playerName,
                    buyerName: auction.currentBidderName,
                    buyerTeam: buyerTeam,
                    price,
                },
            });
        }
    }, [roomId, room, allPlayers]);

    const markUnsold = useCallback(async () => {
        if (!roomId || !room) return;
        const auction = room.currentAuction;
        if (!auction) return;

        // FIX: Prevent marking unsold if there is actually a bid (redirect to sold flow)
        if (auction.currentBid > 0 && auction.currentBidderId) return;

        const currentPlayer = allPlayers.find(p => p.id === auction.currentPlayerId);
        const unsoldPlayers = [...(auction.unsoldPlayers || []), auction.currentPlayerId];

        const nextIndex = (auction.currentIndex || 0) + 1;
        const queue = auction.queue || [];

        if (nextIndex < queue.length) {
            await updateDoc(doc(db, 'rooms', roomId), {
                'currentAuction.currentIndex': nextIndex,
                'currentAuction.currentPlayerId': queue[nextIndex],
                'currentAuction.currentBid': 0,
                'currentAuction.currentBidderId': null,
                'currentAuction.currentBidderName': null,
                'currentAuction.currentBidderTeam': null,
                'currentAuction.timerEnd': null,
                'currentAuction.status': 'unsold',
                'currentAuction.unsoldPlayers': unsoldPlayers,
                'currentAuction.lastUnsold': currentPlayer?.playerName,
            });
        } else {
            await updateDoc(doc(db, 'rooms', roomId), {
                'currentAuction.status': 'done',
                'currentAuction.unsoldPlayers': unsoldPlayers,
                'currentAuction.currentBid': 0,
                'currentAuction.currentBidderId': null,
                'currentAuction.timerEnd': null,
            });
        }
    }, [roomId, room, allPlayers]);

    const skipToNextPlayer = useCallback(async () => {
        if (!roomId || !room) return;
        const auction = room.currentAuction;
        if (!auction) return;

        if (auction.currentBid > 0 && auction.currentBidderId) {
            await markSold();
        } else {
            await markUnsold();
        }
    }, [roomId, room, markSold, markUnsold]);

    const restartAuctionWithSelected = useCallback(async (selectedPlayerIds) => {
        if (!roomId || !room || !selectedPlayerIds || selectedPlayerIds.length === 0) return;

        await updateDoc(doc(db, 'rooms', roomId), {
            'currentAuction.queue': selectedPlayerIds,
            'currentAuction.currentIndex': 0,
            'currentAuction.currentPlayerId': selectedPlayerIds[0],
            'currentAuction.currentBid': 0,
            'currentAuction.currentBidderId': null,
            'currentAuction.currentBidderName': null,
            'currentAuction.currentBidderTeam': null,
            'currentAuction.timerEnd': null,
            'currentAuction.status': 'sold',
            'currentAuction.unsoldPlayers': [],
        });
    }, [roomId, room]);

    const endAuction = useCallback(async () => {
        if (!roomId) return;
        await updateDoc(doc(db, 'rooms', roomId), {
            status: GAME_PHASES.PLAYING_XI,
            'currentAuction.status': 'done',
        });
    }, [roomId]);

    // ============ RTM ============

    const initiateRTMCheck = useCallback(async () => { return false; }, []);

    const useRTM = useCallback(async () => {
        if (!roomId || !room) return;
        const rtmPending = room.currentAuction?.rtmPending;
        if (!rtmPending) return;

        await updateDoc(doc(db, 'rooms', roomId), {
            'currentAuction.rtmPending.status': 'counter_offer',
        });
    }, [roomId, room]);

    const declineRTM = useCallback(async () => {
        if (!roomId || !room) return;
        await updateDoc(doc(db, 'rooms', roomId), {
            'currentAuction.rtmPending': null,
        });
        await markSold();
    }, [roomId, room, markSold]);

    const submitCounterOffer = useCallback(async (amount) => {
        if (!roomId || !room) return;
        await updateDoc(doc(db, 'rooms', roomId), {
            'currentAuction.rtmPending.counterOfferAmount': amount,
            'currentAuction.rtmPending.status': 'waiting_final_match',
        });
    }, [roomId, room]);

    const declineCounterOffer = useCallback(async () => {
        if (!roomId || !room) return;
        const rtmPending = room.currentAuction?.rtmPending;
        if (!rtmPending) return;
        await completeSaleToRTMTeam(rtmPending.winningBid);
    }, [roomId, room]);

    const matchCounterOffer = useCallback(async () => {
        if (!roomId || !room) return;
        const rtmPending = room.currentAuction?.rtmPending;
        if (!rtmPending || !rtmPending.counterOfferAmount) return;
        await completeSaleToRTMTeam(rtmPending.counterOfferAmount);
    }, [roomId, room]);

    const declineCounterMatch = useCallback(async () => {
        if (!roomId || !room) return;
        const rtmPending = room.currentAuction?.rtmPending;
        if (!rtmPending) return;

        const rtmCards = { ...(room.rtmCards || {}) };
        if (rtmCards[rtmPending.originalOwnerUid]) {
            rtmCards[rtmPending.originalOwnerUid]--;
        }

        await updateDoc(doc(db, 'rooms', roomId), {
            'currentAuction.currentBid': rtmPending.counterOfferAmount,
            'currentAuction.rtmPending': null,
            rtmCards,
        });
        await markSold();
    }, [roomId, room, markSold]);

    const completeSaleToRTMTeam = useCallback(async (finalPrice) => {
        if (!roomId || !room) return;
        const rtmPending = room.currentAuction?.rtmPending;
        if (!rtmPending) return;

        const auction = room.currentAuction;
        const currentPlayer = allPlayers.find(p => p.id === rtmPending.playerId);
        if (!currentPlayer) return;

        const buyerId = rtmPending.originalOwnerUid;
        const price = finalPrice;

        const rtmCards = { ...(room.rtmCards || {}) };
        if (rtmCards[buyerId]) {
            rtmCards[buyerId]--;
        }

        const squadDocId = `${roomId}_${buyerId}`;
        const squadSnap = await getDoc(doc(db, 'squads', squadDocId));
        const existingPlayers = squadSnap.exists() ? (squadSnap.data().players || []) : [];

        const alreadyInSquad = existingPlayers.some(p => p.playerId === currentPlayer.id);
        if (alreadyInSquad) return;

        const maxSquadSize = room.rules?.maxSquadSize || 25;
        if (existingPlayers.length >= maxSquadSize) {
            throw new Error('RTM Failed: Squad is full');
        }

        if (currentPlayer.nationality && currentPlayer.nationality.toLowerCase() !== 'indian') {
            const currentOverseas = existingPlayers.filter(p => {
                const fullP = allPlayers.find(ap => ap.id === p.playerId);
                return fullP && fullP.nationality && fullP.nationality.toLowerCase() !== 'indian';
            }).length;
            if (currentOverseas >= 8) {
                throw new Error('RTM Failed: Maximum overseas limit reached');
            }
        }

        const buyerDoc = await getDoc(doc(db, 'users', buyerId));
        const currentPurse = buyerDoc.exists() ? (buyerDoc.data().purseRemaining || 0) : 0;
        if (price > currentPurse) {
            throw new Error('RTM Failed: Insufficient purse');
        }

        existingPlayers.push({
            playerId: currentPlayer.id,
            playerName: currentPlayer.playerName,
            type: 'bought',
            price: price,
        });

        await setDoc(doc(db, 'squads', squadDocId), {
            roomId,
            userId: buyerId,
            players: existingPlayers,
            updatedAt: serverTimestamp(),
        }, { merge: true });

        if (buyerDoc.exists()) {
            await updateDoc(doc(db, 'users', buyerId), {
                purseRemaining: Math.max(0, (buyerDoc.data().purseRemaining || 0) - price),
            });
        }

        const buyerTeam = room?.teamAssignments?.[buyerId] || '';

        const soldPlayers = [...(auction.soldPlayers || []), {
            playerId: currentPlayer.id,
            playerName: currentPlayer.playerName,
            buyerId,
            buyerName: allUsers.find(u => u.uid === buyerId)?.username || '',
            buyerTeam,
            price,
            viaRTM: true,
        }];

        const nextIndex = (auction.currentIndex || 0) + 1;
        const queue = auction.queue || [];

        const updates = {
            'currentAuction.rtmPending': null,
            'currentAuction.soldPlayers': soldPlayers,
            'currentAuction.lastSold': {
                playerId: currentPlayer.id,
                playerName: currentPlayer.playerName,
                buyerName: allUsers.find(u => u.uid === buyerId)?.username || '',
                buyerTeam,
                price,
                viaRTM: true,
            },
            rtmCards,
        };

        if (nextIndex < queue.length) {
            Object.assign(updates, {
                'currentAuction.currentIndex': nextIndex,
                'currentAuction.currentPlayerId': queue[nextIndex],
                'currentAuction.currentBid': 0,
                'currentAuction.currentBidderId': null,
                'currentAuction.currentBidderName': null,
                'currentAuction.currentBidderTeam': null,
                'currentAuction.timerEnd': null,
                'currentAuction.status': 'sold',
            });
        } else {
            updates['currentAuction.status'] = 'done';
            updates['currentAuction.currentBid'] = 0;
            updates['currentAuction.currentBidderId'] = null;
            updates['currentAuction.timerEnd'] = null;
        }

        await updateDoc(doc(db, 'rooms', roomId), updates);
    }, [roomId, room, allPlayers, allUsers]);

    // ============ CHANGE SET MID-AUCTION ============

    const changeAuctionSet = useCallback(async (categoryKey) => {
        if (!roomId || !room) return;
        const auction = room.currentAuction;
        if (!auction) return;

        const queue = auction.queue || [];
        const currentIdx = auction.currentIndex || 0;

        const remainingIds = queue.slice(currentIdx);

        const categoryPlayerIds = remainingIds.filter(pid => {
            const p = allPlayers.find(pl => pl.id === pid);
            return p && p.category === categoryKey;
        });

        if (categoryPlayerIds.length === 0) {
            return;
        }

        const otherIds = remainingIds.filter(pid => !categoryPlayerIds.includes(pid));

        const processedIds = queue.slice(0, currentIdx);
        const newQueue = [...processedIds, ...categoryPlayerIds, ...otherIds];

        await updateDoc(doc(db, 'rooms', roomId), {
            'currentAuction.queue': newQueue,
            'currentAuction.currentIndex': currentIdx,
            'currentAuction.currentPlayerId': newQueue[currentIdx] || null,
            'currentAuction.currentBid': 0,
            'currentAuction.currentBidderId': null,
            'currentAuction.currentBidderName': null,
            'currentAuction.currentBidderTeam': null,
            'currentAuction.timerEnd': null,
            'currentAuction.status': newQueue[currentIdx] ? 'bidding' : 'done',
        });
    }, [roomId, room, allPlayers]);

    // ============ KICK PLAYER CLEANUP ============

    const handleKickPlayerCleanup = useCallback(async (kickedUserId) => {
        if (!roomId || !room) return;

        const squadDocId = `${roomId}_${kickedUserId}`;
        const squadSnap = await getDoc(doc(db, 'squads', squadDocId));
        const kickedPlayers = squadSnap.exists() ? (squadSnap.data().players || []) : [];

        if (kickedPlayers.length > 0) {
            const kickedTeam = room.teamAssignments?.[kickedUserId] || 'UNKNOWN';
            const teamInfo = IPL_TEAMS.find(t => t.name === kickedTeam);
            const teamShort = teamInfo?.short || kickedTeam.substring(0, 3);

            const auction = room.currentAuction;
            if (auction) {
                const playerIds = kickedPlayers.map(p => p.playerId);
                const currentUnsold = auction.unsoldPlayers || [];
                const newUnsold = [...currentUnsold, ...playerIds];

                const kickedPlayerMap = { ...(room.kickedPlayerMap || {}) };
                playerIds.forEach(pid => {
                    kickedPlayerMap[pid] = teamShort;
                });

                await updateDoc(doc(db, 'rooms', roomId), {
                    'currentAuction.unsoldPlayers': newUnsold,
                    kickedPlayerMap,
                });
            }

            await setDoc(doc(db, 'squads', squadDocId), {
                roomId,
                userId: kickedUserId,
                players: [],
                updatedAt: serverTimestamp(),
            }, { merge: true });
        }

        const totalPurse = (room.rules?.totalPurse || 120) * 100;
        await updateDoc(doc(db, 'users', kickedUserId), {
            purseRemaining: totalPurse,
        });
    }, [roomId, room]);

    // ============ PLAYING XI ============

    const submitPlayingXI = useCallback(async (playingXI, impactPlayers, captainId) => {
        if (!roomId || !user) return;
        const docId = `${roomId}_${user.uid}`;
        await setDoc(doc(db, 'playingXI', docId), {
            roomId,
            userId: user.uid,
            playingXI,
            impactPlayers,
            captainId,
            submitted: true,
            submittedAt: serverTimestamp(),
        });
    }, [roomId, user]);

    // ============ SCORING ============

    const submitScore = useCallback(async (targetUserId, score, teamName) => {
        if (!roomId || !user) return;
        const docId = `${roomId}_${targetUserId}`;
        await setDoc(doc(db, 'scores', docId), {
            roomId,
            userId: targetUserId,
            teamName,
            score,
            auctionStrategyPoints: score,
            scoredAt: serverTimestamp(),
            scoredBy: user.uid,
        }, { merge: true });
    }, [roomId, user]);

    const publishResults = useCallback(async () => {
        if (!roomId) return;
        await updateDoc(doc(db, 'rooms', roomId), {
            status: GAME_PHASES.RESULTS,
        });
    }, [roomId]);

    // ============ SEED PLAYERS ============

    const seedPlayers = useCallback(async () => {
        const batch = writeBatch(db);
        allPlayers.forEach(p => {
            batch.set(doc(db, 'players', p.id), p);
        });
        await batch.commit();
    }, [allPlayers]);

    // ============ MINI-GAME ============

    const startMiniGame = useCallback(async () => {
        if (!roomId) return;
        await updateDoc(doc(db, 'rooms', roomId), {
            status: GAME_PHASES.MINI_GAME,
            'miniGame.status': 'selecting',
            'miniGame.completedRounds': [],
            'miniGame.currentRound': null,
            'miniGame.scores': {},
        });
    }, [roomId]);

    const submitMiniGameSelection = useCallback(async (selections) => {
        // selections = { BAT: 'player_id', SPIN: 'player_id', FAST: 'player_id', AR: 'player_id', WK: 'player_id' }
        if (!roomId || !user) return;
        const docId = `${roomId}_${user.uid}`;
        await setDoc(doc(db, 'miniGameSelections', docId), {
            roomId,
            userId: user.uid,
            selections,
            locked: true,
            submittedAt: serverTimestamp(),
        });
    }, [roomId, user]);

    const callMiniGameRound = useCallback(async (role) => {
        if (!roomId || !room) return;

        // Stat definitions
        const batStats = [
            { key: 'totalRuns', label: 'Runs', higher: true, get: p => p.totalRuns || 0 },
            { key: 'strikeRate', label: 'Strike Rate', higher: true, get: p => p.strikeRate || 0 },
            { key: 'highestScore', label: 'HS', higher: true, get: p => parseInt(String(p.highestScore || '0').replace('*', '')) || 0 },
            { key: 'sixes', label: '6s', higher: true, get: p => p.sixes || 0 },
            { key: 'fours', label: '4s', higher: true, get: p => p.fours || 0 },
            { key: 'fifties', label: '50s', higher: true, get: p => p.fifties || 0 },
            { key: 'hundreds', label: '100s', higher: true, get: p => p.hundreds || 0 },
        ];
        const bowlStats = [
            { key: 'wickets', label: 'Wickets', higher: true, get: p => p.wickets || 0 },
            { key: 'economy', label: 'Economy', higher: false, get: p => p.economyRate || 99 },
            { key: 'bestWkts', label: 'Best', higher: true, get: p => parseInt(String(p.best || '0').split('/')[0]) || 0 },
        ];
        const allStatDefs = {
            BAT: batStats, WK: batStats,
            SPIN: bowlStats, FAST: bowlStats,
            AR: [...batStats, ...bowlStats],
        };
        const statDefs = allStatDefs[role] || batStats;

        // Gather all selections for this role — teams that submitted selections
        const submittedSel = Object.entries(miniGameSelections).map(([uid, data]) => ({
            uid,
            playerId: data.selections?.[role],
        })).filter(s => s.playerId); // includes '__none__'

        // Add teams that never submitted at all (force-ended) as '__none__'
        const submittedUids = new Set(submittedSel.map(s => s.uid));
        const teamOwners = allUsers.filter(u => u.role === 'teamOwner');
        const missingSel = teamOwners
            .filter(u => !submittedUids.has(u.uid))
            .map(u => ({ uid: u.uid, playerId: '__none__' }));

        const allSel = [...submittedSel, ...missingSel];

        if (allSel.length === 0) return;

        // Separate real players from '__none__' (no eligible player in squad)
        const realSel = allSel.filter(s => s.playerId !== '__none__');
        const noneSel = allSel.filter(s => s.playerId === '__none__');

        const numUsers = allSel.length;

        // Get player data for real selections only
        const selWithData = realSel.map(s => ({
            uid: s.uid,
            player: allPlayers.find(pl => pl.id === s.playerId),
        })).filter(s => s.player);

        // Build per-stat results (only real players compete in stats)
        const statResults = statDefs.map(stat => {
            const values = selWithData.map(s => ({
                uid: s.uid,
                val: stat.get(s.player),
            }));
            const best = stat.higher
                ? Math.max(...values.map(v => v.val))
                : Math.min(...values.map(v => v.val));
            return {
                statKey: stat.key,
                statLabel: stat.label,
                higher: stat.higher,
                values: values.map(v => ({ uid: v.uid, val: v.val, won: v.val === best })),
            };
        });

        // Count card points per user (only real players compete)
        const cardPoints = {};
        selWithData.forEach(s => { cardPoints[s.uid] = 0; });
        noneSel.forEach(s => { cardPoints[s.uid] = 0; }); // __none__ starts at 0
        statResults.forEach(stat => {
            stat.values.forEach(v => { if (v.won) cardPoints[v.uid]++; });
        });

        // Rank users by card points (descending), ties get same rank
        // __none__ users always rank last
        const allUids = [...selWithData.map(s => s.uid), ...noneSel.map(s => s.uid)];
        const sortedUids = [...allUids].sort((a, b) => cardPoints[b] - cardPoints[a]);
        const userPoints = {};
        let prevCardPts = null;
        for (let i = 0; i < sortedUids.length; i++) {
            const uid = sortedUids[i];
            const pts = cardPoints[uid];
            if (pts !== prevCardPts) {
                prevCardPts = pts;
            }
            userPoints[uid] = Math.max(1, numUsers - i);
        }
        // Fix ties: if tied in cardPoints, both get same (higher) userPoints
        for (let i = 0; i < sortedUids.length; i++) {
            const uid = sortedUids[i];
            if (i > 0 && cardPoints[uid] === cardPoints[sortedUids[i - 1]]) {
                userPoints[uid] = userPoints[sortedUids[i - 1]];
            }
        }

        // Cumulative mini-game scores
        const existingScores = room.miniGame?.scores || {};
        const newScores = { ...existingScores };
        Object.entries(userPoints).forEach(([uid, pts]) => {
            newScores[uid] = (newScores[uid] || 0) + pts;
        });

        const completedRounds = [...(room.miniGame?.completedRounds || []), role];

        // Round result — detailed for cinematic animation
        // Include __none__ players with -1 stats so their card shows N/A
        const noneStatResults = statDefs.map(stat => ({
            statKey: stat.key,
            statLabel: stat.label,
            higher: stat.higher,
            values: noneSel.map(s => ({ uid: s.uid, val: -1, won: false })),
        }));
        const mergedStatResults = statResults.map((sr, i) => ({
            ...sr,
            values: [
                ...sr.values,
                ...(noneStatResults[i]?.values || []),
            ],
        }));

        const roundResult = {
            roundRole: role,
            statResults: mergedStatResults,
            players: [
                ...selWithData.map(s => ({
                    uid: s.uid,
                    playerName: s.player.playerName,
                    playerId: s.player.id,
                    cardPoints: cardPoints[s.uid],
                    userPoints: userPoints[s.uid],
                })),
                ...noneSel.map(s => ({
                    uid: s.uid,
                    playerName: 'N/A — No eligible player',
                    playerId: '__none__',
                    cardPoints: 0,
                    userPoints: 0,
                })),
            ],
        };

        await updateDoc(doc(db, 'rooms', roomId), {
            'miniGame.status': 'playing',
            'miniGame.currentRound': role,
            'miniGame.completedRounds': completedRounds,
            'miniGame.scores': newScores,
            [`miniGame.roundResults.${role}`]: roundResult,
        });
    }, [roomId, room, allPlayers, miniGameSelections]);

    const finishMiniGame = async () => {
        // Save mini game scores to overall leaderboard
        const miniScores = room.miniGame?.scores || {};
        const teamOwners = allUsers.filter(u => u.role === 'teamOwner');
        for (const owner of teamOwners) {
            const miniPts = miniScores[owner.uid] || 0;
            const docId = `${roomId}_${owner.uid}`;
            const existingScoreSnap = await getDoc(doc(db, 'scores', docId));
            const existingScore = existingScoreSnap.exists() ? (existingScoreSnap.data().score || 0) : 0;
            const teamName = room.teamAssignments?.[owner.uid] || '';
            await setDoc(doc(db, 'scores', docId), {
                roomId,
                userId: owner.uid,
                teamName,
                score: existingScore + miniPts,
                miniGamePoints: miniPts,
                scoredAt: serverTimestamp(),
            }, { merge: true });
        }
        await updateDoc(doc(db, 'rooms', roomId), {
            'miniGame.status': 'finished',
            status: GAME_PHASES.RESULTS,
        });
    };

    const submitManualScores = async (manualScores) => {
        // manualScores is an object mapping uid -> score
        await updateDoc(doc(db, 'rooms', roomId), {
            'miniGame.manualScores': manualScores,
            'miniGame.manualScoresSubmitted': true
        });
        
        // Also save these immediately to the leaderboard so Results.jsx can show them
        for (const uid of Object.keys(manualScores)) {
            const docId = `${roomId}_${uid}`;
            const existingScoreSnap = await getDoc(doc(db, 'scores', docId));
            const existingScore = existingScoreSnap.exists() ? (existingScoreSnap.data().score || 0) : 0;
            const teamName = room?.teamAssignments?.[uid] || '';
            await setDoc(doc(db, 'scores', docId), {
                roomId,
                userId: uid,
                teamName,
                score: existingScore + manualScores[uid],
                auctionStrategyPoints: manualScores[uid],
                scoredAt: serverTimestamp(),
            }, { merge: true });
        }
    };

    // ============ FORCE END MINI-GAME (Auctioneer Override) ============

    const forceEndMiniGameSelection = useCallback(async () => {
        // Auctioneer can force the selection phase to end even if not all players have submitted.
        // Players who haven't submitted will simply score 0 for the round — others are unaffected.
        if (!roomId) return;
        await updateDoc(doc(db, 'rooms', roomId), {
            'miniGame.forceEnded': true,
            'miniGame.status': 'forced_end',
        });
    }, [roomId]);

    // ============ MUTE BIDDER (Auctioneer Override) ============

    const muteBidder = useCallback(async (targetUserId) => {
        // Auctioneer disables a specific team owner's bid buttons in real-time.
        if (!roomId || !room) return;
        const mutedBidders = { ...(room.mutedBidders || {}) };
        mutedBidders[targetUserId] = true;
        await updateDoc(doc(db, 'rooms', roomId), { mutedBidders });
    }, [roomId, room]);

    const unmuteBidder = useCallback(async (targetUserId) => {
        // Auctioneer re-enables a team owner's bid buttons.
        if (!roomId || !room) return;
        const mutedBidders = { ...(room.mutedBidders || {}) };
        delete mutedBidders[targetUserId];
        await updateDoc(doc(db, 'rooms', roomId), { mutedBidders });
    }, [roomId, room]);



    const value = {
        allPlayers,
        auctionQueue,
        retentionSelections,
        squads,
        playingXIData,
        scores,
        assignTeams,
        shuffleMyTeam,
        forceShuffleTeams,
        forceShuffleUser,
        submitRetention,
        startAuction,
        startBidding,
        placeBid,
        markSold,
        markUnsold,
        skipToNextPlayer,
        restartAuctionWithSelected,
        endAuction,
        submitPlayingXI,
        submitScore,
        publishResults,
        seedPlayers,
        initiateRTMCheck,
        useRTM,
        declineRTM,
        submitCounterOffer,
        declineCounterOffer,
        matchCounterOffer,
        declineCounterMatch,
        changeAuctionSet,
        handleKickPlayerCleanup,
        miniGameSelections,
        startMiniGame,
        submitMiniGameSelection,
        callMiniGameRound,
        finishMiniGame,
        forceEndMiniGameSelection,
        muteBidder,
        submitManualScores,
        unmuteBidder,
    };

    return (
        <GameContext.Provider value={value}>
            {children}
        </GameContext.Provider>
    );
}

export function useGame() {
    const context = useContext(GameContext);
    if (!context) throw new Error('useGame must be used within GameProvider');
    return context;
}

