import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { RoomProvider, useRoom } from './contexts/RoomContext';
import { GameProvider } from './contexts/GameContext';
import { GAME_PHASES, getTeamByName } from './utils/constants';

import Landing from './pages/Landing';
import Lobby from './pages/Lobby';
import RuleSetup from './pages/RuleSetup';
import TeamAssignment from './pages/TeamAssignment';
import Retention from './pages/Retention';
import Auction from './pages/Auction';
import PlayingXI from './pages/PlayingXI';
import Scoring from './pages/Scoring';
import Results from './pages/Results';
import MiniGame from './pages/MiniGame';
import WatchlistPhase from './pages/WatchlistPhase';

/* ── Cinematic Transition Sound ── */
function playTransitionSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
        resume.then(() => {
            // Rising sweep
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(80, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.3);
            osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.6);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.65);
            osc.connect(gain).connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.7);

            // Deep thump
            const sub = ctx.createOscillator();
            const sg = ctx.createGain();
            sub.type = 'sine'; sub.frequency.value = 48;
            sg.gain.setValueAtTime(0.3, ctx.currentTime + 0.05);
            sg.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            sub.connect(sg).connect(ctx.destination);
            sub.start(ctx.currentTime + 0.05); sub.stop(ctx.currentTime + 0.55);

            // High shimmer
            const shim = ctx.createOscillator();
            const shimG = ctx.createGain();
            shim.type = 'sine'; shim.frequency.value = 1200;
            shimG.gain.setValueAtTime(0, ctx.currentTime + 0.15);
            shimG.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.25);
            shimG.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
            shim.connect(shimG).connect(ctx.destination);
            shim.start(ctx.currentTime + 0.15); shim.stop(ctx.currentTime + 0.75);
        }).catch(() => {});
    } catch (e) {}
}

/* ================================================
   CINEMATIC STINGER TRANSITION
   ================================================ */
const PARTICLES = [
    { x: 140, y: -180 }, { x: -170, y: -120 }, { x: 190, y: 80 },
    { x: -140, y: 160 }, { x: 90, y: -210 }, { x: -200, y: -70 },
    { x: 160, y: 195 }, { x: -90, y: 215 }, { x: 220, y: -40 }, { x: -220, y: 40 },
    { x: 60, y: -230 }, { x: -240, y: 100 }, { x: 250, y: 60 }, { x: -60, y: 240 },
];

const PHASE_LABELS = {
    waiting: { label: 'ROOM LOBBY', icon: '🏟️' },
    ruleSetup: { label: 'RULE SETUP', icon: '⚙️' },
    teamAssignment: { label: 'TEAM ASSIGNMENT', icon: '👥' },
    retention: { label: 'RETENTION PHASE', icon: '🔒' },
    watchlist: { label: 'WATCHLIST PHASE', icon: '🎯' },
    auction: { label: 'AUCTION PHASE', icon: '🏏' },
    playingXI: { label: 'PLAYING XI', icon: '📋' },
    miniGame: { label: 'MINI-GAME BATTLE', icon: '⚡' },
    scoring: { label: 'SCORING PHASE', icon: '📊' },
    results: { label: 'FINAL RESULTS', icon: '🏆' },
};

