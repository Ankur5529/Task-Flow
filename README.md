# TaskFlow

TaskFlow is a web-based task management tool that works as an alternative for lightweight Trello or Jira. It allows users to register, create projects, add other users registered in TaskFlow as members having specific roles like owner or member and manages tasks with help of kanban-style board consisting of columns such as “To Do,” “In Progress,” and “Done.” Tasks include prioritization levels, deadlines, and assignees, and other members of the team can leave comments on tasks. There is also personal dashboard in TaskFlow that provides information regarding the tasks assigned to the logged-in user in all his/her projects, project activities feed, and live updates using WebSocket protocol.
---

## What It Does

- **Authentication**: Signup/login with JWT access + refresh tokens; bcrypt-hashed passwords.
- **Projects & Membership**: Create projects, invite registered users by email, assign roles (owner / member). Owners can remove members and delete projects; members can only manage tasks.
- **Task Board**: Kanban board with To Do / In Progress / Done columns. Create, edit, and delete tasks with title, description, status, priority, due date, and assignee.
- **Filtering & Pagination**: Search by title, filter by priority and assignee, sort by priority/due date/created-at — all server-side.
- **Comments**: Threaded comments per task, visible to all project members, with author names and timestamps.
- **Activity Log**: Per-project chronological feed logging task creation/moves/assignments, member invites/removals, and comments.
- **Dashboard**: Personal view showing assigned tasks, completed tasks this week, project count, and recent activity.
- **Real-Time (WebSockets)**: Any board change — task created, moved, assigned, commented on — is instantly pushed to all other project members currently viewing the same board.

---

## 🐳 Quickstart with Docker (one command)

> **Requires**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

```bash
git clone <your-repo-url>
cd TaskFlow
docker compose up --build
```

| Service | URL / Port |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| PostgreSQL DB | localhost:5432 |

The database is seeded automatically on first run with two test users:

| User | Email | Password |
|---|---|---|
| Alice (owner) | alice@example.com | password |
| Bob (member) | bob@example.com | password |

To stop: `docker compose down`  
To wipe all data and re-seed: `docker compose down -v && docker compose up --build`

---

## How to Run (manual / local dev)

### Prerequisites
- Python 3.10+
- Node.js 18+

### Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Copy environment file and configure
cp .env.example .env
# Edit .env and set a strong JWT_SECRET_KEY

# Seed the database (creates 2 users + shared project with tasks)
python seed_db.py

# Start the server
python app.py
```

Backend runs at: `http://localhost:5000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: `http://localhost:5173`

### Seed Credentials

| User | Email | Password |
|------|-------|----------|
| Alice Owner | alice@example.com | password |
| Bob Member | bob@example.com | password |

Alice owns "Website Redesign" (Bob and Charlie are members). Bob owns "Mobile App Launch" (Alice is a member). Tasks are already assigned across users so you can test real-time and collaboration flows immediately.

---

## Data Model

```
Users ──< ProjectMembers >── Projects
                                │
                            Tasks
                                │
                          Comments

ActivityLog (FK → Project, FK → User)
```

### Tables

| Table | Key Columns |
|---|---|
| `users` | `id (uuid)`, `name`, `email`, `password_hash`, `created_at` |
| `projects` | `id`, `name`, `description`, `owner_id → users.id` |
| `project_members` | `id`, `project_id`, `user_id`, `role (owner/member)` — unique constraint on (project_id, user_id) |
| `tasks` | `id`, `project_id`, `title`, `description`, `status`, `priority`, `due_date`, `assignee_id`, `created_by`, `completed_date`, `created_at` |
| `comments` | `id`, `task_id`, `user_id`, `content`, `timestamp` |
| `activity_logs` | `id`, `project_id`, `user_id`, `action`, `timestamp` |

**Cascades**: Deleting a `Project` cascades to `ProjectMember`, `Task`, `ActivityLog`. Deleting a `Task` cascades to `Comment`. User deletion cascades their own `projects_owned` and `memberships`.

---

## Stack Choice

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | React + Vite | Fast HMR, simple component model, broad ecosystem |
| **Backend** | Python + Flask | Lightweight, easy to reason about, great SQLAlchemy integration |
| **Database** | SQLite (via SQLAlchemy) | Zero-config for local dev; the ORM means swapping to PostgreSQL is a one-line `DATABASE_URL` change |
| **Real-time** | Flask-SocketIO (Socket.IO) | First-class room support maps perfectly to project-scoped broadcasts; well-documented with eventlet |
| **Auth** | Flask-JWT-Extended | Native refresh-token cookie support, clean decorator API |

**SQLite justification**: This is a single-server dev/assessment build. SQLAlchemy abstracts the DB layer completely — switching to PostgreSQL requires only changing `DATABASE_URL` in `.env` and running migrations.

---

## Refresh Token Flow

