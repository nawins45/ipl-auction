import React from 'react';
import { getTeamByName } from '../utils/constants';
import { formatPrice, isIndian, calcPlayerRating } from '../utils/helpers';
import { getCategoryInfo } from '../utils/auctionEngine';

// ──────────────────────────────────────────────────────────
// Stats to show in footer block, depending on role
// ──────────────────────────────────────────────────────────
function getFooterStats(player) {
    const role = (player.playerRole || '').trim().toUpperCase();
    if (role === 'BOW') {
        return [
            { label: 'WKTS', value: player.wickets ?? '—' },
            { label: 'ECON', value: player.economyRate ?? '—' },
            { label: 'BEST', value: player.best || '—' },
            { label: 'TYPE', value: player.bowlingType === 'FAST' ? 'PACE' : (player.bowlingType === 'SPIN' ? 'SPIN' : '—') },
        ];
    } else if (role === 'AR') {
        return [
            { label: 'RUNS', value: player.totalRuns ?? '—' },
            { label: 'S/R',  value: player.strikeRate ?? '—' },
            { label: 'WKTS', value: player.wickets ?? '—' },
            { label: 'ECO',  value: player.economyRate ?? '—' },
        ];
    } else {
        // BAT / WK
        return [
            { label: 'RUNS', value: player.totalRuns ?? '—' },
            { label: 'S/R',  value: player.strikeRate ?? '—' },
            { label: 'H/S',  value: player.highestScore ?? '—' },
            { label: '50s',  value: player.fifties ?? '—' },
        ];
    }
}

// ──────────────────────────────────────────────────────────
// Nationality flag emoji
// ──────────────────────────────────────────────────────────
function getFlagEmoji(nationality) {
    if (!nationality) return '🌍';
    const nat = nationality.toUpperCase();
    const map = {
        IND: '🇮🇳', AUS: '🇦🇺', ENG: '🇬🇧', SA:  '🇿🇦', NZ:  '🇳🇿',
        WI:  '🏳️', PAK: '🇵🇰', SL:  '🇱🇰', AFG: '🇦🇫', BAN: '🇧🇩',
        ZIM: '🇿🇼', IRE: '🇮🇪', SCO: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', NAM: '🇳🇦', NED: '🇳🇱',
    };
    return map[nat] || '🌍';
}

// ──────────────────────────────────────────────────────────
// Role-based gradient for the top hero banner
// ──────────────────────────────────────────────────────────
function getRoleGradient(role, teamColor) {
    const base = teamColor || '#8B5CF6';
    const r = parseInt(base.slice(1, 3), 16);
    const g = parseInt(base.slice(3, 5), 16);
    const b = parseInt(base.slice(5, 7), 16);
    return `linear-gradient(135deg, rgb(${r},${g},${b}) 0%, rgba(${r},${g},${b},0.7) 40%, rgba(6,6,14,0.95) 100%)`;
}

