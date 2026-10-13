import React from 'react';
import { formatPrice } from '../utils/helpers';

export default function PurseBar({ remaining, total, label = 'Purse' }) {
    const pct = total > 0 ? (remaining / total) * 100 : 0;
    const isLow = pct < 20;

    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-white/60">{label}</span>
                <span className={`text-sm font-bold ${isLow ? 'text-red-400' : 'text-ipl-gold'}`}>
                    ₹{formatPrice(remaining)} / ₹{formatPrice(total)}
                </span>
            </div>
            <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${isLow
                            ? 'bg-gradient-to-r from-red-600 to-red-400'
                            : 'bg-gradient-to-r from-emerald-500 to-ipl-gold'
                        }`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}
