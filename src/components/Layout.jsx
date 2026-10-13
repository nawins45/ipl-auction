import React, { useEffect, useState } from 'react';
import { useRoom } from '../contexts/RoomContext';
import { GAME_PHASES, ROLES, getTeamByName } from '../utils/constants';
import { formatPrice } from '../utils/helpers';
import TeamBadge from './TeamBadge';
import PurseBar from './PurseBar';

// Detect iOS Safari (no Fullscreen API support)
const isIOS = typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !('MSStream' in window);

// iOS "Add to Home Screen" guide popup
function IOSFullscreenGuide({ onClose }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
            padding: '16px',
        }} onClick={onClose}>
            <div style={{
                background: 'linear-gradient(145deg,rgba(12,7,30,0.99),rgba(8,4,22,0.99))',
                border: '1px solid rgba(168,85,247,0.3)',
                borderRadius: '20px', padding: '24px',
                width: '100%', maxWidth: '420px',
                boxShadow: '0 0 60px rgba(168,85,247,0.15)',
                marginBottom: '8px',
            }} onClick={e => e.stopPropagation()}>
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '6px' }}>📱</div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: 'white' }}>
                        Fullscreen on iPhone / iPad
                    </h3>
                    <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
                        iOS Safari doesn't allow fullscreen. Use the Home Screen shortcut instead!
                    </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
                    {[
                        { n: 1, icon: '⬆️', text: 'Tap the Share button at the bottom of Safari' },
                        { n: 2, icon: '➕', text: 'Tap "Add to Home Screen"' },
                        { n: 3, icon: '🏏', text: 'Open the "IPL Auction" icon from your Home Screen' },
                        { n: 4, icon: '🔄', text: 'Rotate device to landscape for the full experience!' },
                    ].map(s => (
                        <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '12px', background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(168,85,247,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>{s.icon}</div>
                            <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>{s.text}</p>
                        </div>
                    ))}
                </div>
                <button onClick={onClose} style={{
                    width: '100%', padding: '12px', borderRadius: '12px', border: 'none',
                    background: 'linear-gradient(135deg,#6D28D9,#A855F7)',
                    color: 'white', fontWeight: 900, fontSize: '14px', cursor: 'pointer',
                    boxShadow: '0 0 20px rgba(168,85,247,0.25)',
                }}>Got it! ✓</button>
            </div>
        </div>
    );
}

// Fullscreen + Landscape Lock Button
function FullscreenButton() {
    const [isFS, setIsFS] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [showIOSGuide, setShowIOSGuide] = useState(false);

    useEffect(() => {
        const handler = () => setIsFS(!!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement
        ));
        document.addEventListener('fullscreenchange', handler);
        document.addEventListener('webkitfullscreenchange', handler);
        document.addEventListener('mozfullscreenchange', handler);
        return () => {
            document.removeEventListener('fullscreenchange', handler);
            document.removeEventListener('webkitfullscreenchange', handler);
            document.removeEventListener('mozfullscreenchange', handler);
        };
    }, []);

    const toggle = async () => {
        // iOS: show guide instead
        if (isIOS) { setShowIOSGuide(true); return; }
        try {
            const el = document.documentElement;
            const isInFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
            if (!isInFS) {
                const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
                if (req) {
                    await req.call(el);
                    try { await screen.orientation.lock('landscape'); } catch (e) {}
                }
            } else {
                const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
                if (exit) await exit.call(document);
                try { screen.orientation.unlock(); } catch (e) {}
            }
        } catch (e) {}
    };

    return (
        <>
            {showIOSGuide && <IOSFullscreenGuide onClose={() => setShowIOSGuide(false)} />}
            <button
                onClick={toggle}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                id="fullscreen-btn"
                title={isIOS ? 'iOS Fullscreen Guide' : isFS ? 'Exit Fullscreen' : 'Enter Fullscreen (Landscape)'}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '34px', height: '34px',
                    borderRadius: '8px',
                    background: hovered ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${hovered ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    color: hovered ? '#C084FC' : 'rgba(255,255,255,0.55)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    flexShrink: 0,
                    position: 'relative',
                }}
            >
                {isIOS ? (
                    // iOS: show Apple share-style icon
                    <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M12 3v12M8 7l4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
                    </svg>
                ) : isFS ? (
                    <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </svg>
                ) : (
                    <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                    </svg>
                )}
                {isIOS && (
                    <span style={{
                        position: 'absolute', top: '-2px', right: '-2px',
                        width: '7px', height: '7px', borderRadius: '50%',
                        background: '#A855F7', boxShadow: '0 0 6px rgba(168,85,247,0.8)',
                    }} />
                )}
            </button>
        </>
    );
}

