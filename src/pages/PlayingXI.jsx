import React, { useState, useEffect } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useGame } from '../contexts/GameContext';
import Layout from '../components/Layout';
import TeamBadge from '../components/TeamBadge';
import { ROLES, GAME_PHASES } from '../utils/constants';
import { formatPrice, isIndian } from '../utils/helpers';
import TextRandomizer from '../components/TextRandomizer';

/*
  PlayingXI — Tap-to-add system that works on mobile, tablet & desktop:
  
  Step 1: Tap players from your squad to add them to the XI in batting order.
          The first player you tap = Opener 1, second = Opener 2, etc.
          Tap a player in the XI to remove them (shifts others down).
  
  Step 2: Pick captain from your XI (tap the crown button).
  
  Step 3: If impact players are enabled, pick from bench.
*/

export default function PlayingXI() {
    const { room, userData, allUsers, advancePhase } = useRoom();
    const { allPlayers, squads, submitPlayingXI, playingXIData } = useGame();
    const isAuctioneer = userData?.role === ROLES.AUCTIONEER;

    const [battingOrder, setBattingOrder] = useState([]); // ordered array of playerIds
    const [impactPlayers, setImpactPlayers] = useState([]);
    const [captainId, setCaptainId] = useState(null);
    const [submitted, setSubmitted] = useState(false);

    const maxImpact = room?.rules?.maxImpactPlayers || 1;

    const mySquad = squads[userData?.uid]?.players || [];
    const mySquadDetails = mySquad
        .map(sp => {
            const player = allPlayers.find(p => p.id === sp.playerId);
            if (!player) return null;
            return { ...sp, ...player, acquisitionType: sp.type, acquisitionPrice: sp.price };
        })
        .filter(Boolean);

    // Players in XI vs bench
    const xiSet = new Set(battingOrder);
    const availablePlayers = mySquadDetails.filter(p => !xiSet.has(p.playerId));
    const benchPlayers = mySquadDetails.filter(p => !xiSet.has(p.playerId));

    const isFull = battingOrder.length >= 11;

    // Load previous submission
    useEffect(() => {
        if (userData && playingXIData[userData.uid]?.submitted) {
            setSubmitted(true);
            setBattingOrder(playingXIData[userData.uid].playingXI || []);
            setImpactPlayers(playingXIData[userData.uid].impactPlayers || []);
            setCaptainId(playingXIData[userData.uid].captainId);
        }
    }, [userData, playingXIData]);

    // Add player to end of batting order
    const addToXI = (playerId) => {
        if (submitted || isFull) return;
        setBattingOrder(prev => [...prev, playerId]);
    };

    // Remove player from batting order
    const removeFromXI = (playerId) => {
        if (submitted) return;
        setBattingOrder(prev => prev.filter(id => id !== playerId));
        if (captainId === playerId) setCaptainId(null);
        setImpactPlayers(prev => prev.filter(id => id !== playerId));
    };

    // Move player up in batting order
    const moveUp = (idx) => {
        if (submitted || idx === 0) return;
        setBattingOrder(prev => {
            const arr = [...prev];
            [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
            return arr;
        });
    };

    // Move player down in batting order
    const moveDown = (idx) => {
        if (submitted || idx >= battingOrder.length - 1) return;
        setBattingOrder(prev => {
            const arr = [...prev];
            [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
            return arr;
        });
    };

    const toggleImpact = (playerId) => {
        if (submitted) return;
        setImpactPlayers(prev => {
            if (prev.includes(playerId)) return prev.filter(id => id !== playerId);
            if (prev.length >= maxImpact) return prev;
            return [...prev, playerId];
        });
    };

    const handleSubmit = async () => {
        if (battingOrder.length < 11 || !captainId) return;
        setSubmitted(true);
        await submitPlayingXI(battingOrder, impactPlayers, captainId);
    };

    const teamOwners = allUsers.filter(u => u.role === ROLES.TEAM_OWNER);
    const submittedCount = teamOwners.filter(u => playingXIData[u.uid]?.submitted).length;

    const getPlayerById = (id) => mySquadDetails.find(p => p.playerId === id);
    const posLabel = (idx) => {
        if (idx < 2) return 'Opener';
        return `#${idx + 1}`;
    };

    return (
        <Layout>
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="text-center mb-5 animate-cyber-slide-up">
                    <h2 className="text-3xl font-black mb-1" style={{
                        background: 'linear-gradient(135deg, #A855F7, #EC4899, #FFD700)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}><TextRandomizer text="Playing XI" delay={100} stagger={50} /></h2>
                    <p className="text-white/40 text-sm">
                        {isAuctioneer
                            ? `${submittedCount}/${teamOwners.length} teams submitted`
                            : submitted ? 'Submitted ✅' : `Tap players to set batting order (${battingOrder.length}/11)`}
                    </p>
                </div>

                {!isAuctioneer && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                        {/* LEFT — Batting Order (filled slots) */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-bold text-white/60 uppercase tracking-wider">
                                    Batting Order ({battingOrder.length}/11)
                                </h3>
                                {isFull && !captainId && (
                                    <span className="text-xs text-yellow-400 animate-pulse">👑 Pick captain</span>
                                )}
                            </div>

                            <div className="space-y-1">
                                {battingOrder.map((playerId, idx) => {
                                    const player = getPlayerById(playerId);
                                    if (!player) return null;
                                    const isCaptain = captainId === playerId;
                                    return (
                                        <div key={playerId}
                                            className="glass-card p-2.5 flex items-center gap-2 transition-all duration-200"
                                            style={isCaptain ? { borderColor: 'rgba(255,215,0,0.3)', boxShadow: '0 0 12px rgba(255,215,0,0.1)' } : {}}>
                                            {/* Position badge */}
                                            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-black"
                                                style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.2)', color: '#C084FC' }}>
                                                {posLabel(idx)}
                                            </div>

                                            {/* Player info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-semibold text-white text-sm truncate">{player.playerName}</span>
                                                    {!isIndian(player.nationality) && <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}>✈️</span>}
                                                    {isCaptain && <span className="text-xs">👑</span>}
                                                </div>
                                                <span className="text-[10px] text-white/30">{player.playerRole}</span>
                                            </div>

                                            {/* Actions */}
                                            {!submitted && (
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    {/* Move up/down */}
                                                    <button onClick={() => moveUp(idx)} disabled={idx === 0}
                                                        className="w-7 h-7 rounded flex items-center justify-center text-xs disabled:opacity-20"
                                                        style={{ background: 'rgba(255,255,255,0.05)' }}>▲</button>
                                                    <button onClick={() => moveDown(idx)} disabled={idx >= battingOrder.length - 1}
                                                        className="w-7 h-7 rounded flex items-center justify-center text-xs disabled:opacity-20"
                                                        style={{ background: 'rgba(255,255,255,0.05)' }}>▼</button>

                                                    {/* Captain toggle */}
                                                    <button onClick={() => setCaptainId(isCaptain ? null : playerId)}
                                                        className="w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold transition-all"
                                                        style={isCaptain
                                                            ? { background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#1a0a00' }
                                                            : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }}>
                                                        C
                                                    </button>

                                                    {/* Remove */}
                                                    <button onClick={() => removeFromXI(playerId)}
                                                        className="w-7 h-7 rounded flex items-center justify-center text-xs text-red-400/60 hover:text-red-400 transition-colors"
                                                        style={{ background: 'rgba(255,255,255,0.05)' }}>✕</button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* Empty slots */}
                                {Array.from({ length: Math.max(0, 11 - battingOrder.length) }).map((_, i) => (
                                    <div key={`empty-${i}`} className="glass-card p-2.5 flex items-center gap-2 opacity-30">
                                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-black"
                                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.2)' }}>
                                            {posLabel(battingOrder.length + i)}
                                        </div>
                                        <span className="text-white/20 text-sm italic">← Tap a player to add</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* RIGHT — Available Players (tap to add) */}
                        <div>
                            <h3 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-2">
                                {isFull ? 'Squad' : 'Tap to Add'}
                            </h3>

                            <div className="space-y-1 max-h-[60vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                                {availablePlayers.map(player => (
                                    <div key={player.playerId}
                                        className={`glass-card p-2.5 flex items-center gap-2 transition-all duration-200 ${!isFull && !submitted ? 'cursor-pointer active:scale-[0.98] hover:border-purple-500/30' : 'opacity-50'}`}
                                        onClick={() => addToXI(player.playerId)}>
                                        {/* Add indicator */}
                                        {!isFull && !submitted && (
                                            <div className="w-7 h-7 rounded-full border-2 border-purple-500/30 flex items-center justify-center flex-shrink-0">
                                                <span className="text-purple-400 text-xs font-bold">+</span>
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-semibold text-white text-sm truncate">{player.playerName}</span>
                                                {!isIndian(player.nationality) && <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}>✈️</span>}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.12)', color: '#C084FC' }}>{player.playerRole}</span>
                                                <span className="text-[10px] text-white/25">
                                                    {player.acquisitionType === 'retained' ? '🔒' : `₹${formatPrice(player.acquisitionPrice)}`}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {availablePlayers.length === 0 && isFull && (
                                    <p className="text-white/30 text-xs text-center py-4">All 11 selected ✅</p>
                                )}
                            </div>

                            {/* Impact Players — shown after XI is full */}
                            {isFull && benchPlayers.length > 0 && maxImpact > 0 && !submitted && (
                                <div className="mt-4">
                                    <h3 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-2">
                                        ⚡ Impact Player ({impactPlayers.length}/{maxImpact})
                                    </h3>
                                    <div className="space-y-1">
                                        {benchPlayers.map(player => {
                                            const isImpact = impactPlayers.includes(player.playerId);
                                            return (
                                                <div key={player.playerId}
                                                    className="glass-card p-2.5 flex items-center gap-2 cursor-pointer active:scale-[0.98] transition-all"
                                                    onClick={() => toggleImpact(player.playerId)}
                                                    style={isImpact ? { borderColor: 'rgba(59,130,246,0.3)' } : {}}>
                                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isImpact ? 'border-blue-500 bg-blue-500/20' : 'border-white/20'}`}>
                                                        {isImpact && <span className="text-blue-400 text-[9px]">⚡</span>}
                                                    </div>
                                                    <span className="font-semibold text-white text-sm">{player.playerName}</span>
                                                    {isImpact && <span className="text-[10px] font-bold text-blue-400 ml-auto">IMPACT</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Submit / Status */}
                {!isAuctioneer && !submitted && (
                    <div className="text-center py-5">
                        <button onClick={handleSubmit} className="btn-primary text-lg px-10 py-3.5"
                            disabled={battingOrder.length < 11 || !captainId} id="submit-xi-btn">
                            ✅ Submit Playing XI
                        </button>
                        {battingOrder.length < 11 && <p className="text-[10px] text-white/30 mt-2">Select {11 - battingOrder.length} more players</p>}
                        {battingOrder.length >= 11 && !captainId && <p className="text-[10px] text-white/30 mt-2">Select a captain (C)</p>}
                    </div>
                )}

                {!isAuctioneer && submitted && (
                    <div className="py-6 animate-fade-in">
                        <div className="text-center mb-4">
                            <div className="text-4xl mb-2">✅</div>
                            <p className="text-lg font-bold" style={{ color: '#A855F7' }}>Playing XI Submitted!</p>
                            <p className="text-white/30 text-sm">Waiting for other teams...</p>
                        </div>

                        {/* Playing XI Section */}
                        <div className="mb-4">
                            <h4 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(168,85,247,0.6)' }}>Playing XI</h4>
                            <div className="space-y-1">
                                {battingOrder.filter(id => !impactPlayers.includes(id)).map((playerId, idx) => {
                                    const player = getPlayerById(playerId);
                                    if (!player) return null;
                                    const isCaptain = captainId === playerId;
                                    return (
                                        <div key={playerId} className="glass-card p-2.5 flex items-center gap-2"
                                            style={isCaptain ? { borderColor: 'rgba(255,215,0,0.2)' } : {}}>
                                            <span className="text-[10px] font-bold w-7 text-center" style={{ color: '#A855F7' }}>{idx < 2 ? 'OP' : `#${idx + 1}`}</span>
                                            <span className="text-white font-medium text-sm flex-1 truncate">{player.playerName}</span>
                                            {!isIndian(player.nationality) && <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}>✈️</span>}
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.12)', color: '#C084FC' }}>{player.playerRole}</span>
                                            {isCaptain && <span className="text-xs">👑</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Impact Players Section */}
                        {impactPlayers.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(59,130,246,0.6)' }}>⚡ Impact Players</h4>
                                <div className="space-y-1">
                                    {impactPlayers.map(playerId => {
                                        const player = getPlayerById(playerId);
                                        if (!player) return null;
                                        return (
                                            <div key={playerId} className="glass-card p-2.5 flex items-center gap-2" style={{ borderColor: 'rgba(59,130,246,0.15)' }}>
                                                <span className="text-[10px] font-bold w-7 text-center text-blue-400">⚡</span>
                                                <span className="text-white font-medium text-sm flex-1 truncate">{player.playerName}</span>
                                                {!isIndian(player.nationality) && <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}>✈️</span>}
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.12)', color: '#60A5FA' }}>{player.playerRole}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Auctioneer View */}
                {isAuctioneer && (
                    <div className="space-y-2">
                        {teamOwners.map(owner => {
                            const hasSubmitted = playingXIData[owner.uid]?.submitted;
                            return (
                                <div key={owner.uid} className="glass-card p-3 flex items-center justify-between"
                                    style={hasSubmitted ? { borderColor: 'rgba(16,185,129,0.3)' } : {}}>
                                    <div className="flex items-center gap-2">
                                        <TeamBadge teamName={room?.teamAssignments?.[owner.uid]} size="small" />
                                        <span className="font-semibold text-white text-sm">{owner.username}</span>
                                    </div>
                                    <span className={`text-sm font-bold ${hasSubmitted ? 'text-emerald-400' : 'text-yellow-400'}`}>
                                        {hasSubmitted ? '✅' : '⏳'}
                                    </span>
                                </div>
                            );
                        })}
                        <button onClick={() => advancePhase(GAME_PHASES.SCORING)} className="btn-primary w-full text-lg py-3.5 mt-3" id="proceed-scoring-btn">Proceed to Scoring</button>
                    </div>
                )}
            </div>
        </Layout>
    );
}



