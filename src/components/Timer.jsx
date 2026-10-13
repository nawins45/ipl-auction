import React, { useState, useEffect, useRef } from 'react';

export default function Timer({ endTime, onExpire, size = 'normal' }) {
    const [remaining, setRemaining] = useState(0);
    const [total, setTotal] = useState(0);
    const expiredRef = useRef(false);

    useEffect(() => {
        if (!endTime) {
            setRemaining(0);
            expiredRef.current = false;
            return;
        }

        const endMs = new Date(endTime).getTime();
        const startMs = Date.now();
        const totalSecs = Math.max(0, Math.ceil((endMs - startMs) / 1000));
        setTotal(totalSecs);
        expiredRef.current = false;

        const interval = setInterval(() => {
            const now = Date.now();
            const secsLeft = Math.max(0, Math.ceil((endMs - now) / 1000));
            setRemaining(secsLeft);

            if (secsLeft <= 0 && !expiredRef.current) {
                expiredRef.current = true;
                clearInterval(interval);
                if (onExpire) onExpire();
            }
        }, 100);

        return () => clearInterval(interval);
    }, [endTime, onExpire]);

    const progress = total > 0 ? (remaining / total) * 100 : 0;
    const isUrgent = remaining <= 5 && remaining > 0;

    const sizeClasses = size === 'large'
        ? 'w-28 h-28 text-4xl'
        : size === 'small'
            ? 'w-14 h-14 text-lg'
            : 'w-20 h-20 text-2xl';

    return (
        <div className="flex flex-col items-center gap-2">
            <div
                className={`${sizeClasses} rounded-full flex items-center justify-center relative`}
                style={{
                    background: `conic-gradient(from 0deg, ${isUrgent ? '#EF4444' : '#FFD700'} ${progress}%, rgba(255,255,255,0.1) 0)`,
                }}
            >
                <div className={`absolute inset-1 rounded-full bg-ipl-dark flex items-center justify-center ${isUrgent ? 'animate-timer-urgent' : ''
                    }`}>
                    <span className={`font-black ${isUrgent ? 'text-red-500' : 'text-white'}`}>
                        {remaining}
                    </span>
                </div>
            </div>
            {remaining > 0 && (
                <span className={`text-xs ${isUrgent ? 'text-red-400' : 'text-white/50'}`}>
                    {isUrgent ? '⚡ HURRY!' : 'seconds'}
                </span>
            )}
        </div>
    );
}
