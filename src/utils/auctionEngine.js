// Auction Engine — Category ordering, player queue generation, bid validation
import { CATEGORY_ORDER } from './constants.js';
import { shuffleArray } from './helpers.js';

/**
 * Build the full auction queue from available players.
 * Order: Marquee → WK → BAT → AR → Spinners → Pacers
 * Within each category: random, but avoid consecutive same-team
 */
export function buildAuctionQueue(players) {
    const queue = [];

    for (const cat of CATEGORY_ORDER) {
        const catPlayers = players.filter(p => p.category === cat.key && p.auctionStatus === 'available');
        const ordered = avoidConsecutiveSameTeam(shuffleArray(catPlayers));
        queue.push(...ordered);
    }

    return queue;
}

/**
 * Rearrange players to avoid consecutive same-team players
 */
function avoidConsecutiveSameTeam(players) {
    if (players.length <= 1) return players;

    const result = [];
    const remaining = [...players];

    while (remaining.length > 0) {
        const lastTeam = result.length > 0 ? result[result.length - 1].teamName : null;

        // Find a player not from the last team
        let idx = remaining.findIndex(p => p.teamName !== lastTeam);
        if (idx === -1) idx = 0; // fallback if all remaining are same team

        result.push(remaining[idx]);
        remaining.splice(idx, 1);
    }

    return result;
}

/**
 * Validate a bid
 * Returns { valid: boolean, reason?: string }
 */
export function validateBid(bidAmount, currentBid, basePrice, purseRemaining, minIncrement, squadSize, maxSquadSize) {
    if (squadSize >= maxSquadSize) {
        return { valid: false, reason: 'Squad is full' };
    }

    if (bidAmount > purseRemaining) {
        return { valid: false, reason: 'Insufficient purse' };
    }

    const minimumBid = currentBid > 0 ? currentBid + minIncrement : basePrice;

    if (bidAmount < minimumBid) {
        return { valid: false, reason: `Minimum bid is ${minimumBid} L` };
    }

    return { valid: true };
}

/**
 * Calculate the next minimum bid
 */
export function getNextMinBid(currentBid, basePrice, minIncrement) {
    if (currentBid === 0) return basePrice;
    return currentBid + minIncrement;
}

/**
 * Get category label and icon
 */
export function getCategoryInfo(categoryKey) {
    return CATEGORY_ORDER.find(c => c.key === categoryKey) || { key: categoryKey, label: categoryKey, icon: '🏏' };
}
