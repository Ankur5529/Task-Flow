# TaskFlow

## What the App Does
TaskFlow is a web-based task management tool that serves as a lightweight alternative to Trello or Jira. It enables users to register, create projects, and collaborate with team members using a Kanban-style board ("To Do", "In Progress", "Done"). Key features include role-based access control (owners vs. members), task prioritization, deadlines, threaded comments, an activity feed, and a personal dashboard for tracking assignments. Real-time updates via WebSockets ensure that board changes are instantly reflected for all active project members.

## How to Run It (Step by Step, Clean-Clone Tested)
### Prerequisites
- Python 3.10+
- Node.js 18+
- SQLite (built-in with Python)

### Step 1: Clone the Repository
```bash
git clone <your-repo-url>
cd TaskFlow
```

### Step 2: Backend Setup
```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env and set a strong JWT_SECRET_KEY if desired

# Initialize and seed the database
python seed_db.py

# Start the Flask server
python app.py
```
The backend API will run at `http://localhost:5000`.

### Step 3: Frontend Setup
Open a new terminal, navigate to the `TaskFlow` project root, and then:
```bash
cd frontend

# Install Node dependencies
npm install

# Start the Vite development server
npm run dev
```
The frontend will be available at `http://localhost:5173`.

### Test Credentials
The `seed_db.py` script automatically creates the following test users:
- **Alice Owner** (`alice@example.com` / `password`)
- **Bob Member** (`bob@example.com` / `password`)

## Data Model
Our relational schema is built on SQLite (via SQLAlchemy).

**Diagram:**
```text
Users ──< ProjectMembers >── Projects
                                │
                            Tasks
                                │
                          Comments

ActivityLog (FK → Project, FK → User)
```

**Tables & Relationships:**
- **Users**: `id`, `name`, `email`, `password_hash`. A user can own multiple projects and be a member of multiple projects.
- **Projects**: `id`, `name`, `description`, `owner_id`. Links back to the User table.
- **ProjectMembers**: A junction table linking `Users` and `Projects` with a specific `role` (owner or member).
- **Tasks**: `id`, `project_id`, `title`, `description`, `status`, `priority`, `due_date`, `assignee_id`, `created_by`. Belongs to one project.
- **Comments**: `id`, `task_id`, `user_id`, `content`. Belongs to a task and the user who posted it.
- **ActivityLogs**: `id`, `project_id`, `user_id`, `action`. Tracks events within a project.

*Cascading Deletes:* Deleting a Project cascades to ProjectMembers, Tasks, and ActivityLogs. Deleting a Task cascades to Comments.

## Stack Choice and Why
- **Frontend**: **React + Vite**. Chosen for fast hot-module replacement (HMR), a simple component model, and a robust ecosystem for managing state and UI.
- **Backend**: **Python + Flask**. Lightweight, flexible, and extremely easy to reason about. It integrates seamlessly with SQLAlchemy.
- **Database**: **SQLite (via SQLAlchemy)**. Zero-configuration for local development. Using the SQLAlchemy ORM means migrating to a production database like PostgreSQL is a one-line change to the `DATABASE_URL`.
- **Real-time**: **Flask-SocketIO (Socket.IO)**. Socket.IO provides first-class "room" support, mapping perfectly to project-scoped event broadcasts. It also handles auto-reconnection and long-polling fallbacks out-of-the-box.
- **Authentication**: **Flask-JWT-Extended**. Offers native refresh-token cookie support and clean decorators to secure API endpoints.

## Refresh-Token Flow
1. **Login**: The server creates a short-lived access token (e.g., 15 minutes) returned in the JSON payload, and a long-lived refresh token (e.g., 30 days) set as an `HttpOnly` cookie.
2. **Storage**: The frontend stores the access token **in memory only** (in `src/api/axios.js`). It is never placed in `localStorage` or `sessionStorage` to mitigate XSS attacks. The refresh token lives in the `HttpOnly` cookie, safely out of reach of JavaScript.
3. **Usage**: Every API request attaches the access token via the `Authorization: Bearer <token>` header.
4. **Expiry & Silent Refresh**: On page load, or when an access token expires (resulting in a 401 response), an Axios interceptor catches the failure. It triggers a `POST /auth/refresh` request that uses the `HttpOnly` cookie to silently fetch a new access token.
5. **Concurrency Management**: A subscriber queue in `axios.js` pauses concurrent failing requests while the token refreshes, preventing race conditions. Once refreshed, all queued requests retry transparently. If the refresh token is also expired, the user is redirected to the login page.

