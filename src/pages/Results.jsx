import React, { useEffect, useState } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import TeamBadge from '../components/TeamBadge';
import { ROLES, getTeamByName } from '../utils/constants';
import { formatPrice, isIndian, computeBargainScore } from '../utils/helpers';
import TextRandomizer from '../components/TextRandomizer';

// Winner announcement SFX
function playWinnerSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        // Fanfare: rising arpeggiated chords
        const notes = [
            { f: 523.25, t: 0 },    // C5
            { f: 659.25, t: 0.12 },  // E5
            { f: 783.99, t: 0.24 },  // G5
            { f: 1046.5, t: 0.4 },   // C6
            { f: 783.99, t: 0.55 },  // G5
            { f: 1046.5, t: 0.7 },   // C6
            { f: 1318.5, t: 0.9 },   // E6
        ];
        notes.forEach(({ f, t }) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = f;
            gain.gain.setValueAtTime(0.2, ctx.currentTime + t);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + t + 0.5);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + t);
            osc.stop(ctx.currentTime + t + 0.5);
        });
        // Sub bass for weight
        const sub = ctx.createOscillator();
        const sg = ctx.createGain();
        sub.type = 'sine'; sub.frequency.value = 65;
        sg.gain.setValueAtTime(0.25, ctx.currentTime + 0.4);
        sg.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);
        sub.connect(sg).connect(ctx.destination);
        sub.start(ctx.currentTime + 0.4); sub.stop(ctx.currentTime + 1.3);
    } catch (e) { }
}

/* 3D CSS Trophy */
function Trophy3D() {
    return (
        <div className="trophy-3d" style={{ perspective: '600px', perspectiveOrigin: '50% 40%' }}>
            <div className="trophy-model" style={{ transformStyle: 'preserve-3d', animation: 'trophySpin 4s ease-in-out infinite' }}>
                {/* Cup body */}
                <div style={{
                    width: 80, height: 70, margin: '0 auto',
                    background: 'linear-gradient(135deg, #FFD700, #FFA500, #FFD700, #DAA520)',
                    borderRadius: '10px 10px 25px 25px',
                    boxShadow: 'inset -8px -8px 20px rgba(0,0,0,0.2), inset 4px 4px 10px rgba(255,255,255,0.4), 0 0 40px rgba(255,215,0,0.3)',
                    position: 'relative',
                }} >
                    {/* Star engraving */}
                    <div style={{
                        position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)',
                        fontSize: '1.5rem', textShadow: '0 0 10px rgba(255,255,255,0.6)',
                    }}>⭐</div>
                </div>
                {/* Left handle */}
                <div style={{
                    position: 'absolute', top: 8, left: -18,
                    width: 20, height: 40,
                    border: '4px solid #FFD700',
                    borderRadius: '15px 0 0 15px',
                    borderRight: 'none',
                    boxShadow: '-2px 0 8px rgba(255,215,0,0.2)',
                }} />
                {/* Right handle */}
                <div style={{
                    position: 'absolute', top: 8, right: -18,
                    width: 20, height: 40,
                    border: '4px solid #FFD700',
                    borderRadius: '0 15px 15px 0',
                    borderLeft: 'none',
                    boxShadow: '2px 0 8px rgba(255,215,0,0.2)',
                }} />
                {/* Stem */}
                <div style={{
                    width: 16, height: 30, margin: '0 auto',
                    background: 'linear-gradient(180deg, #DAA520, #FFD700)',
                    boxShadow: 'inset -2px 0 4px rgba(0,0,0,0.15)',
                }} />
                {/* Base */}
                <div style={{
                    width: 60, height: 14, margin: '0 auto',
                    background: 'linear-gradient(180deg, #B8860B, #DAA520, #8B6914)',
                    borderRadius: '4px 4px 8px 8px',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
                }} />
            </div>
        </div>
    );
}

