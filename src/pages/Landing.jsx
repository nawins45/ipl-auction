import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRoom } from '../contexts/RoomContext';
import { ROLES } from '../utils/constants';
import TextRandomizer from '../components/TextRandomizer';

// Animated floating cricket ball particle
function Particle({ style }) {
    return <div style={style} />;
}

// Generate random particles
function useParticles(count = 18) {
    return React.useMemo(() => {
        return Array.from({ length: count }, (_, i) => ({
            id: i,
            left: `${Math.random() * 100}%`,
            size: `${4 + Math.random() * 8}px`,
            duration: `${6 + Math.random() * 10}s`,
            delay: `${Math.random() * 8}s`,
            opacity: 0.1 + Math.random() * 0.25,
            color: i % 3 === 0 ? '#A855F7' : i % 3 === 1 ? '#FFD700' : '#EC4899',
        }));
    }, []);
}

export default function Landing() {
    const { user, loading: authLoading } = useAuth();
    const { createRoom, joinRoom, error: roomError } = useRoom();

    React.useEffect(() => {
        console.log('[Auth] user:', user, 'authLoading:', authLoading);
    }, [user, authLoading]);

    const [username, setUsername] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [role, setRole] = useState(ROLES.AUCTIONEER);
    const [error, setError] = useState(null);
    const [joining, setJoining] = useState(false);
    const [activeTab, setActiveTab] = useState('join'); // 'join' | 'create'

    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [passwordError, setPasswordError] = useState('');

    const particles = useParticles(20);
    const canvasRef = useRef(null);

    // Animated grid canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let frame;
        let t = 0;

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const cols = 24;
            const rows = 14;
            const cw = canvas.width / cols;
            const ch = canvas.height / rows;

            for (let c = 0; c <= cols; c++) {
                const x = c * cw;
                const pulse = Math.sin(t * 0.02 + c * 0.3) * 0.5 + 0.5;
                ctx.strokeStyle = `rgba(140,70,255,${0.03 + pulse * 0.04})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
            }
            for (let r = 0; r <= rows; r++) {
                const y = r * ch;
                const pulse = Math.sin(t * 0.015 + r * 0.4) * 0.5 + 0.5;
                ctx.strokeStyle = `rgba(140,70,255,${0.03 + pulse * 0.04})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.stroke();
            }
            // Neon dot intersections
            for (let c = 0; c <= cols; c += 4) {
                for (let r = 0; r <= rows; r += 3) {
                    const x = c * cw;
                    const y = r * ch;
                    const pulse = Math.sin(t * 0.03 + c * 0.5 + r * 0.7) * 0.5 + 0.5;
                    ctx.beginPath();
                    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(168,85,247,${0.2 + pulse * 0.35})`;
                    ctx.fill();
                }
            }
            t++;
            frame = requestAnimationFrame(draw);
        }
        draw();
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', resize);
        };
    }, []);

    const handleCreate = async () => {
        if (!username.trim()) return setError('Enter a username');
        setShowPasswordModal(true);
        setPasswordInput('');
        setPasswordError('');
    };

    const handlePasswordSubmit = async () => {
        const correctPassword = import.meta.env.VITE_AUCTIONEER_PASSWORD || '451072024';
        if (passwordInput !== correctPassword) {
            setPasswordError('Incorrect password. Access denied.');
            return;
        }
        if (!user) {
            setPasswordError('Firebase session not ready. Wait a moment and try again.');
            return;
        }
        setShowPasswordModal(false);
        setPasswordInput('');
        setPasswordError('');
        setJoining(true);
        setError(null);
        try {
            await createRoom(username.trim());
        } catch (err) {
            console.error('[Landing] createRoom error:', err);
            setError(err.message || 'Failed to create room. Check your connection.');
        }
        setJoining(false);
    };

    const handleJoin = async () => {
        if (!username.trim()) return setError('Enter a username');
        if (!roomCode.trim()) return setError('Enter room code');
        setJoining(true);
        setError(null);
        try {
            await joinRoom(roomCode.trim().toUpperCase(), username.trim());
        } catch (err) {
            setError(err.message);
        }
        setJoining(false);
    };

    if (authLoading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
                <div style={{
                    width: '56px', height: '56px', borderRadius: '50%',
                    border: '2px solid rgba(168,85,247,0.2)',
                    borderTop: '2px solid #A855F7',
                    animation: 'spin 1s linear infinite',
                }} />
                <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '11px', letterSpacing: '0.3em', textTransform: 'uppercase' }}>Initializing</p>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', padding: '20px' }}>
            {/* Animated grid canvas */}
            <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />

            {/* Floating particles */}
            {particles.map(p => (
                <div key={p.id} style={{
                    position: 'fixed',
                    left: p.left,
                    bottom: '-20px',
                    width: p.size,
                    height: p.size,
                    borderRadius: '50%',
                    background: p.color,
                    opacity: p.opacity,
                    boxShadow: `0 0 ${parseInt(p.size) * 2}px ${p.color}`,
                    animation: `floatUp ${p.duration} ${p.delay} infinite linear`,
                    zIndex: 0,
                    pointerEvents: 'none',
                }} />
            ))}

            {/* Radial glow blobs */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                <div style={{
                    position: 'absolute', width: '600px', height: '600px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(109,40,217,0.12) 0%, transparent 70%)',
                    top: '-100px', left: '-150px',
                    animation: 'blobFloat1 15s ease-in-out infinite',
                }} />
                <div style={{
                    position: 'absolute', width: '500px', height: '500px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(236,72,153,0.08) 0%, transparent 70%)',
                    bottom: '-80px', right: '-100px',
                    animation: 'blobFloat2 18s ease-in-out infinite',
                }} />
                <div style={{
                    position: 'absolute', width: '400px', height: '400px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,215,0,0.06) 0%, transparent 70%)',
                    top: '40%', right: '10%',
                    animation: 'blobFloat1 22s ease-in-out infinite reverse',
                }} />
            </div>

            {/* Scanline overlay */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
                background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(140,70,255,0.012) 3px, rgba(140,70,255,0.012) 4px)',
            }} />

            {/* Main content */}
            <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: '480px' }}>
                {/* Hero Header */}
                <div style={{ textAlign: 'center', marginBottom: '40px', animation: 'heroSlideDown 0.8s cubic-bezier(0.22,1,0.36,1) both' }}>
                    {/* Trophy / Cricket emoji with glow */}
                    <div style={{
                        fontSize: 'clamp(3rem,8vw,5rem)',
                        marginBottom: '16px',
                        filter: 'drop-shadow(0 0 20px rgba(255,215,0,0.6))',
                        animation: 'trophyBounce 3s ease-in-out infinite',
                        display: 'inline-block',
                    }}>🏆</div>

                    {/* Brand line */}
                    <div style={{
                        fontSize: 'clamp(11px,2vw,13px)', fontWeight: 700,
                        letterSpacing: '0.5em', textTransform: 'uppercase',
                        color: 'rgba(255,215,0,0.6)',
                        marginBottom: '8px',
                        animation: 'fadeInUp 0.6s ease 0.2s both',
                    }}>N4WIN5's</div>

                    {/* Main title with gradient */}
                    <h1 style={{
                        fontSize: 'clamp(2.5rem,8vw,4rem)',
                        fontWeight: 900,
                        lineHeight: 1,
                        background: 'linear-gradient(135deg, #E2E8F0 0%, #C084FC 40%, #FFD700 80%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        marginBottom: '8px',
                        letterSpacing: '-0.02em',
                        animation: 'fadeInUp 0.7s ease 0.3s both',
                    }}>
                        IPL AUCTION
                    </h1>

                    {/* Animated neon underline */}
                    <div style={{
                        height: '2px',
                        width: '0%',
                        background: 'linear-gradient(90deg, #A855F7, #EC4899, #FFD700)',
                        margin: '12px auto',
                        borderRadius: '2px',
                        boxShadow: '0 0 12px rgba(168,85,247,0.8)',
                        animation: 'underlineExpand 0.8s cubic-bezier(0.22,1,0.36,1) 0.6s both',
                    }} />

                    {/* Subtitle */}
                    <p style={{
                        color: 'rgba(255,255,255,0.3)',
                        fontSize: 'clamp(10px,1.8vw,12px)',
                        letterSpacing: '0.35em',
                        textTransform: 'uppercase',
                        animation: 'fadeInUp 0.6s ease 0.7s both',
                    }}>Real-Time Multiplayer • 3 Game Modes</p>
                </div>

                {/* Game Mode Preview Pills */}
                <div style={{
                    display: 'flex', gap: '8px', justifyContent: 'center',
                    marginBottom: '28px', flexWrap: 'wrap',
                    animation: 'fadeInUp 0.6s ease 0.8s both',
                }}>
                    {[
                        { icon: '🏏', label: 'Classic', color: '#A855F7' },
                        { icon: '⚡', label: 'Mini-Game', color: '#FBBF24' },
                        { icon: '🕵️', label: 'Blind Bid', color: '#EC4899' },
                    ].map(m => (
                        <div key={m.label} style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '5px 12px', borderRadius: '20px',
                            background: `${m.color}10`,
                            border: `1px solid ${m.color}30`,
                            color: m.color,
                            fontSize: '11px', fontWeight: 700,
                            letterSpacing: '0.05em',
                        }}>
                            <span>{m.icon}</span>
                            <span>{m.label}</span>
                        </div>
                    ))}
                </div>

                {/* Main Card */}
                <div style={{
                    background: 'linear-gradient(145deg, rgba(10,7,28,0.95) 0%, rgba(7,4,20,0.9) 100%)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(140,70,255,0.2)',
                    borderRadius: '20px',
                    padding: 'clamp(24px,5vw,36px)',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset, 0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(120,50,255,0.06)',
                    animation: 'cardSlideUp 0.8s cubic-bezier(0.22,1,0.36,1) 0.4s both',
                }}>
                    {/* Corner brackets */}
                    {[['top-3','left-3','border-l-2 border-t-2'],['top-3','right-3','border-r-2 border-t-2'],['bottom-3','left-3','border-l-2 border-b-2'],['bottom-3','right-3','border-r-2 border-b-2']].map((b,i) => (
                        <div key={i} style={{
                            position: 'absolute',
                            top: b[0] === 'top-3' ? '12px' : undefined,
                            bottom: b[0] === 'bottom-3' ? '12px' : undefined,
                            left: b[1] === 'left-3' ? '12px' : undefined,
                            right: b[1] === 'right-3' ? '12px' : undefined,
                            width: '16px', height: '16px',
                            borderLeft: b[2].includes('border-l') ? '2px solid rgba(168,85,247,0.3)' : undefined,
                            borderRight: b[2].includes('border-r') ? '2px solid rgba(168,85,247,0.3)' : undefined,
                            borderTop: b[2].includes('border-t') ? '2px solid rgba(168,85,247,0.3)' : undefined,
                            borderBottom: b[2].includes('border-b') ? '2px solid rgba(168,85,247,0.3)' : undefined,
                        }} />
                    ))}
                    {/* Top shimmer line */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                        background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.5), rgba(255,215,0,0.3), transparent)',
                    }} />

                    {/* Tab Switcher */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr',
                        gap: '6px', marginBottom: '28px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '12px', padding: '4px',
                        border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        {[{ key: 'join', label: '🎮 Join Room', role: ROLES.TEAM_OWNER }, { key: 'create', label: '🎙️ Host Room', role: ROLES.AUCTIONEER }].map(t => (
                            <button key={t.key}
                                onClick={() => { setActiveTab(t.key); setRole(t.role); setError(null); }}
                                id={`tab-${t.key}`}
                                style={{
                                    padding: '10px 8px',
                                    borderRadius: '9px',
                                    fontWeight: 700,
                                    fontSize: 'clamp(11px,2vw,13px)',
                                    cursor: 'pointer',
                                    transition: 'all 0.25s',
                                    border: 'none',
                                    background: activeTab === t.key
                                        ? 'linear-gradient(135deg, rgba(120,50,255,0.25), rgba(168,85,247,0.15))'
                                        : 'transparent',
                                    color: activeTab === t.key ? '#C084FC' : 'rgba(255,255,255,0.3)',
                                    boxShadow: activeTab === t.key ? '0 0 20px rgba(120,50,255,0.15), inset 0 0 0 1px rgba(168,85,247,0.2)' : 'none',
                                }}
                            >{t.label}</button>
                        ))}
                    </div>

                    {/* Username Field */}
                    <div style={{ marginBottom: '18px' }}>
                        <label style={{
                            display: 'block', fontSize: '10px', fontWeight: 700,
                            color: 'rgba(168,85,247,0.6)', textTransform: 'uppercase',
                            letterSpacing: '0.25em', marginBottom: '8px',
                        }}>⬡ Callsign</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (activeTab === 'create' ? handleCreate() : handleJoin())}
                                style={{
                                    width: '100%', padding: '12px 16px',
                                    background: 'rgba(8,5,22,0.8)',
                                    border: '1px solid rgba(140,70,255,0.25)',
                                    borderRadius: '10px',
                                    color: '#E2E8F0', fontSize: '15px',
                                    outline: 'none',
                                    transition: 'all 0.2s',
                                    boxSizing: 'border-box',
                                }}
                                placeholder="Enter your name..."
                                maxLength={20}
                                id="username-input"
                            />
                        </div>
                    </div>

                    {/* Room Code (Join only) */}
                    {activeTab === 'join' && (
                        <div style={{ marginBottom: '18px' }}>
                            <label style={{
                                display: 'block', fontSize: '10px', fontWeight: 700,
                                color: 'rgba(168,85,247,0.6)', textTransform: 'uppercase',
                                letterSpacing: '0.25em', marginBottom: '8px',
                            }}>⬡ Room Code</label>
                            <input
                                type="text"
                                value={roomCode}
                                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                                style={{
                                    width: '100%', padding: '14px 16px',
                                    background: 'rgba(8,5,22,0.8)',
                                    border: '1px solid rgba(140,70,255,0.25)',
                                    borderRadius: '10px',
                                    color: '#FFD700', fontSize: '22px',
                                    fontFamily: 'monospace',
                                    letterSpacing: '0.4em',
                                    textAlign: 'center',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                                placeholder="• • • • • •"
                                maxLength={6}
                                id="room-code-input"
                            />
                        </div>
                    )}

                    {/* CTA Button */}
                    <button
                        onClick={activeTab === 'create' ? handleCreate : handleJoin}
                        disabled={joining}
                        id={activeTab === 'create' ? 'create-room-btn' : 'join-room-btn'}
                        style={{
                            width: '100%', padding: '15px',
                            background: joining ? 'rgba(120,50,255,0.2)' : 'linear-gradient(135deg, #6D28D9 0%, #7C3AED 40%, #9333EA 100%)',
                            border: '1px solid rgba(167,139,250,0.35)',
                            borderRadius: '12px',
                            color: '#fff', fontWeight: 800,
                            fontSize: '14px', letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            cursor: joining ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: joining ? 'none' : '0 0 30px rgba(109,40,217,0.4), 0 4px 12px rgba(0,0,0,0.4)',
                            position: 'relative', overflow: 'hidden',
                        }}
                    >
                        {joining ? (
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', animation: 'spin 1s linear infinite' }} />
                                {activeTab === 'create' ? 'Creating...' : 'Connecting...'}
                            </span>
                        ) : (
                            <span>{activeTab === 'create' ? '▶ Create Room' : '▶ Join Room'}</span>
                        )}
                    </button>

                    {/* Error */}
                    {(error || roomError) && (
                        <div style={{
                            marginTop: '14px', padding: '10px 14px',
                            background: 'rgba(220,38,38,0.1)',
                            border: '1px solid rgba(220,38,38,0.25)',
                            borderRadius: '10px',
                            color: '#FCA5A5', fontSize: '12px', fontWeight: 600,
                            textAlign: 'center',
                        }}>⚠️ {error || roomError}</div>
                    )}
                </div>

                {/* Footer */}
                <p style={{
                    textAlign: 'center', color: 'rgba(255,255,255,0.1)',
                    fontSize: '10px', marginTop: '24px',
                    letterSpacing: '0.2em', textTransform: 'uppercase',
                    animation: 'fadeInUp 0.6s ease 1s both',
                }}>Firebase • Real-time Sync • v2.0</p>
            </div>

            {/* Password Modal */}
            {showPasswordModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 200,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
                    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
                }}>
                    <div style={{
                        background: 'linear-gradient(145deg, rgba(10,7,28,0.98), rgba(7,4,20,0.95))',
                        border: '1px solid rgba(168,85,247,0.35)',
                        borderRadius: '20px', padding: '36px',
                        maxWidth: '380px', width: '100%',
                        position: 'relative', overflow: 'hidden',
                        boxShadow: '0 0 80px rgba(120,50,255,0.2)',
                        animation: 'cardSlideUp 0.4s cubic-bezier(0.22,1,0.36,1) both',
                    }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.6), transparent)' }} />
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔐</div>
                            <h3 style={{ color: 'white', fontWeight: 900, fontSize: '1.3rem', marginBottom: '6px' }}>Auctioneer Access</h3>
                            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>Enter the password to host a room</p>
                        </div>
                        <input
                            type="password"
                            value={passwordInput}
                            onChange={e => setPasswordInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
                            style={{
                                width: '100%', padding: '14px',
                                background: 'rgba(8,5,22,0.9)',
                                border: `1px solid ${passwordError ? 'rgba(220,38,38,0.5)' : 'rgba(140,70,255,0.3)'}`,
                                borderRadius: '10px',
                                color: '#E2E8F0', fontSize: '20px',
                                fontFamily: 'monospace', textAlign: 'center',
                                letterSpacing: '0.3em', outline: 'none',
                                marginBottom: '12px', boxSizing: 'border-box',
                            }}
                            placeholder="••••••••"
                            autoFocus
                            id="password-input"
                        />
                        {passwordError && (
                            <div style={{
                                padding: '8px 12px', borderRadius: '8px',
                                background: 'rgba(220,38,38,0.1)',
                                border: '1px solid rgba(220,38,38,0.2)',
                                color: '#FCA5A5', fontSize: '12px',
                                textAlign: 'center', marginBottom: '12px',
                            }}>❌ {passwordError}</div>
                        )}
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={() => { setShowPasswordModal(false); setPasswordError(''); }}
                                style={{
                                    flex: 1, padding: '12px',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '10px',
                                    color: 'rgba(255,255,255,0.4)',
                                    fontWeight: 600, fontSize: '13px',
                                    cursor: 'pointer',
                                }}>Cancel</button>
                            <button
                                onClick={handlePasswordSubmit}
                                id="password-submit-btn"
                                style={{
                                    flex: 1, padding: '12px',
                                    background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
                                    border: 'none', borderRadius: '10px',
                                    color: 'white', fontWeight: 800,
                                    fontSize: '13px', cursor: 'pointer',
                                    boxShadow: '0 0 20px rgba(168,85,247,0.4)',
                                }}>▶ Unlock</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Injected CSS animations */}
            <style>{`
                @keyframes floatUp {
                    0% { transform: translateY(0) scale(1); opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 0.6; }
                    100% { transform: translateY(-100vh) scale(0.5); opacity: 0; }
                }
                @keyframes heroSlideDown {
                    from { opacity: 0; transform: translateY(-30px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes cardSlideUp {
                    from { opacity: 0; transform: translateY(30px) scale(0.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes trophyBounce {
                    0%, 100% { transform: translateY(0) rotate(-3deg); }
                    50% { transform: translateY(-10px) rotate(3deg); }
                }
                @keyframes blobFloat1 {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    33% { transform: translate(30px, -20px) scale(1.05); }
                    66% { transform: translate(-20px, 15px) scale(0.95); }
                }
                @keyframes blobFloat2 {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    33% { transform: translate(-25px, 20px) scale(1.08); }
                    66% { transform: translate(20px, -15px) scale(0.92); }
                }
                @keyframes underlineExpand {
                    from { width: 0%; }
                    to { width: 60%; }
                }
                #username-input:focus, #room-code-input:focus, #password-input:focus {
                    border-color: rgba(168,85,247,0.55) !important;
                    box-shadow: 0 0 0 3px rgba(168,85,247,0.1), 0 0 20px rgba(120,50,255,0.15);
                }
            `}</style>
        </div>
    );
}