function StingerTransition({ teamName, phase, onDone }) {
    const team = teamName ? getTeamByName(teamName) : null;
    const color = team?.color || '#A855F7';
    const logo = team?.logo;
    const short = team?.short || '🏏';
    const phaseInfo = PHASE_LABELS[phase] || { label: 'NEXT PHASE', icon: '🎮' };

    const onDoneRef = useRef(onDone);
    useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

    useEffect(() => {
        playTransitionSound();
        const t = setTimeout(() => onDoneRef.current?.(), 2400);
        return () => clearTimeout(t);
    }, []);

    return (
        <div className="stinger-overlay" style={{ '--stinger-color': color }}>
            {/* Deep radial glow */}
            <div style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(ellipse 80% 80% at 50% 50%, ${color}20 0%, ${color}04 40%, #03020e 70%)`,
                animation: 'stinger-bg-pulse 2.4s ease-in-out both',
            }} />

            {/* Secondary colored glow */}
            <div style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(ellipse 40% 40% at 50% 50%, ${color}12 0%, transparent 65%)`,
                animation: 'stinger-bg-pulse 1.8s ease-in-out 0.3s both',
            }} />

            {/* Cinematic letterbox bars */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '60px',
                background: `linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)`,
                animation: 'stinger-bar-expand 0.4s ease 0.1s both',
                transformOrigin: 'center',
            }} />
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: '60px',
                background: `linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)`,
                animation: 'stinger-bar-expand 0.4s ease 0.1s both',
                transformOrigin: 'center',
            }} />

            {/* Horizontal light sweep - left */}
            <div style={{
                position: 'absolute', top: 0, left: '-110%', width: '110%', height: '100%',
                background: `linear-gradient(90deg, transparent 0%, ${color}20 60%, transparent 100%)`,
                animation: 'stinger-sweep-ltr 0.8s cubic-bezier(0.16,1,0.3,1) 0.05s both',
            }} />
            {/* Horizontal light sweep - right */}
            <div style={{
                position: 'absolute', top: 0, right: '-110%', width: '110%', height: '100%',
                background: `linear-gradient(270deg, transparent 0%, ${color}20 60%, transparent 100%)`,
                animation: 'stinger-sweep-rtl 0.8s cubic-bezier(0.16,1,0.3,1) 0.05s both',
            }} />

            {/* Top neon bar */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                background: `linear-gradient(90deg, transparent 0%, ${color}ff 30%, #fff 50%, ${color}ff 70%, transparent 100%)`,
                boxShadow: `0 0 20px ${color}, 0 0 40px ${color}80`,
                animation: 'stinger-bar-expand 0.5s ease 0.2s both',
                transformOrigin: 'center',
            }} />
            {/* Bottom neon bar */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px',
                background: `linear-gradient(90deg, transparent 0%, ${color}ff 30%, #fff 50%, ${color}ff 70%, transparent 100%)`,
                boxShadow: `0 0 20px ${color}, 0 0 40px ${color}80`,
                animation: 'stinger-bar-expand 0.5s ease 0.2s both',
                transformOrigin: 'center',
            }} />

            {/* Corner slashes - all 4 corners */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '30%', height: '3px', background: `linear-gradient(90deg, ${color}, transparent)`, boxShadow: `0 0 12px ${color}`, transformOrigin: 'left', animation: 'stinger-corner-tl 0.5s ease 0.3s both' }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: '30%', height: '3px', background: `linear-gradient(270deg, ${color}, transparent)`, boxShadow: `0 0 12px ${color}`, transformOrigin: 'right', animation: 'stinger-corner-tl 0.5s ease 0.35s both' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '30%', height: '3px', background: `linear-gradient(90deg, ${color}, transparent)`, boxShadow: `0 0 12px ${color}`, transformOrigin: 'left', animation: 'stinger-corner-br 0.5s ease 0.3s both' }} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: '30%', height: '3px', background: `linear-gradient(270deg, ${color}, transparent)`, boxShadow: `0 0 12px ${color}`, transformOrigin: 'right', animation: 'stinger-corner-br 0.5s ease 0.35s both' }} />

            {/* Phase label top-left */}
            <div style={{
                position: 'absolute', top: '20px', left: '24px',
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.4em',
                textTransform: 'uppercase', color: `${color}90`,
                animation: 'stinger-sub-in 0.4s ease 0.5s both',
            }}>{phaseInfo.icon} {phaseInfo.label}</div>

            {/* Progress bar at bottom */}
            <div style={{
                position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
                width: 'clamp(100px,20vw,180px)', height: '2px',
                background: 'rgba(255,255,255,0.06)', borderRadius: '2px',
                overflow: 'hidden',
                animation: 'stinger-sub-in 0.4s ease 0.6s both',
            }}>
                <div style={{
                    height: '100%', borderRadius: '2px',
                    background: `linear-gradient(90deg, ${color}, #fff)`,
                    boxShadow: `0 0 8px ${color}`,
                    animation: 'stingerProgressFill 2.2s cubic-bezier(0.4,0,0.2,1) 0.2s both',
                }} />
            </div>

            {/* Center content */}
            <div style={{
                position: 'relative',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
                animation: 'stinger-center-in 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.18s both',
            }}>
                {/* Outer echo ring */}
                <div style={{
                    position: 'absolute',
                    width: 'clamp(130px,22vw,190px)', height: 'clamp(130px,22vw,190px)',
                    borderRadius: '50%',
                    border: `1px solid ${color}25`,
                    animation: 'stingerRingEcho 1.8s ease-out 0.6s infinite',
                    top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                }} />
                {/* Main logo ring */}
                <div style={{
                    width: 'clamp(110px,19vw,160px)', height: 'clamp(110px,19vw,160px)',
                    borderRadius: '50%',
                    border: `2px solid ${color}60`,
                    boxShadow: `0 0 60px ${color}80, 0 0 120px ${color}30, inset 0 0 40px ${color}15`,
                    background: `radial-gradient(circle, ${color}10 0%, rgba(3,2,14,0.85) 70%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'stinger-ring-pulse 1.4s ease-in-out infinite 0.5s',
                    position: 'relative',
                }}>
                    {/* Inner ring */}
                    <div style={{
                        position: 'absolute', inset: '8px', borderRadius: '50%',
                        border: `1px solid ${color}30`,
                    }} />
                    {logo
                        ? <img src={logo} alt={short} style={{ width: '60%', height: '60%', objectFit: 'contain', filter: `drop-shadow(0 0 20px ${color}) drop-shadow(0 0 8px ${color})` }} />
                        : <span style={{ fontSize: 'clamp(3rem,8vw,5rem)', filter: `drop-shadow(0 0 24px ${color})` }}>{short}</span>
                    }
                </div>

                {/* Team name with glow */}
                {team && (
                    <div style={{
                        fontSize: 'clamp(1.2rem,3.5vw,2.2rem)', fontWeight: 900,
                        textTransform: 'uppercase', letterSpacing: '0.2em',
                        color, textShadow: `0 0 30px ${color}, 0 0 60px ${color}60, 0 2px 4px rgba(0,0,0,0.8)`,
                        animation: 'stinger-name-in 0.65s cubic-bezier(0.34,1.56,0.64,1) 0.35s both',
                    }}>
                        {team.name}
                    </div>
                )}

                {/* Divider line */}
                <div style={{
                    width: 'clamp(80px,16vw,140px)', height: '1px',
                    background: `linear-gradient(90deg, transparent, ${color}80, transparent)`,
                    animation: 'stinger-bar-expand 0.5s ease 0.55s both',
                    transformOrigin: 'center',
                }} />

                {/* Subtitle */}
                <div style={{
                    fontSize: 'clamp(9px,1.5vw,11px)', fontWeight: 700, letterSpacing: '0.4em',
                    textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
                    animation: 'stinger-sub-in 0.4s ease 0.65s both',
                }}>
                    {phaseInfo.label}
                </div>
            </div>

            {/* Particle burst — varied colors */}
            {PARTICLES.map((p, i) => (
                <div key={i} style={{
                    position: 'absolute', left: '50%', top: '50%',
                    width: i % 4 === 0 ? '6px' : i % 2 === 0 ? '4px' : '3px',
                    height: i % 4 === 0 ? '6px' : i % 2 === 0 ? '4px' : '3px',
                    borderRadius: i % 3 === 0 ? '2px' : '50%',
                    background: i % 4 === 0 ? '#FFD700' : i % 3 === 0 ? '#EC4899' : color,
                    boxShadow: `0 0 ${i % 4 === 0 ? 12 : 8}px ${i % 4 === 0 ? '#FFD700' : color}`,
                    animation: `stinger-particle ${1.4 + (i % 3) * 0.2}s ease ${0.22 + i * 0.035}s both`,
                    '--px': `${p.x}px`, '--py': `${p.y}px`,
                }} />
            ))}
        </div>
    );
}

/* ── Main Router ── */
function GameRouter() {
    const { loading: authLoading } = useAuth();
    const { room, roomId, userData } = useRoom();
    const [showTransition, setShowTransition] = useState(false);
    const [transitionTeam, setTransitionTeam] = useState(null);
    const prevPhaseRef = useRef(null);

    const myTeamName = room?.teamAssignments?.[userData?.uid] || '';
    const [transitionPhase, setTransitionPhase] = useState(null);

    const handleTransitionDone = useCallback(() => setShowTransition(false), []);

    useEffect(() => {
        if (!room?.status) return;
        if (!prevPhaseRef.current) {
            prevPhaseRef.current = room.status;
            return;
        }
        if (room.status !== prevPhaseRef.current) {
            setTransitionTeam(myTeamName || null);
            setTransitionPhase(room.status);
            setShowTransition(true);
        }
        prevPhaseRef.current = room.status;
    }, [room?.status, myTeamName]);

    if (authLoading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: '56px', height: '56px', borderRadius: '50%',
                        border: '3px solid rgba(168,85,247,0.2)',
                        borderTop: '3px solid #A855F7',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 16px',
                    }} />
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>Loading...</p>
                </div>
            </div>
        );
    }

    if (!roomId || !room) return <Landing />;

    let page;
    switch (room.status) {
        case GAME_PHASES.WAITING:         page = <Lobby />;          break;
        case GAME_PHASES.RULE_SETUP:      page = <RuleSetup />;      break;
        case GAME_PHASES.TEAM_ASSIGNMENT: page = <TeamAssignment />;  break;
        case GAME_PHASES.RETENTION:       page = <Retention />;       break;
        case GAME_PHASES.WATCHLIST:       page = <WatchlistPhase />;  break;
        case GAME_PHASES.AUCTION:         page = <Auction />;         break;
        case GAME_PHASES.PLAYING_XI:      page = <PlayingXI />;       break;
        case GAME_PHASES.SCORING:         page = <Scoring />;         break;
        case GAME_PHASES.RESULTS:         page = <Results />;         break;
        case GAME_PHASES.MINI_GAME:       page = <MiniGame />;        break;
        default:                          page = <Lobby />;
    }

    return (
        <>
            {showTransition && (
                <StingerTransition
                    teamName={transitionTeam}
                    phase={transitionPhase}
                    onDone={handleTransitionDone}
                />
            )}
            {page}
        </>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <RoomProvider>
                <GameProvider>
                    <GameRouter />
                </GameProvider>
            </RoomProvider>
        </AuthProvider>
    );
}