1. **Login** → server creates a short-lived **access token** (15 min, returned in JSON) and a long-lived **refresh token** (30 days, set as an `HttpOnly` cookie).
2. The frontend stores the access token **in memory only** (`accessToken` variable in `axios.js`) — never in `localStorage` or `sessionStorage`. This protects against XSS.
3. The refresh token lives in an `HttpOnly` cookie — inaccessible to JavaScript, protected against XSS.
4. Every API request attaches the access token via `Authorization: Bearer <token>` header.
5. On page load, the frontend calls `POST /auth/refresh` using the cookie to silently re-obtain an access token without requiring the user to log in again.
6. When a request returns **401**, the Axios response interceptor intercepts it, calls `POST /auth/refresh`, and if successful, retries the original request transparently. A subscriber queue prevents multiple parallel 401s from triggering multiple refresh calls.
7. If the refresh token is also expired, the user is redirected to `/login`.

---

## WebSocket Setup

### Technology
**Socket.IO** via `flask-socketio` with the `eventlet` async driver. Socket.IO was chosen over raw WebSockets for its built-in room support, auto-reconnect, and fallback to long-polling.

### Authentication
When the frontend establishes a socket connection, it sends the JWT access token in the Socket.IO `auth` handshake object (`{ token: accessToken }`). The `handle_connect` handler in `socket_events.py` decodes and validates this token using `flask_jwt_extended.decode_token`. If the token is missing, expired, or invalid, the connection is rejected (`return False`).

### Event Scoping (Project Rooms)
After successful authentication, the `handle_connect` handler queries all `ProjectMember` records for the authenticated user and calls `join_room(f"project_{project_id}")` for each one. This means:
- A user only joins rooms for projects they are actually a member of.
- When `socketio.emit('task_created', data, room='project_abc123')` is called in a route, **only clients who joined that room receive the event**.
- This is not a global broadcast. A user in Project A never sees events from Project B.

### Disconnect / Reconnect
Socket.IO handles reconnection automatically with exponential backoff. If the socket drops:
1. The app still works — the UI is always driven by the last HTTP fetch, and users can still perform all actions via normal API calls.
2. When the connection is restored, Socket.IO re-fires the `connect` event, which re-authenticates and re-joins all rooms.
3. Any state missed during the disconnect is recovered by the next API fetch (e.g., clicking into a project board re-fetches all tasks).

---

## What Was Hard

- **Concurrent 401 handling**: When the page loads and fires 4 API calls simultaneously, and the access token has expired, all 4 get a 401. Without the subscriber queue in `axios.js`, all 4 would try to refresh independently, causing race conditions. Implementing the `isRefreshing` flag + `refreshSubscribers` array solved this cleanly.
- **WebSocket scoping**: Making sure socket events only reach the right users required understanding Socket.IO rooms. The key insight was joining rooms at connect-time based on the user's memberships, not at event-time.
- **`window.confirm` in headless tests**: During automated browser testing, `window.confirm` always returns `false` in headless environments, which broke delete flows. Temporarily bypassing it for test runs taught me to think carefully about the gap between browser behavior and test environments.

---

## Known Issues / What's Incomplete

- The "Assigned to Me" dashboard doesn't live-update when you're *newly assigned* to a task while viewing the dashboard (the socket event reaches the board but not the dashboard if the user isn't on the project board page). A global user-level socket room would fix this.
- No drag-and-drop for moving tasks between columns (tasks are moved via status dropdown on each card).
- No automated tests — all testing was done manually via browser automation.
- SQLite doesn't support concurrent writes at scale; PostgreSQL would be required for production.

---

## What I Would Improve With More Time

- Add drag-and-drop (react-beautiful-dnd or dnd-kit) for moving tasks.
- Write integration tests for auth, role enforcement, and assignment rules using pytest + httpx.
- Dockerize: `docker-compose up` to start backend + frontend + a real PostgreSQL instance.
- Deploy: Render (backend) + Vercel (frontend) + Supabase (Postgres).
- Add optimistic UI updates with rollback on failure to make the UI feel snappier.
- Implement per-user socket rooms (not just per-project) so "Assigned to Me" updates live from anywhere in the app.

---

## Where I Used AI

I used Antigravity (an AI coding assistant powered by Google Deepmind) throughout this project as a pair programmer:

- **What it did**: Generated boilerplate route handlers, suggested the subscriber-queue pattern for concurrent 401 handling, helped debug the Socket.IO eventlet integration, and wrote the initial versions of models and validation logic.
- **What I learned**: The token refresh queue pattern — I didn't know about the race condition with concurrent 401s until the AI explained it and I read the Axios interceptor docs to understand exactly how it worked. I also learned about Socket.IO rooms and how `join_room` scoping works at the `connect` handler level.
- **What I changed**: I read and understood every piece of code before it went in. I rewrote the `require_project_membership` decorator from scratch after the AI's first version didn't correctly handle the `task_id` parameter threading through nested blueprints. I also caught and fixed a bug where the activity log commit was happening inside the same SQLAlchemy session as the primary action, which would cause the primary action to roll back if the log write failed — I separated them with a try/except.
