import React, { useState, useEffect, useCallback } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useGame } from '../contexts/GameContext';
import Layout from '../components/Layout';
import PlayerCard from '../components/PlayerCard';
import Timer from '../components/Timer';
import { GAME_PHASES, ROLES } from '../utils/constants';
import { isIndian } from '../utils/helpers';
import TextRandomizer from '../components/TextRandomizer';
import ConfirmModal from '../components/ConfirmModal';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export default function Retention() {
    const { room, roomId, userData, allUsers, advancePhase } = useRoom();
    const { allPlayers, submitRetention, retentionSelections } = useGame();
    const isAuctioneer = userData?.role === ROLES.AUCTIONEER;

    const [selected, setSelected] = useState([]);
    const [submitted, setSubmitted] = useState(false);
    const [timerEnd, setTimerEnd] = useState(null);
    const [showConfirmProceed, setShowConfirmProceed] = useState(false);

    const maxIndian = room?.rules?.maxIndianRetentions || 5;
    const maxOverseas = room?.rules?.maxOverseasRetentions || 2;

    // Get players for my team only
    const myTeam = userData?.assignedTeam;
    const myTeamPlayers = allPlayers.filter(p => p.teamName === myTeam);

    // Check if already submitted
    useEffect(() => {
        if (userData && retentionSelections[userData.uid]?.submitted) {
            setSubmitted(true);
            setSelected(retentionSelections[userData.uid].retainedPlayerIds || []);
        }
    }, [userData, retentionSelections]);

    // Timer management
    useEffect(() => {
        if (room?.retentionTimerEnd) {
            setTimerEnd(room.retentionTimerEnd);
        }
    }, [room?.retentionTimerEnd]);

    const startRetentionTimer = async () => {
        const end = new Date(Date.now() + 90 * 1000).toISOString();
        await updateDoc(doc(db, 'rooms', roomId), {
            retentionTimerEnd: end,
        });
    };

    // Count selections
    const indianSelected = selected.filter(id => {
        const p = allPlayers.find(pl => pl.id === id);
        return p && isIndian(p.nationality);
    }).length;

    const overseasSelected = selected.filter(id => {
        const p = allPlayers.find(pl => pl.id === id);
        return p && !isIndian(p.nationality);
    }).length;

    const togglePlayer = (player) => {
        if (submitted) return;

        setSelected(prev => {
            if (prev.includes(player.id)) {
                return prev.filter(id => id !== player.id);
            }
            // Check limits
            if (isIndian(player.nationality) && indianSelected >= maxIndian) return prev;
            if (!isIndian(player.nationality) && overseasSelected >= maxOverseas) return prev;
            return [...prev, player.id];
        });
    };

    const [submitError, setSubmitError] = useState('');

    const handleSubmit = useCallback(async () => {
        if (submitted) return;
        setSubmitError('');
        try {
            await submitRetention(selected);
            setSubmitted(true);
        } catch (err) {
            console.error('[Retention] submit error:', err);
            setSubmitError(err.message || 'Failed to submit. Please try again.');
        }
    }, [selected, submitted, submitRetention]);

    const handleTimerExpire = useCallback(async () => {
        if (!submitted && !isAuctioneer) {
            await handleSubmit();
        }
    }, [submitted, isAuctioneer, handleSubmit]);

    const handleProceedToAuction = async () => {
        setShowConfirmProceed(true);
    };

    const confirmProceedToAuction = async () => {
        setShowConfirmProceed(false);
        await advancePhase(GAME_PHASES.WATCHLIST);
    };

    // Count submitted
    const teamOwners = allUsers.filter(u => u.role === ROLES.TEAM_OWNER);
    const submittedCount = teamOwners.filter(u => retentionSelections[u.uid]?.submitted).length;

    return (
        <Layout>
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-6 animate-cyber-slide-up">
                    <h2 className="section-title text-3xl mb-2">
                        <TextRandomizer text="🔒 Retention Phase" delay={100} stagger={40} />
                    </h2>
                    <p className="text-white/50 text-sm">
                        <TextRandomizer
                            text={isAuctioneer ? `${submittedCount}/${teamOwners.length} teams submitted` : 'Select players to retain from your team'}
                            delay={300}
                            stagger={20}
                        />
                    </p>
                </div>

                {/* Timer */}
                <div className="flex justify-center mb-6">
                    {timerEnd ? (
                        <Timer endTime={timerEnd} onExpire={handleTimerExpire} size="large" />
                    ) : isAuctioneer ? (
                        <button onClick={startRetentionTimer} className="btn-primary" id="start-retention-timer-btn">
                            ⏱️ Start 90s Retention Timer
                        </button>
                    ) : (
                        <div className="text-white/40 text-sm">Waiting for timer to start...</div>
                    )}
                </div>

                {/* Limits Display */}
                {!isAuctioneer && (
                    <div className="grid grid-cols-2 gap-3 mb-6 animate-stagger-pop" style={{ animationDelay: '0.15s' }}>
                        <div className="glass-card p-3 text-center">
                            <p className="text-xs text-white/50 mb-1">🇮🇳 Indian Retentions</p>
                            <p className="text-2xl font-bold text-emerald-400">{indianSelected} / {maxIndian}</p>
                        </div>
                        <div className="glass-card p-3 text-center">
                            <p className="text-xs text-white/50 mb-1">🌍 Overseas Retentions</p>
                            <p className="text-2xl font-bold text-blue-400">{overseasSelected} / {maxOverseas}</p>
                        </div>
                    </div>
                )}

                {/* Player Grid (Team Owners) */}
                {!isAuctioneer && (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                            {myTeamPlayers.map((player, idx) => (
                                <PlayerCard
                                    key={player.id}
                                    player={player}
                                    selected={selected.includes(player.id)}
                                    onSelect={!submitted ? togglePlayer : undefined}
                                    compact
                                    index={idx}
                                />
                            ))}
                        </div>

                        {!submitted && (
                            <div className="text-center">
                                <button onClick={handleSubmit} className="btn-primary text-lg px-8 py-4" id="submit-retention-btn">
                                    ✅ Submit Retentions ({selected.length} players)
                                </button>
                                <p className="text-xs text-white/30 mt-2">Retained players are FREE — no purse deduction</p>
                                {submitError && (
                                    <div className="mt-3 p-2.5 text-xs text-red-400 text-center rounded-xl" style={{
                                        background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
                                    }}>
                                        ⚠️ {submitError}
                                    </div>
                                )}
                            </div>
                        )}

                        {submitted && (
                            <div className="text-center py-6 animate-fade-in">
                                <div className="text-4xl mb-2">✅</div>
                                <p className="text-emerald-400 font-semibold">Retention submitted!</p>
                                <p className="text-white/40 text-sm mt-1">Waiting for other teams...</p>
                            </div>
                        )}
                    </>
                )}

                {/* Auctioneer View - Submission Status */}
                {isAuctioneer && (
                    <div className="space-y-3">
                        {teamOwners.map(owner => {
                            const retSel = retentionSelections[owner.uid];
                            const hasSubmitted = retSel?.submitted;
                            return (
                                <div key={owner.uid} className={`glass-card p-4 flex items-center justify-between ${hasSubmitted ? 'border-emerald-500/30' : ''}`}>
                                    <div className="flex items-center gap-3">
                                        <span className="font-semibold text-white">{owner.username}</span>
                                        <span className="text-xs text-white/40">{room?.teamAssignments?.[owner.uid]}</span>
                                    </div>
                                    <span className={hasSubmitted ? 'text-emerald-400 font-bold' : 'text-yellow-400'}>
                                        {hasSubmitted ? `✅ ${retSel.retainedPlayerIds?.length || 0} retained` : '⏳ Pending'}
                                    </span>
                                </div>
                            );
                        })}

                        <button
                            onClick={handleProceedToAuction}
                            className="btn-primary w-full text-lg py-4 mt-4"
                            disabled={submittedCount < teamOwners.length && timerEnd && new Date(timerEnd) > new Date()}
                            id="proceed-watchlist-btn"
                        >
                        ➡️ Proceed to Auction →
                        </button>
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={showConfirmProceed}
                title="Proceed to Auction?"
                message="All retention submissions will be finalized. Are you sure you want to proceed to the live auction?"
                onConfirm={confirmProceedToAuction}
                onCancel={() => setShowConfirmProceed(false)}
                confirmText="Start Auction →"
            />
        </Layout>
    );
}
