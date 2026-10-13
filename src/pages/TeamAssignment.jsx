import React from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useGame } from '../contexts/GameContext';
import Layout from '../components/Layout';
import TeamBadge from '../components/TeamBadge';
import { GAME_PHASES, ROLES, getTeamByName } from '../utils/constants';
import TextRandomizer from '../components/TextRandomizer';

export default function TeamAssignment() {
    const { room, userData, allUsers, advancePhase } = useRoom();
    const { assignTeams, shuffleMyTeam, forceShuffleTeams, forceShuffleUser } = useGame();
    const isAuctioneer = userData?.role === ROLES.AUCTIONEER;
    const teamOwners = allUsers.filter(u => u.role === ROLES.TEAM_OWNER);
    const hasAssignments = room?.teamAssignments && Object.keys(room.teamAssignments).length > 0;
    const hasUsedShuffle = room?.shufflesUsed?.[userData?.uid];

    const handleAssign = async () => {
        await assignTeams();
    };

    const handleShuffle = async () => {
        await shuffleMyTeam();
    };

    const handleProceed = async () => {
        await advancePhase(GAME_PHASES.RETENTION);
    };

    return (
        <Layout>
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-6 animate-cyber-slide-up">
                    <h2 className="section-title text-3xl mb-2">
                        <TextRandomizer text="🏏 Team Assignment" delay={100} stagger={40} />
                    </h2>
                    <p className="text-white/50 text-sm">
                        <TextRandomizer
                            text={isAuctioneer ? 'Assign IPL teams to players' : 'Your IPL team will be assigned'}
                            delay={300}
                            stagger={20}
                        />
                    </p>
                    {/* Game Mode Badge */}
                    {room?.gameMode && room.gameMode !== 'CLASSIC' && (
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mt-2 mb-1" style={{
                            background: room.gameMode === 'BLIND' ? 'rgba(99,102,241,0.15)' : 'rgba(168,85,247,0.15)',
                            border: `1px solid ${room.gameMode === 'BLIND' ? 'rgba(99,102,241,0.35)' : 'rgba(168,85,247,0.35)'}`,
                        }}>
                            <span style={{ fontSize: '14px' }}>{room.gameMode === 'BLIND' ? '🕵️' : '⚡'}</span>
                            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: room.gameMode === 'BLIND' ? '#818CF8' : '#C084FC' }}>
                                {room.gameMode === 'BLIND' ? 'BLIND AUCTION MODE' : 'MINI-GAME MODE'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Auctioneer Controls */}
                {isAuctioneer && (
                    <div className="glass-card p-4 mb-6 flex flex-wrap gap-3 justify-center animate-stagger-pop" style={{ animationDelay: '0.15s' }}>
                        <button onClick={handleAssign} className="btn-primary" id="assign-teams-btn">
                            🎲 {hasAssignments ? 'Re-assign All Teams' : 'Assign Teams Randomly'}
                        </button>
                        {hasAssignments && (
                            <button onClick={handleProceed} className="btn-primary" id="proceed-retention-btn">
                                🔒 Proceed to Retention →
                            </button>
                        )}
                    </div>
                )}

                {/* Team Display */}
                {hasAssignments ? (
                    <div className="grid gap-4 md:grid-cols-2">
                        {teamOwners.map((owner, index) => {
                            const teamName = room.teamAssignments[owner.uid];
                            const team = getTeamByName(teamName);
                            const isMe = owner.uid === userData?.uid;

                            return (
                                <div
                                    key={owner.uid}
                                    className={`glass-card p-5 animate-cyber-slide-up transition-all duration-300 hover:scale-[1.02] ${isMe ? 'border-ipl-gold/40 ring-1 ring-ipl-gold/20' : ''}`}
                                    style={{ animationDelay: `${0.1 + index * 0.12}s` }}
                                >
                                    <div className="flex items-center gap-4">
                                        <TeamBadge teamName={teamName} size="large" />
                                        <div className="flex-1">
                                            <h3 className="font-bold text-white text-lg">
                                                <TextRandomizer text={owner.username} delay={300 + index * 100} stagger={35} />
                                            </h3>
                                            <p className="text-sm font-semibold" style={{ color: team.color }}>
                                                <TextRandomizer text={team.name} delay={400 + index * 100} stagger={30} />
                                            </p>
                                            {isMe && (
                                                <span className="text-[10px] text-ipl-gold uppercase tracking-wider">Your Team</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Per-user shuffle (only for own team) */}
                                    {isMe && !isAuctioneer && (
                                        <div className="mt-3">
                                            <button
                                                onClick={handleShuffle}
                                                className="btn-secondary w-full text-sm"
                                                disabled={hasUsedShuffle}
                                                id="shuffle-my-team-btn"
                                            >
                                                {hasUsedShuffle ? '✅ Shuffle Used' : '🔄 Shuffle My Team (1 use)'}
                                            </button>
                                        </div>
                                    )}

                                    {/* Auctioneer: force shuffle this specific user */}
                                    {isAuctioneer && (
                                        <div className="mt-3">
                                            <button
                                                onClick={() => forceShuffleUser(owner.uid)}
                                                className="btn-secondary w-full text-xs py-1.5"
                                            >
                                                🔄 Shuffle {owner.username}'s Team
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-12 text-white/40 animate-fade-in">
                        <div className="text-5xl mb-3 animate-float">🎲</div>
                        <p>{isAuctioneer ? 'Click above to assign teams' : 'Waiting for team assignment...'}</p>
                    </div>
                )}
            </div>
        </Layout>
    );
}
