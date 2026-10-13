import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useRoom } from '../contexts/RoomContext';
import Layout from '../components/Layout';
import { GAME_PHASES, ROLES } from '../utils/constants';
import TextRandomizer from '../components/TextRandomizer';
import ConfirmModal from '../components/ConfirmModal';

export default function RuleSetup() {
    const { room, roomId, userData, advancePhase } = useRoom();
    const isAuctioneer = userData?.role === ROLES.AUCTIONEER;
    const isLocked = room?.rulesLocked;

    // Use Firestore rules as source of truth; fall back to defaults for auctioneer editing
    const firestoreRules = room?.rules || {};

    const [showConfirmProceed, setShowConfirmProceed] = useState(false);
    const [gameMode, setGameMode] = useState(room?.gameMode || 'CLASSIC');

    const [rules, setRules] = useState({
        totalPurse: firestoreRules.totalPurse || 120,
        maxSquadSize: firestoreRules.maxSquadSize || 25,
        maxIndianRetentions: firestoreRules.maxIndianRetentions || 5,
        maxOverseasRetentions: firestoreRules.maxOverseasRetentions || 2,
        bidTimerDuration: firestoreRules.bidTimerDuration || 30,
        minBidIncrement: firestoreRules.minBidIncrement || 25,
        maxImpactPlayers: firestoreRules.maxImpactPlayers || 1,
        rtmEnabled: firestoreRules.rtmEnabled || false,
        rtmCardsPerTeam: firestoreRules.rtmCardsPerTeam || 2,
    });

    // Sync from Firestore when rules change (for non-auctioneer users or when locked)
    useEffect(() => {
        if (room?.rules) {
            setRules({
                totalPurse: room.rules.totalPurse || 120,
                maxSquadSize: room.rules.maxSquadSize || 25,
                maxIndianRetentions: room.rules.maxIndianRetentions || 5,
                maxOverseasRetentions: room.rules.maxOverseasRetentions || 2,
                bidTimerDuration: room.rules.bidTimerDuration || 30,
                minBidIncrement: room.rules.minBidIncrement || 25,
                maxImpactPlayers: room.rules.maxImpactPlayers || 1,
                rtmEnabled: room.rules.rtmEnabled || false,
                rtmCardsPerTeam: room.rules.rtmCardsPerTeam || 2,
            });
        }
    }, [room?.rules]);

    // Sync gameMode from Firestore
    useEffect(() => {
        if (room?.gameMode) setGameMode(room.gameMode);
    }, [room?.gameMode]);

    const handleChange = (field, value) => {
        setRules(prev => ({ ...prev, [field]: Number(value) }));
    };

    const handleSave = async () => {
        await updateDoc(doc(db, 'rooms', roomId), { rules, gameMode });
    };

    const handleLock = async () => {
        await updateDoc(doc(db, 'rooms', roomId), {
            rules,
            gameMode,
            rulesLocked: true,
        });
    };

    const handleProceed = async () => {
        setShowConfirmProceed(true);
    };

    const confirmProceed = async () => {
        setShowConfirmProceed(false);
        await advancePhase(GAME_PHASES.TEAM_ASSIGNMENT);
    };

    const ruleFields = [
        { key: 'totalPurse', label: 'Total Purse', unit: 'Crores', icon: '💰', min: 50, max: 300, step: 5 },
        { key: 'maxSquadSize', label: 'Max Squad Size', unit: 'Players', icon: '👥', min: 15, max: 30, step: 1 },
        { key: 'maxIndianRetentions', label: 'Max Indian Retentions', unit: 'Players', icon: '🇮🇳', min: 0, max: 10, step: 1 },
        { key: 'maxOverseasRetentions', label: 'Max Overseas Retentions', unit: 'Players', icon: '🌍', min: 0, max: 5, step: 1 },
        { key: 'maxImpactPlayers', label: 'Impact Players', unit: 'Players', icon: '⚡', min: 0, max: 5, step: 1 },
        { key: 'bidTimerDuration', label: 'Bid Timer', unit: 'Seconds', icon: '⏱️', min: 10, max: 120, step: 5 },
        { key: 'minBidIncrement', label: 'Min Bid Increment', unit: 'Lakhs', icon: '📈', min: 5, max: 100, step: 5 },
    ];

    const handleRtmToggle = () => {
        setRules(prev => ({ ...prev, rtmEnabled: !prev.rtmEnabled }));
    };

    return (
        <Layout>
            <div className="max-w-2xl mx-auto">
                <div className="text-center mb-6 animate-cyber-slide-up">
                    <div className="text-5xl mb-3">⚙️</div>
                    <h2 className="text-3xl font-black mb-2" style={{
                        background: 'linear-gradient(135deg, #A855F7, #EC4899, #FFD700)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}><TextRandomizer text="Auction Rules" delay={100} stagger={45} /></h2>
                    <p className="text-white/50 text-sm">
                        <TextRandomizer
                            text={isAuctioneer ? 'Configure the auction rules before starting' : (isLocked ? 'Rules have been locked by the auctioneer' : 'Waiting for auctioneer to set rules...')}
                            delay={300}
                            stagger={15}
                        />
                    </p>
                </div>

                {/* Locked indicator for non-auctioneer */}
                {isLocked && !isAuctioneer && (
                    <div className="text-center mb-4 py-3 rounded-2xl animate-fade-in" style={{
                        background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                    }}>
                        <span className="text-emerald-400 font-semibold text-sm">✅ Rules Locked — Waiting for next phase</span>
                    </div>
                )}

                <div className="glass-card p-6 animate-stagger-pop" style={{ animationDelay: '0.15s' }}>
                    <div className="space-y-5">
                        {ruleFields.map((field, i) => (
                            <div key={field.key} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm text-white/80 flex items-center gap-2">
                                        <span>{field.icon}</span>
                                        <span>{field.label}</span>
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl font-bold" style={{ color: '#C084FC' }}>{rules[field.key]}</span>
                                        <span className="text-xs text-white/40">{field.unit}</span>
                                    </div>
                                </div>
                                {isAuctioneer && !isLocked ? (
                                    <input
                                        type="range"
                                        min={field.min}
                                        max={field.max}
                                        step={field.step}
                                        value={rules[field.key]}
                                        onChange={e => handleChange(field.key, e.target.value)}
                                        className="w-full cursor-pointer"
                                        id={`rule-${field.key}`}
                                    />
                                ) : (
                                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(168,85,247,0.1)' }}>
                                        <div className="h-full rounded-full transition-all duration-500"
                                            style={{
                                                width: `${((rules[field.key] - field.min) / (field.max - field.min)) * 100}%`,
                                                background: 'linear-gradient(90deg, #A855F7, #EC4899)',
                                            }} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* ── Game Mode Selector ── */}
                    <div className="mt-6 p-4 rounded-xl" style={{ background: 'rgba(255,215,0,0.03)', border: '1px solid rgba(255,215,0,0.12)' }}>
                        <p className="text-[10px] font-bold text-yellow-400/60 uppercase tracking-[0.25em] mb-3">🎮 Game Mode</p>
                        <div className="grid grid-cols-1 gap-2">
                            {[
                                { key: 'CLASSIC', icon: '🏏', label: 'Classic Auction', desc: 'Full player details visible during bidding' },
                                { key: 'MINI_GAME', icon: '⚡', label: 'Auction + Mini-Game', desc: 'Auction followed by a 5-card stat battle round' },
                                { key: 'BLIND', icon: '🕵️', label: 'Blind Auction', desc: 'Stats visible, names revealed only after sale' },
                            ].map(mode => {
                                const isActive = gameMode === mode.key;
                                const canChange = isAuctioneer && !isLocked;
                                return (
                                    <button
                                        key={mode.key}
                                        onClick={() => canChange && setGameMode(mode.key)}
                                        disabled={!canChange}
                                        style={{
                                            padding: '12px 14px',
                                            borderRadius: '10px',
                                            border: isActive ? '1.5px solid rgba(255,215,0,0.45)' : '1px solid rgba(255,255,255,0.07)',
                                            background: isActive ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.02)',
                                            cursor: canChange ? 'pointer' : 'default',
                                            textAlign: 'left',
                                            transition: 'all 0.2s',
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            boxShadow: isActive ? '0 0 20px rgba(255,215,0,0.08)' : 'none',
                                        }}
                                        id={`mode-${mode.key.toLowerCase()}`}
                                    >
                                        <span style={{ fontSize: '1.6rem' }}>{mode.icon}</span>
                                        <div style={{ flex: 1 }}>
                                            <p style={{ fontWeight: 700, fontSize: '13px', color: isActive ? '#FFD700' : 'rgba(255,255,255,0.6)', margin: 0 }}>{mode.label}</p>
                                            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', margin: '2px 0 0' }}>{mode.desc}</p>
                                        </div>
                                        {isActive && <span style={{ color: '#FFD700', fontSize: '16px' }}>✓</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* RTM Section */}
                    <div className="mt-6 p-4 rounded-xl" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)' }}>
                        <div className="flex items-center justify-between mb-3">
                            <label className="text-sm text-white/80 flex items-center gap-2">
                                <span>🔄</span>
                                <span>Right to Match (RTM)</span>
                            </label>
                            {isAuctioneer && !isLocked ? (
                                <button
                                    onClick={handleRtmToggle}
                                    className={`relative w-12 h-6 rounded-full transition-all duration-300 ${rules.rtmEnabled ? 'bg-purple-600' : 'bg-white/10'}`}
                                    id="rtm-toggle"
                                >
                                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-300 ${rules.rtmEnabled ? 'left-[26px]' : 'left-0.5'}`} />
                                </button>
                            ) : (
                                <span className={`text-sm font-bold ${rules.rtmEnabled ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {rules.rtmEnabled ? 'ON' : 'OFF'}
                                </span>
                            )}
                        </div>
                        {rules.rtmEnabled && (
                            <div className="animate-fade-in">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-white/50">RTM Cards per Team</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl font-bold" style={{ color: '#C084FC' }}>{rules.rtmCardsPerTeam}</span>
                                        <span className="text-xs text-white/40">cards</span>
                                    </div>
                                </div>
                                {isAuctioneer && !isLocked ? (
                                    <input
                                        type="range"
                                        min={1}
                                        max={5}
                                        step={1}
                                        value={rules.rtmCardsPerTeam}
                                        onChange={e => handleChange('rtmCardsPerTeam', e.target.value)}
                                        className="w-full cursor-pointer"
                                        id="rule-rtmCardsPerTeam"
                                    />
                                ) : (
                                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(168,85,247,0.1)' }}>
                                        <div className="h-full rounded-full transition-all duration-500"
                                            style={{
                                                width: `${((rules.rtmCardsPerTeam - 1) / 4) * 100}%`,
                                                background: 'linear-gradient(90deg, #A855F7, #EC4899)',
                                            }} />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {isAuctioneer && (
                        <div className="mt-8 space-y-3">
                            {!isLocked ? (
                                <>
                                    <button onClick={handleSave} className="btn-secondary w-full" id="save-rules-btn">
                                        💾 Save Rules
                                    </button>
                                    <button onClick={handleLock} className="btn-primary w-full" id="lock-rules-btn">
                                        🔒 Lock Rules
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="text-center py-3 rounded-2xl font-semibold" style={{
                                        background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#4ADE80',
                                    }}>
                                        ✅ Rules Locked
                                    </div>
                                    <button onClick={handleProceed} className="btn-primary w-full text-lg py-4" id="proceed-team-btn">
                                        🏏 Proceed to Team Assignment →
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={showConfirmProceed}
                title="Proceed to Team Assignment?"
                message="Rules are locked. Are you sure you want to proceed to team assignment?"
                onConfirm={confirmProceed}
                onCancel={() => setShowConfirmProceed(false)}
                confirmText="Proceed →"
            />
        </Layout>
    );
}
