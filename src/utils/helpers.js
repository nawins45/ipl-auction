// Helper functions for price parsing, validation, etc.

/**
 * Parse base price string to number (in lakhs)
 * "2cr" → 200, "1cr" → 100, "75l" → 75, "50l" → 50, "30l" → 30
 */
export function parsePrice(priceStr) {
    if (typeof priceStr === 'number') return priceStr;
    const str = String(priceStr).trim().toLowerCase();
    if (str.endsWith('cr')) {
        return parseFloat(str.replace('cr', '')) * 100;
    }
    if (str.endsWith('l')) {
        return parseFloat(str.replace('l', ''));
    }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
}

/**
 * Format price in lakhs to display string
 * 200 → "2.00 Cr", 50 → "50 L", 1550 → "15.50 Cr"
 */
export function formatPrice(lakhs) {
    if (lakhs >= 100) {
        return `${(lakhs / 100).toFixed(2)} Cr`;
    }
    return `${lakhs} L`;
}

/**
 * Generate unique room code (6 characters, uppercase alphanumeric)
 */
export function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Check if a player is Indian
 */
export function isIndian(nationality) {
    return nationality === 'IND';
}

/**
 * Determine auction category from player data
 */
export function getPlayerCategory(player) {
    if (player.marquee === 'YES' || player.marquee === true) return 'marquee';
    const role = (player.playerRole || player['player role'] || '').trim().toUpperCase();
    if (role === 'WK' || role === 'WK ') return 'wk';
    if (role === 'BAT') return 'bat';
    if (role === 'AR') return 'ar';
    const bowlType = (player.bowlingType || player['bowling type'] || '').trim().toUpperCase();
    if (bowlType === 'SPIN') return 'spinner';
    if (bowlType === 'FAST') return 'pacer';
    if (role === 'BOW') {
        return bowlType === 'SPIN' ? 'spinner' : 'pacer';
    }
    return 'bat'; // fallback
}

/**
 * Correct team name typos/mismatches from raw data
 */
const TEAM_NAME_CORRECTIONS = {
    'SUNRISES HYDERABAD': 'SUNRISERS HYDERABAD',
    'ROYAL CHALLENGERS BANGALORE': 'ROYAL CHALLENGERS BENGALURU',
};

function correctTeamName(name) {
    const upper = (name || '').trim().toUpperCase();
    return TEAM_NAME_CORRECTIONS[upper] || upper;
}

/**
 * Normalize raw player JSON data to consistent format
 */
export function normalizePlayer(raw, index) {
    const role = (raw['player role'] || '').trim().toUpperCase();
    const bowlingType = (raw['bowling type'] || 'NO').trim().toUpperCase();
    const nationality = (raw['Nationality'] || 'IND').trim().toUpperCase();

    const player = {
        id: `player_${index}`,
        teamName: correctTeamName(raw['Team name']),
        playerName: (raw['player name'] || '').trim(),
        playerRole: role,
        nationality: nationality,
        totalRuns: Number(raw['total runs']) || 0,
        highestScore: String(raw['highest score'] || '0'),
        strikeRate: Number(raw['strike rate']) || 0,
        fours: Number(raw["4's"]) || 0,
        sixes: Number(raw["6's"]) || 0,
        fifties: Number(raw["50's"]) || 0,
        hundreds: Number(raw["100's"]) || 0,
        wickets: Number(raw['wickets']) || 0,
        best: String(raw['best '] || raw['best'] || '0'),
        economyRate: Number(raw['economy rate']) || 0,
        status: (raw['status'] || 'CAPPED').trim().toUpperCase(),
        basePrice: parsePrice(raw['Base price'] || '30l'),
        marquee: raw['marquee'] === 'YES',
        bowlingType: bowlingType,
        category: '', // computed below
        auctionStatus: 'available',
    };

    player.category = getPlayerCategory(player);
    return player;
}

/**
 * Shuffle array (Fisher-Yates)
 */
export function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Compute a bargain score for a player based on stats vs price.
 * Higher score = better bargain (great stats, low price).
 */
export function computeBargainScore(player, soldPriceLakhs) {
    if (!player || !soldPriceLakhs || soldPriceLakhs <= 0) return 0;

    const role = (player.playerRole || '').trim().toUpperCase();

    // Batting score
    const batScore = (player.totalRuns || 0) * 0.01
        + (player.strikeRate || 0) * 0.1
        + (player.fifties || 0) * 5
        + (player.hundreds || 0) * 15
        + (player.fours || 0) * 0.2
        + (player.sixes || 0) * 0.5;

    // Bowling score
    const econ = player.economyRate || 10;
    const bowScore = (player.wickets || 0) * 3
        + Math.max(0, (10 - econ)) * 5;

    let statsScore = 0;
    if (role === 'BAT') statsScore = batScore;
    else if (role === 'BOW') statsScore = bowScore;
    else if (role === 'WK' || role === 'WK ') statsScore = batScore * 1.1;
    else if (role === 'AR') statsScore = (batScore + bowScore) * 0.7;
    else statsScore = batScore; // fallback

    // Bargain = stats per crore spent
    const priceCr = soldPriceLakhs / 100;
    return statsScore / priceCr;
}

/**
 * Calculates a squad's overall strength predictor score.
 * Evaluates individual player statistics (RTG rating) and squad composition balance.
 */
