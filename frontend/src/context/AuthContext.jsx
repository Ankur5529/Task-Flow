import React, { createContext, useState, useContext, useEffect } from 'react';
import { api, setAccessToken } from '../api/axios';
import { initSocket, disconnectSocket } from '../api/socket';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const res = await api.post('/auth/refresh');
                setAccessToken(res.data.access_token);

                const meRes = await api.get('/auth/me');
                setUser(meRes.data);

                initSocket();
            } catch (err) {
                setUser(null);
            } finally {
                setLoading(false);
            }
        };
        checkAuth();
    }, []);

    const login = async (email, password) => {
        const res = await api.post('/auth/login', { email, password });
        setAccessToken(res.data.access_token);
        setUser(res.data.user);

        initSocket();

        return res.data.user;
    };

    const signup = async (name, email, password) => {
        await api.post('/auth/signup', { name, email, password });
    };

    const logout = async () => {
        await api.post('/auth/logout');
        setAccessToken(null);
        setUser(null);

        disconnectSocket();

        window.location.href = '/login';
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);