## WebSocket Setup
- **Authentication**: When the frontend connects, it passes the JWT access token in the Socket.IO `auth` handshake object. The `handle_connect` backend event decodes and validates this token. If invalid or missing, the connection is immediately rejected.
- **Event Scoping (Rooms)**: Upon successful authentication, the backend queries the user's active `ProjectMember` records and automatically joins them to a Socket.IO room for each project (e.g., `room="project_abc123"`). When a board change occurs, `socketio.emit` is targeted *only* to that specific room. This guarantees that events only reach active members of the right project.
- **Disconnects/Reconnects**: Socket.IO's client handles reconnections with exponential backoff. If the connection drops, users can still use the app via standard HTTP requests. Once restored, the socket triggers a new `connect` event, re-authenticating the user and re-joining their valid project rooms. The UI state reconciles by re-fetching the latest data via standard API calls when navigating.

## What Was Hard
- **Concurrent 401 Handling**: When a page loads and fires multiple simultaneous API requests with an expired access token, all requests return 401. Resolving this required implementing a subscriber queue in the Axios interceptor to pause the other requests while the first one performs the refresh, preventing race conditions.
- **WebSocket Scoping**: Ensuring socket events were restricted to the correct users required a deep dive into Socket.IO rooms. The key insight was joining rooms at connect-time based on database memberships rather than passing room IDs blindly from the client.
- **End-to-End Testing Nuances**: Testing delete flows involving browser native prompts (like `window.confirm`) proved difficult in headless browser automation, necessitating temporary workarounds and teaching me the limits of headless environments.

## Known Issues / What Is Incomplete
- **Assigned Dashboard Socket Updates**: The "Assigned to Me" dashboard doesn't live-update when a user is newly assigned a task *while viewing that specific dashboard page*. (A global user-level socket room would resolve this).
- **Drag-and-Drop**: Tasks must be moved using a status dropdown on each card; there is currently no drag-and-drop support.
- **Automated Tests**: Most validation was performed manually. Automated unit/integration tests are missing.
- **Production Database**: SQLite is currently used. A production deployment would require swapping to PostgreSQL for concurrent write capabilities.

## What I Would Improve With More Time
- Implement a library like `dnd-kit` or `react-beautiful-dnd` to support fluid drag-and-drop for task cards on the Kanban board.
- Write a comprehensive test suite (pytest for backend, Jest/React Testing Library for frontend).
- Setup a proper `docker-compose.yml` to orchestrate the frontend, backend, and a PostgreSQL database in a single command.
- Implement per-user WebSocket rooms to enable real-time updates on the global "Assigned to Me" dashboard, regardless of which view the user is currently on.
- Add optimistic UI updates to make the frontend feel snappier, rolling back state only if the API call fails.

## Where I Used AI and What I Learned
- **Where I Used AI**: I used Antigravity as a pair programmer to scaffold boilerplate route handlers, suggest the Axios subscriber-queue pattern for 401 retries, debug Flask-SocketIO eventlet integrations, and write initial SQLAlchemy models.
- **What I Learned**: The AI introduced me to the token refresh queue pattern, explaining the race condition that occurs with concurrent 401s. It also clarified how `join_room` scoping functions effectively at the Socket.IO connection handler level.
- **How I Adapted**: While the AI provided foundational code, I rewrote the `require_project_membership` decorator completely after the AI's version failed to properly thread the `task_id` parameter through nested Flask blueprints. I also caught a bug where activity logs were committed in the same SQLAlchemy session as the primary action (which would roll back the main action if the log failed), and refactored it to use a safe try/except block.