export default function PlayerCard({
    player,
    selected,
    onSelect,
    showTeam = false,
    compact = false,
    index = 0,
}) {
    const team    = getTeamByName(player.teamName);
    const catInfo = getCategoryInfo(player.category);
    const rtg     = calcPlayerRating(player);
    const stats   = getFooterStats(player);
    const flag    = getFlagEmoji(player.nationality);
    const teamColor = team?.color || '#8B5CF6';

    // hex → rgb helper for box-shadow
    const hex = teamColor.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    const borderColor   = `rgba(${r},${g},${b},0.75)`;
    const glowColor     = `rgba(${r},${g},${b},0.35)`;
    const footerBg      = `rgba(${r},${g},${b},0.88)`;
    const heroBg        = getRoleGradient(player.playerRole, teamColor);

    const cardClip = 'polygon(14px 0%, calc(100% - 14px) 0%, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0% calc(100% - 14px), 0% 14px)';

    if (compact) {
        // ── Compact tile used in squad / retention lists ──────────────────
        return (
            <div
                onClick={onSelect ? () => onSelect(player) : undefined}
                className={`relative cursor-pointer rounded-xl p-3 transition-all duration-300 animate-stagger-pop ${selected ? 'scale-[1.02]' : ''}`}
                style={{
                    animationDelay: `${0.05 + index * 0.07}s`,
                    background: `linear-gradient(135deg, rgba(${r},${g},${b},0.1) 0%, rgba(6,6,14,0.85) 100%)`,
                    border: `1.5px solid ${selected ? borderColor : `rgba(${r},${g},${b},0.25)`}`,
                    boxShadow: selected ? `0 0 18px ${glowColor}` : 'none',
                }}
            >
                <div className="flex items-center gap-2">
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black"
                        style={{ background: footerBg, color: '#fff', flexShrink: 0 }}
                    >
                        {rtg}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm truncate">{player.playerName}</p>
                        <p className="text-[10px]" style={{ color: `rgba(${r},${g},${b},0.85)` }}>
                            {flag} {player.playerRole} · {catInfo.icon}
                        </p>
                    </div>
                    <span className="text-[10px] font-bold text-ipl-gold">₹{formatPrice(player.basePrice)}</span>
                </div>
                {selected && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                        style={{ background: teamColor }}>✓</div>
                )}
            </div>
        );
    }

    // ── Full F1-style Sports Card ─────────────────────────────────────────
    return (
        <div
            onClick={onSelect ? () => onSelect(player) : undefined}
            className={`relative cursor-pointer select-none transition-all duration-300 hover:scale-[1.02] animate-stagger-pop ${onSelect ? '' : 'hover:scale-100'}`}
            style={{
                animationDelay: `${0.05 + index * 0.07}s`,
                clipPath: cardClip,
                background: '#0a0814',
                border: `3px solid ${borderColor}`,
                boxShadow: `0 0 30px ${glowColor}, 0 0 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`,
                borderRadius: '4px',
                overflow: 'hidden',
                minWidth: compact ? 'auto' : '220px',
            }}
        >
            {/* ── TOP HERO SECTION (team-colored background + diagonal stripes) ── */}
            <div className="relative" style={{ background: heroBg, minHeight: '120px', overflow: 'hidden' }}>
                {/* Diagonal decorative stripes */}
                <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage: `repeating-linear-gradient(
                        -55deg,
                        rgba(255,255,255,0.03) 0px,
                        rgba(255,255,255,0.03) 2px,
                        transparent 2px,
                        transparent 20px
                    )`,
                    pointerEvents: 'none',
                }} />

                {/* RTG badge - top left */}
                <div className="absolute top-3 left-3 z-10">
                    <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.7)' }}>RTG</p>
                    <p className="font-black leading-none" style={{
                        fontSize: '2.6rem',
                        color: '#fff',
                        textShadow: `0 0 20px rgba(255,255,255,0.4), 0 2px 0 rgba(0,0,0,0.5)`,
                        lineHeight: 1,
                    }}>{rtg}</p>
                </div>

                {/* Team / IPL label - right side vertical */}
                <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1">
                    {player.marquee && (
                        <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(255,215,0,0.2)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.4)' }}>
                            ★ MARQUEE
                        </span>
                    )}
                    <span className="text-[9px] font-semibold"
                        style={{
                            color: 'rgba(255,255,255,0.5)',
                            writingMode: 'vertical-rl',
                            textOrientation: 'mixed',
                            letterSpacing: '0.15em',
                            transform: 'rotate(180deg)',
                            maxHeight: '80px',
                        }}>
                        IPL · {team?.short || '???'}
                    </span>
                </div>

                {/* Role icon / avatar placeholder (center bottom) */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex items-end justify-center pb-2">
                    <div style={{ fontSize: '3.5rem', opacity: 0.18, lineHeight: 1, userSelect: 'none' }}>
                        {player.playerRole === 'BOW' ? '🎯' : player.playerRole === 'WK' ? '🧤' : player.playerRole === 'AR' ? '⚡' : '🏏'}
                    </div>
                </div>

                {/* Category label bottom-left of hero */}
                <div className="absolute bottom-2 left-3">
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.6)' }}>
                        {catInfo.icon} {catInfo.label}
                    </span>
                </div>
            </div>

            {/* ── MIDDLE BANNER — Flag + Player Name ── */}
            <div className="px-3 pt-2.5 pb-2" style={{ background: '#0d0a1e' }}>
                {/* Nationality flag row */}
                <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg leading-none">{flag}</span>
                    {showTeam && team && (
                        <span className="text-[10px] font-semibold" style={{ color: teamColor }}>{team.short}</span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                        style={{ background: `rgba(${r},${g},${b},0.12)`, color: teamColor }}>
                        {player.playerRole}
                    </span>
                    <span className="text-[10px] text-white/30 ml-auto">₹{formatPrice(player.basePrice)}</span>
                </div>

                {/* Player Name — large, bold, F1 style */}
                <h3 className="font-black uppercase leading-tight tracking-wide"
                    style={{
                        fontSize: 'clamp(1rem, 3.5vw, 1.35rem)',
                        color: '#fff',
                        textShadow: `0 0 15px ${glowColor}`,
                        letterSpacing: '0.04em',
                    }}>
                    {player.playerName}
                </h3>
            </div>

            {/* ── FOOTER STATS BLOCK — solid team-color background ── */}
            <div style={{ background: footerBg }}>
                <div className="grid grid-cols-4" style={{ borderTop: `2px solid rgba(255,255,255,0.15)` }}>
                    {stats.map((stat, i) => (
                        <div key={i}
                            className="flex flex-col items-center py-2 px-1"
                            style={{ borderRight: i < 3 ? '1px solid rgba(255,255,255,0.12)' : 'none' }}>
                            <span className="text-[8px] font-bold uppercase tracking-widest"
                                style={{ color: 'rgba(255,255,255,0.65)', letterSpacing: '0.12em' }}>
                                {stat.label}
                            </span>
                            <span className="font-black text-white leading-tight mt-0.5"
                                style={{ fontSize: '1.05rem', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                                {stat.value}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Selection tick */}
            {selected && (
                <div className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center font-black text-sm z-20"
                    style={{ background: teamColor, boxShadow: `0 0 12px ${glowColor}`, color: '#fff' }}>
                    ✓
                </div>
            )}
        </div>
    );
}
