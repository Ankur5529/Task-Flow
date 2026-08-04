import { io } from 'socket.io-client';
import { getAccessToken } from './axios';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

let socket = null;

export const initSocket = () => {
    if (!socket) {
        socket = io(SOCKET_URL, {
            auth: (cb) => {
                cb({ token: getAccessToken() });
            },
            withCredentials: true,
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('Socket connected');
        });

        // Feature 26: Handle disconnects sensibly. The socket automatically reconnects when possible.
        socket.on('disconnect', () => {
            console.log('Socket disconnected');
        });
    }
    return socket;
};

export const getSocket = () => {
    if (!socket) {
        console.warn("Socket not initialized. Call initSocket() first.");
    }
    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};