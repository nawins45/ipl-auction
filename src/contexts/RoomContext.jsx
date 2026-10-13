import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, getDocs, serverTimestamp, arrayUnion, enableNetwork, disableNetwork } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { generateRoomCode } from '../utils/helpers';
import { GAME_PHASES, ROLES } from '../utils/constants';

const RoomContext = createContext(null);

export function RoomProvider({ children }) {
    const { user } = useAuth();
    const [roomId, setRoomId] = useState(null);
    const [room, setRoom] = useState(null);
    const [userData, setUserData] = useState(null);
    const [allUsers, setAllUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Force Firebase reconnect when tab becomes visible (fixes dropped connections on mobile)
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible') {
                try {
                    console.log('Tab visible: Reconnecting Firestore...');
                    await disableNetwork(db);
                    await enableNetwork(db);
                } catch (e) {
                    console.error('Firestore reconnect failed:', e);
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    // Restore session on reload
    useEffect(() => {
        if (user) {
            const savedRoom = localStorage.getItem('ipl_room_id');
            const savedUsername = localStorage.getItem('ipl_username');
            if (savedRoom && savedUsername) {
                // Check if room is still in a valid ongoing state before restoring
                const roomRef = doc(db, 'rooms', savedRoom);
                getDoc(roomRef).then((snap) => {
                    if (!snap.exists()) {
                        // Room no longer exists — clear session
                        localStorage.removeItem('ipl_room_id');
                        localStorage.removeItem('ipl_username');
                        localStorage.removeItem('ipl_role');
                    } else if (snap.data().status === GAME_PHASES.RESULTS) {
                        // Game is over — clear stale session
                        localStorage.removeItem('ipl_room_id');
                        localStorage.removeItem('ipl_username');
                        localStorage.removeItem('ipl_role');
                    } else {
                        setRoomId(savedRoom);
                    }
                }).catch(() => {
                    // On network error — optimistically restore session.
                    // The real-time listener will handle reconnection when network returns.
                    // Do NOT clear localStorage here — that would permanently lose the session on slow networks.
                    setRoomId(savedRoom);
                });
            }
        }
    }, [user]);

    // Listen to room document
    useEffect(() => {
        if (!roomId) return;

        const unsub = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
            if (snap.exists()) {
                setRoom({ id: snap.id, ...snap.data() });
            }
        }, (err) => {
            console.error('Room listener error:', err);
            setError('Lost connection to room');
        });

        return () => unsub();
    }, [roomId]);

    // Listen to user's own document
    useEffect(() => {
        if (!user || !roomId) return;

        const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
            if (snap.exists()) {
                setUserData({ id: snap.id, ...snap.data() });
            }
        });

        return () => unsub();
    }, [user, roomId]);

    // Listen to all users in room
    useEffect(() => {
        if (!roomId) return;

        const q = query(collection(db, 'users'), where('roomId', '==', roomId));
        const unsub = onSnapshot(q, (snap) => {
            const users = [];
            snap.forEach(d => users.push({ id: d.id, ...d.data() }));
            setAllUsers(users);
        });

        return () => unsub();
    }, [roomId]);

    // Create room (Auctioneer)
    const createRoom = useCallback(async (username) => {
        if (!user) {
            const e = new Error('User session not initialized. Please wait...');
            setError(e.message);
            throw e;
        }
        setLoading(true);
        setError(null);

        try {
            const code = generateRoomCode();
            const newRoomId = `room_${code}_${Date.now()}`;

            await setDoc(doc(db, 'rooms', newRoomId), {
                code: code,
                auctioneerId: user.uid,
                status: GAME_PHASES.WAITING,
                rules: {},
                rulesLocked: false,
                teamAssignments: {},
                shufflesUsed: {},
                currentAuction: null,
                createdAt: serverTimestamp(),
            });

            await setDoc(doc(db, 'users', user.uid), {
                uid: user.uid,
                username: username,
                roomId: newRoomId,
                role: ROLES.AUCTIONEER,
                assignedTeam: null,
                purseRemaining: 0,
                isOnline: true,
                lastSeen: serverTimestamp(),
                joinedAt: serverTimestamp(),
            });

            localStorage.setItem('ipl_room_id', newRoomId);
            localStorage.setItem('ipl_username', username);
            localStorage.setItem('ipl_role', ROLES.AUCTIONEER);
            setRoomId(newRoomId);
        } catch (err) {
            console.error('Create room error:', err);
            setError('Failed to create room: ' + err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [user]);

    // Join room (Team Owner)
    const joinRoom = useCallback(async (roomCode, username) => {
        if (!user) {
            const e = new Error('User session not initialized. Please wait...');
            setError(e.message);
            throw e;
        }
        setLoading(true);
        setError(null);

        try {
            // Find room by code
            const q = query(collection(db, 'rooms'), where('code', '==', roomCode.toUpperCase()));
            const snap = await getDocs(q);

            if (snap.empty) {
                const e = new Error('Room not found. Check the code.');
                setError(e.message);
                throw e;
            }

            const roomDoc = snap.docs[0];
            const roomData = roomDoc.data();

            if (roomData.status !== GAME_PHASES.WAITING) {
                // Check if user already exists in this room (reconnection)
                const existingUser = await getDoc(doc(db, 'users', user.uid));
                if (existingUser.exists() && existingUser.data().roomId === roomDoc.id) {
                    // Reconnecting to an ongoing game
                    // Check if kicked
                    if ((roomData.kickedUsers || []).includes(user.uid)) {
                        const e = new Error('You have been kicked from this room.');
                        setError(e.message);
                        throw e;
                    }
                    await updateDoc(doc(db, 'users', user.uid), {
                        isOnline: true,
                        lastSeen: serverTimestamp(),
                    });
                    // Preserve existing role on reconnection — don't demote auctioneer to team owner
                    const existingRole = existingUser.data().role || ROLES.TEAM_OWNER;
                    localStorage.setItem('ipl_room_id', roomDoc.id);
                    localStorage.setItem('ipl_username', username);
                    localStorage.setItem('ipl_role', existingRole);
                    setRoomId(roomDoc.id);
                    return;
                }
                const e = new Error('Game already started. Cannot join.');
                setError(e.message);
                throw e;
            }

            // Check if kicked
            if ((roomData.kickedUsers || []).includes(user.uid)) {
                const e = new Error('You have been kicked from this room.');
                setError(e.message);
                throw e;
            }

            // Check if already in room
            const existingUser = await getDoc(doc(db, 'users', user.uid));
            if (existingUser.exists() && existingUser.data().roomId === roomDoc.id) {
                // Reconnecting
                await updateDoc(doc(db, 'users', user.uid), {
                    isOnline: true,
                    lastSeen: serverTimestamp(),
                });
            } else {
                await setDoc(doc(db, 'users', user.uid), {
                    uid: user.uid,
                    username: username,
                    roomId: roomDoc.id,
                    role: ROLES.TEAM_OWNER,
                    assignedTeam: null,
                    purseRemaining: 0,
                    isOnline: true,
                    lastSeen: serverTimestamp(),
                    joinedAt: serverTimestamp(),
                });
            }

            localStorage.setItem('ipl_room_id', roomDoc.id);
            localStorage.setItem('ipl_username', username);
            localStorage.setItem('ipl_role', ROLES.TEAM_OWNER);
            setRoomId(roomDoc.id);
        } catch (err) {
            console.error('Join room error:', err);
            setError(err.message || 'Failed to join room');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [user]);

    // Leave room
    const leaveRoom = useCallback(async () => {
        localStorage.removeItem('ipl_room_id');
        localStorage.removeItem('ipl_username');
        localStorage.removeItem('ipl_role');
        setRoomId(null);
        setRoom(null);
        setUserData(null);
        setAllUsers([]);
    }, []);

    // Advance game phase (Auctioneer only)
    const advancePhase = useCallback(async (newPhase) => {
        if (!roomId) return;
        try {
            await updateDoc(doc(db, 'rooms', roomId), {
                status: newPhase,
            });
        } catch (err) {
            console.error('Advance phase error:', err);
            setError('Failed to advance phase');
        }
    }, [roomId]);

    // Kick a user from the room (auctioneer only)
    const kickUser = useCallback(async (targetUserId) => {
        if (!roomId) return;
        try {
            // Add to kicked list
            await updateDoc(doc(db, 'rooms', roomId), {
                kickedUsers: arrayUnion(targetUserId),
            });
            // Mark user as kicked
            await updateDoc(doc(db, 'users', targetUserId), {
                kicked: true,
            });
        } catch (err) {
            console.error('Kick user error:', err);
            setError('Failed to kick user');
        }
    }, [roomId]);

    const value = {
        roomId,
        room,
        userData,
        allUsers,
        loading,
        error,
        createRoom,
        joinRoom,
        leaveRoom,
        advancePhase,
        kickUser,
        setError,
    };

    return (
        <RoomContext.Provider value={value}>
            {children}
        </RoomContext.Provider>
    );
}

export function useRoom() {
    const context = useContext(RoomContext);
    if (!context) throw new Error('useRoom must be used within RoomProvider');
    return context;
}
