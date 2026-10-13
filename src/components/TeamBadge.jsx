import React from 'react';
import { getTeamByName } from '../utils/constants';

export default function TeamBadge({ teamName, size = 'normal', showName = false }) {
    const team = getTeamByName(teamName);

    const sizeClasses = size === 'large'
        ? 'w-16 h-16'
        : size === 'small'
            ? 'w-8 h-8'
            : size === 'tiny'
                ? 'w-5 h-5'
                : 'w-12 h-12';

    return (
        <div className="flex items-center gap-2" title={team.name}>
            <div
                className={`${sizeClasses} rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 bg-white/10 shadow-lg`}
                style={{ borderColor: team.color, borderWidth: '2px', borderStyle: 'solid' }}
            >
                {team.logo ? (
                    <img
                        src={team.logo}
                        alt={team.short}
                        className="w-full h-full object-contain p-0.5"
                        onError={(e) => {
                            // Fallback to text abbreviation if image fails
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                        }}
                    />
                ) : null}
                <span
                    className={`font-black text-white items-center justify-center ${size === 'large' ? 'text-xl' : size === 'small' ? 'text-[8px]' : 'text-xs'
                        } ${team.logo ? 'hidden' : 'flex'}`}
                >
                    {team.short}
                </span>
            </div>
            {showName && (
                <span className="text-sm font-semibold" style={{ color: team.color }}>
                    {team.short}
                </span>
            )}
        </div>
    );
}
