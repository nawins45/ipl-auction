/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                ipl: {
                    purple: '#2D1B69',
                    navy: '#0A0E1A',
                    gold: '#FFD700',
                    accent: '#E8A317',
                    dark: '#030712',
                    card: 'rgba(15, 10, 40, 0.7)',
                    surface: 'rgba(25, 15, 60, 0.5)',
                },
                neon: {
                    purple: '#A855F7',
                    blue: '#6366F1',
                    cyan: '#22D3EE',
                    pink: '#EC4899',
                    violet: '#8B5CF6',
                },
                team: {
                    mi: '#004BA0',
                    csk: '#FCCA06',
                    rcb: '#EC1C24',
                    kkr: '#3A225D',
                    dc: '#004C93',
                    pbks: '#DD1F2D',
                    srh: '#FF822A',
                    gt: '#1C1C1C',
                    rr: '#EA1A85',
                    lsg: '#A72056',
                }
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            animation: {
                'pulse-gold': 'pulseGold 2s ease-in-out infinite',
                'pulse-neon': 'pulseNeon 2s ease-in-out infinite',
                'slide-up': 'slideUp 0.5s ease-out both',
                'slide-in': 'slideIn 0.3s ease-out both',
                'fade-in': 'fadeIn 0.4s ease-out both',
                'bid-flash': 'bidFlash 0.5s ease-out',
                'sold-stamp': 'soldStamp 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                'timer-urgent': 'timerUrgent 0.5s ease-in-out infinite',
                'float': 'float 3s ease-in-out infinite',
                'glow': 'glow 2s ease-in-out infinite',
                'border-glow': 'borderGlow 3s ease-in-out infinite',
                'spin-slow': 'spin 8s linear infinite',
                'bounce-in': 'bounceIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both',
                'scale-in': 'scaleIn 0.3s ease-out both',
            },
            keyframes: {
                pulseGold: {
                    '0%, 100%': { boxShadow: '0 0 5px rgba(255, 215, 0, 0.2), inset 0 0 5px rgba(255, 215, 0, 0.05)' },
                    '50%': { boxShadow: '0 0 30px rgba(255, 215, 0, 0.4), inset 0 0 10px rgba(255, 215, 0, 0.1)' },
                },
                pulseNeon: {
                    '0%, 100%': { boxShadow: '0 0 5px rgba(168, 85, 247, 0.3), inset 0 0 5px rgba(168, 85, 247, 0.05)' },
                    '50%': { boxShadow: '0 0 25px rgba(168, 85, 247, 0.5), inset 0 0 10px rgba(168, 85, 247, 0.1)' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(30px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                slideIn: {
                    '0%': { transform: 'translateX(-20px)', opacity: '0' },
                    '100%': { transform: 'translateX(0)', opacity: '1' },
                },
                fadeIn: {
                    '0%': { opacity: '0', transform: 'scale(0.98)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                bidFlash: {
                    '0%': { background: 'rgba(255, 215, 0, 0.3)', transform: 'scale(1.02)' },
                    '100%': { background: 'transparent', transform: 'scale(1)' },
                },
                soldStamp: {
                    '0%': { transform: 'scale(3) rotate(-10deg)', opacity: '0' },
                    '100%': { transform: 'scale(1) rotate(-5deg)', opacity: '1' },
                },
                timerUrgent: {
                    '0%, 100%': { color: '#EF4444' },
                    '50%': { color: '#FFD700' },
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-10px)' },
                },
                glow: {
                    '0%, 100%': { filter: 'brightness(1)' },
                    '50%': { filter: 'brightness(1.3)' },
                },
                borderGlow: {
                    '0%, 100%': { borderColor: 'rgba(168, 85, 247, 0.3)' },
                    '50%': { borderColor: 'rgba(168, 85, 247, 0.6)' },
                },
                bounceIn: {
                    '0%': { transform: 'scale(0.3)', opacity: '0' },
                    '50%': { transform: 'scale(1.1)' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
                scaleIn: {
                    '0%': { transform: 'scale(0.9)', opacity: '0' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
            },
            backdropBlur: {
                xs: '2px',
            },
            boxShadow: {
                'neon-purple': '0 0 15px rgba(168, 85, 247, 0.3), 0 0 30px rgba(168, 85, 247, 0.1)',
                'neon-gold': '0 0 15px rgba(255, 215, 0, 0.3), 0 0 30px rgba(255, 215, 0, 0.1)',
                'neon-cyan': '0 0 15px rgba(34, 211, 238, 0.3), 0 0 30px rgba(34, 211, 238, 0.1)',
            }
        },
    },
    plugins: [],
}
