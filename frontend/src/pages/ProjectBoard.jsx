import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../api/socket';

const ProjectBoard = () => {
    const { id: projectId } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [project, setProject] = useState(null);
    const [projectError, setProjectError] = useState(null);

    const [tasks, setTasks] = useState([]);
    const [tasksLoading, setTasksLoading] = useState(true);
    const [tasksError, setTasksError] = useState(null);

    // Pagination & Filtering
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [assigneeFilter, setAssigneeFilter] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState('desc');

    const [viewMode, setViewMode] = useState('board'); // 'board' or 'list'

    // Task action error (shown inline instead of alert())
    const [actionError, setActionError] = useState(null);

    // Create task modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'Medium', due_date: '', assignee_id: '' });
    const [creatingTask, setCreatingTask] = useState(false);
    const [createTaskError, setCreateTaskError] = useState(null);

    // Task Details Modal (Comments) state
    const [selectedTask, setSelectedTask] = useState(null);
    const [isEditingTask, setIsEditingTask] = useState(false);
    const [editTaskData, setEditTaskData] = useState({});

    const [comments, setComments] = useState([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [commentsError, setCommentsError] = useState(null);
    const [newComment, setNewComment] = useState('');
    const [postingComment, setPostingComment] = useState(false);
    const [commentPostError, setCommentPostError] = useState(null);

    // Member Management Modal state
    const [showMembersModal, setShowMembersModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('member');
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteError, setInviteError] = useState(null);

    // Activity Log state
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [activities, setActivities] = useState([]);
    const [activitiesLoading, setActivitiesLoading] = useState(false);
    const [activitiesError, setActivitiesError] = useState(null);

    const debounceRef = useRef(null);

    const fetchProject = async () => {
        setProjectError(null);
        try {
            const res = await api.get(`/projects/${projectId}`);
            setProject(res.data);
        } catch (error) {
            setProjectError('Failed to load project. Please try again.');
        }
    };

    const fetchTasks = async () => {
        setTasksLoading(true);
        setTasksError(null);
        try {
            const params = new URLSearchParams({
                page,
                per_page: 50,
                sort_by: sortBy,
                sort_order: sortOrder
            });
            if (debouncedSearch) params.append('search', debouncedSearch);
            if (priorityFilter) params.append('priority', priorityFilter);
            if (assigneeFilter) params.append('assignee', assigneeFilter);

            const res = await api.get(`/projects/${projectId}/tasks?${params.toString()}`);
            setTasks(res.data.tasks);
            setTotalPages(res.data.pages);
        } catch (error) {
            setTasksError('Failed to load tasks. Please try again.');
        } finally {
            setTasksLoading(false);
        }
    };

    const fetchComments = async (taskId) => {
        setCommentsLoading(true);
        setCommentsError(null);
        try {
            const res = await api.get(`/projects/${projectId}/tasks/${taskId}/comments`);
            setComments(res.data);
        } catch (error) {
            setCommentsError('Failed to load comments. Please try again.');
        } finally {
            setCommentsLoading(false);
        }
    };

    const fetchActivities = async () => {
        setActivitiesLoading(true);
        setActivitiesError(null);
        try {
            const res = await api.get(`/projects/${projectId}/activity`);
            setActivities(res.data);
        } catch (error) {
            setActivitiesError('Failed to load activities');
        } finally {
            setActivitiesLoading(false);
        }
    };

    const openTaskDetails = (task) => {
        setSelectedTask(task);
        setEditTaskData({
            title: task.title,
            description: task.description || '',
            priority: task.priority,
            assignee_id: task.assignee_id || '',
            due_date: task.due_date ? task.due_date.split('T')[0] : ''
        });
        setIsEditingTask(false);
        setCommentPostError(null);
        fetchComments(task.id);
    };

    const closeTaskDetails = () => {
        setSelectedTask(null);
        setIsEditingTask(false);
        setComments([]);
        setCommentsError(null);
        setNewComment('');
        setCommentPostError(null);
    };

    // Keep a ref to the latest fetchTasks so socket handlers never call a stale
    // closure that has outdated filters/sort/page baked in.
    const fetchTasksRef = useRef(fetchTasks);
    useEffect(() => {
        fetchTasksRef.current = fetchTasks;
    });

    useEffect(() => {
        fetchProject();
        // eslint-disable-next-line
    }, [projectId]);

    // Debounce search: wait 400ms after the user stops typing before refetching
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 400);
        return () => clearTimeout(debounceRef.current);
    }, [search]);

    useEffect(() => {
        fetchTasks();
        // eslint-disable-next-line
    }, [projectId, page, debouncedSearch, priorityFilter, assigneeFilter, sortBy, sortOrder]);

    // WebSocket Listener
    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;

        const onTaskCreated = (newTask) => {
            if (String(newTask.project_id) === String(projectId)) {
                fetchTasksRef.current();
            }
        };

        const onTaskUpdated = (data) => {
            if (String(data.project_id) === String(projectId)) {
                fetchTasksRef.current();
            }
        };

        const onTaskDeleted = (data) => {
            if (String(data.project_id) === String(projectId)) {
                fetchTasksRef.current();
                setSelectedTask(prev => {
                    if (prev && prev.id === data.task_id) return null;
                    return prev;
                });
            }
        };

        socket.on('task_created', onTaskCreated);
        socket.on('task_updated', onTaskUpdated);
        socket.on('task_deleted', onTaskDeleted);

        return () => {
            socket.off('task_created', onTaskCreated);
            socket.off('task_updated', onTaskUpdated);
            socket.off('task_deleted', onTaskDeleted);
        };
    }, [projectId]);

    // Handle stale closure for onCommentCreated's task checking
    const selectedTaskRef = useRef(selectedTask);
    useEffect(() => {
        selectedTaskRef.current = selectedTask;
    }, [selectedTask]);

    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;

        const onCommentCreated = (newCommentData) => {
            if (String(newCommentData.project_id) === String(projectId)) {
                if (selectedTaskRef.current && selectedTaskRef.current.id === newCommentData.task_id) {
                    setComments(prev => {
                        if (!prev.find(c => c.id === newCommentData.id)) {
                            return [...prev, newCommentData];
                        }
                        return prev;
                    });
                }
            }
        };

        socket.on('comment_created', onCommentCreated);
        return () => socket.off('comment_created', onCommentCreated);
    }, [projectId]);

    const handleStatusChange = async (taskId, newStatus) => {
        setActionError(null);
        try {
            await api.put(`/projects/${projectId}/tasks/${taskId}`, { status: newStatus });
            fetchTasks();
        } catch (error) {
            setActionError(error.response?.data?.msg || "Failed to update task status");
        }
    };

    const handleUpdateTaskDetails = async () => {
        setActionError(null);
        try {
            const payload = { ...editTaskData, due_date: editTaskData.due_date || null, assignee_id: editTaskData.assignee_id || null };
            await api.put(`/projects/${projectId}/tasks/${selectedTask.id}`, payload);
            setIsEditingTask(false);
            fetchTasks();
            const assigneeName = project.members.find(m => String(m.id) === String(payload.assignee_id))?.name || '';
            setSelectedTask({ ...selectedTask, ...payload, assignee_name: assigneeName });
        } catch (error) {
            alert(error.response?.data?.msg || 'Failed to update task');
        }
    };

    const handleDeleteTask = async () => {
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        setActionError(null);
        try {
            await api.delete(`/projects/${projectId}/tasks/${selectedTask.id}`);
            closeTaskDetails();
            fetchTasks();
        } catch (error) {
            alert(error.response?.data?.msg || 'Failed to delete task');
        }
    };

    const handleCreateTask = async (e) => {
        e.preventDefault();
        setCreateTaskError(null);
        setCreatingTask(true);
        try {
            const payload = {
                title: newTask.title,
                description: newTask.description,
                priority: newTask.priority,
                due_date: newTask.due_date || null,
                assignee_id: newTask.assignee_id || null
            };
            await api.post(`/projects/${projectId}/tasks`, payload);
            setShowCreateModal(false);
            setNewTask({ title: '', description: '', priority: 'Medium', due_date: '', assignee_id: '' });
            fetchTasks();
        } catch (error) {
            setCreateTaskError(error.response?.data?.msg || 'Failed to create task');
        } finally {
            setCreatingTask(false);
        }
    };

    const closeCreateModal = () => {
        setShowCreateModal(false);
        setCreateTaskError(null);
        setNewTask({ title: '', description: '', priority: 'Medium', due_date: '', assignee_id: '' });
    };

    const handlePostComment = async (e) => {
        e.preventDefault();
        if (!selectedTask || !newComment.trim()) return;

        setCommentPostError(null);
        setPostingComment(true);
        try {
            await api.post(`/projects/${projectId}/tasks/${selectedTask.id}/comments`, {
                content: newComment
            });
            setNewComment('');
            // The socket will receive the event and append the comment
        } catch (error) {
            setCommentPostError(error.response?.data?.msg || 'Failed to post comment');
        } finally {
            setPostingComment(false);
        }
    };

    const handleInviteMember = async (e) => {
        e.preventDefault();
        setInviteError(null);
        setInviteLoading(true);
        try {
            await api.post(`/projects/${projectId}/members`, {
                email: inviteEmail,
                role: inviteRole
            });
            setInviteEmail('');
            fetchProject(); // Refetch to get updated members list
        } catch (error) {
            setInviteError(error.response?.data?.msg || 'Failed to invite member');
        } finally {
            setInviteLoading(false);
        }
    };

    const handleRemoveMember = async (memberId) => {
        if (!window.confirm("Are you sure you want to remove this member?")) return;
        setInviteError(null);
        try {
            await api.delete(`/projects/${projectId}/members/${memberId}`);
            fetchProject(); // Refetch to update members list
            // Also refetch tasks in case assignees were updated to null
            fetchTasks(); 
        } catch (error) {
            setInviteError(error.response?.data?.msg || 'Failed to remove member');
        }
    };

    // Feature 12: A board view with columns by status; tasks appear in the right column.
    const renderBoardColumn = (title, status) => {
        const columnTasks = tasks.filter(t => t.status === status);

        return (
            <div className="board-column glass-panel" style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>{title} ({columnTasks.length})</h3>
                {columnTasks.map(task => (
                    <div
                        key={task.id}
                        className="task-card"
                        style={{ background: 'var(--bg-color)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', cursor: 'pointer' }}
                        onClick={() => openTaskDetails(task)}
                    >
                        <h4>{task.title}</h4>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                            Priority: <span style={{ color: task.priority === 'High' ? 'var(--error-color)' : task.priority === 'Medium' ? 'orange' : 'var(--success-color)' }}>{task.priority}</span>
                        </div>
                        {task.assignee_name && <div style={{ fontSize: '0.8rem' }}>Assigned: {task.assignee_name}</div>}

                        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                            <select
                                value={task.status}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => handleStatusChange(task.id, e.target.value)}
                                style={{ background: 'var(--glass-bg)', color: 'white', border: 'none', padding: '4px', borderRadius: '4px' }}
                            >
                                <option value="To Do">To Do</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Done">Done</option>
                            </select>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    if (!project && !projectError) return <div style={{ padding: '40px' }}>Loading project...</div>;

    if (projectError) {
        return (
            <div style={{ padding: '40px' }}>
                <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
                    <h3>Something went wrong</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>{projectError}</p>
                    <button className="btn-primary" onClick={fetchProject} style={{ width: 'auto', marginTop: '16px' }}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ padding: '40px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Prominent Back to Dashboard Button */}
            <div style={{ marginBottom: '24px' }}>
                <button
                    onClick={() => navigate('/')}
                    className="btn-primary"
                    style={{
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--glass-border)',
                        width: 'auto',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        fontSize: '1rem',
                        transition: 'all 0.2s',
                        color: 'white'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--glass-bg)'}
                >
                    <span style={{ fontSize: '1.2rem', lineHeight: '1' }}>&#8592;</span> Back to Dashboard
                </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                    <h1>{project.name}</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>{project.description}</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn-primary" onClick={() => { setShowActivityModal(true); fetchActivities(); }} style={{ width: 'auto', backgroundColor: 'var(--glass-bg)' }}>
                        Activity Log
                    </button>
                    <button className="btn-primary" onClick={() => setShowMembersModal(true)} style={{ width: 'auto', backgroundColor: 'var(--accent-color)' }}>
                        Manage Members
                    </button>
                    <button className="btn-primary" onClick={() => setShowCreateModal(true)} style={{ width: 'auto' }}>
                        + New Task
                    </button>
                    <button className="btn-primary" onClick={() => setViewMode(viewMode === 'board' ? 'list' : 'board')} style={{ width: 'auto', backgroundColor: 'var(--glass-bg)' }}>
                        Toggle View ({viewMode === 'board' ? 'List' : 'Board'})
                    </button>
                </div>
            </div>

            {actionError && <div className="error-banner" style={{ marginBottom: '16px' }}>{actionError}</div>}

            {/* Filters Bar */}
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <input
                    type="text"
                    placeholder="Search tasks..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ padding: '8px', background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '4px' }}
                />

                <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }} style={{ padding: '8px', background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '4px' }}>
                    <option value="">All Priorities</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                </select>

                <select value={assigneeFilter} onChange={(e) => { setAssigneeFilter(e.target.value); setPage(1); }} style={{ padding: '8px', background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '4px' }}>
                    <option value="">All Assignees</option>
                    <option value="unassigned">Unassigned</option>
                    {project.members.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                </select>

                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: '8px', background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '4px' }}>
                    <option value="created_at">Sort by Created</option>
                    <option value="priority">Sort by Priority</option>
                    <option value="due_date">Sort by Due Date</option>
                </select>

                <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={{ padding: '8px', background: 'var(--bg-color)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '4px' }}>
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                </select>
            </div>

            {tasksLoading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>Loading tasks...</div>
            ) : tasksError ? (
                <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
                    <h3>Something went wrong</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>{tasksError}</p>
                    <button className="btn-primary" onClick={fetchTasks} style={{ width: 'auto', marginTop: '16px' }}>
                        Retry
                    </button>
                </div>
            ) : viewMode === 'board' ? (
                <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                    {renderBoardColumn('To Do', 'To Do')}
                    {renderBoardColumn('In Progress', 'In Progress')}
                    {renderBoardColumn('Done', 'Done')}
                </div>
            ) : (
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                <th style={{ padding: '12px' }}>Title</th>
                                <th style={{ padding: '12px' }}>Status</th>
                                <th style={{ padding: '12px' }}>Priority</th>
                                <th style={{ padding: '12px' }}>Assignee</th>
                                <th style={{ padding: '12px' }}>Due Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map(task => (
                                <tr key={task.id} onClick={() => openTaskDetails(task)} style={{ borderBottom: '1px solid var(--glass-border)', cursor: 'pointer' }}>
                                    <td style={{ padding: '12px' }}>{task.title}</td>
                                    <td style={{ padding: '12px' }} onClick={(e) => e.stopPropagation()}>
                                        <select
                                            value={task.status}
                                            onChange={(e) => handleStatusChange(task.id, e.target.value)}
                                            style={{ background: 'var(--glass-bg)', color: 'white', border: 'none', padding: '4px', borderRadius: '4px' }}
                                        >
                                            <option value="To Do">To Do</option>
                                            <option value="In Progress">In Progress</option>
                                            <option value="Done">Done</option>
                                        </select>
                                    </td>
                                    <td style={{ padding: '12px' }}>{task.priority}</td>
                                    <td style={{ padding: '12px' }}>{task.assignee_name || 'Unassigned'}</td>
                                    <td style={{ padding: '12px' }}>{task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Pagination Controls */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '24px' }}>
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }}>Prev</button>
                        <span style={{ padding: '8px' }}>Page {page} of {totalPages}</span>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }}>Next</button>
                    </div>
                </div>
            )}

            {/* Create Task Modal */}
            {showCreateModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div className="glass-panel auth-card" style={{ maxWidth: '500px' }}>
                        <h2>Create New Task</h2>

                        {createTaskError && <div className="error-banner">{createTaskError}</div>}

                        <form onSubmit={handleCreateTask} className="auth-form" style={{ marginTop: '20px' }}>
                            <div className="form-group">
                                <label>Title</label>
                                <input
                                    type="text"
                                    required
                                    value={newTask.title}
                                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                                    placeholder="e.g. Fix login bug"
                                    disabled={creatingTask}
                                />
                            </div>
                            <div className="form-group">
                                <label>Description (Optional)</label>
                                <input
                                    type="text"
                                    value={newTask.description}
                                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                                    placeholder="What needs to be done?"
                                    disabled={creatingTask}
                                />
                            </div>
                            <div className="form-group">
                                <label>Priority</label>
                                <select
                                    value={newTask.priority}
                                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                                    disabled={creatingTask}
                                    style={{ width: '100%', padding: '8px' }}
                                >
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Due Date (Optional)</label>
                                <input
                                    type="date"
                                    value={newTask.due_date}
                                    onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                                    disabled={creatingTask}
                                    min={new Date().toISOString().split('T')[0]}
                                />
                            </div>
                            <div className="form-group">
                                <label>Assignee (Optional)</label>
                                <select
                                    value={newTask.assignee_id}
                                    onChange={(e) => setNewTask({ ...newTask, assignee_id: e.target.value })}
                                    disabled={creatingTask}
                                    style={{ width: '100%', padding: '8px' }}
                                >
                                    <option value="">Unassigned</option>
                                    {project.members.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                                <button type="button" className="btn-primary" onClick={closeCreateModal} disabled={creatingTask} style={{ backgroundColor: 'var(--bg-color-secondary)' }}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-primary" disabled={creatingTask}>
                                    {creatingTask ? 'Creating...' : 'Create Task'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Task Details / Comments Modal */}
            {selectedTask && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }} onClick={closeTaskDetails}>
                    <div className="glass-panel" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '24px', borderBottom: '1px solid var(--glass-border)' }}>
                            {/* Prominent Back to Board Button */}
                            <div style={{ marginBottom: '24px' }}>
                                <button
                                    onClick={closeTaskDetails}
                                    className="btn-primary"
                                    style={{
                                        background: 'var(--glass-bg)',
                                        border: '1px solid var(--glass-border)',
                                        width: 'auto',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '6px 12px',
                                        fontSize: '0.9rem',
                                        transition: 'all 0.2s',
                                        color: 'white'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'var(--glass-bg)'}
                                >
                                    <span style={{ fontSize: '1.2rem', lineHeight: '1' }}>&#8592;</span> Back to {project?.name || 'Board'}
                                </button>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                {isEditingTask ? (
                                    <input 
                                        type="text" 
                                        value={editTaskData.title} 
                                        onChange={(e) => setEditTaskData({...editTaskData, title: e.target.value})} 
                                        style={{ fontSize: '1.5rem', fontWeight: 'bold', width: '100%', padding: '8px', background: 'var(--bg-color)', color: 'white', border: '1px solid var(--glass-border)', borderRadius: '4px' }}
                                    />
                                ) : (
                                    <h2>{selectedTask.title}</h2>
                                )}
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {isEditingTask ? (
                                        <>
                                            <button onClick={handleUpdateTaskDetails} className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem', width: 'auto' }}>Save</button>
                                            <button onClick={() => setIsEditingTask(false)} style={{ background: 'var(--bg-color)', color: 'white', border: '1px solid var(--glass-border)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={() => setIsEditingTask(true)} style={{ background: 'var(--glass-bg)', color: 'white', border: '1px solid var(--glass-border)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>Edit</button>
                                            <button onClick={handleDeleteTask} style={{ background: 'var(--error-color)', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>Delete</button>
                                        </>
                                    )}
                                    <button onClick={closeTaskDetails} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.5rem', marginLeft: '8px' }}>&times;</button>
                                </div>
                            </div>
                            
                            {isEditingTask ? (
                                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <textarea 
                                        value={editTaskData.description} 
                                        onChange={(e) => setEditTaskData({...editTaskData, description: e.target.value})} 
                                        placeholder="Task description..."
                                        style={{ width: '100%', padding: '8px', background: 'var(--bg-color)', color: 'white', border: '1px solid var(--glass-border)', borderRadius: '4px', minHeight: '80px' }}
                                    />
                                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                        <div>
                                            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Priority</label>
                                            <select value={editTaskData.priority} onChange={e => setEditTaskData({...editTaskData, priority: e.target.value})} style={{ padding: '6px', background: 'var(--bg-color)', color: 'white', border: '1px solid var(--glass-border)', borderRadius: '4px' }}>
                                                <option value="Low">Low</option>
                                                <option value="Medium">Medium</option>
                                                <option value="High">High</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Assignee</label>
                                            <select value={editTaskData.assignee_id} onChange={e => setEditTaskData({...editTaskData, assignee_id: e.target.value})} style={{ padding: '6px', background: 'var(--bg-color)', color: 'white', border: '1px solid var(--glass-border)', borderRadius: '4px' }}>
                                                <option value="">Unassigned</option>
                                                {project.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Due Date</label>
                                            <input type="date" value={editTaskData.due_date} onChange={e => setEditTaskData({...editTaskData, due_date: e.target.value})} style={{ padding: '6px', background: 'var(--bg-color)', color: 'white', border: '1px solid var(--glass-border)', borderRadius: '4px' }} />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>{selectedTask.description || 'No description'}</p>
                                    <div style={{ display: 'flex', gap: '16px', marginTop: '16px', fontSize: '0.9rem' }}>
                                        <div><strong>Status:</strong> {selectedTask.status}</div>
                                        <div><strong>Priority:</strong> <span style={{ color: selectedTask.priority === 'High' ? 'var(--error-color)' : selectedTask.priority === 'Medium' ? 'orange' : 'var(--success-color)' }}>{selectedTask.priority}</span></div>
                                        <div><strong>Assignee:</strong> {selectedTask.assignee_name || 'Unassigned'}</div>
                                        {selectedTask.due_date && <div><strong>Due:</strong> {new Date(selectedTask.due_date).toLocaleDateString()}</div>}
                                    </div>
                                </>
                            )}
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'rgba(0,0,0,0.2)' }}>
                            <h3 style={{ marginBottom: '16px' }}>Comments</h3>
                            {commentsLoading ? (
                                <div>Loading comments...</div>
                            ) : commentsError ? (
                                <div style={{ textAlign: 'center' }}>
                                    <p style={{ color: 'var(--text-secondary)' }}>{commentsError}</p>
                                    <button className="btn-primary" onClick={() => fetchComments(selectedTask.id)} style={{ width: 'auto', marginTop: '8px' }}>
                                        Retry
                                    </button>
                                </div>
                            ) : comments.length === 0 ? (
                                <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No comments yet.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {comments.map(c => (
                                        <div key={c.id} style={{ background: 'var(--glass-bg)', padding: '12px', borderRadius: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem' }}>
                                                <strong>{c.author_name}</strong>
                                                <span style={{ color: 'var(--text-secondary)' }}>{new Date(c.timestamp).toLocaleString()}</span>
                                            </div>
                                            <div style={{ whiteSpace: 'pre-wrap' }}>{c.content}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '24px', borderTop: '1px solid var(--glass-border)' }}>
                            {commentPostError && <div className="error-banner" style={{ marginBottom: '12px' }}>{commentPostError}</div>}
                            <form onSubmit={handlePostComment} style={{ display: 'flex', gap: '12px' }}>
                                <input
                                    type="text"
                                    placeholder="Write a comment..."
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-color)', color: 'white' }}
                                    disabled={postingComment}
                                />
                                <button type="submit" className="btn-primary" style={{ width: 'auto' }} disabled={postingComment || !newComment.trim()}>
                                    {postingComment ? 'Posting...' : 'Post'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Manage Members Modal */}
            {showMembersModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }} onClick={() => setShowMembersModal(false)}>
                    <div className="glass-panel" style={{ maxWidth: '500px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '24px', borderBottom: '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <h2>Manage Members</h2>
                                <button onClick={() => setShowMembersModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'rgba(0,0,0,0.2)' }}>
                            <h3 style={{ marginBottom: '16px' }}>Current Members</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {project.members.map(m => (
                                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--glass-bg)', padding: '12px', borderRadius: '8px' }}>
                                        <div>
                                            <strong>{m.name}</strong> <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>({m.email})</span>
                                            <div style={{ fontSize: '0.8rem', marginTop: '4px', color: m.role === 'owner' ? 'var(--accent-color)' : 'var(--success-color)' }}>{m.role}</div>
                                        </div>
                                        {project.owner_id === user.id && m.id !== user.id && (
                                            <button onClick={() => handleRemoveMember(m.id)} style={{ background: 'var(--error-color)', border: 'none', color: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {project.owner_id === user.id && (
                                <div style={{ marginTop: '32px' }}>
                                    <h3 style={{ marginBottom: '16px' }}>Invite New Member</h3>
                                    {inviteError && <div className="error-banner" style={{ marginBottom: '12px' }}>{inviteError}</div>}
                                    <form onSubmit={handleInviteMember} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <input
                                            type="email"
                                            placeholder="User Email"
                                            required
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                            style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-color)', color: 'white' }}
                                        />
                                        <select
                                            value={inviteRole}
                                            onChange={(e) => setInviteRole(e.target.value)}
                                            style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-color)', color: 'white' }}
                                        >
                                            <option value="member">Member</option>
                                            <option value="owner">Owner</option>
                                        </select>
                                        <button type="submit" className="btn-primary" disabled={inviteLoading || !inviteEmail.trim()}>
                                            {inviteLoading ? 'Inviting...' : 'Send Invite'}
                                        </button>
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Activity Log Modal */}
            {showActivityModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }} onClick={() => setShowActivityModal(false)}>
                    <div className="glass-panel" style={{ maxWidth: '500px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '24px', borderBottom: '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <h2>Activity Log</h2>
                                <button onClick={() => setShowActivityModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'rgba(0,0,0,0.2)' }}>
                            {activitiesLoading ? (
                                <div>Loading activities...</div>
                            ) : activitiesError ? (
                                <div className="error-banner">{activitiesError}</div>
                            ) : activities.length === 0 ? (
                                <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No recent activity.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {activities.map(act => (
                                        <div key={act.id} style={{ background: 'var(--glass-bg)', padding: '12px', borderRadius: '8px', fontSize: '0.9rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <strong>{act.actor_name}</strong>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{new Date(act.timestamp).toLocaleString()}</span>
                                            </div>
                                            <div>{act.action}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectBoard;