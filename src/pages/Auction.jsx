import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import Timer from '../components/Timer';
import TeamBadge from '../components/TeamBadge';
import PurseBar from '../components/PurseBar';
import ConfirmModal from '../components/ConfirmModal';
import { ROLES, GAME_PHASES, CATEGORY_ORDER, getTeamByName, MAX_OVERSEAS } from '../utils/constants';
import { formatPrice, isIndian, calcSquadPredictorScore } from '../utils/helpers';
import { getCategoryInfo } from '../utils/auctionEngine';
import TextRandomizer from '../components/TextRandomizer';

// Sound effects using Web Audio API
function playSound(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (type === 'sold') {
            // Rising chime + impact
            [523.25, 659.25, 783.99].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.4);
                osc.connect(gain).connect(ctx.destination);
                osc.start(ctx.currentTime + i * 0.1);
                osc.stop(ctx.currentTime + i * 0.1 + 0.4);
            });
        } else if (type === 'unsold') {
            // Descending buzz
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            osc.connect(gain).connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.5);
        } else if (type === 'transition') {
            // Cinematic whoosh
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(200, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);
            osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.6);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.15);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
            osc.connect(gain).connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.7);
        } else if (type === 'bid') {
            // Punchy click-pop for placing a bid
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(880, ctx.currentTime);
            osc1.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.06);
            gain1.gain.setValueAtTime(0.35, ctx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
            osc1.connect(gain1).connect(ctx.destination);
            osc1.start(); osc1.stop(ctx.currentTime + 0.15);
            // Secondary click layer
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(1200, ctx.currentTime + 0.03);
            gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.03);
            gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            osc2.connect(gain2).connect(ctx.destination);
            osc2.start(ctx.currentTime + 0.03); osc2.stop(ctx.currentTime + 0.12);
        }
    } catch (e) { }
}
// Fullscreen + Landscape Lock Button
function FullscreenButton(/* FOO */{ voiceEnabled, setVoiceEnabled }) {
    const [isFS, setIsFS] = React.useState(false);
    React.useEffect(() => {
        const handler = () => setIsFS(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);
    const toggle = async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
                try { await screen.orientation.lock('landscape'); } catch (e) {}
            } else {
                await document.exitFullscreen();
                try { screen.orientation.unlock(); } catch (e) {}
            }
        } catch (e) {}
    };
    return (
        <button
            onClick={toggle}
            id="fullscreen-btn"
            title={isFS ? 'Exit Fullscreen' : 'Enter Fullscreen (Landscape)'}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 'clamp(6px,1.5vw,10px)',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.65)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                flexShrink: 0,
            }}
        >
            {isFS ? (
                <svg width="clamp(14px,2vw,18px)" height="clamp(14px,2vw,18px)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
            ) : (
                <svg width="clamp(14px,2vw,18px)" height="clamp(14px,2vw,18px)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                </svg>
            )}
        </button>
    );
}

export default function Auction() {
    const { room, userData, allUsers, advancePhase, kickUser } = useRoom();
    const { allPlayers, startAuction, startBidding, placeBid, markSold, markUnsold, endAuction, squads, restartAuctionWithSelected, initiateRTMCheck, useRTM, declineRTM, submitCounterOffer, declineCounterOffer, matchCounterOffer, declineCounterMatch, changeAuctionSet, handleKickPlayerCleanup, retentionSelections, muteBidder, unmuteBidder } = useGame();
    const { user } = useAuth();

    const isAuctioneer = userData?.role === ROLES.AUCTIONEER;
    const auction = room?.currentAuction;

    const [bidError, setBidError] = useState(null);
    const [isBidCooldown, setIsBidCooldown] = useState(false);
    const [isSelling, setIsSelling] = useState(false);
    const [sellError, setSellError] = useState(null);
    const [showSoldAnimation, setShowSoldAnimation] = useState(false);
    const [showUnsoldAnimation, setShowUnsoldAnimation] = useState(false);
    const [showStinger, setShowStinger] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(true);
    const [stingerText, setStingerText] = useState('');
    const [showMySquad, setShowMySquad] = useState(false);
    const [showFullStats, setShowFullStats] = useState(false);
    const [showAdminSquads, setShowAdminSquads] = useState(false);
    const [saleSnapshot, setSaleSnapshot] = useState(null);

    const [showConfirmSaleModal, setShowConfirmSaleModal] = useState(false);
    const [showReviewUnsoldModal, setShowReviewUnsoldModal] = useState(false);
    const [selectedUnsoldPlayers, setSelectedUnsoldPlayers] = useState(new Set());
    const [showConfirmPhase, setShowConfirmPhase] = useState(false);
    const [showConfirmEndAuction, setShowConfirmEndAuction] = useState(false);
    const [showSetChangeMenu, setShowSetChangeMenu] = useState(false);
    const [pendingSetChange, setPendingSetChange] = useState(null);
    const [showKickConfirm, setShowKickConfirm] = useState(null);
    const [rtmCounterAmount, setRtmCounterAmount] = useState(0);

    // ── Watchlist State & Refs ──
    const [watchlist, setWatchlist] = useState(new Set());
    const isWatchlistLoaded = useRef(false);
    const [showWatchlist, setShowWatchlist] = useState(false);
    const [playerSearchQuery, setPlayerSearchQuery] = useState('');

    // ── Watchlist Active Warning overlay ──
    const [showTargetActiveAlert, setShowTargetActiveAlert] = useState(false);

    // ── Heartbeat BGM Refs ──
    const heartbeatIntervalRef = useRef(null);
    const heartbeatCtxRef = useRef(null);

    // ── Bid War Intensity ──
    const [bidCount, setBidCount] = useState(0);
    const prevBidderRef = useRef(null);

    // ── Unsold confirmation ──
    const [showUnsoldConfirm, setShowUnsoldConfirm] = useState(false);

    // ── Drag-and-Drop Squad Reordering ──
    const [squadOrder, setSquadOrder] = useState([]); // ordered list of playerIds
    const dragIndexRef = useRef(null);

    // ── Bidding War Tracking ──
    const [biddingWarTeams, setBiddingWarTeams] = useState(null); // { a: team, b: team }
    const bidWarHistoryRef = useRef([]); // last N bids [{ bidderId, team }]


    // ── Confetti canvas ref ──
    const confettiRef = useRef(null);
    const confettiAnimRef = useRef(null);


    useEffect(() => {
        if (auction?.rtmPending?.status === 'counter_offer') {
            setRtmCounterAmount(auction.rtmPending.winningBid + 25);
        } else if (!auction?.rtmPending) {
            setRtmCounterAmount(0);
        }
    }, [auction?.rtmPending?.status, auction?.rtmPending?.winningBid]);

    const currentPlayer = auction?.currentPlayerId
        ? allPlayers.find(p => p.id === auction.currentPlayerId)
        : null;

    // ── Watchlist flags — defined early so useEffect dep arrays can reference them ──
    const currentPlayerWatchlisted = currentPlayer && watchlist.has(currentPlayer.id);

    const minIncrement = room?.rules?.minBidIncrement || 25;
    const nextMinBid = auction?.currentBid > 0
        ? auction.currentBid + minIncrement
        : (currentPlayer?.basePrice || 0);

    const quickBids = [
        nextMinBid,
        nextMinBid + minIncrement,
        nextMinBid + minIncrement * 2,
        nextMinBid + minIncrement * 5,
    ];

    // Detect Category Changes for Stingers
    const prevPlayerRef = useRef(null);
    useEffect(() => {
        if (!currentPlayer) return;

        const prevPlayer = prevPlayerRef.current;
        if (prevPlayer && prevPlayer.id !== currentPlayer.id) {
            // Did category change?
            if (prevPlayer.category !== currentPlayer.category) {
                const newCat = getCategoryInfo(currentPlayer.category);
                setStingerText(`Next Set: ${newCat.label}`);
                setShowStinger(true);
                playSound('transition');
                setTimeout(() => setShowStinger(false), 2500);
            }
        }
        prevPlayerRef.current = currentPlayer;
    }, [currentPlayer?.id, currentPlayer?.category]);

    // Show animations + sound on status change
    useEffect(() => {
        if (auction?.status === 'sold' && auction?.lastSold) {
            setShowUnsoldAnimation(false); // reset the other
            playSound('sold');
            setShowSoldAnimation(true);
            const t = setTimeout(() => setShowSoldAnimation(false), 3500);
            return () => clearTimeout(t);
        }
        if (auction?.status === 'unsold') {
            setShowSoldAnimation(false); // reset the other
            playSound('unsold');
            setShowUnsoldAnimation(true);
            const t = setTimeout(() => setShowUnsoldAnimation(false), 3000);
            return () => clearTimeout(t);
        }
    }, [auction?.status, auction?.currentPlayerId]);

    // ── Bid intensity: count bidder changes per player ──
    useEffect(() => {
        if (!auction?.currentBidderId) return;
        if (auction.currentBidderId !== prevBidderRef.current) {
            setBidCount(c => c + 1);
            prevBidderRef.current = auction.currentBidderId;
        }
    }, [auction?.currentBidderId]);

    // Reset intensity when player changes
    useEffect(() => {
        setBidCount(0);
        prevBidderRef.current = null;
        bidWarHistoryRef.current = [];
        setBiddingWarTeams(null);
    }, [auction?.currentPlayerId]);

    // ── Bidding War Detection ──
    useEffect(() => {
        if (!auction?.currentBidderId || !auction?.currentBidderTeam) return;
        const history = bidWarHistoryRef.current;
        history.push({ uid: auction.currentBidderId, team: auction.currentBidderTeam });
        if (history.length > 8) history.shift();
        if (history.length >= 6) {
            const lastSix = history.slice(-6);
            const teams = [...new Set(lastSix.map(b => b.team))];
            if (teams.length === 2) {
                setBiddingWarTeams({ a: teams[0], b: teams[1] });
            } else {
                setBiddingWarTeams(null);
            }
        }
    }, [auction?.currentBidderId, auction?.currentBidderTeam]);

    // ── Squad Order Sync ──
    // Reads from squads directly (avoids hook-after-derived-variable violation)
    useEffect(() => {
        const squadPlayers = squads[user?.uid]?.players || [];
        if (squadPlayers.length === 0) return;
        const storageKey = `squadOrder_${room?.code}_${user?.uid}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const savedIds = JSON.parse(saved);
                const currentIds = squadPlayers.map(p => p.playerId);
                const merged = [
                    ...savedIds.filter(id => currentIds.includes(id)),
                    ...currentIds.filter(id => !savedIds.includes(id)),
                ];
                setSquadOrder(merged);
            } catch (e) {
                setSquadOrder(squadPlayers.map(p => p.playerId));
            }
        } else {
            setSquadOrder(squadPlayers.map(p => p.playerId));
        }
    }, [squads, user?.uid, room?.code]);






    // ── Load watchlist targets on mount/room code sync ──
    useEffect(() => {
        if (room?.code) {
            try {
                const stored = localStorage.getItem(`watchlist_${room.code}`);
                if (stored) {
                    setWatchlist(new Set(JSON.parse(stored)));
                } else {
                    setWatchlist(new Set());
                }
            } catch (e) {
                console.error("Error loading watchlist", e);
            }
            isWatchlistLoaded.current = true;
        }
    }, [room?.code]);

    // ── Save watchlist targets ──
    useEffect(() => {
        if (room?.code && isWatchlistLoaded.current) {
            localStorage.setItem(`watchlist_${room.code}`, JSON.stringify([...watchlist]));
        }
    }, [watchlist, room?.code]);

    // ── Heartbeat BGM Sound Effects ──
    const startHeartbeat = useCallback(() => {
        if (heartbeatIntervalRef.current) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContextClass();
            heartbeatCtxRef.current = ctx;

            const playBeat = (pitch, duration, volume, timeOffset) => {
                try {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(pitch, ctx.currentTime + timeOffset);
                    osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + timeOffset + duration);
                    gain.gain.setValueAtTime(0, ctx.currentTime + timeOffset);
                    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + timeOffset + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + timeOffset + duration);
                    osc.connect(gain).connect(ctx.destination);
                    osc.start(ctx.currentTime + timeOffset);
                    osc.stop(ctx.currentTime + timeOffset + duration + 0.1);
                } catch (e) {}
            };

            const doPlay = () => {
                playBeat(65, 0.12, 0.48, 0);
                playBeat(80, 0.15, 0.52, 0.15);
            };

            const triggerLubDub = () => {
                if (!ctx || ctx.state === 'closed') return;
                if (ctx.state === 'suspended') {
                    ctx.resume().then(doPlay).catch(() => {});
                } else {
                    doPlay();
                }
            };

            // Resume context on first call (needed for mobile)
            if (ctx.state === 'suspended') {
                ctx.resume().then(() => {
                    triggerLubDub();
                    heartbeatIntervalRef.current = setInterval(triggerLubDub, 850);
                }).catch(() => {});
            } else {
                triggerLubDub();
                heartbeatIntervalRef.current = setInterval(triggerLubDub, 850);
            }
        } catch (e) {
            console.error('Heartbeat trigger error', e);
        }
    }, []);

    const stopHeartbeat = useCallback(() => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
        }
        if (heartbeatCtxRef.current) {
            try {
                heartbeatCtxRef.current.close();
            } catch (e) {}
            heartbeatCtxRef.current = null;
        }
    }, []);

    useEffect(() => {
        const isBiddingActive = auction?.status === 'bidding';
        const isOverFifteenCrores = auction?.currentBid >= 1500; // 1500 lakhs = 15 Cr
        const isRTMPending = !!auction?.rtmPending;

        if ((isBiddingActive && isOverFifteenCrores) || isRTMPending) {
            startHeartbeat();
        } else {
            stopHeartbeat();
        }

        return () => {
            stopHeartbeat();
        };
    }, [auction?.status, auction?.currentBid, auction?.rtmPending, startHeartbeat, stopHeartbeat]);

    // ── Watchlist Target Active Announcement ──
    useEffect(() => {
        if (currentPlayerWatchlisted) {
            setShowTargetActiveAlert(true);
            const t = setTimeout(() => setShowTargetActiveAlert(false), 2500);

            // Play warning buzzer
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc1 = ctx.createOscillator();
                const osc2 = ctx.createOscillator();
                const gain = ctx.createGain();

                osc1.type = 'sawtooth'; osc1.frequency.value = 180;
                osc2.type = 'sine'; osc2.frequency.value = 185;

                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
                gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.4);
                gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.5);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);

                osc1.connect(gain); osc2.connect(gain);
                gain.connect(ctx.destination);

                osc1.start(); osc2.start();
                osc1.stop(ctx.currentTime + 1.2); osc2.stop(ctx.currentTime + 1.2);
            } catch (e) {}

            return () => {
                clearTimeout(t);
                setShowTargetActiveAlert(false);
            };
        }
    }, [auction?.currentPlayerId, currentPlayerWatchlisted]);

    // ── Confetti launcher ──
    const launchConfetti = useCallback(() => {
        const canvas = confettiRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const pieces = Array.from({ length: 120 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height * 0.4,
            vx: (Math.random() - 0.5) * 6,
            vy: Math.random() * 4 + 2,
            color: ['#FFD700','#A855F7','#10B981','#EF4444','#3B82F6','#F59E0B'][Math.floor(Math.random()*6)],
            size: Math.random() * 8 + 4,
            rot: Math.random() * 360,
            rotV: (Math.random() - 0.5) * 8,
            life: 1,
        }));
        let frame = 0;
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            pieces.forEach(p => {
                p.x += p.vx; p.y += p.vy; p.rot += p.rotV; p.life -= 0.008;
                p.vy += 0.12;
                ctx.save();
                ctx.globalAlpha = Math.max(0, p.life);
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rot * Math.PI) / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5);
                ctx.restore();
            });
            frame++;
            if (frame < 200) confettiAnimRef.current = requestAnimationFrame(animate);
            else ctx.clearRect(0, 0, canvas.width, canvas.height);
        };
        if (confettiAnimRef.current) cancelAnimationFrame(confettiAnimRef.current);
        animate();
    }, []);

    // Launch confetti on sold + cleanup on unmount
    useEffect(() => {
        if (auction?.status === 'sold') launchConfetti();
        return () => {
            if (confettiAnimRef.current) cancelAnimationFrame(confettiAnimRef.current);
        };
    }, [auction?.status, auction?.currentPlayerId, launchConfetti]);

    // ── Watchlist helpers ──
    const toggleWatchlist = useCallback((playerId) => {
        setWatchlist(prev => {
            const next = new Set(prev);
            if (next.has(playerId)) next.delete(playerId);
            else next.add(playerId);
            return next;
        });
    }, []);


    const handleBid = async (amount) => {
        if (isBidCooldown) return;

        setBidError(null);
        setIsBidCooldown(true);

        try {
            await placeBid(amount);
            playSound('bid');
            // 1-second cooldown after a successful bid attempt
            setTimeout(() => {
                setIsBidCooldown(false);
            }, 1000);
        } catch (err) {
            setBidError(err.message);
            setIsBidCooldown(false);
        }
    };

    const handleTimerExpire = useCallback(async () => {
        if (!isAuctioneer) return;
        // The auctioneer must manually click confirm or force sold/unsold,
        // so we don't auto-sell here anymore to prevent accidents.
    }, [isAuctioneer]);

    const teamOwners = allUsers.filter(u => u.role === ROLES.TEAM_OWNER);
    const totalInQueue = auction?.queue?.length || 0;
    const currentIndex = auction?.currentIndex || 0;
    const soldCount = auction?.soldPlayers?.length || 0;
    const unsoldCount = auction?.unsoldPlayers?.length || 0;

    // My squad data
    const mySquadPlayers = squads[user?.uid]?.players || [];
    const myRetained = mySquadPlayers.filter(p => p.type === 'retained');
    const myBought = mySquadPlayers.filter(p => p.type === 'bought');
    const totalSpent = myBought.reduce((sum, p) => sum + (p.price || 0), 0);

    // Helper to get team name for a user
    const getTeamForUser = (uid) => room?.teamAssignments?.[uid] || '';


    // Current bidder's team
    const currentBidderTeam = auction?.currentBidderTeam || getTeamForUser(auction?.currentBidderId);

    // ── Blind Auction Mode flag ──
    const isBlindMode = room?.gameMode === 'BLIND';
    // In blind mode, reveal name/team only when status is 'sold'
    const blindRevealed = isBlindMode && auction?.status === 'sold';

    // Next player in queue
    const nextPlayerInQueue = (() => {
        if (!auction?.queue || currentIndex + 1 >= auction.queue.length) return null;
        return allPlayers.find(p => p.id === auction.queue[currentIndex + 1]);
    })();

    // Squad composition helper
    const getSquadComposition = (squadPlayersList) => {
        const comp = { BAT: 0, BOW: 0, AR: 0, WK: 0, SPINNER: 0, PACER: 0, OVERSEAS: 0, INDIAN: 0 };
        squadPlayersList.forEach(sp => {
            const full = allPlayers.find(p => p.id === sp.playerId);
            if (!full) return;
            const role = full.playerRole?.trim().toUpperCase();
            if (role === 'BAT') comp.BAT++;
            else if (role === 'BOW') {
                comp.BOW++;
                if (full.bowlingType === 'SPIN') comp.SPINNER++;
                else if (full.bowlingType === 'FAST') comp.PACER++;
            }
            else if (role === 'AR') comp.AR++;
            else if (role === 'WK' || role === 'WK ') comp.WK++;
            if (!isIndian(full.nationality)) comp.OVERSEAS++;
            else comp.INDIAN++;
        });
        return comp;
    };

    const maxSquadSize = room?.rules?.maxSquadSize || 25;

    // ── Bid War Intensity Level ──
    const intensityLevel = bidCount >= 7 ? 'fire' : bidCount >= 4 ? 'hot' : 'low';
    const intensityPct   = Math.min(100, (bidCount / 10) * 100);
    const intensityColor = intensityLevel === 'fire' ? '#EF4444' : intensityLevel === 'hot' ? '#FB923C' : '#60A5FA';
    const intensityLabel = intensityLevel === 'fire' ? '🔥 ON FIRE!' : intensityLevel === 'hot' ? '⚡ HEATING UP' : '💤 Low';

    // ── My Overseas count for slot tracker ──
    const myOverseasCount = mySquadPlayers.filter(sp => {
        const p = allPlayers.find(pl => pl.id === sp.playerId);
        return p && !isIndian(p.nationality);
    }).length;
    const currentPlayerIsOverseas = currentPlayer && !isIndian(currentPlayer.nationality);
    const overseasFull = myOverseasCount >= MAX_OVERSEAS;
    const isBlockedByOverseas = !isAuctioneer && overseasFull && currentPlayerIsOverseas;
    const isMutedByAuctioneer = !isAuctioneer && !!(room?.mutedBidders?.[user?.uid]);

    // ── Watchlist flags (nextPlayerWatchlisted needs nextPlayerInQueue, defined above) ──
    const nextPlayerWatchlisted = nextPlayerInQueue && watchlist.has(nextPlayerInQueue.id);

    // ── Blockbuster threshold (₹10 Cr = 1000 lakhs) ──
    const BLOCKBUSTER_THRESHOLD = 1000;

    // Handle opening confirm sale modal — snapshot current state
    const openConfirmSale = () => {
        setSaleSnapshot({
            bidderId: auction?.currentBidderId,
            bidderTeam: currentBidderTeam,
            bid: auction?.currentBid,
            playerName: currentPlayer?.playerName,
        });
        setShowConfirmSaleModal(true);
    };

    // Check if bid changed since snapshot
    const hasBidChangedSinceSnapshot = saleSnapshot && (
        saleSnapshot.bidderId !== auction?.currentBidderId ||
        saleSnapshot.bid !== auction?.currentBid
    );

    const toggleUnsoldPlayerSelection = (playerId) => {
        const newSet = new Set(selectedUnsoldPlayers);
        if (newSet.has(playerId)) newSet.delete(playerId);
        else newSet.add(playerId);
        setSelectedUnsoldPlayers(newSet);
    };

    const handleRestartUnsoldAuction = async () => {
        if (selectedUnsoldPlayers.size === 0) return;
        await restartAuctionWithSelected(Array.from(selectedUnsoldPlayers));
        setShowReviewUnsoldModal(false);
        setSelectedUnsoldPlayers(new Set());
    };

    // RTM-aware sale handler
    const handleConfirmSale = async () => {
        if (isSelling) return;
        setIsSelling(true);
        setSellError(null);
        setShowConfirmSaleModal(false);
        try {
            const rtmTriggered = await initiateRTMCheck();
            if (!rtmTriggered) {
                await markSold();
            }
        } catch (err) {
            console.error('[Auction] markSold error:', err);
            setSellError(err.message || 'Failed to complete sale. Try again.');
        } finally {
            setIsSelling(false);
        }
        // If RTM triggered, the UI will show the RTM modal via room state
    };

    // Set change handler
    const handleSetChange = (categoryKey) => {
        setPendingSetChange(categoryKey);
        setShowSetChangeMenu(false);
    };

    const confirmSetChange = async () => {
        if (pendingSetChange) {
            await changeAuctionSet(pendingSetChange);
        }
        setPendingSetChange(null);
    };

    // Kick user handler
    const handleKick = async (userId) => {
        await kickUser(userId);
        await handleKickPlayerCleanup(userId);
        setShowKickConfirm(null);
    };

    // End auction with confirmation
    const handleEndAuction = async () => {
        setShowConfirmEndAuction(false);
        await endAuction();
    };

    // RTM data from room
    const rtmPending = auction?.rtmPending;
    const rtmCards = room?.rtmCards || {};
    const kickedPlayerMap = room?.kickedPlayerMap || {};

    // Purse leaderboard data
    const activeTeamOwners = allUsers.filter(u => u.role === ROLES.TEAM_OWNER && !(room?.kickedUsers || []).includes(u.uid));
    const purseLeaderboard = activeTeamOwners.map(u => ({
        uid: u.uid,
        username: u.username,
        teamName: room?.teamAssignments?.[u.uid] || '',
        purse: u.purseRemaining ?? ((room?.rules?.totalPurse || 120) * 100),
    })).sort((a, b) => b.purse - a.purse);

    const myTeamName = room?.teamAssignments?.[user?.uid] || '';
    const myTeam = getTeamByName(myTeamName);
    const themeColor = myTeam?.color || '#A855F7';
    const getRGBString = (hexColor) => {
        let hex = (hexColor || '#A855F7').replace('#', '');
        // Expand 3-char shorthand hex (#abc → #aabbcc) to avoid NaN
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const r = parseInt(hex.slice(0, 2), 16) || 0;
        const g = parseInt(hex.slice(2, 4), 16) || 0;
        const b = parseInt(hex.slice(4, 6), 16) || 0;
        return `${r},${g},${b}`;
    };
    const themeColorRGB = getRGBString(themeColor);

    return (
        <Layout>
            <div className="max-w-7xl mx-auto relative">
                <div style={{ position: 'absolute', top: '-45px', right: '10px', zIndex: 1000, display: 'flex', gap: '8px' }}>
                    {/* Voice Mute Toggle */}
                    <button
                        onClick={() => setVoiceEnabled(v => !v)}
                        id="voice-toggle-btn"
                        title={voiceEnabled ? 'Mute AI Voice' : 'Enable AI Voice'}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 'clamp(6px,1.5vw,10px)',
                            borderRadius: '8px',
                            background: voiceEnabled ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${voiceEnabled ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)'}`,
                            color: voiceEnabled ? '#C084FC' : 'rgba(255,255,255,0.3)',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            flexShrink: 0,
                            fontSize: 'clamp(12px,2vw,16px)',
                        }}
                    >
                        {voiceEnabled ? '🔊' : '🔇'}
                    </button>
                </div>
                <style>{`
                    :root {
                        --theme-color: ${themeColor};
                        --theme-color-rgb: ${themeColorRGB};
                    }
                    @keyframes slideInRight {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    .stinger-active {
                        animation: slideInRight 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
                    }
                `}</style>

                {/* ── CONFETTI CANVAS ── */}
                <canvas
                    ref={confettiRef}
                    style={{ position: 'fixed', inset: 0, zIndex: 300, pointerEvents: 'none' }}
                />

                {/* ── WATCHLIST TARGET UP-NEXT ALERT ── */}
                {nextPlayerWatchlisted && auction?.status !== 'done' && (
                    <div
                        className="fixed top-16 left-1/2 -translate-x-1/2 z-[150] px-6 py-2.5 rounded-full font-bold text-sm animate-target-banner"
                        style={{
                            background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,165,0,0.1))',
                            border: '1.5px solid rgba(255,215,0,0.5)',
                            color: '#FFD700',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 0 20px rgba(255,215,0,0.25)',
                        }}
                    >
                        ⚠️ WATCHLIST TARGET UP NEXT → <span className="text-white">{nextPlayerInQueue?.playerName}</span>
                    </div>
                )}

                {/* ── WATCHLIST TARGET ACTIVE OVERLAY ANNOUNCEMENT ── */}
                {showTargetActiveAlert && (
                    <div className="fixed inset-0 z-[250] flex flex-col items-center justify-center bg-black/70 backdrop-blur-[3px] pointer-events-none animate-fade-in">
                        <div className="text-center p-8 rounded-3xl border border-yellow-400/40 bg-[#0a0615] shadow-2xl shadow-yellow-500/10 max-w-lg animate-scale-in">
                            <span className="text-5xl mb-4 block animate-bounce">🎯</span>
                            <h2 className="text-3xl font-black text-yellow-400 tracking-wider uppercase">Target Acquisition</h2>
                            <div className="my-3 text-2xl font-extrabold text-white">{currentPlayer?.playerName}</div>
                            <p className="text-white/60 text-sm">This player is in your watchlist. Win the bid!</p>
                        </div>
                    </div>
                )}

                {/* STINGER OVERLAY */}
                {showStinger && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }}>
                        <div className="stinger-active text-center">
                            <h1 className="text-6xl md:text-8xl font-black italic uppercase tracking-widest text-transparent bg-clip-text" style={{
                                backgroundImage: 'linear-gradient(to right, #FFD700, #FBBF24, #FFD700)',
                                WebkitTextStroke: '1px rgba(255,215,0,0.5)',
                                textShadow: '0 0 40px rgba(255,215,0,0.3)',
                            }}>
                                {stingerText}
                            </h1>
                            <div className="mt-6 w-3/4 mx-auto h-1 rounded-full bg-gradient-to-r from-transparent via-ipl-gold to-transparent opacity-50"></div>
                        </div>
                    </div>
                )}

                {/* Auction not started */}
                {!auction && isAuctioneer && (
                    <div className="text-center py-16 animate-cyber-slide-up">
                        <div className="text-7xl mb-6 animate-float">🏏</div>
                        <h2 className="text-4xl font-black mb-4" style={{
                            background: 'linear-gradient(135deg, #A855F7, #EC4899, #FFD700)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            <TextRandomizer text="Ready to Auction" delay={100} stagger={50} />
                        </h2>
                        <p className="text-white/40 mb-6">Start the live auction to begin bidding</p>
                        <button onClick={() => startAuction()} className="btn-primary text-xl px-10 py-5 animate-pulse-neon" id="start-auction-btn">
                            🚀 Start Auction
                        </button>
                    </div>
                )}

                {!auction && !isAuctioneer && (
                    <div className="text-center py-16 animate-fade-in">
                        <div className="text-7xl mb-6 animate-float">⏳</div>
                        <h2 className="section-title text-3xl mb-2">Waiting for Auction</h2>
                        <p className="text-white/40">The auctioneer will start the auction shortly...</p>
                    </div>
                )}

                {/* Auction Done */}
                {auction?.status === 'done' && (
                    <div className="text-center py-16 animate-fade-in">
                        <div className="text-7xl mb-4 animate-float">🏆</div>
                        <h2 className="text-4xl font-black mb-2" style={{
                            background: 'linear-gradient(135deg, #A855F7, #EC4899, #FFD700)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>Auction Complete!</h2>
                        <div className="flex gap-6 justify-center mt-4 mb-6">
                            <div className="glass-card px-6 py-3 text-center">
                                <p className="text-2xl font-bold text-emerald-400">{soldCount}</p>
                                <p className="text-xs text-white/40">Sold</p>
                            </div>
                            <div className="glass-card px-6 py-3 text-center">
                                <p className="text-2xl font-bold text-red-400">{unsoldCount}</p>
                                <p className="text-xs text-white/40">Unsold</p>
                            </div>
                        </div>
                        {isAuctioneer && (
                            <div className="flex flex-col gap-4 items-center justify-center">
                                {unsoldCount > 0 && (
                                    <button onClick={() => setShowReviewUnsoldModal(true)} className="px-8 py-3 rounded-xl font-bold text-white transition-all transform hover:scale-105"
                                        style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.3), rgba(99,102,241,0.3))', border: '1px solid rgba(168,85,247,0.5)' }}>
                                        👀 Review Unsold Players ({unsoldCount})
                                    </button>
                                )}
                                <button onClick={() => setShowConfirmPhase(true)} className="btn-primary text-lg px-8 py-4 w-64" id="proceed-xi-btn">
                                    📋 Proceed to Playing XI →
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Active Auction */}
                {auction && auction.status !== 'done' && (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                        <div className="lg:col-span-3">
                            {/* Progress */}
                            <div className="glass-card p-3 mb-4 flex items-center justify-between text-sm animate-fade-in">
                                <div className="flex items-center gap-3">
                                    <span className="text-white/80 font-semibold">Player {currentIndex + 1} / {totalInQueue}</span>
                                    <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full transition-all duration-500"
                                            style={{
                                                width: `${totalInQueue > 0 ? ((currentIndex + 1) / totalInQueue) * 100 : 0}%`,
                                                background: 'linear-gradient(90deg, #A855F7, #EC4899)',
                                            }} />
                                    </div>
                                </div>
                                <div className="flex gap-4 text-xs">
                                    <span className="text-emerald-400 font-medium">✅ {soldCount}</span>
                                    <span className="text-red-400 font-medium">❌ {unsoldCount}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {currentPlayer && (
                                        <span className="px-3 py-1 rounded-full text-xs text-white/60" style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.2)' }}>
                                            {getCategoryInfo(currentPlayer.category).icon} {getCategoryInfo(currentPlayer.category).label}
                                        </span>
                                    )}
                                    {nextPlayerInQueue && (
                                        <span className="px-2.5 py-1 rounded-full text-[10px]" style={{
                                            background: nextPlayerWatchlisted ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.04)',
                                            border: nextPlayerWatchlisted ? '1px solid rgba(255,215,0,0.4)' : '1px solid rgba(255,255,255,0.08)',
                                            color: nextPlayerWatchlisted ? '#FFD700' : 'rgba(255,255,255,0.5)',
                                        }}>
                                            {nextPlayerWatchlisted ? '⭐' : '⏩'} Up Next: <span className="font-semibold">{nextPlayerInQueue.playerName}</span>
                                            <span className="ml-1 opacity-60">({nextPlayerInQueue.playerRole}) ₹{formatPrice(nextPlayerInQueue.basePrice)}</span>
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Main Player Card */}
                            {currentPlayer && (
                                <div
                                    className={`glass-card p-6 relative overflow-hidden ${currentPlayerWatchlisted ? 'animate-target-pulse' : ''}`}
                                    style={currentPlayerWatchlisted ? {
                                        border: '2px solid rgba(255,215,0,0.5)',
                                        boxShadow: '0 0 30px rgba(255,215,0,0.15)',
                                    } : isBlindMode && !blindRevealed ? {
                                        border: '2px solid rgba(236,72,153,0.35)',
                                        boxShadow: '0 0 20px rgba(236,72,153,0.08)',
                                    } : {}}
                                >
                                    {/* BLIND MODE Banner */}
                                    {isBlindMode && !blindRevealed && (
                                        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
                                            style={{ background: 'rgba(236,72,153,0.15)', border: '1px solid rgba(236,72,153,0.4)', color: '#F472B6' }}>
                                            🕵️ BLIND AUCTION
                                        </div>
                                    )}
                                    {/* REVEALED Banner */}
                                    {isBlindMode && blindRevealed && (
                                        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold animate-fade-in"
                                            style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#34D399' }}>
                                            ✨ REVEALED!
                                        </div>
                                    )}

                                    {/* Watchlist target badge */}
                                    {currentPlayerWatchlisted && !
                                        isBlindMode && (
                                        <div className="absolute top-3 left-3 z-20 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold"
                                            style={{ background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.4)', color: '#FFD700' }}>
                                            🎯 WATCHLIST TARGET
                                        </div>
                                    )}

                                    {/* SOLD Overlay — Rubber Stamp Style */}
                                    {showSoldAnimation && auction?.lastSold && (
                                        <div className="sold-overlay" style={{ flexDirection: 'column', gap: '0.75rem' }}>
                                            {/* Blockbuster Banner */}
                                            {auction.lastSold.price >= BLOCKBUSTER_THRESHOLD && (
                                                <div className="animate-blockbuster px-6 py-1.5 rounded font-black text-sm tracking-widest uppercase"
                                                    style={{ background: 'linear-gradient(135deg,#FFD700,#FFA500)', color: '#1a0a00', boxShadow: '0 0 30px rgba(255,215,0,0.5)' }}>
                                                    🔥 BLOCKBUSTER ACQUISITION
                                                </div>
                                            )}
                                            {/* Stamp */}
                                            <div className="animate-stamp-slam flex items-center justify-center"
                                                style={{
                                                    border: '6px solid #10B981',
                                                    borderRadius: '12px',
                                                    padding: '8px 28px',
                                                    transform: 'rotate(-8deg)',
                                                    boxShadow: '0 0 40px rgba(16,185,129,0.6)',
                                                }}>
                                                <span style={{ fontSize: '3.5rem', fontWeight: 900, color: '#10B981', letterSpacing: '0.1em', textShadow: '0 0 20px rgba(16,185,129,0.8)' }}>SOLD!</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <TeamBadge teamName={auction.lastSold.buyerTeam} size="large" />
                                                <div>
                                                    <p className="text-white text-xl font-black">{auction.lastSold.playerName}</p>
                                                    <p className="text-white/80 text-sm">→ {getTeamByName(auction.lastSold.buyerTeam).name}</p>
                                                </div>
                                            </div>
                                            <div className="price-tag">₹{formatPrice(auction.lastSold.price)}</div>
                                        </div>
                                    )}

                                    {/* UNSOLD Overlay — Rubber Stamp Style */}
                                    {showUnsoldAnimation && (
                                        <div className="unsold-overlay">
                                            <div className="animate-stamp-slam flex items-center justify-center"
                                                style={{
                                                    border: '6px solid #EF4444',
                                                    borderRadius: '12px',
                                                    padding: '8px 24px',
                                                    transform: 'rotate(-8deg)',
                                                    boxShadow: '0 0 40px rgba(239,68,68,0.6)',
                                                }}>
                                                <span style={{ fontSize: '3.5rem', fontWeight: 900, color: '#EF4444', letterSpacing: '0.1em', textShadow: '0 0 20px rgba(239,68,68,0.8)' }}>UNSOLD</span>
                                            </div>
                                            <p className="text-white/60 mt-2 text-lg">{auction.lastUnsold || ''}</p>
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-4">
                                        {/* Player Header */}
                                        <div className="flex items-center gap-3">
                                            {/* In blind mode: show mystery avatar before reveal */}
                                            {isBlindMode && !blindRevealed ? (
                                                <div style={{
                                                    width: '52px', height: '52px', flexShrink: 0,
                                                    borderRadius: '12px',
                                                    background: 'linear-gradient(135deg, rgba(236,72,153,0.2), rgba(168,85,247,0.2))',
                                                    border: '2px solid rgba(236,72,153,0.3)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '1.5rem',
                                                    animation: 'target-pulse 2s ease-in-out infinite',
                                                }}>❓</div>
                                            ) : (
                                                <TeamBadge teamName={currentPlayer.teamName} size="large" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <h2 className="text-xl md:text-2xl font-black text-white truncate">
                                                    {isBlindMode && !blindRevealed ? (
                                                        <span style={{ color: 'rgba(244,114,182,0.8)', letterSpacing: '0.05em' }}>
                                                            {`MYSTERY PLAYER #${(auction?.currentIndex ?? 0) + 1}`}
                                                        </span>
                                                    ) : (
                                                        <TextRandomizer text={currentPlayer.playerName} delay={50} stagger={30} key={currentPlayer.id} />
                                                    )}
                                                </h2>
                                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.25)', color: '#C084FC' }}>
                                                        {currentPlayer.playerRole}
                                                    </span>
                                                    {/* In blind mode: show only IND/OVERSEAS (needed for squad limits), hide actual country */}
                                                    {isBlindMode && !blindRevealed ? (
                                                        isIndian(currentPlayer.nationality) ? (
                                                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ADE80' }}>🇮🇳 IND</span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(96,165,250,0.1)', color: '#93C5FD' }}>✈️ OVERSEAS</span>
                                                        )
                                                    ) : (
                                                        <>
                                                            {isIndian(currentPlayer.nationality) ? (
                                                                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ADE80' }}>🇮🇳</span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(96,165,250,0.1)', color: '#93C5FD' }}>🌍 {currentPlayer.nationality}</span>
                                                            )}
                                                            {currentPlayer.marquee && (
                                                                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold animate-pulse-gold" style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700' }}>⭐ Marquee</span>
                                                            )}
                                                        </>
                                                    )}
                                                    {/* Always show base price */}
                                                    <span className="text-[11px] text-white/30 ml-1">Base: ₹{formatPrice(currentPlayer.basePrice)}</span>
                                                </div>
                                            </div>
                                            <Timer endTime={auction.timerEnd} onExpire={handleTimerExpire} size="normal" />
                                        </div>

                                        {/* Stats — single compact row */}
                                        <div className="flex flex-wrap gap-2">
                                            {currentPlayer.playerRole !== 'BOW' && (
                                                <>
                                                    <MiniStat label="Runs" val={currentPlayer.totalRuns} />
                                                    <MiniStat label="SR" val={currentPlayer.strikeRate} />
                                                    <MiniStat label="HS" val={currentPlayer.highestScore} />
                                                </>
                                            )}
                                            {(currentPlayer.playerRole === 'BOW' || currentPlayer.playerRole === 'AR') && (
                                                <>
                                                    <MiniStat label="Wkts" val={currentPlayer.wickets} />
                                                    <MiniStat label="Econ" val={currentPlayer.economyRate} />
                                                    <MiniStat label="Best" val={currentPlayer.best} />
                                                </>
                                            )}
                                        </div>

                                        {/* Show Full Stats button — all users */}
                                        <button
                                            onClick={() => setShowFullStats(!showFullStats)}
                                            className="text-[11px] px-3 py-1.5 rounded-lg transition-all hover:scale-105 mt-1"
                                            style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', color: '#C084FC' }}
                                        >
                                            {showFullStats ? '▲ Hide Stats' : '📊 Show Full Stats'}
                                        </button>

                                        {/* Full Stats Panel */}
                                        {showFullStats && (
                                            <div className="glass-card p-4 mt-2 animate-fade-in" style={{ borderColor: 'rgba(168,85,247,0.15)' }}>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                    <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(168,85,247,0.05)' }}>
                                                        <p className="text-[9px] text-white/30 uppercase">Runs</p>
                                                        <p className="text-sm font-bold text-white">{currentPlayer.totalRuns}</p>
                                                    </div>
                                                    <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(168,85,247,0.05)' }}>
                                                        <p className="text-[9px] text-white/30 uppercase">HS</p>
                                                        <p className="text-sm font-bold text-white">{currentPlayer.highestScore}</p>
                                                    </div>
                                                    <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(168,85,247,0.05)' }}>
                                                        <p className="text-[9px] text-white/30 uppercase">SR</p>
                                                        <p className="text-sm font-bold text-white">{currentPlayer.strikeRate}</p>
                                                    </div>
                                                    <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(168,85,247,0.05)' }}>
                                                        <p className="text-[9px] text-white/30 uppercase">4s / 6s</p>
                                                        <p className="text-sm font-bold text-white">{currentPlayer.fours} / {currentPlayer.sixes}</p>
                                                    </div>
                                                    <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(168,85,247,0.05)' }}>
                                                        <p className="text-[9px] text-white/30 uppercase">50s / 100s</p>
                                                        <p className="text-sm font-bold text-white">{currentPlayer.fifties} / {currentPlayer.hundreds}</p>
                                                    </div>
                                                    <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(168,85,247,0.05)' }}>
                                                        <p className="text-[9px] text-white/30 uppercase">Wickets</p>
                                                        <p className="text-sm font-bold text-white">{currentPlayer.wickets}</p>
                                                    </div>
                                                    <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(168,85,247,0.05)' }}>
                                                        <p className="text-[9px] text-white/30 uppercase">Best</p>
                                                        <p className="text-sm font-bold text-white">{currentPlayer.best}</p>
                                                    </div>
                                                    <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(168,85,247,0.05)' }}>
                                                        <p className="text-[9px] text-white/30 uppercase">Econ</p>
                                                        <p className="text-sm font-bold text-white">{currentPlayer.economyRate}</p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-2 mt-3">
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.1)', color: '#C084FC' }}>🏏 {currentPlayer.bowlingType !== 'NO' ? currentPlayer.bowlingType : '—'}</span>
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.1)', color: '#C084FC' }}>📋 {currentPlayer.status}</span>
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.1)', color: '#C084FC' }}>💰 Base: ₹{formatPrice(currentPlayer.basePrice)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* ── SUBTLE BIDDING WAR INDICATOR ── */}
                                    {biddingWarTeams && auction.status === 'bidding' && (
                                        <div className="mt-2 flex items-center justify-center gap-2 animate-fade-in">
                                            <div className="h-px flex-1 rounded" style={{ background: `linear-gradient(to right, transparent, ${getTeamByName(biddingWarTeams.a).color}60)` }} />
                                            <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full"
                                                style={{ color: '#FB923C', background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.2)' }}>
                                                ⚔ Rivalry: {getTeamByName(biddingWarTeams.a).short} vs {getTeamByName(biddingWarTeams.b).short}
                                            </span>
                                            <div className="h-px flex-1 rounded" style={{ background: `linear-gradient(to left, transparent, ${getTeamByName(biddingWarTeams.b).color}60)` }} />
                                        </div>
                                    )}

                                    {/* Current Bid — shows team name */}
                                    <div className="mt-4 p-4 rounded-2xl text-center" style={{
                                        background: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(15,10,40,0.5) 100%)',
                                        border: '1px solid rgba(168,85,247,0.2)',
                                    }}>
                                        <p className="text-xs text-white/40 uppercase tracking-wider mb-1">
                                            <TextRandomizer text="Current Bid" delay={100} stagger={40} />
                                        </p>
                                        <p className="text-4xl md:text-5xl font-black text-ipl-gold" key={auction.currentBid}>
                                            {auction.currentBid > 0 ? `₹${formatPrice(auction.currentBid)}` : '—'}
                                        </p>
                                        {auction.currentBidderId && (
                                            <div className="flex items-center gap-2 justify-center mt-3">
                                                <TeamBadge teamName={currentBidderTeam} size="small" />
                                                <span className="text-sm font-bold" style={{ color: getTeamByName(currentBidderTeam).color }}>
                                                    {getTeamByName(currentBidderTeam).name}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Bid Buttons */}
                                    {!isAuctioneer && auction.status === 'bidding' && auction.timerEnd && (
                                        <div className="mt-4 animate-fade-in">
                                            {/* ── OVERSEAS SLOT BLOCKER ── */}
                                            {isBlockedByOverseas && (
                                                <div className="mb-3 p-3 rounded-xl text-center font-bold text-sm"
                                                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
                                                    🚫 Overseas limit reached (8/8). Cannot bid on overseas players.
                                                </div>
                                            )}
                                            {/* ── MUTED BY AUCTIONEER BANNER ── */}
                                            {isMutedByAuctioneer && (
                                                <div className="mb-3 p-3 rounded-xl text-center font-bold text-sm animate-pulse"
                                                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5' }}>
                                                    🔇 The Auctioneer has paused your bidding.
                                                </div>
                                            )}
                                            {/* ── DYNAMIC OVERSEAS SLOT TRACKER FOR BIDDING ── */}
                                            {currentPlayerIsOverseas && !isBlockedByOverseas && (
                                                <div className="mb-3 p-2.5 rounded-xl flex items-center justify-between text-xs"
                                                    style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', color: '#93C5FD' }}>
                                                    <span className="font-semibold flex items-center gap-1">✈️ Overseas Slots used:</span>
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="flex gap-0.5">
                                                            {Array.from({ length: MAX_OVERSEAS }).map((_, idx) => (
                                                                <span key={idx} className="text-[10px]" title={idx < myOverseasCount ? "Filled" : "Empty"}>
                                                                    {idx < myOverseasCount ? '✈' : '○'}
                                                                </span>
                                                            ))}
                                                        </div>
                                                        <span className="font-bold ml-1">({myOverseasCount}/{MAX_OVERSEAS})</span>
                                                    </div>
                                                </div>
                                            )}
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                {quickBids.map(amount => (
                                                    <button
                                                        key={amount}
                                                        onClick={() => handleBid(amount)}
                                                        className={`relative overflow-hidden rounded-2xl py-3 px-4 text-center font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 ${isBidCooldown ? 'opacity-50 pointer-events-none' : ''}`}
                                                        disabled={isBlockedByOverseas || isMutedByAuctioneer || amount > (userData?.purseRemaining || 0) || auction.currentBidderId === user?.uid || isBidCooldown}
                                                        style={{
                                                            background: 'linear-gradient(135deg, rgba(var(--theme-color-rgb), 0.15) 0%, rgba(var(--theme-color-rgb), 0.05) 100%)',
                                                            border: '1.5px solid rgba(var(--theme-color-rgb), 0.35)',
                                                            color: 'var(--theme-color)',
                                                            boxShadow: '0 0 15px rgba(var(--theme-color-rgb), 0.1)',
                                                        }}
                                                    >
                                                        <span className="text-lg">₹{formatPrice(amount)}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            {bidError && (
                                                <p className="text-red-400 text-sm mt-3 text-center rounded-xl py-2" style={{ background: 'rgba(220,38,38,0.1)' }}>{bidError}</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Auctioneer Controls */}
                                    {isAuctioneer && (
                                        <div className="mt-4 flex flex-wrap gap-3 justify-center relative">
                                            {!auction.timerEnd && auction.status !== 'sold' && auction.status !== 'unsold' && (
                                                <button onClick={() => startBidding()} className="btn-primary px-8 py-3" id="start-bidding-btn">
                                                    ⏱️ Start Bidding
                                                </button>
                                            )}
                                            {(auction.status === 'sold' || auction.status === 'unsold') && (
                                                <button onClick={() => startBidding()} className="btn-primary px-8 py-3" id="next-player-btn">
                                                    ➡️ Next Player
                                                </button>
                                            )}
                                            {auction.timerEnd && auction.status === 'bidding' && (
                                                <>
                                                    {auction.currentBid > 0 && (
                                                        <button
                                                            onClick={openConfirmSale}
                                                            disabled={isSelling}
                                                            className="px-8 py-3 rounded-full font-bold text-white transition-all transform hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                                                            id="force-sold-btn"
                                                            style={{ background: 'linear-gradient(135deg, #059669, #10B981)', boxShadow: '0 0 20px rgba(16,185,129,0.3)' }}>
                                                            {isSelling ? (
                                                                <span className="flex items-center gap-2">
                                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                    Processing...
                                                                </span>
                                                            ) : '✅ Sold!'}
                                                        </button>
                                                    )}
                                                    <button onClick={() => setShowUnsoldConfirm(true)} className="px-8 py-3 rounded-full font-bold text-white transition-all transform hover:scale-105" id="force-unsold-btn"
                                                        style={{ background: 'linear-gradient(135deg, #DC2626, #EF4444)', boxShadow: '0 0 20px rgba(239,68,68,0.3)' }}>
                                                        ❌ Unsold
                                                    </button>

                                                    {/* Unsold Confirmation Modal */}
                                                    {showUnsoldConfirm && (
                                                        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
                                                            <div style={{ background: 'linear-gradient(145deg,rgba(10,5,25,0.98),rgba(20,5,10,0.98))', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '20px', padding: 'clamp(20px,4vw,32px)', maxWidth: '380px', width: '90%', textAlign: 'center', boxShadow: '0 0 40px rgba(239,68,68,0.15)' }}>
                                                                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>❌</div>
                                                                <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'white', margin: '0 0 8px' }}>Mark as Unsold?</h3>
                                                                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '14px', margin: '0 0 8px' }}>
                                                                    <strong style={{ color: 'white' }}>{currentPlayer?.playerName}</strong>
                                                                </p>
                                                                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px', margin: '0 0 24px' }}>This player will be moved to the unsold pool. You can re-auction them later.</p>
                                                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                                                    <button onClick={() => setShowUnsoldConfirm(false)}
                                                                        style={{ padding: '10px 24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>
                                                                        Cancel
                                                                    </button>
                                                                    <button onClick={() => { setShowUnsoldConfirm(false); markUnsold(); }}
                                                                        style={{ padding: '10px 24px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.4)', background: 'linear-gradient(135deg,#DC2626,#EF4444)', color: 'white', fontWeight: 900, cursor: 'pointer', fontSize: '14px', boxShadow: '0 0 16px rgba(239,68,68,0.3)' }}>
                                                                        ❌ Confirm Unsold
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            <button onClick={() => setShowConfirmEndAuction(true)} className="btn-secondary text-sm px-4" id="end-auction-btn">
                                                🏁 End Auction
                                            </button>
                                            {/* Set Change Button */}
                                            <div className="relative">
                                                <button onClick={() => setShowSetChangeMenu(!showSetChangeMenu)} className="btn-secondary text-sm px-4" id="change-set-btn">
                                                    🔄 Change Set
                                                </button>
                                                {showSetChangeMenu && (
                                                    <div className="absolute bottom-full mb-2 right-0 glass-card p-3 rounded-xl z-50 animate-slide-up" style={{ minWidth: '200px' }}>
                                                        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Switch to Set</p>
                                                        {CATEGORY_ORDER.map(cat => {
                                                            const info = getCategoryInfo(cat.key);
                                                            const isActive = currentPlayer?.category === cat.key;

                                                            const remainingInCat = (auction?.queue || []).slice(auction?.currentIndex || 0).filter(pid => {
                                                                const p = allPlayers.find(pl => pl.id === pid);
                                                                return p && p.category === cat.key;
                                                            }).length;

                                                            return (
                                                                <button key={cat.key} onClick={() => handleSetChange(cat.key)} disabled={remainingInCat === 0}
                                                                    className={`w-full flex justify-between items-center px-3 py-2 rounded-lg text-sm mb-1 transition-all ${isActive ? 'bg-purple-500/20 text-purple-300' : 'hover:bg-white/5 text-white/70'} ${remainingInCat === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}>
                                                                    <span>{info.icon} {info.label}</span>
                                                                    <span className="text-[10px] bg-black/30 px-1.5 rounded disabled:opacity-50">{remainingInCat} left</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Confirm Sale Modal — with race condition protection */}
                                            {showConfirmSaleModal && saleSnapshot && (
                                                <div className="absolute bottom-full mb-4 bg-[#0a0614] border border-neon-purple p-6 rounded-2xl shadow-2xl z-50 text-center animate-slide-up" style={{ minWidth: '340px' }}>
                                                    <h4 className="text-xl font-black text-white mb-2">Confirm Sale</h4>
                                                    {hasBidChangedSinceSnapshot ? (
                                                        <>
                                                            <div className="p-3 rounded-xl mb-4" style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }}>
                                                                <p className="text-yellow-400 font-bold text-sm mb-1">⚠️ Bid Changed!</p>
                                                                <p className="text-white/60 text-xs">A new bid came in since you clicked Sold.</p>
                                                                <p className="text-white/80 text-sm mt-2">
                                                                    Now: <strong style={{ color: getTeamByName(currentBidderTeam).color }}>{getTeamByName(currentBidderTeam).name}</strong> at <strong className="text-ipl-gold">₹{formatPrice(auction.currentBid)}</strong>
                                                                </p>
                                                            </div>
                                                            <div className="flex gap-3 justify-center">
                                                                <button onClick={() => { setShowConfirmSaleModal(false); setSaleSnapshot(null); }} className="px-5 py-2 rounded-xl text-white/50 hover:bg-white/10 hover:text-white transition-colors">
                                                                    Dismiss
                                                                </button>
                                                                <button onClick={openConfirmSale} className="px-5 py-2 rounded-xl font-bold text-yellow-400 hover:bg-yellow-400/10 transition-colors border border-yellow-400/30">
                                                                    Review New Bid
                                                                </button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <p className="text-white/70 mb-5">Sell <strong className="text-white">{saleSnapshot.playerName}</strong> to <strong style={{ color: getTeamByName(saleSnapshot.bidderTeam).color }}>{getTeamByName(saleSnapshot.bidderTeam).name}</strong> for <strong className="text-ipl-gold font-bold">₹{formatPrice(saleSnapshot.bid)}</strong>?</p>
                                                            <div className="flex gap-3 justify-center">
                                                                <button onClick={() => { setShowConfirmSaleModal(false); setSaleSnapshot(null); }} className="px-5 py-2 rounded-xl text-white/50 hover:bg-white/10 hover:text-white transition-colors">
                                                                    Cancel/Wait
                                                                </button>
                                                                <button onClick={() => { setShowConfirmSaleModal(false); setSaleSnapshot(null); handleConfirmSale(); }} className="px-6 py-2 rounded-xl font-bold bg-green-600 hover:bg-green-500 text-white transition-colors border border-green-500 drop-shadow-md shadow-green-500/50">
                                                                    Confirm Sale
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Auctioneer Overview: All Teams Purse & Squad ── */}
                            {isAuctioneer && (
                                <div className="mt-4">
                                    <button
                                        onClick={() => setShowAdminSquads(!showAdminSquads)}
                                        className="glass-card w-full p-3 flex items-center justify-between text-sm transition-colors"
                                        style={{ border: '1px solid rgba(168,85,247,0.25)' }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">📊</span>
                                            <span className="font-semibold text-white">Teams Overview</span>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full text-white/50" style={{ background: 'rgba(168,85,247,0.15)' }}>
                                                {allUsers.filter(u => u.role === ROLES.TEAM_OWNER).length} teams
                                            </span>
                                        </div>
                                        <span className="text-white/40 text-xs">{showAdminSquads ? '▲' : '▼'}</span>
                                    </button>
                                    {showAdminSquads && (
                                        <div className="glass-card mt-1 p-3 rounded-xl animate-fade-in" style={{ border: '1px solid rgba(168,85,247,0.12)' }}>
                                            <div className="space-y-2">
                                                {allUsers.filter(u => u.role === ROLES.TEAM_OWNER).map(owner => {
                                                    const teamName = room?.teamAssignments?.[owner.uid] || '';
                                                    const team = getTeamByName(teamName);
                                                    const ownerSquad = squads[owner.uid]?.players || [];
                                                    const overseasCount = ownerSquad.filter(sp => {
                                                        const pl = allPlayers.find(p => p.id === sp.playerId);
                                                        return pl && !isIndian(pl.nationality);
                                                    }).length;
                                                    const totalPurse = (room?.rules?.totalPurse || 120) * 100;
                                                    const pursePct = totalPurse > 0 ? ((owner.purseRemaining || 0) / totalPurse) * 100 : 0;
                                                    return (
                                                        <div key={owner.uid} className="p-2.5 rounded-xl" style={{ background: `${team.color}08`, border: `1px solid ${team.color}20` }}>
                                                            <div className="flex items-center justify-between mb-1.5">
                                                                <div className="flex items-center gap-2">
                                                                    <TeamBadge teamName={teamName} size="small" />
                                                                    <span className="text-xs font-bold text-white/80">{owner.username}</span>
                                                                    {isAuctioneer && (
                                                                        <button
                                                                            onClick={() => room?.mutedBidders?.[owner.uid] ? unmuteBidder(owner.uid) : muteBidder(owner.uid)}
                                                                            className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold"
                                                                            style={{ background: room?.mutedBidders?.[owner.uid] ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.1)", color: room?.mutedBidders?.[owner.uid] ? "#EF4444" : "rgba(255, 255, 255, 0.5)" }}
                                                                            title={room?.mutedBidders?.[owner.uid] ? "Unmute Bidder" : "Mute Bidder"}
                                                                        >
                                                                            {room?.mutedBidders?.[owner.uid] ? "Muted" : "Mute"}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <span className="text-xs font-bold" style={{ color: '#FBBF24' }}>?{formatPrice(owner.purseRemaining || 0)}</span>
                                                            </div>
                                                            {/* Purse bar */}
                                                            <div className="w-full h-1.5 rounded-full overflow-hidden mb-1.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                                                <div className="h-full rounded-full transition-all" style={{
                                                                    width: `${pursePct}%`,
                                                                    background: pursePct > 50 ? `linear-gradient(90deg, ${team.color}, ${team.color}cc)` : pursePct > 20 ? 'linear-gradient(90deg, #FB923C, #F59E0B)' : 'linear-gradient(90deg, #EF4444, #DC2626)',
                                                                }} />
                                                            </div>
                                                            <div className="flex gap-2 text-[10px] text-white/40">
                                                                <span>👥 {ownerSquad.length} players</span>
                                                                <span>✈️ {overseasCount}/{MAX_OVERSEAS} OS</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* My Squad Panel */}
                            {!isAuctioneer && (
                                <div className="mt-4">
                                                                    <button
                                        onClick={() => setShowMySquad(!showMySquad)}
                                        className="glass-card w-full p-3 flex items-center justify-between text-sm transition-colors"
                                        style={{ border: '1px solid rgba(var(--theme-color-rgb), 0.25)' }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">📋</span>
                                            <span className="font-semibold text-white">My Squad</span>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full text-white/50" style={{ background: 'rgba(var(--theme-color-rgb), 0.15)' }}>
                                                {mySquadPlayers.length} players {myOverseasCount > 0 && `· ✈️ ${myOverseasCount}/${MAX_OVERSEAS}`}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-black text-emerald-400" title="Squad Predictor Score">🔮 {calcSquadPredictorScore(mySquadPlayers, allPlayers)} pts</span>
                                            <span className="text-xs text-ipl-gold font-bold">₹{formatPrice(userData?.purseRemaining || 0)} left</span>
                                            <span className="text-white/30 transition-transform duration-300" style={{ transform: showMySquad ? 'rotate(180deg)' : '' }}>▼</span>
                                        </div>
                                    </button>
                                    {showMySquad && (
                                        <div className="glass-card mt-1 p-4 animate-fade-in">
                                            <div className="grid grid-cols-3 gap-3 mb-4">
                                                <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                                                    <p className="text-[10px] text-white/40">Retained</p>
                                                    <p className="text-lg font-bold text-emerald-400">{myRetained.length}</p>
                                                </div>
                                                <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.15)' }}>
                                                    <p className="text-[10px] text-white/40">Bought</p>
                                                    <p className="text-lg font-bold text-blue-400">{myBought.length}</p>
                                                </div>
                                                <div className="text-center p-2 rounded-lg" style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.15)' }}>
                                                    <p className="text-[10px] text-white/40">Spent</p>
                                                    <p className="text-lg font-bold text-ipl-gold">₹{formatPrice(totalSpent)}</p>
                                                </div>
                                            </div>
                                            {/* Squad Composition Summary */}
                                            {mySquadPlayers.length > 0 && (() => {
                                                const comp = getSquadComposition(mySquadPlayers);
                                                return (
                                                    <div className="mb-4 p-2.5 rounded-xl" style={{ background: 'rgba(var(--theme-color-rgb), 0.04)', border: '1px solid rgba(var(--theme-color-rgb), 0.1)' }}>
                                                        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">📊 Composition</p>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(var(--theme-color-rgb), 0.1)', color: 'var(--theme-color)' }}>🏏 BAT: {comp.BAT}</span>
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(var(--theme-color-rgb), 0.1)', color: 'var(--theme-color)' }}>🎯 WK: {comp.WK}</span>
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(var(--theme-color-rgb), 0.1)', color: 'var(--theme-color)' }}>⚡ AR: {comp.AR}</span>
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(59,130,246,0.1)', color: '#60A5FA' }}>🌀 Spin: {comp.SPINNER}</span>
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171' }}>🔥 Pace: {comp.PACER}</span>
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ADE80' }}>🇮🇳 IND: {comp.INDIAN}</span>
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(96,165,250,0.1)', color: '#93C5FD' }}>✈️ OS: {comp.OVERSEAS}/{MAX_OVERSEAS}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                            {/* Squad Needs Reminder */}
                                            {(() => {
                                                const N = maxSquadSize;
                                                const comp = getSquadComposition(mySquadPlayers);
                                                const needs = [
                                                    { label: '🏏 Batsmen', current: comp.BAT, target: Math.round(N * (4/15)) },
                                                    { label: '💨 Fast Bowlers', current: comp.PACER, target: Math.round(N * (3/15)) },
                                                    { label: '🌀 Spinners', current: comp.SPINNER, target: Math.round(N * (2/15)) },
                                                    { label: '⚡ All-Rounders', current: comp.AR, target: Math.round(N * (3/15)) },
                                                    { label: '🧤 Wicketkeepers', current: comp.WK, target: Math.max(1, Math.round(N * (1/15))) },
                                                ];
                                                const hasWarning = needs.some(n => n.current < n.target);
                                                if (!hasWarning) return null;
                                                return (
                                                    <div className="mb-4 p-2.5 rounded-xl" style={{ background: 'rgba(251,146,60,0.05)', border: '1px solid rgba(251,146,60,0.2)' }}>
                                                        <p className="text-[10px] text-orange-400 uppercase tracking-wider mb-2 font-bold">⚠️ Squad Needs Reminder</p>
                                                        <div className="space-y-1">
                                                            {needs.map(n => {
                                                                const isMet = n.current >= n.target;
                                                                return (
                                                                    <div key={n.label} className="flex items-center justify-between text-[10px] px-1">
                                                                        <span style={{ color: isMet ? 'rgba(255,255,255,0.35)' : 'rgba(251,146,60,0.9)' }}>{n.label}</span>
                                                                        <span className="font-bold" style={{ color: isMet ? '#4ADE80' : '#FB923C' }}>
                                                                            {n.current} / {n.target} {isMet ? '✅' : '⚠️'}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                            {mySquadPlayers.length > 0 && (() => {
                                                // Build ordered list using squadOrder state
                                                const orderedSquad = squadOrder
                                                    .map(id => mySquadPlayers.find(p => p.playerId === id))
                                                    .filter(Boolean)
                                                    .concat(mySquadPlayers.filter(p => !squadOrder.includes(p.playerId)));

                                                const handleDragStart = (idx) => { dragIndexRef.current = idx; };
                                                const handleDragOver = (e, idx) => {
                                                    e.preventDefault();
                                                    if (dragIndexRef.current === null || dragIndexRef.current === idx) return;
                                                    const newOrdered = [...orderedSquad];
                                                    const [moved] = newOrdered.splice(dragIndexRef.current, 1);
                                                    newOrdered.splice(idx, 0, moved);
                                                    dragIndexRef.current = idx;
                                                    const newIds = newOrdered.map(p => p.playerId);
                                                    setSquadOrder(newIds);
                                                    // Persist to localStorage
                                                    const storageKey = `squadOrder_${room?.code}_${user?.uid}`;
                                                    localStorage.setItem(storageKey, JSON.stringify(newIds));
                                                };
                                                const handleDragEnd = () => { dragIndexRef.current = null; };

                                                return (
                                                    <div>
                                                        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">👥 Full Squad — <span className="normal-case text-white/20 font-normal">drag to reorder</span></p>
                                                        <div className="space-y-1">
                                                            {orderedSquad.map((p, idx) => (
                                                                <div
                                                                    key={p.playerId}
                                                                    data-drag-index={idx}
                                                                    draggable
                                                                    onDragStart={() => handleDragStart(idx)}
                                                                    onDragOver={(e) => handleDragOver(e, idx)}
                                                                    onDragEnd={handleDragEnd}
                                                                    onTouchStart={(e) => { document.body.style.overflow = 'hidden'; handleDragStart(idx); }}
                                                                    onTouchMove={(e) => {
                                                                        const touch = e.touches[0];
                                                                        const target = document.elementFromPoint(touch.clientX, touch.clientY);
                                                                        const targetItem = target?.closest('[data-drag-index]');
                                                                        if (targetItem) {
                                                                            const targetIdx = parseInt(targetItem.getAttribute('data-drag-index'), 10);
                                                                            if (!isNaN(targetIdx) && targetIdx !== dragIndexRef.current) {
                                                                                handleDragOver(e, targetIdx);
                                                                            }
                                                                        }
                                                                    }}
                                                                    onTouchEnd={() => { document.body.style.overflow = ''; handleDragEnd(); }}
                                                                    className="flex items-center justify-between p-2 rounded-lg text-xs cursor-grab active:cursor-grabbing select-none"
                                                                    style={{
                                                                        background: p.type === 'retained' ? 'rgba(16,185,129,0.05)' : 'rgba(96,165,250,0.05)',
                                                                        border: p.type === 'retained' ? '1px solid rgba(16,185,129,0.1)' : '1px solid rgba(96,165,250,0.1)',
                                                                        transition: 'opacity 0.15s'
                                                                    }}
                                                                >
                                                                    <span className="text-white/25 mr-1.5 text-base leading-none">⋮⋮</span>
                                                                    <span className="text-white/30 text-[9px] mr-1.5 font-bold">{idx + 1}</span>
                                                                    <span className="text-white font-medium flex-1">{p.playerName}</span>
                                                                    {p.type === 'retained' ? (
                                                                        <span className="text-emerald-400 text-[10px] font-bold">RETAINED</span>
                                                                    ) : (
                                                                        <span className="text-ipl-gold font-bold">₹{formatPrice(p.price)}</span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                            {mySquadPlayers.length === 0 && <p className="text-white/30 text-xs text-center py-4">No players yet</p>}

                                            {/* ── OVERSEAS SLOT TRACKER ── */}
                                            <div className="mt-3 p-2.5 rounded-xl" style={{ background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.1)' }}>
                                                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">✈️ Overseas Slots</p>
                                                <div className="flex gap-1 flex-wrap mb-1.5">
                                                    {Array.from({ length: MAX_OVERSEAS }).map((_, i) => (
                                                        <div key={i} className="w-6 h-6 rounded flex items-center justify-center text-xs"
                                                            style={{
                                                                background: i < myOverseasCount ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.05)',
                                                                border: i < myOverseasCount ? '1px solid rgba(96,165,250,0.5)' : '1px solid rgba(255,255,255,0.08)',
                                                                color: i < myOverseasCount ? '#93C5FD' : 'rgba(255,255,255,0.2)',
                                                            }}>
                                                            {i < myOverseasCount ? '✈' : '○'}
                                                        </div>
                                                    ))}
                                                </div>
                                                <p className="text-[10px]" style={{ color: overseasFull ? '#FCA5A5' : myOverseasCount >= MAX_OVERSEAS - 1 ? '#FCD34D' : '#93C5FD' }}>
                                                    {overseasFull
                                                        ? '🚫 Full! Cannot bid on overseas players'
                                                        : myOverseasCount >= MAX_OVERSEAS - 1
                                                            ? `⚠️ 1 slot remaining (${myOverseasCount}/${MAX_OVERSEAS})`
                                                            : `${myOverseasCount}/${MAX_OVERSEAS} slots used`
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── WATCHLIST PANEL ── */}
                            {!isAuctioneer && (
                                <div className="mt-3">
                                    <button
                                        onClick={() => setShowWatchlist(!showWatchlist)}
                                        className="glass-card w-full p-3 flex items-center justify-between text-sm hover:border-yellow-400/30 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">⭐</span>
                                            <span className="font-semibold text-white">Watchlist Targets</span>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700' }}>
                                                {watchlist.size}
                                            </span>
                                        </div>
                                        <span className="text-white/30 transition-transform duration-300" style={{ transform: showWatchlist ? 'rotate(180deg)' : '' }}>▼</span>
                                    </button>
                                    {showWatchlist && (
                                        <div className="glass-card mt-1 p-3 animate-fade-in" style={{ borderColor: 'rgba(255,215,0,0.15)' }}>
                                            <div className="space-y-1 max-h-64 overflow-y-auto">
                                                {(auction?.queue || [])
                                                    .map(pid => allPlayers.find(p => p.id === pid))
                                                    .filter(Boolean)
                                                    .filter(p => watchlist.has(p.id))
                                                    .map(p => {
                                                        const isActive = auction?.currentPlayerId === p.id && auction?.status !== 'done';
                                                        const soldInfo = (auction?.soldPlayers || []).find(s => s.playerId === p.id);
                                                        const isUnsold = (auction?.unsoldPlayers || []).includes(p.id);

                                                        let statusLabel = '⏳ Upcoming';
                                                        let statusStyle = 'text-white/30';

                                                        if (isActive) {
                                                            statusLabel = '🔴 Active Bid';
                                                            statusStyle = 'text-red-400 font-bold animate-pulse';
                                                        } else if (soldInfo) {
                                                            statusLabel = `✅ Sold (₹${formatPrice(soldInfo.price)})`;
                                                            statusStyle = 'text-emerald-400 font-bold';
                                                        } else if (isUnsold) {
                                                            statusLabel = '❌ Unsold';
                                                            statusStyle = 'text-red-400';
                                                        }

                                                        return (
                                                            <div key={p.id} className="flex items-center justify-between p-2 rounded-lg text-xs transition-colors"
                                                                style={{
                                                                    background: isActive ? 'rgba(255,215,0,0.06)' : 'rgba(255,255,255,0.02)',
                                                                    border: isActive ? '1px solid rgba(255,215,0,0.2)' : '1px solid transparent'
                                                                }}>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-white font-medium truncate">{p.playerName}</p>
                                                                    <p className={`text-[10px] ${statusStyle}`}>{statusLabel}</p>
                                                                </div>
                                                                <button
                                                                    onClick={() => toggleWatchlist(p.id)}
                                                                    className="ml-2 text-base text-yellow-400 hover:scale-125 transition-transform"
                                                                    title="Remove target"
                                                                >
                                                                    ★
                                                                </button>
                                                            </div>
                                                        );
                                                    })
                                                }
                                                {watchlist.size === 0 && (
                                                    <p className="text-white/20 text-xs text-center py-3">No targets watchlisted</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Right Sidebar */}
                        <div className="space-y-3">
                            {/* Purse Leaderboard */}
                            <div className="glass-card p-3">
                                <h3 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(255,215,0,0.6)' }}>💰 Purse Leaderboard</h3>
                                <div className="space-y-1.5">
                                    {purseLeaderboard.map((entry, i) => {
                                        const team = getTeamByName(entry.teamName);
                                        return (
                                            <div key={entry.uid} className="flex items-center gap-2 text-xs p-1.5 rounded-lg" style={{ background: i === 0 ? 'rgba(255,215,0,0.06)' : 'transparent' }}>
                                                <span className="w-4 text-center font-bold" style={{ color: i === 0 ? '#FFD700' : 'rgba(255,255,255,0.3)' }}>{i + 1}</span>
                                                <TeamBadge teamName={entry.teamName} size="tiny" />
                                                <span className="flex-1 text-white/70 font-medium truncate">{team.short}</span>
                                                <span className="text-ipl-gold font-bold">₹{formatPrice(entry.purse)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Predictor Leaderboard */}
                            <div className="glass-card p-3">
                                <h3 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(16,185,129,0.7)' }}>🔮 Predictor Leaderboard</h3>
                                <div className="space-y-1.5">
                                    {allUsers
                                        .filter(u => u.role === ROLES.TEAM_OWNER && !(room?.kickedUsers || []).includes(u.uid))
                                        .map(owner => {
                                            const squadPlayers = squads[owner.uid]?.players || [];
                                            const score = calcSquadPredictorScore(squadPlayers, allPlayers);
                                            return {
                                                uid: owner.uid,
                                                username: owner.username,
                                                teamName: room?.teamAssignments?.[owner.uid] || '',
                                                score: score,
                                            };
                                        })
                                        .sort((a, b) => b.score - a.score)
                                        .map((entry, idx) => {
                                            const team = getTeamByName(entry.teamName);
                                            return (
                                                <div key={entry.uid} className="flex items-center gap-2 text-xs p-1.5 rounded-lg" style={{ background: idx === 0 && entry.score > 0 ? 'rgba(16,185,129,0.06)' : 'transparent' }}>
                                                    <span className="w-4 text-center font-bold" style={{ color: idx === 0 && entry.score > 0 ? '#10B981' : 'rgba(255,255,255,0.3)' }}>{idx + 1}</span>
                                                    <TeamBadge teamName={entry.teamName} size="tiny" />
                                                    <span className="flex-1 text-white/70 font-medium truncate">{team.short}</span>
                                                    <span className="font-black text-emerald-400">🔮 {entry.score} pts</span>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>

                            <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(168,85,247,0.6)' }}>Teams</h3>
                            {teamOwners.map((owner, i) => {
                                const teamName = getTeamForUser(owner.uid);
                                const team = getTeamByName(teamName);
                                const squadPlayers = squads[owner.uid]?.players || [];
                                const isBidding = auction?.currentBidderId === owner.uid;

                                return (
                                    <div key={owner.uid}
                                        className={`glass-card p-3 transition-all duration-300 animate-stagger-pop ${isBidding ? 'animate-pulse-neon' : ''}`}
                                        style={{ ...(isBidding ? { borderColor: 'rgba(168,85,247,0.5)' } : {}), animationDelay: `${i * 0.08}s` }}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <TeamBadge teamName={teamName} size="small" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-white truncate">{team.short}</p>
                                                <p className="text-[10px] text-white/30">{owner.username}</p>
                                                {isAuctioneer && (
                                                    <button
                                                        onClick={() => room?.mutedBidders?.[owner.uid] ? unmuteBidder(owner.uid) : muteBidder(owner.uid)}
                                                        className="mt-1 px-2 py-0.5 rounded text-[9px] font-bold transition-colors"
                                                        style={{ 
                                                            background: room?.mutedBidders?.[owner.uid] ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.05)", 
                                                            color: room?.mutedBidders?.[owner.uid] ? "#EF4444" : "rgba(255, 255, 255, 0.4)",
                                                            border: room?.mutedBidders?.[owner.uid] ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(255, 255, 255, 0.1)"
                                                        }}
                                                    >
                                                        {room?.mutedBidders?.[owner.uid] ? "Muted" : "Mute"}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: '#C084FC' }}>{squadPlayers.length}</span>
                                                <span className="text-[9px] font-black text-emerald-400 mt-1" title="Squad Predictor Score">🔮 {calcSquadPredictorScore(squadPlayers, allPlayers)}</span>
                                            </div>
                                        </div>
                                        <PurseBar
                                            remaining={owner.purseRemaining || 0}
                                            total={(room?.rules?.totalPurse || 120) * 100}
                                            label=""
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Review Unsold Players Overlay Modal */}
            {showReviewUnsoldModal && (
                <div className="fixed inset-0 z-[100] flex flex-col justify-center items-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="glass-card max-w-2xl w-full max-h-[85vh] flex flex-col p-6 rounded-2xl relative animate-slide-up">
                        <button onClick={() => setShowReviewUnsoldModal(false)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">✕</button>
                        <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-wide">Review Unsold Players</h2>
                        <p className="text-white/50 text-sm mb-6">Select the players you want to bring back to the auction for a final bid.</p>

                        <div className="flex-1 overflow-y-auto mb-6 pr-2 space-y-2 custom-scroll">
                            {(auction?.unsoldPlayers || []).map(pid => {
                                const p = allPlayers.find(pl => pl.id === pid);
                                if (!p) return null;
                                return (
                                    <label key={p.id} className="cursor-pointer flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div className="flex items-center gap-4 flex-1">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded accent-neon-purple cursor-pointer focus:ring-neon-purple/50 bg-[#0a0a0f] border-gray-600"
                                                checked={selectedUnsoldPlayers.has(p.id)}
                                                onChange={() => toggleUnsoldPlayerSelection(p.id)}
                                            />
                                            <div className="flex-1">
                                                <p className="text-white font-bold">{p.playerName}</p>
                                                <p className="text-xs text-white/50">{getCategoryInfo(p.category).label} | ₹{formatPrice(p.basePrice)}</p>
                                            </div>
                                        </div>
                                    </label>
                                );
                            })}
                            {(!auction?.unsoldPlayers || auction.unsoldPlayers.length === 0) && (
                                <div className="text-center py-10 text-white/30 italic">No unsold players to review.</div>
                            )}
                        </div>

                        <div className="flex justify-between items-center mt-auto border-t border-white/10 pt-4">
                            <span className="text-sm font-semibold text-white/70">{selectedUnsoldPlayers.size} selected</span>
                            <div className="flex gap-3">
                                <button onClick={() => setShowReviewUnsoldModal(false)} className="px-6 py-2.5 rounded-xl font-semibold btn-secondary text-sm">Cancel</button>
                                <button
                                    onClick={handleRestartUnsoldAuction}
                                    disabled={selectedUnsoldPlayers.size === 0}
                                    className="px-6 py-2.5 rounded-xl font-bold btn-primary disabled:opacity-30 text-sm"
                                >
                                    Re-Auction Selected →
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* RTM Flow Modal */}
            {rtmPending && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }}>
                    <div className="glass-card p-6 rounded-2xl max-w-md w-full animate-slide-up" style={{ borderColor: 'rgba(168,85,247,0.4)' }}>
                        <div className="text-center mb-4">
                            <div className="text-3xl mb-2">🔄</div>
                            <h3 className="text-xl font-black text-white">Right to Match</h3>
                            <p className="text-white/50 text-sm mt-1">{rtmPending.playerName}</p>
                        </div>

                        {rtmPending.status === 'waiting_rtm_decision' && (
                            <>
                                <p className="text-white/70 text-sm text-center mb-4">
                                    <strong style={{ color: getTeamByName(room?.teamAssignments?.[rtmPending.originalOwnerUid] || '').color }}>
                                        {getTeamByName(room?.teamAssignments?.[rtmPending.originalOwnerUid] || '').short}
                                    </strong> can use RTM to match <strong className="text-ipl-gold">₹{formatPrice(rtmPending.winningBid)}</strong>
                                </p>
                                {userData?.uid === rtmPending.originalOwnerUid ? (() => {
                                    const squad = squads[userData.uid]?.players || [];
                                    const maxSquadSize = room?.rules?.maxSquadSize || 25;
                                    const isFull = squad.length >= maxSquadSize;
                                    
                                    const rtmPlayer = allPlayers.find(p => p.id === rtmPending.playerId);
                                    const isOverseas = rtmPlayer?.nationality && rtmPlayer.nationality.toLowerCase() !== 'indian';
                                    const currentOverseas = squad.filter(p => {
                                        const fullP = allPlayers.find(ap => ap.id === p.playerId);
                                        return fullP && fullP.nationality && fullP.nationality.toLowerCase() !== 'indian';
                                    }).length;
                                    const overOverseas = isOverseas && currentOverseas >= 8;
                                    
                                    const isTooPoor = rtmPending.winningBid > (userData?.purseRemaining || 0);
                                    
                                    const rtmDisabled = isFull || overOverseas || isTooPoor;
                                    const rtmText = isTooPoor ? 'Insufficient Purse' : isFull ? 'Squad Full' : overOverseas ? 'Overseas Limit' : 'Use RTM 🔄';
                                    
                                    return (
                                        <div className="flex gap-3 justify-center">
                                            <button onClick={declineRTM} className="px-5 py-2.5 rounded-xl font-semibold text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-all">Decline RTM</button>
                                            <button
                                                onClick={useRTM}
                                                disabled={rtmDisabled}
                                                className="px-5 py-2.5 rounded-xl font-bold text-white transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                                                style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)', boxShadow: '0 0 20px rgba(168,85,247,0.3)' }}>
                                                {rtmText}
                                            </button>
                                        </div>
                                    );
                                })() : (
                                    <p className="text-white/40 text-xs text-center">Waiting for {getTeamByName(room?.teamAssignments?.[rtmPending.originalOwnerUid] || '').short} to decide...</p>
                                )}
                            </>
                        )}

                        {rtmPending.status === 'counter_offer' && (
                            <>
                                <p className="text-white/70 text-sm text-center mb-4">Winning bidder (<strong style={{ color: getTeamByName(room?.teamAssignments?.[rtmPending.winningBidderId] || '').color }}>{getTeamByName(room?.teamAssignments?.[rtmPending.winningBidderId] || '').short}</strong>) can make a counter-offer</p>
                                {userData?.uid === rtmPending.winningBidderId ? (() => {
                                    const currentAmount = rtmCounterAmount || rtmPending.winningBid + 25;
                                    const isInvalid = currentAmount <= rtmPending.winningBid ||
                                        currentAmount > (userData?.purseRemaining || 0) ||
                                        currentAmount % 25 !== 0;

                                    return (
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-4 justify-center">
                                                <button onClick={() => setRtmCounterAmount(prev => Math.max(rtmPending.winningBid + 25, (prev || rtmPending.winningBid + 25) - 25))} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-2xl flex items-center justify-center transition-colors select-none">-</button>
                                                <div className="flex items-baseline gap-1 border-b-2 border-ipl-gold/50 focus-within:border-ipl-gold px-2 pb-1">
                                                    <span className="text-2xl font-black text-ipl-gold">₹</span>
                                                    <input
                                                        type="number"
                                                        step="0.25"
                                                        value={rtmCounterAmount ? (rtmCounterAmount / 100) : ((rtmPending.winningBid + 25) / 100)}
                                                        onChange={(e) => {
                                                            const val = parseFloat(e.target.value);
                                                            if (!isNaN(val)) setRtmCounterAmount(val * 100);
                                                            else setRtmCounterAmount(0);
                                                        }}
                                                        onBlur={() => {
                                                            let val = rtmCounterAmount || rtmPending.winningBid + 25;
                                                            val = Math.max(rtmPending.winningBid + 25, Math.round(val / 25) * 25);
                                                            if (val > (userData?.purseRemaining || 0)) val = (userData?.purseRemaining || 0);
                                                            val = Math.round(val / 25) * 25;
                                                            setRtmCounterAmount(val);
                                                        }}
                                                        className="bg-transparent text-3xl w-24 text-center font-black text-ipl-gold focus:outline-none"
                                                    />
                                                    <span className="text-lg font-bold text-ipl-gold">Cr</span>
                                                </div>
                                                <button onClick={() => setRtmCounterAmount(prev => Math.min(userData?.purseRemaining || 0, (prev || rtmPending.winningBid + 25) + 25))} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-2xl flex items-center justify-center transition-colors select-none">+</button>
                                            </div>
                                            <div className="flex gap-3 justify-center">
                                                <button onClick={declineCounterOffer} className="px-5 py-2.5 rounded-xl font-semibold text-white/50 border border-white/10 hover:bg-white/10 transition-all">No Counter</button>
                                                <button
                                                    onClick={() => submitCounterOffer(currentAmount)}
                                                    disabled={isInvalid}
                                                    className="px-6 py-2.5 rounded-xl font-bold text-white transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                                                    style={{ background: 'linear-gradient(135deg, #059669, #10B981)', boxShadow: isInvalid ? 'none' : '0 0 20px rgba(16,185,129,0.3)' }}>
                                                    {currentAmount > (userData?.purseRemaining || 0) ? `Insufficient Purse (₹${formatPrice(userData?.purseRemaining || 0)} left)` : 'Submit Counter'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })() : (
                                    <p className="text-white/40 text-xs text-center">Waiting for {getTeamByName(room?.teamAssignments?.[rtmPending.winningBidderId] || '').short} to respond...</p>
                                )}
                            </>
                        )}

                        {rtmPending.status === 'waiting_final_match' && (
                            <>
                                <p className="text-white/70 text-sm text-center mb-4">
                                    Counter-offer: <strong className="text-ipl-gold">₹{formatPrice(rtmPending.counterOfferAmount)}</strong>. Will <strong style={{ color: getTeamByName(room?.teamAssignments?.[rtmPending.originalOwnerUid] || '').color }}>{getTeamByName(room?.teamAssignments?.[rtmPending.originalOwnerUid] || '').short}</strong> match?
                                </p>
                                {userData?.uid === rtmPending.originalOwnerUid ? (() => {
                                    const squad = squads[userData.uid]?.players || [];
                                    const maxSquadSize = room?.rules?.maxSquadSize || 25;
                                    const isFull = squad.length >= maxSquadSize;
                                    
                                    const rtmPlayer = allPlayers.find(p => p.id === rtmPending.playerId);
                                    const isOverseas = rtmPlayer?.nationality && rtmPlayer.nationality.toLowerCase() !== 'indian';
                                    const currentOverseas = squad.filter(p => {
                                        const fullP = allPlayers.find(ap => ap.id === p.playerId);
                                        return fullP && fullP.nationality && fullP.nationality.toLowerCase() !== 'indian';
                                    }).length;
                                    const overOverseas = isOverseas && currentOverseas >= 8;
                                    
                                    const isTooPoor = rtmPending.counterOfferAmount > (userData?.purseRemaining || 0);
                                    
                                    const rtmDisabled = isFull || overOverseas || isTooPoor;
                                    const rtmText = isTooPoor ? 'Insufficient Purse' : isFull ? 'Squad Full' : overOverseas ? 'Overseas Limit' : `Match ₹${formatPrice(rtmPending.counterOfferAmount)}`;

                                    return (
                                        <div className="flex gap-3 justify-center">
                                            <button onClick={declineCounterMatch} className="px-5 py-2.5 rounded-xl font-semibold text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-all">Decline</button>
                                            <button
                                                onClick={matchCounterOffer}
                                                disabled={rtmDisabled}
                                                className="px-5 py-2.5 rounded-xl font-bold text-white transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                                                style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)' }}>
                                                {rtmText}
                                            </button>
                                        </div>
                                    );
                                })() : (
                                    <p className="text-white/40 text-xs text-center">Waiting for {getTeamByName(room?.teamAssignments?.[rtmPending.originalOwnerUid] || '').short} to decide...</p>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Kick User Confirm */}
            <ConfirmModal
                isOpen={!!showKickConfirm}
                title="Kick User?"
                message={`Are you sure you want to kick this user? Their players will be returned to the unsold pool.`}
                onConfirm={() => handleKick(showKickConfirm)}
                onCancel={() => setShowKickConfirm(null)}
                confirmText="Kick User"
                danger
            />

            {/* Set Change Confirm */}
            <ConfirmModal
                isOpen={!!pendingSetChange}
                title="Change Player Set?"
                message={`Switch to ${pendingSetChange ? getCategoryInfo(pendingSetChange).label : ''} set? The current bid will reset.`}
                onConfirm={confirmSetChange}
                onCancel={() => setPendingSetChange(null)}
                confirmText="Switch Set"
            />

            {/* End Auction Confirm */}
            <ConfirmModal
                isOpen={showConfirmEndAuction}
                title="End Auction?"
                message="Are you sure you want to end the auction and proceed to Playing XI selection?"
                onConfirm={handleEndAuction}
                onCancel={() => setShowConfirmEndAuction(false)}
                confirmText="End Auction →"
            />

            {/* Phase Transition Confirm */}
            <ConfirmModal
                isOpen={showConfirmPhase}
                title="Proceed to Playing XI?"
                message="The auction is complete. Are you sure you want to proceed to Playing XI selection?"
                onConfirm={async () => { setShowConfirmPhase(false); await advancePhase(GAME_PHASES.PLAYING_XI); }}
                onCancel={() => setShowConfirmPhase(false)}
                confirmText="Proceed →"
            />
        </Layout >
    );
}

function StatBox({ label, value, icon }) {
    return (
        <div className="rounded-xl p-3 text-center" style={{
            background: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(15,10,40,0.4) 100%)',
            border: '1px solid rgba(168,85,247,0.12)',
        }}>
            <p className="text-[10px] text-white/40 uppercase tracking-wider">{icon} {label}</p>
            <p className="text-lg font-bold text-white mt-0.5">{value}</p>
        </div>
    );
}

function MiniStat({ label, val }) {
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs" style={{
            background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.1)'
        }}>
            <span className="text-white/35 font-medium">{label}</span>
            <span className="font-semibold text-white/80">{val}</span>
        </span>
    );
}






