import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const Signup = () => {
    const { signup } = useAuth();
    const navigate = useNavigate();
    
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    // Inline validation errors (shown while typing)
    const [fieldErrors, setFieldErrors] = useState({});

    const validateField = (field, value) => {
        const errs = { ...fieldErrors };
        if (field === 'name') {
            if (!value.trim()) errs.name = 'Name is required.';
            else delete errs.name;
        }
        if (field === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) errs.email = 'Please enter a valid email address.';
            else delete errs.email;
        }
        if (field === 'password') {
            if (value.length < 8) errs.password = 'Password must be at least 8 characters.';
            else if (!/[A-Za-z]/.test(value)) errs.password = 'Password must contain at least one letter.';
            else if (!/[0-9]/.test(value)) errs.password = 'Password must contain at least one number.';
            else delete errs.password;
        }
        setFieldErrors(errs);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        // Final validation pass before submit
        const errs = {};
        if (!name.trim()) errs.name = 'Name is required.';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) errs.email = 'Please enter a valid email address.';
        if (password.length < 8) errs.password = 'Password must be at least 8 characters.';
        else if (!/[A-Za-z]/.test(password)) errs.password = 'Password must contain at least one letter.';
        else if (!/[0-9]/.test(password)) errs.password = 'Password must contain at least one number.';
        if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

        setLoading(true);
        try {
            await signup(name, email, password);
            navigate('/login');
        } catch (err) {
            setError(err.response?.data?.msg || 'Failed to sign up');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card glass-panel">
                <div className="auth-header">
                    <div className="auth-logo">Task<span>Flow.</span></div>
                    <h2>Create Account</h2>
                    <p>Join TaskFlow and start collaborating</p>
                </div>
                
                {error && <div className="error-banner">{error}</div>}
                
                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label>Full Name</label>
                        <input 
                            type="text" 
                            required 
                            value={name}
                            onChange={(e) => { setName(e.target.value); validateField('name', e.target.value); }}
                            placeholder="John Doe"
                            style={fieldErrors.name ? { borderColor: 'var(--error-color)' } : {}}
                        />
                        {fieldErrors.name && <div style={{ color: 'var(--error-color)', fontSize: '0.8rem', marginTop: '4px' }}>{fieldErrors.name}</div>}
                    </div>

                    <div className="form-group">
                        <label>Email</label>
                        <input 
                            type="email" 
                            required 
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); validateField('email', e.target.value); }}
                            placeholder="you@example.com"
                            style={fieldErrors.email ? { borderColor: 'var(--error-color)' } : {}}
                        />
                        {fieldErrors.email && <div style={{ color: 'var(--error-color)', fontSize: '0.8rem', marginTop: '4px' }}>{fieldErrors.email}</div>}
                    </div>
                    
                    <div className="form-group">
                        <label>Password</label>
                        <div style={{ position: 'relative' }}>
                            <input 
                                type={showPassword ? 'text' : 'password'}
                                required 
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); validateField('password', e.target.value); }}
                                placeholder="Min 8 chars, 1 letter, 1 number"
                                style={{ ...(fieldErrors.password ? { borderColor: 'var(--error-color)' } : {}), paddingRight: '44px' }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(v => !v)}
                                style={{
                                    position: 'absolute',
                                    right: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--text-secondary)',
                                    padding: '0',
                                    display: 'flex',
                                    alignItems: 'center',
                                }}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                                        <line x1="1" y1="1" x2="23" y2="23"/>
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                        <circle cx="12" cy="12" r="3"/>
                                    </svg>
                                )}
                            </button>
                        </div>
                        {fieldErrors.password && <div style={{ color: 'var(--error-color)', fontSize: '0.8rem', marginTop: '4px' }}>{fieldErrors.password}</div>}
                        {!fieldErrors.password && password && (
                            <div style={{ color: 'var(--success-color)', fontSize: '0.8rem', marginTop: '4px' }}>✓ Password looks good</div>
                        )}
                    </div>
                    
                    <button type="submit" className="btn-primary" disabled={loading || Object.keys(fieldErrors).length > 0}>
                        {loading ? 'Signing up...' : 'Sign Up'}
                    </button>
                </form>
                
                <div className="auth-footer">
                    Already have an account? <Link to="/login">Log in</Link>
                </div>
            </div>
        </div>
    );
};

export default Signup;

