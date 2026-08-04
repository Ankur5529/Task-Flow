import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { getSocket } from '../api/socket';

const Dashboard = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [activities, setActivities] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Modal state
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
                api.get('/dashboard/stats')
            ]);
            setProjects(projectsRes.data);
            setTasks(tasksRes.data);
            setActivities(activitiesRes.data);
            setStats(statsRes.data);
        } catch (err) {
            setError('Failed to load dashboard data. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, []);

    // WebSocket for live activity
    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;

        const onActivityLogged = (newActivity) => {
            setActivities(prev => {
                if (!prev.find(a => a.id === newActivity.id)) {
                    // Prepend and keep only top 50
                    return [newActivity, ...prev].slice(0, 50);
                }
                return prev;
            });
        };

        const onTaskEvent = () => {
            // Re-fetch assigned tasks if a task is created/updated/deleted
            // Since it could affect our "Assigned to Me" list. 
            // In a larger app, we'd selectively patch, but refetching is reliable here.
            api.get('/tasks/me').then(res => setTasks(res.data)).catch(console.error);
        };

        // Feature 24: When a user is assigned a task, their "Assigned to me" view updates live.
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
            const res = await api.post('/projects', {
                name: newProjectName,
                description: newProjectDesc
            });
            setProjects([...projects, { ...res.data.project, role: 'owner' }]);
            setShowModal(false);
            setNewProjectName('');
            setNewProjectDesc('');
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

    // Feature 27: Show for the logged-in user: number of projects they are in, tasks assigned to them by status, tasks they completed this week, the project with the most open tasks, and a personal recent-activity feed.
    return (
        <div className="dashboard-container" style={{ padding: '40px', maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                <div>
                    <h1>Dashboard</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Welcome back, {user?.name}</p>
                </div>
                <div>
                    <button className="btn-primary" onClick={() => setShowModal(true)} style={{ width: 'auto', marginRight: '16px' }}>
                        + New Project
                    </button>
                    <button className="btn-primary" onClick={logout} style={{ width: 'auto', backgroundColor: 'var(--glass-bg)' }}>
                        Logout
                    </button>
                </div>
            </div>

            {loading ? (
                <div>Loading dashboard...</div>
            ) : error ? (
                <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
                    <h3>Something went wrong</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
                    <button className="btn-primary" onClick={fetchDashboardData} style={{ width: 'auto', marginTop: '16px' }}>
                        Retry
                    </button>
                </div>
            ) : (
                <>
                {/* Stats Bar */}
                {stats && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
                        <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
                            <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{stats.project_count}</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>Projects</div>
                        </div>
                        <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
                            <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: 'orange' }}>{(stats.tasks_by_status?.['To Do'] || 0) + (stats.tasks_by_status?.['In Progress'] || 0)}</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>Open Tasks</div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '8px', fontSize: '0.75rem' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>To Do: <strong style={{ color: 'white' }}>{stats.tasks_by_status?.['To Do'] || 0}</strong></span>
                                <span style={{ color: 'var(--text-secondary)' }}>In Progress: <strong style={{ color: 'white' }}>{stats.tasks_by_status?.['In Progress'] || 0}</strong></span>
                            </div>
                        </div>
                        <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
                            <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: 'var(--success-color)' }}>{stats.completed_this_week}</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>Completed This Week</div>
                        </div>
                        <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
                            {stats.busiest_project ? (
                                <>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stats.busiest_project.name}</div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>{stats.busiest_project.open_task_count} open tasks</div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Most Active Project</div>
                                </>
                            ) : (
                                <div style={{ color: 'var(--text-secondary)' }}>No open tasks</div>
                            )}
                        </div>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '24px', alignItems: 'start' }}>
                    
                    {/* Feature 18: "Assigned to me" view (across all their projects) */}
                    <div className="glass-panel" style={{ padding: '24px' }}>
                        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>Assigned to Me</h2>
                        {tasks.length === 0 ? (
                            <p style={{ color: 'var(--text-secondary)' }}>No assigned tasks.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {tasks.map(task => (
                                    <div key={task.id} 
                                        className="task-card"
                                        onClick={() => navigate(`/projects/${task.project_id}`)}
                                        style={{ background: 'var(--bg-color)', padding: '12px', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--glass-border)' }}
                                    >
                                        <div style={{ fontWeight: 'bold' }}>{task.title}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Project: {task.project_name}</div>
                                        <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                                            Due: {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'None'} | Status: {task.status}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Middle Column: My Projects */}
                    <div>
                        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>My Projects</h2>
                        {projects.length === 0 ? (
                            <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
                                <h3>No projects yet</h3>
                                <p>Create your first project to get started.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '24px' }}>
                                {projects.map((project) => (
                                    <Link to={`/projects/${project.id}`} key={project.id} style={{ textDecoration: 'none' }}>
                                        <div className="glass-panel project-card" style={{ padding: '24px', transition: 'transform 0.2s', cursor: 'pointer' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                                <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '1.1rem' }}>{project.name}</h3>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    padding: '4px 8px',
                                                    borderRadius: '12px',
                                                    backgroundColor: project.role === 'owner' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                                    color: project.role === 'owner' ? 'var(--accent-color)' : 'var(--success-color)'
                                                }}>
                                                    {project.role}
                                                </span>
                                            </div>
                                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0' }}>
                                                {project.description || 'No description provided.'}
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right Column: Recent Activity */}
                    <div className="glass-panel" style={{ padding: '24px', maxHeight: '80vh', overflowY: 'auto' }}>
                        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>Recent Activity</h2>
                        {activities.length === 0 ? (
                            <p style={{ color: 'var(--text-secondary)' }}>No activity yet.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {activities.map(activity => (
                                    <div key={activity.id} style={{ fontSize: '0.85rem' }}>
                                        <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>{activity.actor_name}</span> {activity.action}
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '2px' }}>
                                            {new Date(activity.timestamp).toLocaleString()} • {activity.project_name}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                </>
            )}

            {/* Create Project Modal */}
            {showModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div className="glass-panel auth-card" style={{ maxWidth: '500px' }}>
                        <h2>Create New Project</h2>

                        {createError && <div className="error-banner">{createError}</div>}

                        <form onSubmit={handleCreateProject} className="auth-form" style={{ marginTop: '20px' }}>
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
                                <label>Description (Optional)</label>
                                <input
                                    type="text"
                                    value={newProjectDesc}
                                    onChange={(e) => setNewProjectDesc(e.target.value)}
                                    placeholder="What is this project about?"
                                    disabled={creating}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                                <button type="button" className="btn-primary" onClick={closeModal} disabled={creating} style={{ backgroundColor: 'var(--bg-color-secondary)' }}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-primary" disabled={creating}>
                                    {creating ? 'Creating...' : 'Create Project'}
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