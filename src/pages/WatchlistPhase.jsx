import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { GAME_PHASES, ROLES, getTeamByName } from '../utils/constants';
import { formatPrice, isIndian } from '../utils/helpers';
import TextRandomizer from '../components/TextRandomizer';
import TeamBadge from '../components/TeamBadge';
import { doc, updateDoc, collection, onSnapshot, query, where, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export default function WatchlistPhase() {
    const { room, roomId, userData, allUsers } = useRoom();
    const { allPlayers, startAuction, squads, retentionSelections } = useGame();
    const { user } = useAuth();

    const isAuctioneer = userData?.role === ROLES.AUCTIONEER;

    // Local watchlist state
    const [watchlist, setWatchlist] = useState(() => {
        try { return new Set(JSON.parse(localStorage.getItem(`watchlist_${room?.code}`) || '[]')); }
        catch { return new Set(); }
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('all'); // all, marquee, bat, bow, ar, wk

    // Filter available players (excluding retained players)
    const availablePlayers = useMemo(() => {
        // Collect all retained player IDs
        const retainedIds = new Set();
        Object.values(retentionSelections || {}).forEach(sel => {
            (sel.retainedPlayerIds || []).forEach(id => retainedIds.add(id));
        });
        return allPlayers.filter(p => !retainedIds.has(p.id));
    }, [allPlayers, retentionSelections]);

    // Filtered list based on search and tab
    const filteredPlayers = useMemo(() => {
        return availablePlayers.filter(p => {
            const matchesSearch = p.playerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                 p.teamName.toLowerCase().includes(searchQuery.toLowerCase());
            
            if (!matchesSearch) return false;
            if (activeFilter === 'all') return true;
            if (activeFilter === 'marquee') return p.marquee;
            if (activeFilter === 'bat') return p.playerRole === 'BAT';
            if (activeFilter === 'bow') return p.playerRole === 'BOW';
            if (activeFilter === 'ar') return p.playerRole === 'AR';
            if (activeFilter === 'wk') return p.playerRole === 'WK' || p.playerRole === 'WK ';
            return true;
        });
    }, [availablePlayers, searchQuery, activeFilter]);

    // Save watchlist to localStorage
    useEffect(() => {
        if (room?.code) {
            localStorage.setItem(`watchlist_${room.code}`, JSON.stringify([...watchlist]));
            
            // Sync count to Firestore user doc so auctioneer/others can see progress
            if (user?.uid) {
                updateDoc(doc(db, 'users', user.uid), {
                    watchlistCount: watchlist.size,
                    updatedAt: serverTimestamp()
                }).catch(e => console.error("Error updating watchlistCount", e));
            }
        }
    }, [watchlist, room?.code, user?.uid]);

    const toggleWatchlist = (playerId) => {
        setWatchlist(prev => {
            const next = new Set(prev);
            if (next.has(playerId)) next.delete(playerId);
            else next.add(playerId);
            return next;
        });
    };

    const handleStartLiveAuction = async () => {
        if (!isAuctioneer) return;
        try {
            await startAuction();
        } catch (e) {
            console.error("Failed to start auction", e);
        }
    };

    const teamOwners = allUsers.filter(u => u.role === ROLES.TEAM_OWNER);

    return (
        <Layout>
            <div className="max-w-6xl mx-auto px-4">
                {/* Header Section */}
                <div className="text-center mb-6 animate-cyber-slide-up">
                    <h2 className="section-title text-3xl mb-2">
                        <TextRandomizer text="⭐ Watchlist Targeting Phase" delay={100} stagger={40} />
                    </h2>
                    <p className="text-white/50 text-sm max-w-xl mx-auto mt-2">
                        {isAuctioneer
                            ? "Waiting for team owners to select their target players. You can start the live auction when they are ready."
                            : "Star the players you are targeting in the auction. Watchlisted targets will trigger large screen alerts and special highlights when they come up in the live bidding!"
                        }
                    </p>
                </div>

                {isAuctioneer ? (
                    // --- AUCTIONEER VIEW ---
                    <div className="max-w-2xl mx-auto space-y-6">
                        <div className="glass-card p-6 border-emerald-500/20">
                            <h3 className="text-lg font-black text-white mb-4 uppercase tracking-wider flex items-center gap-2">
                                <span>📋</span> Team Preparation Progress
                            </h3>
                            <div className="space-y-3">
                                {teamOwners.map(owner => {
                                    const team = getTeamByName(room?.teamAssignments?.[owner.uid] || '');
                                    const starredCount = owner.watchlistCount || 0;
                                    return (
                                        <div key={owner.uid} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                                            <div className="flex items-center gap-3">
                                                <TeamBadge teamName={team.name} size="small" />
                                                <div>
                                                    <p className="text-sm font-bold text-white">{team.short} ({owner.username})</p>
                                                    <p className="text-[10px] text-white/30">Roster Limit: 8 Overseas</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                                                style={{ background: starredCount > 0 ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)', color: starredCount > 0 ? '#FFD700' : 'rgba(255,255,255,0.3)' }}>
                                                ⭐ {starredCount} targets
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="text-center pt-4">
                            <button
                                onClick={handleStartLiveAuction}
                                className="btn-primary text-xl px-12 py-5 animate-pulse-neon shadow-emerald-500/20"
                                id="start-live-auction-btn"
                            >
                                🔨 Start Live Auction →
                            </button>
                            <p className="text-xs text-white/30 mt-2">Proceeding will freeze targets and initialize the auction queue.</p>
                        </div>
                    </div>
                ) : (
                    // --- TEAM OWNER VIEW ---
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        
                        {/* Sidebar: Starred Targets Summary */}
                        <div className="lg:col-span-1 space-y-4">
                            <div className="glass-card p-4 border-yellow-400/20">
                                <h3 className="text-sm font-black text-white mb-3 uppercase tracking-wider flex items-center justify-between">
                                    <span>🎯 Starred Targets</span>
                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400">{watchlist.size}</span>
                                </h3>
                                <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
                                    {[...watchlist].map(pid => {
                                        const p = allPlayers.find(pl => pl.id === pid);
                                        if (!p) return null;
                                        return (
                                            <div key={p.id} className="flex justify-between items-center p-2 rounded-lg bg-yellow-400/5 border border-yellow-400/10 text-xs">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-white font-bold truncate">{p.playerName}</p>
                                                    <p className="text-[10px] text-white/40">{p.playerRole} | ₹{formatPrice(p.basePrice)}</p>
                                                </div>
                                                <button onClick={() => toggleWatchlist(p.id)} className="text-base text-yellow-400 hover:scale-115 transition-transform ml-2">★</button>
                                            </div>
                                        );
                                    })}
                                    {watchlist.size === 0 && (
                                        <div className="text-center py-12 text-white/20 text-xs italic">
                                            No targets starred yet.<br />Star players on the right to build your watchlist.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-3 rounded-2xl bg-white/5 border border-white/5 text-center text-xs text-white/40">
                                ⏳ Waiting for auctioneer to start the bidding...
                            </div>
                        </div>

                        {/* Main Board: Player Pool Search & Filtering */}
                        <div className="lg:col-span-3 space-y-4">
                            
                            {/* Search & Tabs row */}
                            <div className="glass-card p-3 flex flex-col sm:flex-row gap-3 justify-between items-center">
                                <input
                                    type="text"
                                    placeholder="Search by player name or franchise..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full sm:max-w-xs text-xs px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none focus:border-neon-purple/40"
                                />
                                
                                <div className="flex gap-1 flex-wrap justify-center text-[10px] uppercase font-bold">
                                    {['all', 'marquee', 'bat', 'wk', 'ar', 'bow'].map(tab => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveFilter(tab)}
                                            className={`px-3 py-1.5 rounded-lg border transition-all ${
                                                activeFilter === tab
                                                    ? 'bg-purple-600 border-purple-500 text-white'
                                                    : 'bg-white/5 border-white/5 text-white/50 hover:bg-white/10'
                                            }`}
                                        >
                                            {tab === 'wk' ? 'Gloves/WK' : tab}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Player pool list view */}
                            <div className="glass-card p-4 max-h-[70vh] overflow-y-auto pr-2 custom-scroll">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {filteredPlayers.map(p => {
                                        const isStarred = watchlist.has(p.id);
                                        const flag = p.nationality === 'IND' ? '🇮🇳' : '🌍';
                                        return (
                                            <div
                                                key={p.id}
                                                className={`flex items-center justify-between p-3 rounded-xl transition-all duration-300 ${
                                                    isStarred
                                                        ? 'bg-yellow-400/5 border border-yellow-400/30'
                                                        : 'bg-white/5 border border-white/5 hover:border-white/10'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm text-white/80"
                                                        style={{ background: isStarred ? 'linear-gradient(135deg,#eab308,#ca8a04)' : 'rgba(255,255,255,0.08)' }}>
                                                        {isStarred ? '★' : '☆'}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                                                            {p.playerName}
                                                            {p.marquee && <span className="text-[9px] bg-yellow-400/10 text-yellow-400 px-1 py-0.2 rounded font-black">M</span>}
                                                        </h4>
                                                        <p className="text-[10px] text-white/40">
                                                            {flag} {p.playerRole} · {p.teamName}
                                                        </p>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs text-ipl-gold font-bold">₹{formatPrice(p.basePrice)}</span>
                                                    <button
                                                        onClick={() => toggleWatchlist(p.id)}
                                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${
                                                            isStarred
                                                                ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                                                                : 'bg-white/5 text-white/60 hover:bg-white/10'
                                                        }`}
                                                    >
                                                        {isStarred ? 'Starred' : 'Star Target'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {filteredPlayers.length === 0 && (
                                        <div className="col-span-2 text-center py-16 text-white/30 italic">
                                            No players found matching current query or filters.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </Layout>
    );
}
