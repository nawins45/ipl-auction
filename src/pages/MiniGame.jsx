import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import TeamBadge from '../components/TeamBadge';
import { ROLES, getTeamByName } from '../utils/constants';

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const MINI_GAME_ROLES = [
    { key: 'BAT', label: 'Best Batsman', short: 'Bat', icon: '🏏', color: '#A855F7' },
    { key: 'SPIN', label: 'Best Spinner', short: 'Spin', icon: '🌀', color: '#60A5FA' },
    { key: 'FAST', label: 'Best Fast Bowler', short: 'Pace', icon: '💨', color: '#F87171' },
    { key: 'AR', label: 'Best All-Rounder', short: 'AR', icon: '⚡', color: '#FBBF24' },
    { key: 'WK', label: 'Best Wicketkeeper', short: 'WK', icon: '🧤', color: '#34D399' },
];

const ALL_STAT_LABELS = [
    { key: 'totalRuns', label: 'Runs' },
    { key: 'strikeRate', label: 'SR' },
    { key: 'highestScore', label: 'HS' },
    { key: 'sixes', label: '6s' },
    { key: 'fours', label: '4s' },
    { key: 'fifties', label: '50s' },
    { key: 'hundreds', label: '100s' },
    { key: 'wickets', label: 'Wkts' },
    { key: 'economy', label: 'Econ' },
    { key: 'bestWkts', label: 'Best' },
];

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function getGridCols(n) {
    return Math.min(4, Math.max(1, Math.ceil(Math.sqrt(n))));
}

function isPlayerEligible(roleKey, player) {
    if (!player) return false;
    // playerRole is stored uppercase: BAT, BOW, AR, WK (sometimes "WK ")
    // bowlingType is stored uppercase: SPIN, FAST, NO
    const role = (player.playerRole || '').trim().toUpperCase();
    const bowl = (player.bowlingType || '').trim().toUpperCase();

    switch (roleKey) {
        case 'BAT':
            // Pure batters only — role is exactly BAT (not AR, not BOW)
            return role === 'BAT';
        case 'WK':
            // Wicket-keepers — role starts with WK (covers "WK" and "WK ")
            return role.startsWith('WK');
        case 'SPIN':
            // Spinners — bowlingType is SPIN. Applies to BOW and AR.
            return bowl === 'SPIN' && (role === 'BOW' || role === 'AR');
        case 'FAST':
            // Fast bowlers — bowlingType is FAST. Applies to BOW and AR.
            return bowl === 'FAST' && (role === 'BOW' || role === 'AR');
        case 'AR':
            // All-Rounders — role is AR regardless of bowling type
            return role === 'AR';
        default:
            return true;
    }
}

function fmtStat(key, player) {
    if (!player) return '—';
    switch (key) {
        case 'totalRuns': return player.totalRuns || 0;
        case 'strikeRate': return player.strikeRate > 0 ? Number(player.strikeRate).toFixed(1) : '0.0';
        case 'highestScore': return player.highestScore || '0';
        case 'sixes': return player.sixes || 0;
        case 'fours': return player.fours || 0;
        case 'fifties': return player.fifties || 0;
        case 'hundreds': return player.hundreds || 0;
        case 'wickets': return player.wickets || 0;
        case 'economy': return player.economyRate > 0 ? Number(player.economyRate).toFixed(2) : 'N/A';
        case 'bestWkts': return player.best || '0/0';
        default: return '—';
    }
}

/* ─────────────────────────────────────────────
   SOUND ENGINE
───────────────────────────────────────────── */
function playBattleSound(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (type === 'slide') {
            const osc = ctx.createOscillator(); const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.15);
            osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.4);
            g.gain.setValueAtTime(0, ctx.currentTime);
            g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.08);
            g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
            osc.connect(g).connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.5);
        } else if (type === 'win') {
            const osc = ctx.createOscillator(); const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
            g.gain.setValueAtTime(0.28, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
            osc.connect(g).connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.4);
        } else if (type === 'lose') {
            const osc = ctx.createOscillator(); const g = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.25);
            g.gain.setValueAtTime(0.18, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.connect(g).connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.35);
        } else if (type === 'countdown') {
            const osc = ctx.createOscillator(); const g = ctx.createGain();
            osc.type = 'sine'; osc.frequency.value = 523;
            g.gain.setValueAtTime(0.22, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
            osc.connect(g).connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.2);
        } else if (type === 'fanfare') {
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
                const osc = ctx.createOscillator(); const g = ctx.createGain();
                osc.type = 'sine'; osc.frequency.value = f;
                g.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.1);
                g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.5);
                osc.connect(g).connect(ctx.destination);
                osc.start(ctx.currentTime + i * 0.1);
                osc.stop(ctx.currentTime + i * 0.1 + 0.5);
            });
        }
    } catch (e) {}
}

/* ─────────────────────────────────────────────
   FULLSCREEN BUTTON
───────────────────────────────────────────── */
// iOS detection
const isIOS_MG = typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !('MSStream' in window);