export default function Results() {
    const { room, allUsers, leaveRoom, userData } = useRoom();
    const { scores, playingXIData, squads, allPlayers } = useGame();
    const { user } = useAuth();
    const [showPodium, setShowPodium] = useState(false);
    const [showRankings, setShowRankings] = useState(false);
    const [expandedUser, setExpandedUser] = useState(null);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

    const teamOwners = allUsers.filter(u => u.role === ROLES.TEAM_OWNER);
    const isAuctioneer = userData?.role === ROLES.AUCTIONEER;

    const baseUsers = teamOwners.map(u => {
        const auctionPts = scores[u.uid]?.auctionStrategyPoints ?? 0;
        const miniPts = scores[u.uid]?.miniGamePoints ?? 0;
        // Mini game has 5 rounds, so scale to 10 to match auction points for average
        const scaledMiniPts = miniPts * 2;
        const averageScore = (auctionPts + scaledMiniPts) / 2;
        return {
            ...u,
            teamName: room?.teamAssignments?.[u.uid],
            score: averageScore, // Overall score is now the average
            auctionStrategyPoints: auctionPts,
            miniGamePoints: miniPts,
        };
    });

    const rankings = [...baseUsers].sort((a, b) => b.score - a.score);
    const auctionRankings = [...baseUsers].sort((a, b) => b.auctionStrategyPoints - a.auctionStrategyPoints);
    const miniGameRankings = [...baseUsers].sort((a, b) => b.miniGamePoints - a.miniGamePoints);

    const medals = ['🥇', '🥈', '🥉'];

    useEffect(() => {
        const t1 = setTimeout(() => {
            setShowPodium(true);
            playWinnerSound();
        }, 500);
        const t2 = setTimeout(() => setShowRankings(true), 1200);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, []);

    return (
        <Layout>
            <div className="max-w-3xl mx-auto">
                {/* Hero with 3D Trophy */}
                <div className="text-center mb-10 animate-cyber-slide-up">
                    <div className="relative inline-block mb-4">
                        <Trophy3D />
                        {/* Glow ring */}
                        <div className="absolute inset-0 -m-12 rounded-full" style={{
                            background: 'radial-gradient(circle, rgba(255,215,0,0.12) 0%, transparent 70%)',
                            animation: 'pulseGold 2s ease-in-out infinite',
                        }} />
                    </div>
                    <h2 className="text-4xl md:text-5xl font-black mb-2" style={{
                        background: 'linear-gradient(135deg, #FFD700, #EC4899, #A855F7)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>                        <TextRandomizer text="Final Results" delay={200} stagger={50} />
                    </h2>
                    <p className="text-white/40 text-sm tracking-widest uppercase">
                        <TextRandomizer text="IPL Auction Game — Leaderboard" delay={500} stagger={20} />
                    </p>
                    <div className="neon-divider mx-auto mt-3 w-40" />
                </div>

                {/* Dual Winner Highlight */}
                {showPodium && rankings.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* 1. Auction Strategy Champion */}
                        <div className="glass-card p-6 text-center relative overflow-hidden animate-bounce-in"
                            style={{ borderColor: 'rgba(245,158,11,0.3)', boxShadow: '0 0 40px rgba(245,158,11,0.1)' }}>
                            <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(245,158,11,0.05) 0%, transparent 70%)' }} />
                            <div className="relative z-10">
                                <p className="text-xs text-white/40 uppercase tracking-[0.2em] mb-3">
                                    <TextRandomizer text="📋 Best Auction Strategy" delay={600} stagger={30} />
                                </p>
                                <div className="flex justify-center mb-3">
                                    <TeamBadge teamName={auctionRankings[0].teamName} size="large" />
                                </div>
                                <h3 className="text-2xl font-black mb-1" style={{ color: getTeamByName(auctionRankings[0].teamName).color }}>
                                    {getTeamByName(auctionRankings[0].teamName).name}
                                </h3>
                                <p className="text-white/40 text-xs mb-3">{auctionRankings[0].username}</p>
                                <div className="inline-block px-4 py-1.5 rounded-full" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.1))', border: '1px solid rgba(245,158,11,0.25)' }}>
                                    <span className="text-2xl font-black" style={{ color: '#F59E0B', textShadow: '0 0 15px rgba(245,158,11,0.4)' }}>
                                        {auctionRankings[0].auctionStrategyPoints || 0}
                                    </span>
                                    <span className="text-white/30 text-sm ml-1">Pts</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Mini-Game Champion */}
                        <div className="glass-card p-6 text-center relative overflow-hidden animate-bounce-in"
                            style={{ borderColor: 'rgba(168,85,247,0.3)', boxShadow: '0 0 40px rgba(168,85,247,0.1)' }}>
                            <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(168,85,247,0.05) 0%, transparent 70%)' }} />
                            <div className="relative z-10">
                                <p className="text-xs text-white/40 uppercase tracking-[0.2em] mb-3">
                                    <TextRandomizer text="⚔️ Mini-Game Champion" delay={800} stagger={30} />
                                </p>
                                <div className="flex justify-center mb-3">
                                    <TeamBadge teamName={miniGameRankings[0].teamName} size="large" />
                                </div>
                                <h3 className="text-2xl font-black mb-1" style={{ color: getTeamByName(miniGameRankings[0].teamName).color }}>
                                    {getTeamByName(miniGameRankings[0].teamName).name}
                                </h3>
                                <p className="text-white/40 text-xs mb-3">{miniGameRankings[0].username}</p>
                                <div className="inline-block px-4 py-1.5 rounded-full" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(139,92,246,0.1))', border: '1px solid rgba(168,85,247,0.25)' }}>
                                    <span className="text-2xl font-black" style={{ color: '#A855F7', textShadow: '0 0 15px rgba(168,85,247,0.4)' }}>
                                        {miniGameRankings[0].miniGamePoints || 0}
                                    </span>
                                    <span className="text-white/30 text-sm ml-1">Wins</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Overall Podium (Top 3) */}
                {showPodium && rankings.length >= 3 && (
                    <div className="mb-8">
                        <h4 className="text-center text-white/50 text-xs tracking-[0.2em] uppercase mb-4">👑 Overall Combined Grand Champions</h4>
                        <div className="flex items-end justify-center gap-3">
                            <PodiumCard rank={2} user={rankings[1]} height="h-28" delay={0.3} />
                            <PodiumCard rank={1} user={rankings[0]} height="h-36" highlight delay={0.1} />
                            <PodiumCard rank={3} user={rankings[2]} height="h-20" delay={0.5} />
                        </div>
                    </div>
                )}

                {/* Full Rankings */}
                {showRankings && (
                    <div className="space-y-2.5">
                        {rankings.map((user, index) => {
                            const team = getTeamByName(user.teamName);
                            const isExpanded = expandedUser === user.uid;
                            const xiData = playingXIData[user.uid];
                            const squad = squads[user.uid]?.players || [];
                            return (
                                <div key={user.uid}
                                    className={`glass-card overflow-hidden transition-all animate-cyber-slide-up ${index === 0 ? 'animate-pulse-gold' : ''}`}
                                    style={{
                                        animationDelay: `${0.1 + index * 0.1}s`,
                                        borderColor: index === 0 ? 'rgba(255,215,0,0.3)' : undefined,
                                    }}
                                >
                                    {/* Ranking Row — clickable */}
                                    <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                                        onClick={() => setExpandedUser(isExpanded ? null : user.uid)}>
                                        <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-black flex-shrink-0"
                                            style={index < 3 ? {
                                                background: `linear-gradient(135deg, ${team.color}30, ${team.color}10)`,
                                                border: `2px solid ${team.color}50`,
                                                color: team.color,
                                            } : {
                                                background: 'rgba(168,85,247,0.08)',
                                                border: '1px solid rgba(168,85,247,0.15)',
                                                color: 'rgba(255,255,255,0.4)',
                                            }}>
                                            {index < 3 ? medals[index] : index + 1}
                                        </div>

                                        <TeamBadge teamName={user.teamName} />
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-white text-lg truncate">{team.name}</h3>
                                            <p className="text-xs text-white/30">{user.username}</p>
                                        </div>

                                        <div className="text-right flex items-center gap-2">
                                            <div>
                                                <p className={`text-3xl font-black ${index === 0 ? '' : 'text-white'}`}
                                                    style={index === 0 ? { color: '#FFD700', textShadow: '0 0 15px rgba(255,215,0,0.3)' } : {}}>
                                                    {user.score}
                                                </p>
                                                <p className="text-[10px] text-white/20">/10</p>
                                                {user.miniGamePoints > 0 && (
                                                    <p className="text-[10px] text-purple-400/70">+{user.miniGamePoints} 🎮</p>
                                                )}
                                            </div>
                                            <span className="text-white/20 transition-transform duration-300" style={{ transform: isExpanded ? 'rotate(180deg)' : '' }}>▼</span>
                                        </div>
                                    </div>

                                    {/* Expanded Squad View */}
                                    {isExpanded && (
                                        <div className="px-4 pb-4 animate-fade-in" style={{ borderTop: `1px solid ${team.color}15` }}>
                                            {/* Playing XI */}
                                            {xiData?.submitted ? (
                                                <div className="mb-3 mt-3">
                                                    <h4 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(168,85,247,0.6)' }}>Playing XI</h4>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                        {(xiData.playingXI || []).filter(id => !(xiData.impactPlayers || []).includes(id)).map((playerId, idx) => {
                                                            const player = allPlayers.find(p => p.id === playerId);
                                                            if (!player) return null;
                                                            const isCaptain = xiData.captainId === playerId;
                                                            return (
                                                                <div key={playerId} className="flex items-center gap-2 p-2 rounded-xl text-sm"
                                                                    style={{
                                                                        background: isCaptain ? 'rgba(255,215,0,0.06)' : 'rgba(168,85,247,0.04)',
                                                                        border: `1px solid ${isCaptain ? 'rgba(255,215,0,0.15)' : 'rgba(168,85,247,0.08)'}`,
                                                                    }}>
                                                                    <span className="text-[10px] font-bold w-5 text-center" style={{ color: '#A855F7' }}>{idx < 2 ? 'OP' : `#${idx + 1}`}</span>
                                                                    <span className="text-white font-medium flex-1 truncate">{player.playerName}</span>
                                                                    {!isIndian(player.nationality) && <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}>✈️</span>}
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.12)', color: '#C084FC' }}>{player.playerRole}</span>
                                                                    {isCaptain && <span className="text-[10px] font-bold" style={{ color: '#FFD700' }}>👑</span>}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Impact Players */}
                                                    {(xiData.impactPlayers || []).length > 0 && (
                                                        <div className="mt-3">
                                                            <h4 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(59,130,246,0.6)' }}>⚡ Impact Players</h4>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                                {(xiData.impactPlayers || []).map(playerId => {
                                                                    const player = allPlayers.find(p => p.id === playerId);
                                                                    if (!player) return null;
                                                                    return (
                                                                        <div key={playerId} className="flex items-center gap-2 p-2 rounded-xl text-sm"
                                                                            style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.12)' }}>
                                                                            <span className="text-[10px] font-bold text-blue-400 w-5 text-center">⚡</span>
                                                                            <span className="text-white font-medium flex-1 truncate">{player.playerName}</span>
                                                                            {!isIndian(player.nationality) && <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}>✈️</span>}
                                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.12)', color: '#60A5FA' }}>{player.playerRole}</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-white/30 text-xs text-center py-3 mt-3">Playing XI not available</p>
                                            )}

                                            {/* Full Squad */}
                                            <details className="mt-2">
                                                <summary className="text-xs font-bold uppercase tracking-widest cursor-pointer hover:text-white/80 mb-2 transition-colors" style={{ color: 'rgba(168,85,247,0.5)' }}>
                                                    Full Squad ({(squad || []).length} players)
                                                </summary>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2">
                                                    {(squad || []).map(sp => (
                                                        <div key={sp.playerId} className="flex items-center gap-2 p-2 rounded-lg text-xs" style={{ background: 'rgba(168,85,247,0.03)' }}>
                                                            <span className="text-white flex-1 truncate">{sp.playerName}</span>
                                                            {(() => { const pl = allPlayers.find(p => p.id === sp.playerId); return pl && !isIndian(pl.nationality) ? <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}>✈️</span> : null; })()}
                                                            <span className="text-white/30">{sp.type === 'retained' ? '🔒' : `₹${formatPrice(sp.price)}`}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </details>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="text-center mt-10 py-6 animate-fade-in" style={{ animationDelay: '1.5s' }}>
                    <div className="neon-divider mx-auto w-24 mb-4" />
                    <p className="text-white/20 text-sm tracking-wider mb-6">🏏 Game Over — Thanks for playing!</p>
                    
                    <button onClick={() => setShowLeaveConfirm(true)}
                        className="btn-primary text-lg px-10 py-3.5" id="leave-room-btn"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)' }}>
                        🚪 Leave Room
                    </button>

                    {/* Leave Room Confirmation */}
                    {showLeaveConfirm && (
                        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
                            <div style={{ background: 'linear-gradient(145deg,rgba(10,5,25,0.99),rgba(8,4,20,0.99))', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '20px', padding: 'clamp(24px,5vw,40px)', maxWidth: '380px', width: '90%', textAlign: 'center', boxShadow: '0 0 50px rgba(168,85,247,0.12)' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🚪</div>
                                <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'white', margin: '0 0 10px' }}>Leave Room?</h3>
                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: '0 0 24px', lineHeight: 1.6 }}>You'll be taken back to the lobby. The game results will remain accessible if you rejoin with the room code.</p>
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                    <button onClick={() => setShowLeaveConfirm(false)}
                                        style={{ padding: '12px 24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>
                                        Cancel
                                    </button>
                                    <button onClick={leaveRoom}
                                        style={{ padding: '12px 24px', borderRadius: '12px', border: '1px solid rgba(168,85,247,0.35)', background: 'linear-gradient(135deg,#6D28D9,#A855F7)', color: 'white', fontWeight: 900, cursor: 'pointer', fontSize: '14px', boxShadow: '0 0 20px rgba(168,85,247,0.25)' }}>
                                        🚪 Yes, Leave
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>


                {/* Auction Summary */}
                {showRankings && room?.currentAuction?.soldPlayers?.length > 0 && (() => {
                    const soldPlayers = room.currentAuction.soldPlayers;

                    // Top 3 Most Expensive
                    const topExpensive = [...soldPlayers].sort((a, b) => b.price - a.price).slice(0, 3);

                    // Top 3 Best Bargains
                    const withBargainScore = soldPlayers.map(sale => {
                        const playerData = allPlayers.find(p => p.id === sale.playerId);
                        return {
                            ...sale,
                            bargainScore: computeBargainScore(playerData, sale.price),
                            playerData,
                        };
                    }).filter(s => s.bargainScore > 0);
                    const topBargains = [...withBargainScore].sort((a, b) => b.bargainScore - a.bargainScore).slice(0, 3);

                    const medals = ['🥇', '🥈', '🥉'];

                    return (
                        <div className="mt-10 space-y-6 animate-fade-in" style={{ animationDelay: '2s' }}>
                            <h2 className="text-2xl font-black text-center mb-6" style={{
                                background: 'linear-gradient(135deg, #A855F7, #EC4899)',
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            }}>Auction Summary</h2>

                            {/* Most Expensive */}
                            <div className="glass-card p-5">
                                <h3 className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,215,0,0.7)' }}>💰 Top 3 Most Expensive</h3>
                                <div className="space-y-2">
                                    {topExpensive.map((sale, i) => (
                                        <div key={sale.playerId} className="flex items-center gap-3 p-3 rounded-xl" style={{
                                            background: i === 0 ? 'rgba(255,215,0,0.06)' : 'rgba(168,85,247,0.04)',
                                            border: `1px solid ${i === 0 ? 'rgba(255,215,0,0.15)' : 'rgba(168,85,247,0.08)'}`,
                                        }}>
                                            <span className="text-lg">{medals[i]}</span>
                                            <TeamBadge teamName={sale.buyerTeam} size="tiny" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white font-bold text-sm truncate">{sale.playerName}</p>
                                                <p className="text-white/40 text-[10px]">{getTeamByName(sale.buyerTeam).short}</p>
                                            </div>
                                            <span className="text-ipl-gold font-black text-lg">₹{formatPrice(sale.price)}</span>
                                            {sale.viaRTM && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">🔄 RTM</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Best Bargains */}
                            <div className="glass-card p-5">
                                <h3 className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(16,185,129,0.7)' }}>💡 Top 3 Best Bargains</h3>
                                <div className="space-y-2">
                                    {topBargains.map((sale, i) => (
                                        <div key={sale.playerId} className="flex items-center gap-3 p-3 rounded-xl" style={{
                                            background: i === 0 ? 'rgba(16,185,129,0.06)' : 'rgba(168,85,247,0.04)',
                                            border: `1px solid ${i === 0 ? 'rgba(16,185,129,0.15)' : 'rgba(168,85,247,0.08)'}`,
                                        }}>
                                            <span className="text-lg">{medals[i]}</span>
                                            <TeamBadge teamName={sale.buyerTeam} size="tiny" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white font-bold text-sm truncate">{sale.playerName}</p>
                                                <p className="text-white/40 text-[10px]">
                                                    {sale.playerData?.playerRole} |
                                                    {sale.playerData?.playerRole !== 'BOW' ? ` ${sale.playerData?.totalRuns} runs` : ''}
                                                    {(sale.playerData?.playerRole === 'BOW' || sale.playerData?.playerRole === 'AR') ? ` ${sale.playerData?.wickets} wkts` : ''}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-emerald-400 font-black text-lg">₹{formatPrice(sale.price)}</span>
                                                <p className="text-[10px] text-white/30">Score: {sale.bargainScore.toFixed(1)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>
        </Layout>
    );
}

function PodiumCard({ rank, user, height, highlight = false, delay = 0 }) {
    const team = getTeamByName(user.teamName);
    const medals = ['', '🥇', '🥈', '🥉'];

    return (
        <div className="flex flex-col items-center w-28 animate-slide-up" style={{ animationDelay: `${delay}s` }}>
            <TeamBadge teamName={user.teamName} size={highlight ? 'large' : 'normal'} />
            <p className="text-xs font-semibold text-white mt-1 truncate w-full text-center">{team.short}</p>
            <p className="text-xl font-black" style={{ color: '#FFD700', textShadow: '0 0 10px rgba(255,215,0,0.3)' }}>{user.score}</p>
            <div className={`w-full ${height} rounded-t-lg flex items-center justify-center text-3xl font-black transition-all`}
                style={highlight ? {
                    background: `linear-gradient(to top, ${team.color}30, ${team.color}08)`,
                    border: `1px solid ${team.color}40`,
                    boxShadow: `0 0 30px ${team.color}15`,
                } : {
                    background: 'linear-gradient(to top, rgba(168,85,247,0.1), rgba(168,85,247,0.03))',
                    border: '1px solid rgba(168,85,247,0.15)',
                }}>
                {medals[rank]}
            </div>
        </div>
    );
}



