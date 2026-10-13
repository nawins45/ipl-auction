import React from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useGame } from '../contexts/GameContext';
import Layout from '../components/Layout';
import { GAME_PHASES, ROLES } from '../utils/constants';
import TextRandomizer from '../components/TextRandomizer';

export default function Lobby() {
    const { room, userData, allUsers, advancePhase, leaveRoom } = useRoom();
    const { seedPlayers } = useGame();
    const isAuctioneer = userData?.role === ROLES.AUCTIONEER;
    const teamOwners = allUsers.filter(u =>
        u.role === ROLES.TEAM_OWNER &&
        !(room?.kickedUsers || []).includes(u.uid)
    );

    const handleStartSetup = async () => {
        await advancePhase(GAME_PHASES.RULE_SETUP);
    };

    return (
        <Layout>
            <div className="max-w-2xl mx-auto">
                {/* Room Code HUD */}
                <div className="glass-card p-8 text-center mb-5 animate-cyber-slide-up relative">
                    <p className="text-[10px] text-purple-400/40 uppercase tracking-[0.3em] mb-2">
                        <TextRandomizer text="Access Code" delay={100} stagger={40} />
                    </p>
                    <div className="text-4xl md:text-5xl font-black font-mono tracking-[0.3em] py-2" style={{
                        color: '#FFD700',
                        textShadow: '0 0 20px rgba(255,215,0,0.3), 0 0 40px rgba(255,215,0,0.1)',
                    }}>
                        <TextRandomizer text={room?.code || ''} delay={300} stagger={80} />
                    </div>
                    <p className="text-white/15 text-[10px] mt-1 tracking-wider">
                        <TextRandomizer text="Share with players to join" delay={500} stagger={20} />
                    </p>
                    <div className="neon-divider mx-auto mt-3 w-20" />
                </div>

                {/* Players List */}
                <div className="glass-card p-5 mb-5 animate-stagger-pop" style={{ animationDelay: '0.15s' }}>
                    <h2 className="text-[10px] font-bold text-purple-400/50 uppercase tracking-[0.2em] mb-3">
                        <TextRandomizer text={`Players Connected (${teamOwners.length})`} delay={400} stagger={25} />
                    </h2>

                    {teamOwners.length === 0 ? (
                        <div className="text-center py-8 text-white/20">
                            <div className="w-10 h-10 border border-purple-500/20 rounded mx-auto mb-3 flex items-center justify-center"
                                style={{ clipPath: 'polygon(0 4px, 4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px))' }}>
                                <span className="text-purple-400/40 text-lg">?</span>
                            </div>
                            <p className="text-xs">Waiting for players...</p>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {teamOwners.map((u, i) => (
                                <div key={u.id} className="flex items-center gap-3 p-2.5 animate-stagger-pop" style={{
                                    animationDelay: `${0.3 + i * 0.1}s`,
                                    background: 'rgba(120,50,255,0.04)',
                                    border: '1px solid rgba(140,70,255,0.08)',
                                    clipPath: 'polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 4px 100%, 0 calc(100% - 4px))',
                                }}>
                                    <div className="w-7 h-7 flex items-center justify-center text-xs font-black" style={{
                                        background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.05))',
                                        border: '1px solid rgba(255,215,0,0.2)',
                                        clipPath: 'polygon(0 3px, 3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px))',
                                        color: '#FFD700',
                                    }}>
                                        {i + 1}
                                    </div>
                                    <span className="font-medium text-white/80 text-sm flex-1">
                                        <TextRandomizer text={u.username} delay={400 + i * 100} stagger={35} />
                                    </span>
                                    <div className={`w-1.5 h-1.5 rounded-full ${u.isOnline ? 'bg-emerald-400' : 'bg-red-400'}`}
                                        style={{ boxShadow: u.isOnline ? '0 0 4px rgba(52,211,153,0.5)' : '0 0 4px rgba(248,113,113,0.5)' }} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Auctioneer */}
                {allUsers.filter(u => u.role === ROLES.AUCTIONEER).map(a => (
                    <div key={a.id} className="glass-card p-4 mb-5 flex items-center gap-3 animate-slide-in-left" style={{ borderColor: 'rgba(255,215,0,0.12)', animationDelay: '0.25s' }}>
                        <div className="w-9 h-9 flex items-center justify-center text-lg" style={{
                            background: 'linear-gradient(135deg, rgba(255,215,0,0.1), rgba(255,215,0,0.03))',
                            border: '1px solid rgba(255,215,0,0.2)',
                            clipPath: 'polygon(0 4px, 4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px))',
                        }}>🎙️</div>
                        <div>
                            <p className="font-bold text-sm" style={{ color: '#FFD700' }}>
                                <TextRandomizer text={a.username} delay={300} stagger={40} />
                            </p>
                            <p className="text-[9px] text-white/25 uppercase tracking-wider">
                                <TextRandomizer text="Auctioneer" delay={500} stagger={30} />
                            </p>
                        </div>
                    </div>
                ))}

                {/* Actions */}
                {isAuctioneer && (
                    <div className="space-y-2 animate-stagger-pop" style={{ animationDelay: '0.4s' }}>
                        <button onClick={handleStartSetup} className="btn-primary w-full text-sm py-3.5"
                            disabled={teamOwners.length < 2} id="start-setup-btn">
                            ▶ Proceed to Rule Setup
                            {teamOwners.length < 2 && (
                                <span className="block text-[10px] font-normal opacity-50 mt-0.5 normal-case">Need at least 2 players</span>
                            )}
                        </button>
                        <button onClick={seedPlayers} className="btn-secondary w-full text-xs" id="seed-players-btn">
                            Seed Players
                        </button>
                    </div>
                )}

                {!isAuctioneer && (
                    <div className="text-center py-6 text-white/20 animate-fade-in">
                        <div className="w-8 h-8 border border-purple-500/20 rounded mx-auto mb-3 animate-pulse flex items-center justify-center text-purple-400/30 text-sm"
                            style={{ clipPath: 'polygon(0 4px, 4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px))' }}>⏳</div>
                        <p className="text-xs">Waiting for Auctioneer to start...</p>
                    </div>
                )}

                <div className="mt-8 relative">
                    <div className="absolute inset-0 bg-red-500/10 blur-xl rounded-full" />
                    <button onClick={leaveRoom} className="relative w-full py-4 rounded-xl font-bold uppercase tracking-widest text-sm transition-all transform hover:scale-[1.02] hover:bg-red-500/20 active:scale-[0.98]" style={{
                        color: '#F87171',
                        border: '1px solid rgba(248,113,113,0.3)',
                        background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(153,27,27,0.05))',
                        boxShadow: '0 0 20px rgba(239,68,68,0.1)'
                    }}>
                        🚪 Leave Room
                    </button>
                </div>
            </div>
        </Layout>
    );
}
