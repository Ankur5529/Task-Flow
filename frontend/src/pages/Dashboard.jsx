import React, { useState, useEffect } from 'react';
import { api } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { getSocket } from '../api/socket';

/* ── tiny reusable stat card ── */
const StatCard = ({ value, label, color, sub }) => (
    <div className="stat-card">
        <div style={{ fontSize: '2rem', fontWeight: '800', color: color || 'var(--accent-color)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{sub}</div>}
    </div>
);

const Dashboard = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [activities, setActivities] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [showModal, setShowModal] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState(null);

    const fetchDashboardData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [projectsRes, tasksRes, activitiesRes, statsRes] = await Promise.all([
                api.get('/projects'),
                api.get('/tasks/me'),
                api.get('/activity/me'),
                api.get('/dashboard/stats'),
            ]);
            setProjects(projectsRes.data);
            setTasks(tasksRes.data);
            setActivities(activitiesRes.data);
            setStats(statsRes.data);
        } catch {
            setError('Failed to load dashboard data. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDashboardData(); }, []);

    /* live socket updates */
    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;

        const onActivityLogged = (a) => {
            setActivities(prev => prev.find(x => x.id === a.id) ? prev : [a, ...prev].slice(0, 50));
        };
        const onTaskEvent = () => {
            api.get('/tasks/me').then(r => setTasks(r.data)).catch(console.error);
        };

        socket.on('activity_logged', onActivityLogged);
        socket.on('task_created', onTaskEvent);
        socket.on('task_updated', onTaskEvent);
        socket.on('task_deleted', onTaskEvent);
        socket.on('assigned_task_updated', onTaskEvent);
        return () => {
            socket.off('activity_logged', onActivityLogged);
            socket.off('task_created', onTaskEvent);
            socket.off('task_updated', onTaskEvent);
            socket.off('task_deleted', onTaskEvent);
            socket.off('assigned_task_updated', onTaskEvent);
        };
    }, []);

    const handleCreateProject = async (e) => {
        e.preventDefault();
        setCreateError(null);
        setCreating(true);
        try {
            const res = await api.post('/projects', { name: newProjectName, description: newProjectDesc });
            setProjects([...projects, { ...res.data.project, role: 'owner' }]);
            closeModal();
        } catch (err) {
            setCreateError(err.response?.data?.msg || 'Failed to create project');
        } finally {
            setCreating(false);
        }
    };

    const closeModal = () => {
        setShowModal(false);
        setCreateError(null);
        setNewProjectName('');
        setNewProjectDesc('');
    };

    /* ── PRIORITY COLOR ── */
    const priorityColor = (p) =>
        p === 'High' ? 'var(--error-color)' : p === 'Medium' ? 'var(--warning-color)' : 'var(--success-color)';

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-color)' }}>

            {/* ── TOP NAV ── */}
            <nav className="nav-header">
                <div className="nav-logo">Task<span>Flow.</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '500' }}>
                        Hello, <strong style={{ color: 'var(--text-primary)' }}>{user?.name}</strong>
                    </span>
                    <button
                        className="btn-primary"
                        onClick={() => setShowModal(true)}
                        style={{ width: 'auto', padding: '8px 18px', fontSize: '0.875rem' }}
                    >
                        + New Project
                    </button>
                    <button
                        onClick={logout}
                        style={{
                            padding: '8px 18px',
                            background: 'white',
                            color: 'var(--text-secondary)',
                            border: '1.5px solid var(--card-border)',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--error-color)'; e.currentTarget.style.color = 'var(--error-color)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    >
                        Logout
                    </button>
                </div>
            </nav>

            {/* ── MAIN CONTENT ── */}
            <div style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-secondary)' }}>Loading dashboard…</div>
                ) : error ? (
                    <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
                        <h3 style={{ marginBottom: '8px' }}>Something went wrong</h3>
                        <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
                        <button className="btn-primary" onClick={fetchDashboardData} style={{ width: 'auto', marginTop: '16px' }}>Retry</button>
                    </div>
                ) : (
                    <>
                        {/* ── HERO STATS ── */}
                        {stats && (
                            <>
                                {/* Blue hero card */}
                                <div className="hero-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.85rem', opacity: 0.85, marginBottom: '4px', fontWeight: '500' }}>
                                            Welcome back, {user?.name} 👋
                                        </div>
                                        <div style={{ fontSize: '2.2rem', fontWeight: '800', letterSpacing: '-1px' }}>
                                            {stats.project_count} Project{stats.project_count !== 1 ? 's' : ''}
                                        </div>
                                        <div style={{ fontSize: '0.875rem', opacity: 0.8, marginTop: '4px' }}>you're a member of</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.6rem', fontWeight: '800' }}>
                                                {(stats.tasks_by_status?.['To Do'] || 0) + (stats.tasks_by_status?.['In Progress'] || 0)}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', opacity: 0.8, fontWeight: '500' }}>Open Tasks</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.6rem', fontWeight: '800' }}>{stats.completed_this_week}</div>
                                            <div style={{ fontSize: '0.78rem', opacity: 0.8, fontWeight: '500' }}>Done This Week</div>
                                        </div>
                                        {stats.busiest_project && (
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '1.6rem', fontWeight: '800' }}>{stats.busiest_project.open_task_count}</div>
                                                <div style={{ fontSize: '0.78rem', opacity: 0.8, fontWeight: '500' }}>{stats.busiest_project.name}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Small stat cards row */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
                                    <StatCard value={stats.project_count} label="Total Projects" color="var(--accent-color)" />
                                    <StatCard
                                        value={stats.tasks_by_status?.['To Do'] || 0}
                                        label="To Do"
                                        color="var(--text-secondary)"
                                    />
                                    <StatCard
                                        value={stats.tasks_by_status?.['In Progress'] || 0}
                                        label="In Progress"
                                        color="var(--warning-color)"
                                    />
                                    <StatCard
                                        value={stats.completed_this_week}
                                        label="Done This Week"
                                        color="var(--success-color)"
                                    />
                                </div>
                            </>
                        )}

                        {/* ── THREE-COLUMN LAYOUT ── */}
                        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 280px', gap: '24px', alignItems: 'start' }}>

                            {/* LEFT: Assigned to Me */}
                            <div className="glass-panel" style={{ padding: '24px' }}>
                                <h2 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--card-border)' }}>
                                    📋 Assigned to Me
                                </h2>
                                {tasks.length === 0 ? (
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No tasks assigned to you.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {tasks.map(task => (
                                            <div
                                                key={task.id}
                                                className="task-card"
                                                onClick={() => navigate(`/projects/${task.project_id}`)}
                                                style={{ padding: '12px', cursor: 'pointer' }}
                                            >
                                                <div style={{ fontWeight: '600', fontSize: '0.875rem', marginBottom: '4px' }}>{task.title}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                                    {task.project_name}
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: '600', color: priorityColor(task.priority) }}>
                                                        ● {task.priority}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                        {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* CENTER: My Projects */}
                            <div>
                                <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px' }}>My Projects</h2>
                                {projects.length === 0 ? (
                                    <div className="glass-panel" style={{ padding: '48px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🚀</div>
                                        <h3 style={{ marginBottom: '8px' }}>No projects yet</h3>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '20px' }}>
                                            Create your first project to get started.
                                        </p>
                                        <button className="btn-primary" onClick={() => setShowModal(true)} style={{ width: 'auto' }}>
                                            + New Project
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                                        {projects.map((project) => (
                                            <Link to={`/projects/${project.id}`} key={project.id} style={{ textDecoration: 'none' }}>
                                                <div className="glass-panel project-card" style={{ padding: '24px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                                        <div style={{
                                                            width: '40px', height: '40px', borderRadius: '10px',
                                                            background: 'linear-gradient(135deg, #2563EB, #6366F1)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: '1.1rem', fontWeight: '700', color: 'white',
                                                            flexShrink: 0,
                                                        }}>
                                                            {project.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <span style={{
                                                            fontSize: '0.68rem', padding: '3px 8px', borderRadius: '12px', fontWeight: '700',
                                                            backgroundColor: project.role === 'owner' ? 'rgba(37,99,235,0.1)' : 'rgba(16,185,129,0.1)',
                                                            color: project.role === 'owner' ? 'var(--accent-color)' : 'var(--success-color)',
                                                        }}>
                                                            {project.role.toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                                                        {project.name}
                                                    </h3>
                                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.4' }}>
                                                        {project.description || 'No description provided.'}
                                                    </p>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* RIGHT: Recent Activity */}
                            <div className="glass-panel" style={{ padding: '24px', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
                                <h2 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--card-border)', flexShrink: 0 }}>
                                    ⚡ Recent Activity
                                </h2>
                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                    {activities.length === 0 ? (
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No activity yet.</p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                            {activities.map(activity => (
                                                <div key={activity.id} style={{ fontSize: '0.82rem' }}>
                                                    <span style={{ fontWeight: '700', color: 'var(--accent-color)' }}>{activity.actor_name}</span>{' '}
                                                    <span style={{ color: 'var(--text-primary)' }}>{activity.action}</span>
                                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: '2px' }}>
                                                        {new Date(activity.timestamp).toLocaleString()} · {activity.project_name}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>
                    </>
                )}
            </div>

            {/* ── CREATE PROJECT MODAL ── */}
            {showModal && (
                <div style={{
                    position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.5)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
                }} onClick={closeModal}>
                    <div className="glass-panel" style={{ maxWidth: '480px', width: '100%', padding: '36px', animation: 'slideIn 0.2s ease-out' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ marginBottom: '8px' }}>Create New Project</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '24px' }}>
                            Give your project a name and an optional description.
                        </p>

                        {createError && <div className="error-banner">{createError}</div>}

                        <form onSubmit={handleCreateProject} className="auth-form">
                            <div className="form-group">
                                <label>Project Name</label>
                                <input
                                    type="text"
                                    required
                                    value={newProjectName}
                                    onChange={(e) => setNewProjectName(e.target.value)}
                                    placeholder="e.g. Website Redesign"
                                    disabled={creating}
                                />
                            </div>
                            <div className="form-group">
                                <label>Description <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(Optional)</span></label>
                                <input
                                    type="text"
                                    value={newProjectDesc}
                                    onChange={(e) => setNewProjectDesc(e.target.value)}
                                    placeholder="What is this project about?"
                                    disabled={creating}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    disabled={creating}
                                    style={{
                                        flex: 1, padding: '12px', background: 'white', color: 'var(--text-secondary)',
                                        border: '1.5px solid var(--card-border)', borderRadius: '10px',
                                        cursor: 'pointer', fontWeight: '600', fontSize: '0.95rem',
                                    }}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn-primary" disabled={creating} style={{ flex: 1 }}>
                                    {creating ? 'Creating…' : 'Create Project'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;