export function calcSquadPredictorScore(squadPlayers, allPlayers) {
    if (!squadPlayers || squadPlayers.length === 0) return 0;

    // Deterministic hash helper (same as PlayerCard.jsx)
    function deterministicScore(str, min, max) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
        return min + (hash % (max - min + 1));
    }

    let totalRtg = 0;
    let wkCount = 0;
    let batCount = 0;
    let bowCount = 0;
    let arCount = 0;
    let overseasCount = 0;

    squadPlayers.forEach(sp => {
        const p = allPlayers.find(pl => pl.id === sp.playerId);
        if (!p) return;

        const role = (p.playerRole || '').trim().toUpperCase();
        const score = calcPlayerRating(p);

        totalRtg += score;

        if (role === 'BAT') batCount++;
        else if (role === 'BOW') bowCount++;
        else if (role === 'WK' || role === 'WK ') wkCount++;
        else if (role === 'AR') arCount++;

        if (p.nationality !== 'IND') overseasCount++;
    });

    // Composition balance bonuses
    let balanceBonus = 0;
    if (wkCount >= 1) balanceBonus += 50; // WK is critical
    balanceBonus += Math.min(4, batCount) * 15;
    balanceBonus += Math.min(4, bowCount) * 15;
    balanceBonus += Math.min(3, arCount) * 15;

    // Penalty for exceeding squad limits
    let penalty = 0;
    if (overseasCount > 8) {
        penalty += (overseasCount - 8) * 150;
    }

    return Math.max(0, totalRtg + balanceBonus - penalty);
}

// Deterministic hash helper for marquee players
function getDeterministicScore(str, min, max) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return min + (hash % (max - min + 1));
}

/**
 * RTG/OVR Rating calculator.
 * Marquee players: 88–97 range based on ACTUAL stats (so Rohit > Will Jacks).
 * Non-marquee:    70–87 range based on ACTUAL stats.
 * Fully deterministic — no randomness.
 *
 * BAT/WK : Runs, Strike Rate, Average, Milestones
 * BOW    : Wickets, Best Figures, Economy Rate
 * AR     : Combined bat + bowl
 */
export function calcPlayerRating(player) {
    if (!player) return 70;

    const isMarquee = player.marquee === true || player.marquee === 'YES';
    const role = (player.playerRole || '').trim().toUpperCase();

    // ── Batting stats ──
    const runs     = player.totalRuns   || 0;
    const sr       = player.strikeRate  || 120;
    const fifties  = player.fifties     || 0;
    const hundreds = player.hundreds    || 0;

    // ── Bowling stats ──
    const wkts = player.wickets      || 0;
    const econ = player.economyRate  || 9.0;   // default = moderate economy

    // Parse best figures ("4/24" → 4 wickets)
    const bestStr  = (player.best || player['best '] || '0').toString().trim();
    const bestWkts = parseInt(bestStr.split('/')[0]) || 0;

    // ── Batter raw score (0.0 → 1.0) ──
    // Proxy average from career runs + milestones (T20 average range 15–50)
    const average       = 20 + Math.min(30, (runs / 150) + (fifties * 1.5) + (hundreds * 4));
    const runsScore     = Math.min(runs, 8000) / 8000;                             // 40 % weight
    const averageScore  = Math.min(average, 50) / 50;                              // 30 % weight
    const srScore       = (Math.min(Math.max(100, sr), 180) - 100) / 80;           // 20 % weight
    const milestoneScore = Math.min((fifties + hundreds * 3), 60) / 60;            // 10 % weight
    const batRaw = (runsScore * 0.4) + (averageScore * 0.3) + (srScore * 0.2) + (milestoneScore * 0.1);

    // ── Bowler raw score (0.0 → 1.0) ──
    const bowlMatches   = Math.min(Math.round(wkts / 0.8), 200);
    const wicketsScore  = Math.min(wkts, 200) / 200;                               // 40 % weight
    const bestWktsScore = Math.min(bestWkts, 6) / 6;                               // 20 % weight
    const econScore     = (12 - Math.min(Math.max(5.0, econ), 12.0)) / 7.0;        // 30 % weight (lower econ = better)
    const bowMatchScore = bowlMatches / 200;                                        // 10 % weight
    const bowRaw = (wicketsScore * 0.4) + (bestWktsScore * 0.2) + (econScore * 0.3) + (bowMatchScore * 0.1);

    // ── Role-based composite raw score ──
    let rawScore = 0;
    if (role === 'BAT') {
        rawScore = batRaw;
    } else if (role === 'WK') {
        rawScore = Math.min(1.0, batRaw + 0.05);     // slight bonus for keepers
    } else if (role === 'BOW') {
        rawScore = bowRaw;
    } else if (role === 'AR') {
        rawScore = Math.min(1.0, (batRaw + bowRaw) * 0.75);
    } else {
        rawScore = batRaw;
    }

    if (isMarquee) {
        // Marquee: stats-based, range 88–97
        // (Rohit ~95, Bumrah ~96, Will Jacks ~92, Dhoni ~95)
        return 88 + Math.round(rawScore * 9);
    }
    // Non-marquee: stats-based, range 70–87
    return 70 + Math.round(rawScore * 17);
}



