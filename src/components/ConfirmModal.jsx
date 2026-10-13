import React from 'react';

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
            <div className="glass-card p-6 rounded-2xl max-w-sm w-full animate-slide-up relative" style={{ borderColor: danger ? 'rgba(239,68,68,0.3)' : 'rgba(168,85,247,0.3)' }}>
                {/* Corner brackets */}
                <div className="absolute top-2 left-2 w-4 h-4 border-l-2 border-t-2" style={{ borderColor: danger ? 'rgba(239,68,68,0.3)' : 'rgba(168,85,247,0.3)' }} />
                <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2" style={{ borderColor: danger ? 'rgba(239,68,68,0.3)' : 'rgba(168,85,247,0.3)' }} />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2" style={{ borderColor: danger ? 'rgba(239,68,68,0.3)' : 'rgba(168,85,247,0.3)' }} />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-r-2 border-b-2" style={{ borderColor: danger ? 'rgba(239,68,68,0.3)' : 'rgba(168,85,247,0.3)' }} />

                <div className="text-center mb-5">
                    <h3 className="text-xl font-black text-white mb-2">{title}</h3>
                    <p className="text-white/60 text-sm leading-relaxed">{message}</p>
                </div>

                <div className="flex gap-3 justify-center">
                    <button
                        onClick={onCancel}
                        className="px-6 py-2.5 rounded-xl font-semibold text-white/50 hover:bg-white/10 hover:text-white transition-all text-sm"
                        style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-6 py-2.5 rounded-xl font-bold text-white transition-all hover:scale-105 text-sm"
                        style={{
                            background: danger
                                ? 'linear-gradient(135deg, #DC2626, #EF4444)'
                                : 'linear-gradient(135deg, #7C3AED, #A855F7)',
                            boxShadow: danger
                                ? '0 0 20px rgba(239,68,68,0.3)'
                                : '0 0 20px rgba(168,85,247,0.3)',
                        }}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
