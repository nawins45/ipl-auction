import React, { useState } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useGame } from '../contexts/GameContext';
import Layout from '../components/Layout';
import TeamBadge from '../components/TeamBadge';
import ConfirmModal from '../components/ConfirmModal';
import { ROLES, GAME_PHASES, getTeamByName } from '../utils/constants';
import { formatPrice, isIndian } from '../utils/helpers';
import TextRandomizer from '../components/TextRandomizer';

export default function Scoring() {
    const { room, userData, allUsers, advancePhase } = useRoom();
    const { allPlayers, squads, playingXIData, submitScore, publishResults, scores, startMiniGame } = useGame();
    const isAuctioneer = userData?.role === ROLES.AUCTIONEER;
    const teamOwners = allUsers.filter(u => u.role === ROLES.TEAM_OWNER);

    const [expandedUser, setExpandedUser] = useState(null);
    const [localScores, setLocalScores] = useState({});
    const [showConfirmPublish, setShowConfirmPublish] = useState(false);

    if (!isAuctioneer) {
        return (
            <Layout>
                <div className="max-w-2xl mx-auto text-center py-16 animate-fade-in">
                    <div className="text-7xl mb-6 animate-float">📊</div>
                    <h2 className="text-3xl font-black mb-3" style={{
                        background: 'linear-gradient(135deg, #A855F7, #EC4899, #FFD700)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>Scoring in Progress</h2>
                    <p className="text-white/50 mb-8">The Auctioneer is reviewing each team's Playing XI and assigning scores...</p>
                    <div className="glass-card p-8 inline-block">
                        {/* Pulsing radar rings */}
                        <div className="relative w-20 h-20 mx-auto mb-4">
                            <div className="absolute inset-0 rounded-full" style={{ border: '2px solid rgba(168,85,247,0.3)', animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }} />
                            <div className="absolute inset-0 rounded-full" style={{ border: '2px solid rgba(168,85,247,0.15)', animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite', animationDelay: '0.5s' }} />
                            <div className="w-full h-full rounded-full flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)' }}>
                                <span className="text-3xl">⏳</span>
                            </div>
                        </div>
                        <p className="text-white/40 text-sm">Hold tight — results will be announced soon!</p>
                        
                    </div>
                </div>
            </Layout>
        );
    }

    const handleScoreChange = (userId, score) => {
        setLocalScores(prev => ({ ...prev, [userId]: Math.min(10, Math.max(0, Number(score) || 0)) }));
    };

    const handleSubmitScore = async (userId) => {
        const score = localScores[userId] ?? 0;
        const teamName = room?.teamAssignments?.[userId] || '';
        await submitScore(userId, score, teamName);
    };

    const handlePublish = async () => {
        setShowConfirmPublish(true);
    };

    const confirmPublish = async () => {
        setShowConfirmPublish(false);
        if (room?.gameMode === 'MINI_GAME') { await startMiniGame(); } else { await publishResults(); }
    };

    const allScored = teamOwners.every(u => scores[u.uid]);

    return (
        <Layout>
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-6 animate-cyber-slide-up">
                    <div className="text-5xl mb-3">📊</div>
                    <h2 className="text-3xl font-black mb-2" style={{
                        background: 'linear-gradient(135deg, #A855F7, #EC4899, #FFD700)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}><TextRandomizer text="Score Teams" delay={100} stagger={50} /></h2>
                    <p className="text-white/50 text-sm">
                        <TextRandomizer text="Review each team's Playing XI and assign a score out of 10" delay={300} stagger={15} />
                    </p>
                </div>

                <div className="space-y-4">
                    {teamOwners.map((owner, i) => {
                        const teamName = room?.teamAssignments?.[owner.uid];
                        const team = getTeamByName(teamName);
                        const xiData = playingXIData[owner.uid];
                        const squad = squads[owner.uid]?.players || [];
                        const isExpanded = expandedUser === owner.uid;
                        const existingScore = scores[owner.uid]?.score;
                        const localScore = localScores[owner.uid];

                        return (
                            <div key={owner.uid} className="glass-card overflow-hidden animate-cyber-slide-up"
                                style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
                                {/* Header */}
                                <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                                    onClick={() => setExpandedUser(isExpanded ? null : owner.uid)}>
                                    <div className="flex items-center gap-3">
                                        <TeamBadge teamName={teamName} />
                                        <div>
                                            <h3 className="font-bold text-white">{team.name}</h3>
                                            <p className="text-[10px] text-white/30">{owner.username}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {existingScore !== undefined && (
                                            <span className="text-2xl font-black" style={{ color: '#FFD700', textShadow: '0 0 10px rgba(255,215,0,0.3)' }}>
                                                {existingScore}/10
                                            </span>
                                        )}
                                        <span className="text-white/30 transition-transform duration-300" style={{ transform: isExpanded ? 'rotate(180deg)' : '' }}>▼</span>
                                    </div>
                                </div>

                                {/* Expanded */}
                                {isExpanded && (
                                    <div className="p-4 animate-fade-in" style={{ borderTop: `1px solid ${team.color}20` }}>
                                        {/* Playing XI */}
                                        {xiData?.submitted ? (
                                            <div className="mb-4">
                                                <h4 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(168,85,247,0.6)' }}>Playing XI</h4>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                    {(xiData.playingXI || []).filter(id => !(xiData.impactPlayers || []).includes(id)).map((playerId, idx) => {
                                                        const player = allPlayers.find(p => p.id === playerId);
                                                        if (!player) return null;
                                                        const isCaptain = xiData.captainId === playerId;
                                                        return (
                                                            <div key={playerId} className="flex items-center gap-2 p-2.5 rounded-xl text-sm transition-all"
                                                                style={{
                                                                    background: isCaptain ? 'rgba(255,215,0,0.06)' : 'rgba(168,85,247,0.04)',
                                                                    border: `1px solid ${isCaptain ? 'rgba(255,215,0,0.15)' : 'rgba(168,85,247,0.08)'}`,
                                                                }}>
                                                                <span className="text-[10px] font-bold w-5 text-center" style={{ color: '#A855F7' }}>
                                                                    {idx < 2 ? 'OP' : `#${idx + 1}`}
                                                                </span>
                                                                <span className="text-white font-medium flex-1 truncate">{player.playerName}</span>
                                                                {!isIndian(player.nationality) && <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}>✈️</span>}
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.12)', color: '#C084FC' }}>{player.playerRole}</span>
                                                                {isCaptain && <span className="text-[10px] font-bold" style={{ color: '#FFD700' }}>👑</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Impact Players Section */}
                                                {(xiData.impactPlayers || []).length > 0 && (
                                                    <div className="mt-3">
                                                        <h4 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(59,130,246,0.6)' }}>⚡ Impact Players</h4>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                            {(xiData.impactPlayers || []).map(playerId => {
                                                                const player = allPlayers.find(p => p.id === playerId);
                                                                if (!player) return null;
                                                                return (
                                                                    <div key={playerId} className="flex items-center gap-2 p-2.5 rounded-xl text-sm"
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
                                            <p className="text-white/40 text-sm mb-4 py-3 text-center rounded-xl" style={{ background: 'rgba(168,85,247,0.04)' }}>Playing XI not submitted</p>
                                        )}

                                        {/* Full Squad */}
                                        <details className="mb-4">
                                            <summary className="text-xs font-bold uppercase tracking-widest cursor-pointer hover:text-white/80 mb-2 transition-colors" style={{ color: 'rgba(168,85,247,0.5)' }}>
                                                Full Squad ({squad.length} players)
                                            </summary>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2">
                                                {squad.map(sp => (
                                                    <div key={sp.playerId} className="flex items-center gap-2 p-2 rounded-lg text-xs" style={{ background: 'rgba(168,85,247,0.03)' }}>
                                                        <span className="text-white flex-1 truncate">{sp.playerName}</span>
                                                        {(() => { const pl = allPlayers.find(p => p.id === sp.playerId); return pl && !isIndian(pl.nationality) ? <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}>✈️</span> : null; })()}
                                                        <span className="text-white/30">{sp.type === 'retained' ? '🔒' : `₹${formatPrice(sp.price)}`}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </details>

                                        {/* Score Input */}
                                        <div className="flex items-center gap-3 p-4 rounded-xl" style={{
                                            background: 'linear-gradient(135deg, rgba(168,85,247,0.06), rgba(15,10,40,0.4))',
                                            border: '1px solid rgba(168,85,247,0.15)',
                                        }}>
                                            <span className="text-sm text-white/60">Score:</span>
                                            <input
                                                type="number" min="0" max="10" step="0.5"
                                                className="input-field w-20 text-center text-xl font-bold"
                                                value={localScore ?? existingScore ?? ''}
                                                onChange={e => handleScoreChange(owner.uid, e.target.value)}
                                            />
                                            <span className="text-white/40">/ 10</span>
                                            <button onClick={() => handleSubmitScore(owner.uid)} className="btn-primary text-sm ml-auto">
                                                {existingScore !== undefined ? '✏️ Update' : '✅ Submit'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="mt-8 text-center">
                    <button onClick={handlePublish} className="btn-primary text-xl px-12 py-4"
                        disabled={!allScored} id="publish-results-btn">
                        {room?.gameMode === 'MINI_GAME' ? '?? Start Mini-Game Battle' : '?? Publish Results'}
                    </button>
                    {!allScored && (
                        <p className="text-xs text-white/30 mt-2">{room?.gameMode === 'MINI_GAME' ? 'Score all Playing XIs before starting battle' : 'Score all teams before publishing'}</p>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={showConfirmPublish}
                title={room?.gameMode === 'MINI_GAME' ? 'Start Mini-Game?' : 'Publish Results?'}
                message={room?.gameMode === 'MINI_GAME' ? "Scores will be finalized and users will be redirected to the mini-game. Are you sure?" : "Scores will be finalized and results will be shown to all players. Are you sure?"}
                onConfirm={confirmPublish}
                onCancel={() => setShowConfirmPublish(false)}
                confirmText={room?.gameMode === 'MINI_GAME' ? "Start ??" : "Publish ??"}
            />
        </Layout >
    );
}