function FullscreenButton({ compact }) {
    const [isFS, setIsFS] = useState(false);
    const [showIOSGuide, setShowIOSGuide] = useState(false);

    useEffect(() => {
        const h = () => setIsFS(!!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement));
        document.addEventListener('fullscreenchange', h);
        document.addEventListener('webkitfullscreenchange', h);
        document.addEventListener('mozfullscreenchange', h);
        return () => {
            document.removeEventListener('fullscreenchange', h);
            document.removeEventListener('webkitfullscreenchange', h);
            document.removeEventListener('mozfullscreenchange', h);
        };
    }, []);

    const toggle = async () => {
        if (isIOS_MG) { setShowIOSGuide(true); return; }
        try {
            const el = document.documentElement;
            if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement) {
                const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
                if (req) {
                    await req.call(el);
                    try { await screen.orientation.lock('landscape'); } catch (e) {}
                }
            } else {
                const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
                if (exit) await exit.call(document);
                try { screen.orientation.unlock(); } catch (e) {}
            }
        } catch (e) {}
    };

    return (
        <>
            {showIOSGuide && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', padding: '16px' }}
                    onClick={() => setShowIOSGuide(false)}>
                    <div style={{ background: 'linear-gradient(145deg,rgba(12,7,30,0.99),rgba(8,4,22,0.99))', border: '1px solid rgba(168,85,247,0.3)', borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '420px', marginBottom: '8px' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '6px' }}>📱</div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: 'white' }}>Fullscreen on iPhone / iPad</h3>
                            <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>iOS Safari doesn't allow fullscreen. Use the Home Screen shortcut instead!</p>
                        </div>
                        {[
                            { icon: '⬆️', text: 'Tap the Share button at the bottom of Safari' },
                            { icon: '➕', text: 'Tap "Add to Home Screen"' },
                            { icon: '🏏', text: 'Open the "IPL Auction" icon from your Home Screen' },
                            { icon: '🔄', text: 'Rotate to landscape for the full experience!' },
                        ].map((s, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '12px', background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)', marginBottom: '8px' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(168,85,247,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>{s.icon}</div>
                                <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>{s.text}</p>
                            </div>
                        ))}
                        <button onClick={() => setShowIOSGuide(false)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg,#6D28D9,#A855F7)', color: 'white', fontWeight: 900, fontSize: '14px', cursor: 'pointer', marginTop: '4px' }}>Got it! ✓</button>
                    </div>
                </div>
            )}
            <button onClick={toggle} title={isIOS_MG ? 'iOS Fullscreen Guide' : isFS ? 'Exit Fullscreen' : 'Fullscreen (Landscape)'}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: compact ? '6px' : '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.13)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s', position: 'relative' }}>
                {isIOS_MG
                    ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3v12M8 7l4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
                    : isFS
                        ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                        : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                }
                {isIOS_MG && <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '7px', height: '7px', borderRadius: '50%', background: '#A855F7', boxShadow: '0 0 6px rgba(168,85,247,0.8)' }} />}
            </button>
        </>
    );
}

