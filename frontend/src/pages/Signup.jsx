import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const Signup = () => {
    const { signup } = useAuth();
    const navigate = useNavigate();
    
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
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
                        <input 
                            type="password" 
                            required 
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); validateField('password', e.target.value); }}
                            placeholder="Min 8 chars, 1 letter, 1 number"
                            style={fieldErrors.password ? { borderColor: 'var(--error-color)' } : {}}
                        />
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