export default function Layout({ children }) {
    const { room, userData, roomId, leaveRoom } = useRoom();
    const isAuctioneer = userData?.role === ROLES.AUCTIONEER;
    const teamName = room?.teamAssignments?.[userData?.uid];
    const team = teamName ? getTeamByName(teamName) : null;
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

    // Inject team-specific CSS colour variables into :root
    useEffect(() => {
        if (team && team.color) {
            const hex = team.color.replace('#', '');
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            document.documentElement.style.setProperty('--theme-color', team.color);
            document.documentElement.style.setProperty('--theme-r', r);
            document.documentElement.style.setProperty('--theme-g', g);
            document.documentElement.style.setProperty('--theme-b', b);
            document.documentElement.style.setProperty('--theme-glow', `rgba(${r},${g},${b},0.3)`);
            document.documentElement.style.setProperty('--theme-subtle', `rgba(${r},${g},${b},0.08)`);
            document.documentElement.style.setProperty(
                '--theme-gradient',
                `linear-gradient(135deg, rgba(${r},${g},${b},0.9) 0%, rgba(${r},${g},${b},0.5) 50%, rgba(6,6,14,0.95) 100%)`
            );
        } else {
            // Default purple fallback
            document.documentElement.style.setProperty('--theme-color', '#8B5CF6');
            document.documentElement.style.setProperty('--theme-r', 139);
            document.documentElement.style.setProperty('--theme-g', 92);
            document.documentElement.style.setProperty('--theme-b', 246);
            document.documentElement.style.setProperty('--theme-glow', 'rgba(139,92,246,0.3)');
            document.documentElement.style.setProperty('--theme-subtle', 'rgba(139,92,246,0.08)');
            document.documentElement.style.setProperty('--theme-gradient', 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 50%, #A78BFA 100%)');
        }
    }, [teamName]);

    const phaseLabels = {
        [GAME_PHASES.WAITING]: 'Lobby',
        [GAME_PHASES.RULE_SETUP]: 'Rule Setup',
        [GAME_PHASES.TEAM_ASSIGNMENT]: 'Team Assignment',
        [GAME_PHASES.RETENTION]: 'Retention',
        [GAME_PHASES.AUCTION]: 'Live Auction',
        [GAME_PHASES.PLAYING_XI]: 'Playing XI',
        [GAME_PHASES.SCORING]: 'Scoring',
        [GAME_PHASES.RESULTS]: 'Results',
        [GAME_PHASES.MINI_GAME]: 'Mini Game',
    };

    return (
        <div className="min-h-screen">
            {/* HUD Header — Premium */}
            <header className="sticky top-0 z-50" style={{
                background: 'linear-gradient(180deg, rgba(5,4,16,0.98) 0%, rgba(6,4,18,0.92) 100%)',
                backdropFilter: 'blur(24px) saturate(150%)',
                borderBottom: '1px solid rgba(168,85,247,0.12)',
                boxShadow: '0 1px 0 rgba(168,85,247,0.06), 0 4px 30px rgba(0,0,0,0.5)',
            }}>
                <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '52px' }}>

                        {/* Left — Brand + Phase */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {/* Brand mark */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{
                                        width: '20px', height: '20px', borderRadius: '5px',
                                        background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '11px', flexShrink: 0,
                                        boxShadow: '0 0 10px rgba(168,85,247,0.4)',
                                    }}>🏏</div>
                                    <span style={{
                                        fontSize: '13px', fontWeight: 900, letterSpacing: '0.12em',
                                        textTransform: 'uppercase',
                                        background: 'linear-gradient(135deg, #C084FC, #A855F7, #818CF8)',
                                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                    }}>IPL Auction</span>
                                </div>
                                {room?.status && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '26px' }}>
                                        <div style={{
                                            width: '5px', height: '5px', borderRadius: '50%',
                                            background: '#A855F7', animation: 'pulse 2s infinite',
                                            boxShadow: '0 0 6px rgba(168,85,247,0.7)',
                                        }} />
                                        <span style={{
                                            fontSize: '9px', color: 'rgba(192,132,252,0.55)',
                                            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em',
                                        }}>{phaseLabels[room.status] || room.status}</span>
                                    </div>
                                )}
                            </div>

                            {/* Room code pill */}
                            {roomId && (
                                <div style={{
                                    display: 'none',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    background: 'rgba(88,28,235,0.08)',
                                    border: '1px solid rgba(109,40,217,0.18)',
                                }} className="sm-show">
                                    <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>ROOM </span>
                                    <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 800, color: '#A78BFA' }}>{room?.code}</span>
                                </div>
                            )}
                        </div>

                        {/* Right — User & Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {team && <TeamBadge teamName={teamName} size="small" />}

                            {userData?.purseRemaining !== undefined && !isAuctioneer && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>PURSE</span>
                                        <span style={{ fontSize: '13px', fontWeight: 900, color: '#FBBF24' }}>₹{formatPrice(userData.purseRemaining)}</span>
                                    </div>
                                    <div style={{ width: '72px' }}>
                                        <PurseBar remaining={userData.purseRemaining} total={(room?.rules?.totalPurse || 120) * 100} label="" />
                                    </div>
                                </div>
                            )}

                            {/* User badge */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '5px 10px', borderRadius: '8px',
                                background: 'rgba(88,28,235,0.07)',
                                border: '1px solid rgba(109,40,217,0.16)',
                            }}>
                                <div style={{
                                    width: '6px', height: '6px', borderRadius: '50%',
                                    background: '#34D399', boxShadow: '0 0 6px rgba(52,211,153,0.6)',
                                }} />
                                <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>{userData?.username}</span>
                                {isAuctioneer && (
                                    <span style={{
                                        fontSize: '8px', padding: '1px 5px', borderRadius: '4px',
                                        fontWeight: 800, color: '#C084FC', letterSpacing: '0.1em',
                                        background: 'rgba(109,40,217,0.18)', border: '1px solid rgba(167,139,250,0.2)',
                                    }}>HOST</span>
                                )}
                            </div>

                            {/* Leave Room Button — visible to all users inside a room */}
                            {roomId && room?.status !== GAME_PHASES.WAITING && (
                                <button onClick={() => setShowLeaveConfirm(true)}
                                    title="Leave Room"
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '5px',
                                        padding: '5px 10px', borderRadius: '8px', cursor: 'pointer',
                                        background: 'rgba(220,38,38,0.07)',
                                        border: '1px solid rgba(220,38,38,0.18)',
                                        color: 'rgba(248,113,113,0.75)',
                                        fontSize: '11px', fontWeight: 700,
                                        transition: 'all 0.18s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background='rgba(220,38,38,0.14)'; e.currentTarget.style.color='#FCA5A5'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background='rgba(220,38,38,0.07)'; e.currentTarget.style.color='rgba(248,113,113,0.75)'; }}
                                >
                                    🚪 <span style={{ display: 'none' }} className="sm-show">Leave</span>
                                </button>
                            )}

                            {/* Fullscreen Button */}
                            <FullscreenButton />
                        </div>
                    </div>
                </div>
            </header>

            {/* Leave Room Confirmation Modal */}
            {showLeaveConfirm && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
                    <div style={{ background: 'linear-gradient(145deg,rgba(10,5,25,0.99),rgba(8,4,20,0.99))', border: '1px solid rgba(220,38,38,0.25)', borderRadius: '20px', padding: 'clamp(24px,5vw,40px)', maxWidth: '380px', width: '90%', textAlign: 'center', boxShadow: '0 0 50px rgba(220,38,38,0.1)' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🚪</div>
                        <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'white', margin: '0 0 10px' }}>Leave Room?</h3>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: '0 0 24px', lineHeight: 1.6 }}>You'll exit the current game and return to the lobby. This won't affect other players.</p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button onClick={() => setShowLeaveConfirm(false)}
                                style={{ padding: '12px 24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>
                                Cancel
                            </button>
                            <button onClick={() => { setShowLeaveConfirm(false); leaveRoom(); }}
                                style={{ padding: '12px 24px', borderRadius: '12px', border: '1px solid rgba(220,38,38,0.4)', background: 'linear-gradient(135deg,#991B1B,#DC2626)', color: 'white', fontWeight: 900, cursor: 'pointer', fontSize: '14px', boxShadow: '0 0 20px rgba(220,38,38,0.2)' }}>
                                🚪 Yes, Leave
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="px-4 py-6 max-w-7xl mx-auto animate-fade-in">
                {children}
            </main>
        </div>
    );
}