/* ─────────────────────────────────────────────
   PLAYER STAT CARD (Selection phase)
───────────────────────────────────────────── */
function PlayerStatCard({ player, isSelected, isDisabled, roleColor, onClick }) {
    return (
        <div onClick={!isDisabled ? onClick : undefined}
            style={{
                padding: 'clamp(8px,1.5vw,12px)',
                borderRadius: '12px',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.3 : 1,
                background: isSelected ? `${roleColor}18` : 'rgba(255,255,255,0.03)',
                border: isSelected ? `2px solid ${roleColor}80` : '1px solid rgba(255,255,255,0.08)',
                transition: 'all 0.18s',
                transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                boxShadow: isSelected ? `0 0 22px ${roleColor}30` : 'none',
                userSelect: 'none',
            }}>
            {/* Name + nationality */}
            <div style={{ marginBottom: '7px' }}>
                <p style={{
                    margin: 0, fontWeight: 800,
                    fontSize: 'clamp(11px,1.6vw,14px)',
                    color: isSelected ? roleColor : 'white',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {isSelected ? '✓ ' : ''}{player.playerName}
                </p>
                <p style={{ margin: 0, fontSize: 'clamp(9px,1.1vw,11px)', color: 'rgba(255,255,255,0.35)' }}>
                    {player.playerRole} · {player.nationality} {player.marquee ? '⭐' : ''}
                </p>
            </div>

            {/* All stats grid — 5 per row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '3px' }}>
                {ALL_STAT_LABELS.map(s => (
                    <div key={s.key} style={{
                        textAlign: 'center', padding: '3px 2px', borderRadius: '4px',
                        background: 'rgba(255,255,255,0.04)',
                    }}>
                        <p style={{ margin: 0, fontSize: 'clamp(7px,0.85vw,9px)', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', lineHeight: 1.1 }}>{s.label}</p>
                        <p style={{ margin: '1px 0 0', fontSize: 'clamp(9px,1.1vw,12px)', fontWeight: 700, color: 'rgba(255,255,255,0.82)', lineHeight: 1.2 }}>
                            {fmtStat(s.key, player)}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────
   BATTLE OVERLAY — Cinematic full-screen view
───────────────────────────────────────────── */
function BattleOverlay({ battleAnim, allUsers, room, myUid, onClose }) {
    const { role, phase, currentStatIdx, liveCardPoints, statResults, players } = battleAnim;
    const roleInfo = MINI_GAME_ROLES.find(r => r.key === role) || {};
    const cols = getGridCols(players.length);
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

    const sortedPlayers = (phase === 'sorting' || phase === 'done')
        ? [...players].sort((a, b) => (liveCardPoints[b.uid] || 0) - (liveCardPoints[a.uid] || 0))
        : players;

    const currentStat = statResults[currentStatIdx];

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(4, 2, 18, 0.98)',
            backdropFilter: 'blur(24px)',
            display: 'flex', flexDirection: 'column',
            padding: 'clamp(10px,2vw,20px)',
            boxSizing: 'border-box',
            overflow: 'hidden',
        }}>
            <style>{`
                @keyframes mgSlideL { from { transform:translateX(-110%) scale(0.9); opacity:0; } to { transform:translateX(0) scale(1); opacity:1; } }
                @keyframes mgSlideR { from { transform:translateX(110%) scale(0.9); opacity:0; } to { transform:translateX(0) scale(1); opacity:1; } }
                @keyframes mgSlideT { from { transform:translateY(-60px) scale(0.95); opacity:0; } to { transform:translateY(0) scale(1); opacity:1; } }
                @keyframes mgSlideB { from { transform:translateY(60px) scale(0.95); opacity:0; } to { transform:translateY(0) scale(1); opacity:1; } }
                @keyframes mgPop { 0%{transform:scale(0.6);opacity:0;} 70%{transform:scale(1.12);} 100%{transform:scale(1);opacity:1;} }
                @keyframes mgPulse { 0%,100%{transform:scale(1);} 50%{transform:scale(1.18);} }
                @keyframes mgGlow { 0%,100%{box-shadow:0 0 18px rgba(255,215,0,0.35);} 50%{box-shadow:0 0 45px rgba(255,215,0,0.75);} }
                @keyframes mgTick { from{transform:scale(1.6);color:#FFD700;} to{transform:scale(1);} }
                @keyframes mgFadeUp { from{transform:translateY(16px);opacity:0;} to{transform:translateY(0);opacity:1;} }
                @keyframes mgCountdown { 0%{transform:scale(2);opacity:0;} 60%{transform:scale(1.1);opacity:1;} 100%{transform:scale(1);opacity:1;} }
                .mg-card-in:nth-child(odd)  { animation: mgSlideL 0.55s cubic-bezier(0.34,1.56,0.64,1) both; }
                .mg-card-in:nth-child(even) { animation: mgSlideR 0.55s cubic-bezier(0.34,1.56,0.64,1) both; }
                .mg-card-in:nth-child(3n)   { animation: mgSlideT 0.55s cubic-bezier(0.34,1.56,0.64,1) both; }
                .mg-card-in:nth-child(4n)   { animation: mgSlideB 0.55s cubic-bezier(0.34,1.56,0.64,1) both; }
                .mg-card-in:nth-child(n) { animation-delay: calc(var(--i,0)*0.06s); }
                .mg-stat-win  { animation: mgPulse 0.4s ease; }
                .mg-tick      { animation: mgTick 0.35s ease; }
                .mg-gold-glow { animation: mgGlow 1.4s ease-in-out infinite; }
                .mg-fade-up   { animation: mgFadeUp 0.4s ease both; }
                .mg-pop       { animation: mgPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both; }
                .mg-countdown { animation: mgCountdown 0.6s ease both; }
            `}</style>

            {/* ── TOP BAR ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'clamp(8px,1.5vw,16px)', flexShrink: 0 }}>
                <div style={{ textAlign: 'left' }}>
                    <h2 style={{
                        margin: 0,
                        fontSize: 'clamp(16px,3.5vw,32px)',
                        fontWeight: 900,
                        color: roleInfo.color,
                        lineHeight: 1,
                    }}>
                        {roleInfo.icon} {roleInfo.label} Battle
                    </h2>

                    {phase === 'stat-reveal' && currentStat && (
                        <div className="mg-pop" key={currentStatIdx} style={{
                            display: 'inline-block', marginTop: '4px',
                            padding: 'clamp(3px,0.7vw,6px) clamp(10px,1.5vw,16px)',
                            borderRadius: '20px',
                            background: `${roleInfo.color}20`,
                            border: `1px solid ${roleInfo.color}50`,
                        }}>
                            <span style={{ fontSize: 'clamp(11px,1.8vw,16px)', fontWeight: 700, color: roleInfo.color }}>
                                ⚔️ {currentStat.statLabel} — {currentStatIdx + 1} / {statResults.length}
                            </span>
                        </div>
                    )}

                    {phase === 'countdown' && (
                        <div className="mg-countdown" style={{ marginTop: '4px', fontSize: 'clamp(18px,3.5vw,30px)', fontWeight: 900, color: '#FFD700' }}>
                            ⚔️ BATTLE STARTS!
                        </div>
                    )}

                    {(phase === 'sorting' || phase === 'done') && (
                        <div className="mg-pop" style={{ marginTop: '4px', fontSize: 'clamp(14px,2.5vw,22px)', fontWeight: 900, color: '#FFD700' }}>
                            🏆 Results are in!
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FullscreenButton compact />
                    {phase === 'done' && (
                        <button onClick={onClose}
                            style={{
                                padding: 'clamp(6px,1.2vw,10px) clamp(12px,2vw,18px)',
                                borderRadius: '10px', border: 'none',
                                background: 'rgba(255,255,255,0.08)',
                                color: 'rgba(255,255,255,0.75)',
                                fontSize: 'clamp(11px,1.5vw,14px)', fontWeight: 700, cursor: 'pointer',
                            }}>
                            ✕ Close
                        </button>
                    )}
                </div>
            </div>

            {/* ── CARDS GRID ── */}
            <div style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: 'clamp(6px,1.2vw,12px)',
                minHeight: 0,
            }}>
                {sortedPlayers.map((entry, idx) => {
                    const teamName = room?.teamAssignments?.[entry.uid] || '';
                    const team = getTeamByName(teamName);
                    const cardPts = liveCardPoints[entry.uid] || 0;
                    const isWinner = (phase === 'done' || phase === 'sorting') && idx === 0;
                    const myStatEntry = (phase === 'stat-reveal' && currentStat)
                        ? currentStat.values?.find(v => v.uid === entry.uid)
                        : null;
                    const wonCurrent = myStatEntry?.won;
                    const isMe = entry.uid === myUid;

                    return (
                        <div key={entry.uid}
                            className={phase === 'cards-in' ? 'mg-card-in' : ''}
                            style={{
                                '--i': idx,
                                padding: 'clamp(8px,1.3vw,14px)',
                                borderRadius: 'clamp(10px,1.5vw,16px)',
                                display: 'flex', flexDirection: 'column',
                                gap: 'clamp(4px,0.8vw,8px)',
                                background: isWinner ? 'rgba(255,215,0,0.07)'
                                    : wonCurrent ? 'rgba(16,185,129,0.08)'
                                    : isMe ? `${roleInfo.color}0d`
                                    : 'rgba(255,255,255,0.03)',
                                border: isWinner ? '2px solid rgba(255,215,0,0.55)'
                                    : (phase === 'stat-reveal' && myStatEntry)
                                        ? wonCurrent ? '2px solid rgba(16,185,129,0.55)' : '1px solid rgba(239,68,68,0.3)'
                                        : '1px solid rgba(255,255,255,0.08)',
                                boxShadow: isWinner ? '0 0 35px rgba(255,215,0,0.25)'
                                    : wonCurrent ? '0 0 18px rgba(16,185,129,0.25)' : 'none',
                                transition: 'all 0.45s cubic-bezier(0.34,1.56,0.64,1)',
                                overflow: 'hidden',
                                minHeight: 0,
                            }}>

                            {/* Card header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(4px,0.8vw,8px)', flexShrink: 0 }}>
                                <TeamBadge teamName={teamName} size="tiny" />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: 0, fontSize: 'clamp(9px,1.2vw,13px)', fontWeight: 800, color: team.color, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{team.short}</p>
                                    <p style={{ margin: 0, fontSize: 'clamp(8px,1vw,11px)', color: 'rgba(255,255,255,0.45)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{entry.playerName}</p>
                                </div>
                                {(phase === 'sorting' || phase === 'done') && (
                                    <span className="mg-pop" style={{ fontSize: 'clamp(14px,2.2vw,22px)', flexShrink: 0 }}>{medals[idx] || `${idx + 1}`}</span>
                                )}
                            </div>

                            {/* Current stat spotlight */}
                            {phase === 'stat-reveal' && myStatEntry && (
                                <div className={wonCurrent ? 'mg-stat-win' : ''}
                                    style={{
                                        padding: 'clamp(4px,1vw,8px)',
                                        borderRadius: '8px',
                                        textAlign: 'center', flexShrink: 0,
                                        background: wonCurrent ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.1)',
                                        border: wonCurrent ? '1px solid rgba(16,185,129,0.45)' : '1px solid rgba(239,68,68,0.2)',
                                    }}>
                                    <p style={{ margin: 0, fontSize: 'clamp(8px,1vw,11px)', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{currentStat?.statLabel}</p>
                                    <p style={{ margin: '1px 0', fontSize: 'clamp(16px,3vw,28px)', fontWeight: 900, color: wonCurrent ? '#4ADE80' : '#F87171', lineHeight: 1 }}>
                                        {myStatEntry.val !== undefined ? myStatEntry.val : '—'}
                                    </p>
                                    {wonCurrent && <p style={{ margin: 0, fontSize: 'clamp(8px,1vw,11px)', color: '#4ADE80', fontWeight: 700 }}>✓ WINS +1</p>}
                                </div>
                            )}

                            {/* Card points counter */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                                <span style={{ fontSize: 'clamp(8px,1vw,11px)', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' }}>Card Pts</span>
                                <span key={cardPts} className={cardPts > 0 ? 'mg-tick' : ''}
                                    style={{ fontSize: 'clamp(16px,2.8vw,24px)', fontWeight: 900, color: cardPts > 0 ? '#FFD700' : 'rgba(255,255,255,0.2)' }}>
                                    {cardPts}
                                </span>
                            </div>

                            {/* All stat rows (revealed progressively) */}
                            {phase !== 'cards-in' && phase !== 'countdown' && statResults.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '2px', flex: 1, alignContent: 'start' }}>
                                    {statResults.map((stat, si) => {
                                        const sv = stat.values?.find(v => v.uid === entry.uid);
                                        const revealed = si <= currentStatIdx || phase === 'sorting' || phase === 'done';
                                        const isCurrent = si === currentStatIdx && phase === 'stat-reveal';
                                        return (
                                            <div key={si} style={{
                                                padding: '2px 1px', borderRadius: '4px', textAlign: 'center',
                                                background: isCurrent
                                                    ? (sv?.won ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.15)')
                                                    : revealed && sv?.won ? 'rgba(16,185,129,0.09)' : 'rgba(255,255,255,0.02)',
                                                border: isCurrent
                                                    ? (sv?.won ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(239,68,68,0.2)')
                                                    : revealed && sv?.won ? '1px solid rgba(16,185,129,0.18)' : '1px solid transparent',
                                                opacity: !revealed ? 0.22 : 1,
                                                transition: 'all 0.3s',
                                            }}>
                                                <p style={{ margin: 0, fontSize: 'clamp(6px,0.8vw,8px)', color: 'rgba(255,255,255,0.28)', lineHeight: 1 }}>{stat.statLabel?.slice(0, 4)}</p>
                                                <p style={{
                                                    margin: '1px 0 0', lineHeight: 1.2,
                                                    fontSize: 'clamp(8px,1.1vw,11px)',
                                                    fontWeight: 700,
                                                    color: isCurrent ? (sv?.won ? '#4ADE80' : '#F87171') : revealed && sv?.won ? '#34D399' : 'rgba(255,255,255,0.65)',
                                                }}>
                                                    {revealed ? sv?.val ?? '—' : '?'}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* User points badge (done) */}
                            {(phase === 'done' || phase === 'sorting') && entry.userPoints != null && (
                                <div className="mg-fade-up" style={{
                                    textAlign: 'center', padding: 'clamp(4px,0.8vw,8px)',
                                    borderRadius: '8px', flexShrink: 0,
                                    background: isWinner ? 'rgba(255,215,0,0.08)' : 'rgba(168,85,247,0.07)',
                                    border: isWinner ? '1px solid rgba(255,215,0,0.2)' : '1px solid rgba(168,85,247,0.15)',
                                }}>
                                    <p style={{ margin: 0, fontSize: 'clamp(7px,0.9vw,10px)', color: 'rgba(255,255,255,0.3)' }}>Game Pts</p>
                                    <p style={{ margin: 0, fontSize: 'clamp(18px,3vw,26px)', fontWeight: 900, color: isWinner ? '#FFD700' : '#C084FC' }}>+{entry.userPoints}</p>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */
export default function MiniGame() {
    const { room, userData, allUsers, leaveRoom } = useRoom();
    const { squads, allPlayers, miniGameSelections, submitMiniGameSelection, callMiniGameRound, finishMiniGame, forceEndMiniGameSelection } = useGame();
    const { user } = useAuth();

    const isAuctioneer = userData?.role === ROLES.AUCTIONEER;
    const miniGame = room?.miniGame || {};
    const mySquadPlayers = squads[user?.uid]?.players || [];
    const teamOwners = allUsers.filter(u => u.role === ROLES.TEAM_OWNER);

    // Selection state
    const [localSelections, setLocalSelections] = useState({});
    const [locked, setLocked] = useState(false);
    const [activeRole, setActiveRole] = useState('BAT');
    const [selectionError, setSelectionError] = useState(null);

    // Battle animation state
    const [battleAnim, setBattleAnim] = useState({ active: false, role: null, phase: 'idle', currentStatIdx: -1, liveCardPoints: {}, statResults: [], players: [] });
    const [autoSequence, setAutoSequence] = useState(false);
    const [manualScores, setManualScores] = useState({});
    const timersRef = useRef([]);
    const prevRoundRef = useRef(null);

    const mySubmission = miniGameSelections[user?.uid];
    const isLocked = mySubmission?.locked || locked;
    const completedRounds = miniGame.completedRounds || [];

    // Window size for responsive layout
    const [winW, setWinW] = useState(window.innerWidth);
    useEffect(() => {
        const h = () => setWinW(window.innerWidth);
        window.addEventListener('resize', h);
        return () => window.removeEventListener('resize', h);
    }, []);

    // Auto-Sequence logic (Auctioneer only)
    useEffect(() => {
        if (isAuctioneer && autoSequence && battleAnim.phase === 'done') {
            const nextRound = MINI_GAME_ROLES.find(r => !completedRounds.includes(r.key));
            if (nextRound) {
                const t = setTimeout(() => {
                    callMiniGameRound(nextRound.key);
                }, 800); // brief pause before next round starts
                return () => clearTimeout(t);
            } else {
                setAutoSequence(false);
            }
        }
    }, [isAuctioneer, autoSequence, battleAnim.phase, completedRounds, callMiniGameRound]);


    // Load existing selections
    useEffect(() => {
        if (mySubmission?.selections && !locked) {
            setLocalSelections(mySubmission.selections);
            setLocked(true);
        }
    }, [mySubmission]);

    // Clear animation timers
    const clearTimers = useCallback(() => {
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
    }, []);

    // Animate through stats (sped up)
    const revealStat = useCallback((result, idx, pts) => {
        if (idx >= result.statResults.length) {
            const t = setTimeout(() => {
                setBattleAnim(p => ({ ...p, phase: 'sorting' }));
                playBattleSound('fanfare');
                const t2 = setTimeout(() => setBattleAnim(p => ({ ...p, phase: 'done' })), 800);
                timersRef.current.push(t2);
            }, 300);
            timersRef.current.push(t);
            return;
        }
        const stat = result.statResults[idx];
        const newPts = { ...pts };
        (stat.values || []).forEach(v => { if (v.won) newPts[v.uid] = (newPts[v.uid] || 0) + 1; });

        setBattleAnim(p => ({ ...p, phase: 'stat-reveal', currentStatIdx: idx, liveCardPoints: newPts }));

        const myEntry = (stat.values || []).find(v => v.uid === user?.uid);
        playBattleSound(myEntry?.won ? 'win' : 'lose');

        const t = setTimeout(() => revealStat(result, idx + 1, newPts), 1700);
        timersRef.current.push(t);
    }, [user?.uid]);

    // Start full battle cinematic (sped up, no countdown delay)
    const startBattle = useCallback((role, result) => {
        clearTimers();
        setBattleAnim({ active: true, role, phase: 'cards-in', currentStatIdx: -1, liveCardPoints: {}, statResults: result.statResults || [], players: result.players || [] });
        playBattleSound('slide');

        const t1 = setTimeout(() => {
            setBattleAnim(p => ({ ...p, phase: 'countdown' }));
            playBattleSound('countdown');
            const t2 = setTimeout(() => {
                revealStat(result, 0, {});
            }, 2200);
            timersRef.current.push(t2);
        }, 1100);
        timersRef.current.push(t1);
    }, [clearTimers, revealStat]);

    // Watch Firebase for new round results
    useEffect(() => {
        const curRound = room?.miniGame?.currentRound;
        if (!curRound || curRound === prevRoundRef.current) return;
        const result = room?.miniGame?.roundResults?.[curRound];
        if (!result?.statResults) return;
        prevRoundRef.current = curRound;
        startBattle(curRound, result);
        return () => clearTimers();
    }, [room?.miniGame?.currentRound, room?.miniGame?.roundResults]);

    const handleSelectPlayer = (playerId) => {
        if (isLocked) return;
        setSelectionError(null);
        setLocalSelections(p => ({ ...p, [activeRole]: playerId }));
    };

    const handleLockIn = async () => {
        // Roles with no eligible players are pre-filled with '__none__' — skip them
        const eligibleByRole = {};
        MINI_GAME_ROLES.forEach(r => {
            eligibleByRole[r.key] = mySquadPlayers.some(sp => {
                const p = allPlayers.find(pl => pl.id === sp.playerId);
                return p && isPlayerEligible(r.key, p);
            });
        });
        const missing = MINI_GAME_ROLES.filter(r => eligibleByRole[r.key] && !localSelections[r.key]);
        setSelectionError(null);
        if (missing.length) { setSelectionError(`Please select a player for: ${missing.map(r => r.label).join(', ')}`); return; }
        // Auto-fill __none__ for roles with no eligible players
        const finalSelections = { ...localSelections };
        MINI_GAME_ROLES.forEach(r => {
            if (!finalSelections[r.key]) finalSelections[r.key] = '__none__';
        });
        await submitMiniGameSelection(finalSelections);
        setLocked(true);
    };

    const lockedCount = Object.values(miniGameSelections).filter(s => s.locked).length;
    const forceEnded = !!miniGame.forceEnded;
    const allLocked = lockedCount >= teamOwners.length || forceEnded;
    const currentRoleInfo = MINI_GAME_ROLES.find(r => r.key === activeRole);

    const isDesktop = winW >= 1024;
    const isTablet = winW >= 640 && winW < 1024;

    return (
        <div style={{ minHeight: '100vh', background: '#080514', color: 'white', padding: 'clamp(10px,2.5vw,22px)', boxSizing: 'border-box' }}>
            <style>{`
                ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); } ::-webkit-scrollbar-thumb { background: rgba(168,85,247,0.3); border-radius: 4px; }
            `}</style>

            {/* Battle overlay */}
            {battleAnim.active && (
                <BattleOverlay
                    battleAnim={battleAnim}
                    allUsers={allUsers}
                    room={room}
                    myUid={user?.uid}
                    onClose={() => setBattleAnim(p => ({ ...p, active: false }))}
                />
            )}

            {/* ── HEADER ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'clamp(12px,2.5vw,20px)' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 'clamp(18px,4vw,30px)', fontWeight: 900, background: 'linear-gradient(135deg,#A855F7,#EC4899,#FFD700)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        🎮 Top 5 Card Battle
                    </h1>
                    <p style={{ margin: 0, fontSize: 'clamp(10px,1.5vw,13px)', color: 'rgba(255,255,255,0.35)' }}>
                        {lockedCount}/{teamOwners.length} teams locked in {allLocked ? '✅' : '⏳'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button onClick={leaveRoom} style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.5)', color: '#EF4444', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Leave Room
                    </button>
                    <FullscreenButton />
                </div>
            </div>

            {/* ── MAIN LAYOUT ── */}
            <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: 'clamp(12px,2vw,20px)' }}>

                {/* LEFT — Selection (team owners) */}
                {!isAuctioneer && (
                    <div>
                        {/* Role selector tabs */}
                        <div style={{ display: 'flex', gap: 'clamp(4px,0.8vw,8px)', marginBottom: 'clamp(10px,1.8vw,14px)', flexWrap: 'wrap' }}>
                            {MINI_GAME_ROLES.map(r => {
                                const sel = localSelections[r.key];
                                const hasNoEligible = !mySquadPlayers.some(sp => {
                                    const p = allPlayers.find(pl => pl.id === sp.playerId);
                                    return p && isPlayerEligible(r.key, p);
                                });
                                const done = !!sel || hasNoEligible;
                                const active = activeRole === r.key;
                                return (
                                    <button key={r.key} onClick={() => setActiveRole(r.key)}
                                        style={{
                                            flex: '1 1 0', minWidth: 0,
                                            padding: 'clamp(6px,1.2vw,10px) clamp(6px,1.2vw,10px)',
                                            borderRadius: '10px', cursor: 'pointer',
                                            fontSize: 'clamp(10px,1.4vw,13px)', fontWeight: 700,
                                            background: active ? `${r.color}22` : done ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.03)',
                                            border: active ? `1.5px solid ${r.color}70` : done ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(255,255,255,0.08)',
                                            color: active ? r.color : done ? '#4ADE80' : 'rgba(255,255,255,0.45)',
                                            transition: 'all 0.18s', position: 'relative',
                                        }}>
                                        {r.icon} {isDesktop || isTablet ? r.short : r.icon}
                                        {done && <span style={{ position: 'absolute', top: '-3px', right: '-3px', width: '8px', height: '8px', borderRadius: '50%', background: '#4ADE80' }} />}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Role info banner */}
                        <div style={{ marginBottom: 'clamp(8px,1.5vw,12px)', padding: 'clamp(7px,1.2vw,10px) clamp(10px,1.8vw,14px)', borderRadius: '10px', background: `${currentRoleInfo?.color}0e`, border: `1px solid ${currentRoleInfo?.color}30` }}>
                            <p style={{ margin: 0, fontSize: 'clamp(10px,1.4vw,13px)', color: currentRoleInfo?.color, fontWeight: 700 }}>
                                {currentRoleInfo?.icon} {isLocked ? `Locked: ${allPlayers.find(p => p.id === localSelections[activeRole])?.playerName || '—'}` : `Select your ${currentRoleInfo?.label}`}
                            </p>
                        </div>

                        {/* Player list */}
                        {!isLocked ? (
                            (() => {
                                const filteredPlayers = mySquadPlayers.filter(sp => {
                                    const p = allPlayers.find(pl => pl.id === sp.playerId);
                                    return p && isPlayerEligible(activeRole, p);
                                });
                                if (filteredPlayers.length === 0) {
                                    return (
                                        <div style={{
                                            padding: 'clamp(20px,4vw,32px)', borderRadius: '14px', textAlign: 'center',
                                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                                            marginBottom: '12px',
                                        }}>
                                            <div style={{ fontSize: 'clamp(28px,5vw,40px)', marginBottom: '10px' }}>{currentRoleInfo?.icon}</div>
                                            <p style={{ margin: '0 0 6px', color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: 'clamp(12px,1.8vw,15px)' }}>No eligible players</p>
                                            <p style={{ margin: 0, color: 'rgba(255,255,255,0.25)', fontSize: 'clamp(10px,1.4vw,12px)' }}>Your squad has no {currentRoleInfo?.label} — you'll auto-submit N/A for this role.</p>
                                        </div>
                                    );
                                }
                                return (
                                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(clamp(150px,22vw,210px),1fr))`, gap: 'clamp(7px,1.2vw,11px)', maxHeight: 'clamp(280px,48vh,480px)', overflowY: 'auto', paddingRight: '2px' }}>
                                        {filteredPlayers.map(sp => {
                                            const p = allPlayers.find(pl => pl.id === sp.playerId);
                                            if (!p) return null;
                                            const usedElsewhere = Object.entries(localSelections).some(([k, v]) => k !== activeRole && v === sp.playerId);
                                            return (
                                                <PlayerStatCard
                                                    key={sp.playerId}
                                                    player={p}
                                                    isSelected={localSelections[activeRole] === sp.playerId}
                                                    isDisabled={usedElsewhere}
                                                    roleColor={currentRoleInfo?.color || '#A855F7'}
                                                    onClick={() => handleSelectPlayer(sp.playerId)}
                                                />
                                            );
                                        })}
                                    </div>
                                );
                            })()
                        ) : (
                            <div style={{ padding: 'clamp(14px,2.5vw,20px)', borderRadius: '14px', textAlign: 'center', background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.18)' }}>
                                <div style={{ fontSize: 'clamp(24px,4vw,36px)', marginBottom: '8px' }}>✅</div>
                                <p style={{ margin: '0 0 4px', color: '#34D399', fontWeight: 800, fontSize: 'clamp(13px,2vw,16px)' }}>Cards Locked In!</p>
                                <p style={{ margin: '0 0 14px', color: 'rgba(255,255,255,0.3)', fontSize: 'clamp(10px,1.4vw,12px)' }}>Waiting for the auctioneer to call the battle rounds...</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
                                    {MINI_GAME_ROLES.map(r => {
                                        const selId = localSelections[r.key];
                                        const p = selId && selId !== '__none__' ? allPlayers.find(pl => pl.id === selId) : null;
                                        return (
                                            <span key={r.key} style={{ padding: 'clamp(4px,0.8vw,6px) clamp(8px,1.5vw,12px)', borderRadius: '20px', fontSize: 'clamp(10px,1.3vw,12px)', background: `${r.color}12`, border: `1px solid ${r.color}30`, color: r.color }}>
                                                {r.icon} {p?.playerName || (selId === '__none__' ? 'N/A' : '—')}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {!isLocked && (
                            <>
                            <button onClick={handleLockIn}
                                style={{
                                    marginTop: 'clamp(10px,1.8vw,14px)', width: '100%',
                                    padding: 'clamp(12px,2vw,16px)', borderRadius: '12px', border: 'none',
                                    fontSize: 'clamp(13px,2vw,16px)', fontWeight: 900, cursor: 'pointer',
                                    background: 'linear-gradient(135deg,#A855F7,#EC4899)',
                                    color: 'white', boxShadow: '0 0 22px rgba(168,85,247,0.32)',
                                    transition: 'transform 0.15s',
                                }}>
                                🔒 Lock In My Cards!
                            </button>
                            {selectionError && (
                                <div style={{
                                    marginTop: '8px', padding: '10px 14px',
                                    background: 'rgba(220,38,38,0.1)',
                                    border: '1px solid rgba(220,38,38,0.3)',
                                    borderRadius: '10px',
                                    color: '#FCA5A5', fontSize: '12px',
                                    textAlign: 'center',
                                }}>⚠️ {selectionError}</div>
                            )}
                            </>
                        )}
                    </div>
                )}

                {/* RIGHT — Auctioneer controls + leaderboard */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(12px,2vw,16px)' }}>

                    {/* Auctioneer overview of readiness (when not auctioneer — show just team status) */}
                    {!isAuctioneer && (
                        <div style={{ padding: 'clamp(10px,1.8vw,14px)', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <p style={{ margin: '0 0 8px', fontSize: 'clamp(10px,1.4vw,12px)', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>⚔️ Battle Status</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {MINI_GAME_ROLES.map(r => {
                                    const done = completedRounds.includes(r.key);
                                    return (
                                        <span key={r.key} style={{ padding: 'clamp(4px,0.8vw,6px) clamp(8px,1.5vw,12px)', borderRadius: '20px', fontSize: 'clamp(10px,1.3vw,12px)', fontWeight: 700, background: done ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)', border: done ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(255,255,255,0.08)', color: done ? '#34D399' : 'rgba(255,255,255,0.35)' }}>
                                            {done ? '✅' : r.icon} {r.short}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Auctioneer battle controls */}
                    {isAuctioneer && (
                        <div style={{ padding: 'clamp(12px,2vw,18px)', borderRadius: '14px', background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.14)' }}>
                            <p style={{ margin: '0 0 clamp(8px,1.5vw,12px)', fontSize: 'clamp(10px,1.4vw,12px)', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                Call Battle Rounds
                            </p>
                            {!allLocked && (
                                <p style={{ fontSize: 'clamp(10px,1.4vw,12px)', color: '#FB923C', margin: '0 0 10px' }}>
                                    ⏳ {lockedCount}/{teamOwners.length} teams locked in — waiting...
                                </p>
                            )}
                            {/* Force End button - only when some teams haven't submitted */}
                            {!allLocked && (
                                <button
                                    onClick={() => {
                                        if (window.confirm(`Force end selection? ${teamOwners.length - lockedCount} team(s) haven't submitted. They will score 0 for this round — others are unaffected.`)) {
                                            forceEndMiniGameSelection();
                                        }
                                    }}
                                    style={{
                                        width: '100%', marginBottom: '12px',
                                        padding: 'clamp(8px,1.4vw,11px)', borderRadius: '10px',
                                        border: '1px solid rgba(239,68,68,0.4)',
                                        background: 'rgba(239,68,68,0.08)', color: '#F87171',
                                        fontSize: 'clamp(10px,1.3vw,12px)', fontWeight: 700, cursor: 'pointer',
                                        letterSpacing: '0.05em',
                                    }}
                                >
                                    ⚡ Force End Selection (Skip AFK Players)
                                </button>
                            )}
                            {/* Auctioneer also sees readiness */}
                            {!allLocked && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
                                    {teamOwners.map(owner => {
                                        const sub = miniGameSelections[owner.uid];
                                        const teamName = room?.teamAssignments?.[owner.uid] || '';
                                        const team = getTeamByName(teamName);
                                        return (
                                            <div key={owner.uid} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: 'clamp(5px,1vw,8px)', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <TeamBadge teamName={teamName} size="tiny" />
                                                <span style={{ flex: 1, fontSize: 'clamp(10px,1.4vw,12px)', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{team.short}</span>
                                                <span style={{ fontSize: 'clamp(9px,1.2vw,11px)', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: sub?.locked ? 'rgba(16,185,129,0.1)' : 'rgba(251,146,60,0.1)', color: sub?.locked ? '#4ADE80' : '#FB923C' }}>
                                                    {sub?.locked ? '✅ Ready' : '⏳ ...'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {/* Auto-Battle Sequence Button */}
                            {completedRounds.length < MINI_GAME_ROLES.length ? (
                                <button
                                    disabled={!allLocked || autoSequence}
                                    onClick={() => {
                                        setAutoSequence(true);
                                        const nextRound = MINI_GAME_ROLES.find(r => !completedRounds.includes(r.key));
                                        if (nextRound) callMiniGameRound(nextRound.key);
                                    }}
                                    style={{
                                        width: '100%', marginTop: '10px',
                                        padding: 'clamp(12px,2vw,16px)', borderRadius: '12px', border: 'none',
                                        background: autoSequence ? 'rgba(16,185,129,0.2)' : 'linear-gradient(135deg,#10B981,#3B82F6)',
                                        color: autoSequence ? '#34D399' : 'white', fontWeight: 900,
                                        fontSize: 'clamp(13px,2vw,16px)', cursor: (!allLocked || autoSequence) ? 'not-allowed' : 'pointer',
                                        opacity: (!allLocked) ? 0.5 : 1,
                                        boxShadow: (!allLocked || autoSequence) ? 'none' : '0 0 20px rgba(16,185,129,0.4)',
                                    }}>
                                    {autoSequence ? '⚔️ Battles in Progress...' : '⚔️ Start Full Battle Sequence'}
                                </button>
                            ) : (
                                <button onClick={finishMiniGame}
                                    style={{
                                        width: '100%', marginTop: 'clamp(10px,1.8vw,14px)',
                                        padding: 'clamp(12px,2vw,16px)', borderRadius: '12px', border: 'none',
                                        background: 'linear-gradient(135deg,#FFD700,#FFA500)',
                                        color: '#1a0a00', fontWeight: 900,
                                        fontSize: 'clamp(13px,2vw,16px)', cursor: 'pointer',
                                        boxShadow: '0 0 25px rgba(255,215,0,0.3)',
                                    }}>
                                    🏆 Finish & Show Final Results!
                                </button>
                            )}
                        </div>
                    )}

                    {/* Live mini-game leaderboard */}
                    {Object.keys(miniGame.scores || {}).length > 0 && (
                        <div style={{ padding: 'clamp(12px,2vw,16px)', borderRadius: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <p style={{ margin: '0 0 clamp(8px,1.5vw,12px)', fontSize: 'clamp(10px,1.4vw,12px)', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>🏆 Live Standings</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                {Object.entries(miniGame.scores || {})
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([uid, pts], idx) => {
                                        const teamName = room?.teamAssignments?.[uid] || '';
                                        const team = getTeamByName(teamName);
                                        const medals = ['🥇', '🥈', '🥉'];
                                        return (
                                            <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px,1vw,10px)', padding: 'clamp(7px,1.2vw,10px) clamp(8px,1.4vw,12px)', borderRadius: '10px', background: idx === 0 ? 'rgba(255,215,0,0.05)' : 'rgba(255,255,255,0.02)', border: idx === 0 ? '1px solid rgba(255,215,0,0.18)' : '1px solid rgba(255,255,255,0.05)' }}>
                                                <span style={{ fontWeight: 900, width: '22px', textAlign: 'center', fontSize: 'clamp(12px,1.8vw,16px)' }}>{medals[idx] || idx + 1}</span>
                                                <TeamBadge teamName={teamName} size="tiny" />
                                                <span style={{ flex: 1, fontWeight: 700, fontSize: 'clamp(11px,1.5vw,14px)', color: team.color }}>{team.short}</span>
                                                <span style={{ fontWeight: 900, fontSize: 'clamp(18px,2.8vw,24px)', color: idx === 0 ? '#FFD700' : 'white' }}>{pts}</span>
                                                <span style={{ fontSize: 'clamp(9px,1.2vw,11px)', color: 'rgba(255,255,255,0.28)' }}>pts</span>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    )}

                    {completedRounds.length === 0 && isAuctioneer && allLocked && (
                        <div style={{ textAlign: 'center', padding: 'clamp(20px,4vw,40px)', color: 'rgba(255,255,255,0.2)' }}>
                            <div style={{ fontSize: 'clamp(28px,5vw,48px)', marginBottom: '10px' }}>⚔️</div>
                            <p style={{ fontWeight: 700, fontSize: 'clamp(12px,1.8vw,15px)' }}>All teams ready! Start the battle sequence above.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


