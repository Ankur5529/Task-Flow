import axios from 'axios';

// Base instance
export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
    withCredentials: true, // Crucial for sending/receiving HttpOnly cookies
});

// Feature 2: The access token is stored in memory to prevent XSS. The refresh token is in an HttpOnly cookie.
let accessToken = null;

export const setAccessToken = (token) => {
    accessToken = token;
};

export const getAccessToken = () => {
    return accessToken;
};

// --- Concurrent refresh handling ---
// Prevents multiple simultaneous 401s (e.g. several dashboard calls at once)
// from each independently triggering their own /auth/refresh call.
let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(callback) {
    refreshSubscribers.push(callback);
}

function onRefreshed(newToken) {
    refreshSubscribers.forEach((callback) => callback(newToken));
    refreshSubscribers = [];
}

// Request interceptor: Attach the access token to every request
api.interceptors.request.use((config) => {
    if (accessToken) {
        config.headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Feature 5: Expired access token returns 401 and the client transparently refreshes and retries.
api.interceptors.response.use((response) => {
    return response;
}, async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't retried this request yet
    if (error.response?.status === 401 && !originalRequest._retry &&
        originalRequest.url !== '/auth/login' && originalRequest.url !== '/auth/refresh') {

        if (isRefreshing) {
            // A refresh is already in flight — wait for it instead of starting a new one
            return new Promise((resolve) => {
                subscribeTokenRefresh((newToken) => {
                    originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                    resolve(api(originalRequest));
                });
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            // Attempt to refresh the token using the HttpOnly cookie
            const refreshResponse = await axios.post('http://localhost:5000/auth/refresh', {}, {
                withCredentials: true
            });

            const newAccessToken = refreshResponse.data.access_token;
            setAccessToken(newAccessToken);
            isRefreshing = false;
            onRefreshed(newAccessToken);

            // Retry the original request with the new token
            originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
            return api(originalRequest);
        } catch (refreshError) {
            // Refresh failed (e.g. cookie expired), clear token and redirect to login
            isRefreshing = false;
            refreshSubscribers = [];
            setAccessToken(null);
            window.location.href = '/login';
            return Promise.reject(refreshError);
        }
    }

    return Promise.reject(error);
});