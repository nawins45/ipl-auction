// IPL Team data and constants

export const IPL_TEAMS = [
    { name: 'MUMBAI INDIANS', short: 'MI', color: '#004BA0', gradient: 'from-blue-700 to-blue-900', logo: '/teams/MI.png' },
    { name: 'CHENNAI SUPER KINGS', short: 'CSK', color: '#FCCA06', gradient: 'from-yellow-500 to-yellow-700', logo: '/teams/CSK.png' },
    { name: 'ROYAL CHALLENGERS BENGALURU', short: 'RCB', color: '#EC1C24', gradient: 'from-red-600 to-red-900', logo: '/teams/RCB.png' },
    { name: 'KOLKATA KNIGHT RIDERS', short: 'KKR', color: '#3A225D', gradient: 'from-purple-700 to-purple-900', logo: '/teams/KKR.png' },
    { name: 'DELHI CAPITALS', short: 'DC', color: '#004C93', gradient: 'from-blue-600 to-red-600', logo: '/teams/DC.png' },
    { name: 'PUNJAB KINGS', short: 'PBKS', color: '#DD1F2D', gradient: 'from-red-500 to-red-800', logo: '/teams/PBKS.png' },
    { name: 'SUNRISERS HYDERABAD', short: 'SRH', color: '#FF822A', gradient: 'from-orange-500 to-orange-800', logo: '/teams/SRH.png' },
    { name: 'GUJARAT TITANS', short: 'GT', color: '#1DB9C3', gradient: 'from-cyan-500 to-blue-900', logo: '/teams/GT.png' },
    { name: 'RAJASTHAN ROYALS', short: 'RR', color: '#EA1A85', gradient: 'from-pink-500 to-blue-700', logo: '/teams/RR.png' },
    { name: 'LUCKNOW SUPER GIANTS', short: 'LSG', color: '#A72056', gradient: 'from-red-700 to-cyan-700', logo: '/teams/LSG.png' },
];

export const GAME_PHASES = {
    WAITING: 'waiting',
    RULE_SETUP: 'ruleSetup',
    TEAM_ASSIGNMENT: 'teamAssignment',
    RETENTION: 'retention',
    WATCHLIST: 'watchlist',
    AUCTION: 'auction',
    PLAYING_XI: 'playingXI',
    SCORING: 'scoring',
    RESULTS: 'results',
    MINI_GAME: 'miniGame',
};

export const CATEGORY_ORDER = [
    { key: 'marquee', label: 'Marquee Set', icon: '⭐' },
    { key: 'wk', label: 'Wicket Keepers', icon: '🧤' },
    { key: 'bat', label: 'Batters', icon: '🏏' },
    { key: 'ar', label: 'All-rounders', icon: '🔄' },
    { key: 'spinner', label: 'Spinners', icon: '🌀' },
    { key: 'pacer', label: 'Pacers', icon: '💨' },
];

export const ROLES = {
    AUCTIONEER: 'auctioneer',
    TEAM_OWNER: 'teamOwner',
};

export const AUCTION_STATUS = {
    AVAILABLE: 'available',
    RETAINED: 'retained',
    SOLD: 'sold',
    UNSOLD: 'unsold',
    KICKED: 'kicked',
};

export const INDIAN_NATIONALITIES = ['IND'];

// IPL squad limits
export const MAX_OVERSEAS = 8;

export function getTeamByName(name) {
    return IPL_TEAMS.find(t => t.name === name) || { name, short: name.substring(0, 3), color: '#666', gradient: 'from-gray-500 to-gray-700' };
}

export function getTeamColor(teamName) {
    const team = getTeamByName(teamName);
    return team.color;
}
