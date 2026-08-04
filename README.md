# TaskFlow

A lightweight, self-hosted alternative to Trello or Jira — Kanban boards, real-time collaboration, and role-based project access, built with React and Flask.

## Table of Contents
- [What the App Does](#what-the-app-does)
- [How to Run It](#how-to-run-it-step-by-step-clean-clone-tested)
- [Data Model](#data-model)
- [Stack Choice and Why](#stack-choice-and-why)
- [Refresh-Token Flow](#refresh-token-flow)
- [WebSocket Setup](#websocket-setup)
- [What Was Hard](#what-was-hard)
- [Known Issues / What Is Incomplete](#known-issues--what-is-incomplete)
- [What I Would Improve With More Time](#what-i-would-improve-with-more-time)
- [Where I Used AI and What I Learned](#where-i-used-ai-and-what-i-learned)

## What the App Does
TaskFlow is a web-based task management tool that serves as a lightweight alternative to Trello or Jira. Users register, create projects, and collaborate with teammates on a Kanban-style board (**To Do → In Progress → Done**).

Key features:
- **Role-based access control** — owners vs. members, with different permissions per project
- **Task prioritization and deadlines** — set due dates and priority levels per task
- **Threaded comments** — discuss individual tasks in context
- **Activity feed** — a running log of what changed and who changed it
- **Personal dashboard** — see everything assigned to you across all projects, in one place
- **Real-time updates** — board changes are pushed instantly to every active project member via WebSockets

## How to Run It (Step by Step, Clean-Clone Tested)

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL 14+ (running locally or accessible via connection string)

### Step 1: Clone the Repository
```bash
git clone <your-repo-url>
cd TaskFlow
```

### Step 2: Backend Setup
```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env and set a strong JWT_SECRET_KEY, and DATABASE_URL to point to your PostgreSQL instance
# e.g. DATABASE_URL=postgresql://username:password@localhost:5432/taskflow

# Initialize and seed the database
python seed_db.py

# Start the Flask server
python app.py
```
The backend API runs at `http://localhost:5000`.

### Step 3: Frontend Setup
Open a new terminal, navigate to the `TaskFlow` project root, then:
```bash
cd frontend

# Install Node dependencies
npm install

# Start the Vite development server
npm run dev
```
The frontend is available at `http://localhost:5173`.

### Test Credentials
`seed_db.py` automatically creates the following test users:

| Name | Email | Password | Role |
|---|---|---|---|
| Alice Owner | `alice@example.com` | `password` | Owner |
| Bob Member | `bob@example.com` | `password` | Member |

## Data Model
The relational schema is built on PostgreSQL via SQLAlchemy.

```text
Users ──< ProjectMembers >── Projects
                                │
                              Tasks
                                │
                            Comments

ActivityLog (FK → Project, FK → User)
```

**Tables & Relationships:**
- **Users** — `id`, `name`, `email`, `password_hash`. A user can own multiple projects and be a member of multiple projects.
- **Projects** — `id`, `name`, `description`, `owner_id`. Links back to the Users table.
- **ProjectMembers** — junction table linking `Users` and `Projects`, storing each user's `role` (owner or member) on a per-project basis.
- **Tasks** — `id`, `project_id`, `title`, `description`, `status`, `priority`, `due_date`, `assignee_id`, `created_by`. Belongs to one project.
- **Comments** — `id`, `task_id`, `user_id`, `content`. Belongs to a task and the user who posted it.
- **ActivityLogs** — `id`, `project_id`, `user_id`, `action`. Tracks events within a project.

**Cascading deletes:** Deleting a Project cascades to ProjectMembers, Tasks, and ActivityLogs. Deleting a Task cascades to Comments.

## Stack Choice and Why
- **Frontend — React + Vite.** Fast hot-module replacement, a simple component model, and a mature ecosystem for state and UI management.
- **Backend — Python + Flask.** Lightweight, flexible, and easy to reason about. Integrates cleanly with SQLAlchemy.
- **Database — PostgreSQL (via SQLAlchemy).** A production-grade relational database with proper concurrent write support, strong data integrity, and room to grow — unlike SQLite, it won't lock up under simultaneous writes as more users and real-time updates come in.
- **Real-time — Flask-SocketIO (Socket.IO).** First-class "room" support maps directly onto project-scoped event broadcasts, and it handles auto-reconnection and long-polling fallback out of the box.
- **Authentication — Flask-JWT-Extended.** Native refresh-token cookie support and clean decorators for securing API endpoints.

## Refresh-Token Flow
1. **Login** — the server issues a short-lived access token (e.g., 15 minutes) in the JSON response, and a long-lived refresh token (e.g., 30 days) as an `HttpOnly` cookie.
2. **Storage** — the frontend keeps the access token **in memory only** (`src/api/axios.js`), never in `localStorage` or `sessionStorage`, to reduce XSS exposure. The refresh token stays in the `HttpOnly` cookie, out of reach of JavaScript entirely.
3. **Usage** — every API request attaches the access token via the `Authorization: Bearer <token>` header.
4. **Expiry & silent refresh** — on page load, or whenever an access token expires (triggering a 401), an Axios interceptor catches the failure and calls `POST /auth/refresh`, which uses the `HttpOnly` cookie to silently obtain a new access token.
5. **Concurrency management** — a subscriber queue in `axios.js` pauses concurrent failing requests while the refresh is in flight, avoiding race conditions. Once the token refreshes, all queued requests retry transparently. If the refresh token has also expired, the user is redirected to login.

## WebSocket Setup
- **Authentication** — the frontend passes the JWT access token in the Socket.IO `auth` handshake object. The `handle_connect` backend event decodes and validates it; an invalid or missing token gets the connection rejected immediately.
- **Event scoping (rooms)** — on successful authentication, the backend looks up the user's active `ProjectMember` records and joins them to a Socket.IO room per project (e.g., `room="project_abc123"`). Board-change events are emitted only to the relevant room, so events reach only active members of the right project.
- **Disconnects/reconnects** — Socket.IO's client handles reconnection with exponential backoff. If the connection drops, the app keeps working over standard HTTP. Once the socket reconnects, it re-authenticates and rejoins valid project rooms, and the UI reconciles state by re-fetching data on navigation.

## What Was Hard
- **Concurrent 401 handling** — a page load firing several simultaneous requests with an expired access token meant several 401s at once. Fixing this required a subscriber queue in the Axios interceptor so only the first failing request triggers a refresh, while the rest wait and retry afterward.
- **WebSocket scoping** — keeping socket events restricted to the right users meant digging into Socket.IO rooms. The key fix was joining rooms at connect-time based on database membership, rather than trusting room IDs passed from the client.
- **End-to-end testing nuances** — testing delete flows that rely on native browser prompts (`window.confirm`) was difficult under headless automation, requiring temporary workarounds and a better sense of what headless environments can and can't do.

## Known Issues / What Is Incomplete
- **Assigned dashboard socket updates** — the "Assigned to Me" dashboard doesn't live-update when a user is newly assigned a task while already viewing that page (a global, user-level socket room would fix this).
- **No drag-and-drop** — tasks move between columns via a status dropdown on each card only.
- **No automated tests** — validation so far has been manual; unit/integration test coverage is missing.
- **Backend deployment error on Render** — the backend currently throws an error when deployed on Render; it works fine locally, but I haven't tracked down the root cause yet.

## What I Would Improve With More Time
- Add drag-and-drop for Kanban cards using `dnd-kit` or `react-beautiful-dnd`.
- Write a real test suite — pytest for the backend, Jest/React Testing Library for the frontend.
- Set up `docker-compose.yml` to spin up the frontend, backend, and PostgreSQL together in one command.
- Add per-user WebSocket rooms so the "Assigned to Me" dashboard updates live, regardless of the page the user is on.
- Add optimistic UI updates so the app feels snappier, rolling back only if the API call fails.
- Debug and fix the backend deployment error on Render so the app can run properly in production.

## Where I Used AI and What I Learned
- **Learning WebSockets** — I had never worked with WebSockets before this project, so I used AI to learn the concepts from scratch: how Socket.IO works, what "rooms" are, and how real-time events differ from regular request/response APIs.
- **Implementation** — with that foundation, AI helped me actually implement the WebSocket layer — setting up Flask-SocketIO on the backend, connecting it to the React frontend, and getting project-scoped events working through rooms.
- **Debugging** — when things broke (connection issues, events not reaching the right clients, etc.), AI helped me debug and figure out what was going wrong.
- **Testing** — AI also helped me test one of the features to make sure it worked as expected.