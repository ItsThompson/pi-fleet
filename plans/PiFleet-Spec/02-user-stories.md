# 02: User Stories

## Persona

**Alex** is a software engineer who runs 3-8 concurrent pi coding sessions in tmux, often with subagent orchestration. They work across multiple projects simultaneously, switching between terminal panes frequently. They use a tiling window manager (Aerospace) and want a lightweight, always-accessible dashboard that tells them at a glance which sessions need attention without disrupting their workflow. They are technically sophisticated but impatient with unreliable tools.

---

## Terminal Opener

### US-TERM-01: Click to switch and activate terminal
**As** Alex, **I want to** click a session in pi-fleet and have my terminal window come to the foreground with that session's tmux pane active **so that** I can immediately interact with the agent.

**Acceptance Criteria:**
- After clicking, `tmux switch-client` targets the correct session:window.pane
- The terminal application window is activated (brought to front) via `osascript`
- The entire flow completes in under 500ms
- If the terminal app cannot be determined, a notification explains the failure

### US-TERM-02: Scoped client resolution
**As** Alex, **I want** the terminal opener to work correctly when I have multiple terminal windows open **so that** having two iTerm windows does not break the feature.

**Acceptance Criteria:**
- `tmux list-clients` is scoped to the target session (uses `-t <session_name>`)
- With one client attached to the target session: switch succeeds
- With zero clients on target session: notification says "no client attached to session X"
- With multiple clients on target session: notification says "multiple clients; detach extras"

### US-TERM-03: Pane existence validation
**As** Alex, **I want** the terminal opener to validate the target pane exists before attempting to switch **so that** I get a clear error instead of a cryptic tmux failure.

**Acceptance Criteria:**
- Before `switch-client`, pi-fleet runs `tmux has-session -t <session>` or equivalent
- If pane does not exist: notification says "session/pane no longer exists"
- Stale `lastKnownTmuxTarget` values are cleared on validation failure

### US-TERM-04: Pod-level terminal open
**As** Alex, **I want to** click a pod card and have it open the lead (parent) session **so that** I navigate to the orchestrator without having to expand the pod first.

**Acceptance Criteria:**
- Pod card's "Open in terminal" button targets the lead session's tmux pane
- If lead session has no tmux target, notification explains the issue

---

## Pod System

### US-POD-01: Automatic pod formation
**As** Alex, **I want** subagent sessions to automatically group under their parent **so that** I see a clean hierarchy without manual setup.

**Acceptance Criteria:**
- When a parent reports ownership of subagent IDs, matching sessions nest under that parent's pod
- Pod display name equals the lead session's `agentName` or directory name
- Pod appears within one heartbeat cycle (5s) of both parent and child registering

### US-POD-02: Single-member pod rendering
**As** Alex, **I want** standalone sessions (no subagents) to render as flat rows **so that** the UI isn't cluttered with unnecessary nesting.

**Acceptance Criteria:**
- A pod with exactly one session renders as a single card/row (no collapsible group chrome)
- If a subagent later registers, the pod transitions to multi-member rendering

### US-POD-03: Multi-member pod rendering
**As** Alex, **I want** pods with multiple sessions to render as a collapsible group **so that** I can see the parent/children relationship.

**Acceptance Criteria:**
- Multi-member pod shows a collapsible card with member count badge
- Expanding shows child sessions listed by state
- Pod state indicator reflects the "worst" state among members

### US-POD-04: Parent death handling
**As** Alex, **I want** surviving child sessions to become standalone pods when their parent dies **so that** I can still see and navigate to them.

**Acceptance Criteria:**
- When a parent session unregisters or is reaped, its children become independent single-member pods
- Children retain their cluster assignment (if any)
- No UI flicker: transition is atomic from the user's perspective

### US-POD-05: Pod state aggregation
**As** Alex, **I want** a pod's status to reflect the worst state among its members **so that** I know at a glance if anything in the group needs attention.

**Acceptance Criteria:**
- Priority ordering: `pending_approval` > `idle` > `running_tool` > `processing`
- Pod status dot/badge uses the color of the highest-priority state among members
- Pod badge count shows number of members needing attention

---

## Cluster System

### US-CLUST-01: Create a cluster
**As** Alex, **I want to** create a named cluster **so that** I can organize my sessions by project.

**Acceptance Criteria:**
- Cluster creation is available from the sidebar UI
- User provides a name (required) and optional directory list
- Cluster appears immediately in the sidebar
- Cluster persists across app restarts

### US-CLUST-02: Directory-based auto-assignment
**As** Alex, **I want** new sessions to automatically assign to a cluster based on their working directory **so that** sessions from `~/workplace/my-project/` go into my "Work" cluster without manual action.

**Acceptance Criteria:**
- When a session registers, its `cwd` is matched against all cluster directories
- Most-specific path prefix wins (longest match)
- A session in `~/workplace/project-a/src/` matches cluster with directory `~/workplace/project-a/` over one with `~/workplace/`
- Tilde (`~`) in directory configs is expanded to the user's home directory

### US-CLUST-03: Manual pod reassignment via drag-and-drop
**As** Alex, **I want to** drag a pod from one cluster to another **so that** I can override the automatic directory assignment.

**Acceptance Criteria:**
- Pods are draggable between cluster sections in the sidebar
- Drop target highlights on hover
- Manual assignment overrides directory-based matching
- Manual assignment persists across restarts (stored by session ID)
- Visual feedback during drag (ghost element, valid/invalid drop zones)

### US-CLUST-04: Unclustered section
**As** Alex, **I want** an "Unclustered" section always visible at the bottom **so that** I can see sessions that don't match any cluster.

**Acceptance Criteria:**
- "Unclustered" section is always rendered regardless of contents
- Pods not matching any cluster directory and without manual assignment appear here
- Pods can be dragged out of "Unclustered" into a cluster

### US-CLUST-05: Delete a cluster
**As** Alex, **I want to** delete a cluster I no longer need **so that** the sidebar stays clean.

**Acceptance Criteria:**
- Deletion is available via context menu or settings
- Confirmation dialog appears before deletion
- Pods in the deleted cluster move to "Unclustered"
- Manual assignments referencing the deleted cluster are cleared

### US-CLUST-06: Edit cluster name and directories
**As** Alex, **I want to** rename a cluster and update its directory bindings **so that** I can adapt as my projects change.

**Acceptance Criteria:**
- Name and directory list are editable inline or via a settings panel
- Changes take effect immediately (pods re-evaluate assignment)
- Existing manual assignments are preserved (not cleared on edit)

### US-CLUST-07: Cluster sort order
**As** Alex, **I want to** reorder clusters in the sidebar **so that** my most important projects are at the top.

**Acceptance Criteria:**
- Clusters are drag-reorderable in the sidebar
- Sort order persists across restarts
- "Unclustered" always remains at the bottom (not reorderable)

---

## Attention System

### US-ATT-01: Pod-level attention badge
**As** Alex, **I want to** see a badge count on each pod showing how many sessions need attention **so that** I can spot blocked agents without expanding every pod.

**Acceptance Criteria:**
- Badge shows count of member sessions in `pending_approval` or `idle` state
- Badge is hidden when count is 0
- Badge updates in real-time via SSE

### US-ATT-02: Cluster-level attention badge
**As** Alex, **I want to** see a badge count on each cluster showing total attention-needed sessions **so that** I can see at a glance which project groups are blocked.

**Acceptance Criteria:**
- Cluster badge = sum of all pod badges within it
- Badge is hidden when count is 0
- "Unclustered" section also shows a badge

### US-ATT-03: Filter by attention state
**As** Alex, **I want to** click a state badge to filter the view to only sessions in that state **so that** I can quickly find what needs my input.

**Acceptance Criteria:**
- Clicking a badge (e.g., "idle" or "pending_approval") filters the current view to show only matching sessions/pods
- Clicking again clears the filter (toggle behavior)
- Multiple badge filters can be active simultaneously (OR logic)
- Active filters are visually indicated (highlighted badge)

### US-ATT-04: Notification panel
**As** Alex, **I want** a global notification panel listing all sessions that currently need attention **so that** I have a single place to check regardless of cluster/pod context.

**Acceptance Criteria:**
- Panel is accessible from a global button/icon in the app header
- Shows a reverse-chronological list of sessions needing attention
- Each entry shows: session name, parent pod name, cluster name, state, time since state change
- Clicking an entry opens that session in the terminal
- Panel live-updates as states change

---

## Navigation and UI

### US-NAV-01: Sidebar cluster list
**As** Alex, **I want** a sidebar showing all clusters with chevron-expandable pod lists **so that** I can navigate the hierarchy quickly.

**Acceptance Criteria:**
- Sidebar shows clusters as collapsible sections
- Chevron on the left of each cluster name toggles expansion
- Expanded cluster shows its pods as rows
- Pods show their name, state dot, and attention badge

### US-NAV-02: Cluster detail view
**As** Alex, **I want to** click a cluster name to see a grid of pod cards **so that** I get a visual overview of all work in that project.

**Acceptance Criteria:**
- Main area shows a grid of cards, one per pod
- Header shows: cluster name, bound directories, count of manually-assigned pods
- Each pod card shows: pod name, member count, aggregated state, attention badge, "Open in terminal" button
- Cards are fixed-size and individually scrollable if session list overflows

### US-NAV-03: Pod detail view
**As** Alex, **I want to** click a pod (from sidebar or cluster view) to see a grid of session cards **so that** I can see detailed info for each session.

**Acceptance Criteria:**
- Main area shows a grid of session cards
- Each card shows: session name, activity status, model name, context usage %, turn count, thinking level, "Open in terminal" button
- Cards use the same fixed-size scrollable pattern

### US-NAV-04: State-based grouping in views
**As** Alex, **I want** pods within a cluster view and sessions within a pod view to be grouped by state **so that** items needing attention are visually separated.

**Acceptance Criteria:**
- Cards are grouped into sections: "Needs Attention" (pending_approval, idle), "Working" (processing, running_tool)
- Section headers show the group label and count
- Grouping applies at all drill-down levels

---

## Session Data

### US-DATA-01: Rich session card metadata
**As** Alex, **I want** session cards to show model name, context usage, and turn count **so that** I can understand each session's state without switching to it.

**Acceptance Criteria:**
- Model name displayed (e.g., "Claude Sonnet 4")
- Context usage shown as percentage bar or fraction
- Turn count shown as a number
- Thinking level shown when non-default
- All fields update in real-time via heartbeats

### US-DATA-02: Subagent identification
**As** Alex, **I want** subagent sessions to be visually distinguished from lead sessions **so that** I can tell which is the orchestrator and which are workers.

**Acceptance Criteria:**
- Subagent cards show a visual indicator (e.g., "sub" badge or indented position)
- Lead session card is visually distinct (e.g., crown icon or "lead" label)
- If a session is a subagent but its parent hasn't claimed it yet, it shows as standalone (not labeled "sub")

---

## App Lifecycle

### US-APP-01: F5 overlay toggle
**As** Alex, **I want to** press F5 to show/hide the pi-fleet overlay **so that** I can quickly check status without leaving my workflow.

**Acceptance Criteria:**
- F5 toggles overlay visibility (same behavior as pi-watch)
- If F5 is already bound by another app, a notification explains and suggests using the tray menu

### US-APP-02: Ghost mode
**As** Alex, **I want** a ghost mode that makes the overlay translucent and click-through **so that** I can keep it visible while working in other windows.

**Acceptance Criteria:**
- Ghost mode toggled via tray menu
- Overlay opacity configurable (default 0.3)
- Overlay becomes click-through (mouse events pass to windows below)
- Ghost mode state persists across restarts

### US-APP-03: Sound alerts
**As** Alex, **I want** sound alerts when a session needs attention **so that** I notice even when the overlay is hidden.

**Acceptance Criteria:**
- Sound plays when a session transitions to `pending_approval` or `idle`
- Sound is togglable via tray menu
- Sound preference persists across restarts

---

## Setup and Resilience

### US-SETUP-01: First launch empty state
**As** Alex, **I want** a clear empty state when I first launch pi-fleet with no sessions or clusters **so that** I understand what the app does and how to get started.

**Acceptance Criteria:**
- With zero sessions: main area shows an illustration/message explaining that sessions will appear when pi is running with the pi-fleet extension
- With zero clusters: sidebar shows only "Unclustered" section with a "Create Cluster" button
- Empty state disappears as soon as the first session registers
- No error states or broken UI when everything is empty

### US-SETUP-02: Extension installation
**As** Alex, **I want** clear instructions for installing the pi-fleet extension **so that** my pi sessions report to the dashboard.

**Acceptance Criteria:**
- First-launch empty state includes a brief setup guide (symlink command or install path)
- If pi-watch extension is detected running concurrently, a non-blocking notice suggests removing it to avoid duplicate registrations
- Extension installation does not require restarting pi-fleet (new sessions register on next start)

### US-SETUP-03: SSE connection loss indicator
**As** Alex, **I want** a visible indicator when the dashboard loses connection to the server **so that** I know the displayed data may be stale.

**Acceptance Criteria:**
- When SSE disconnects: a subtle "Reconnecting..." banner appears below the header
- Banner shows attempt count (e.g., "Reconnecting (attempt 3)...")
- On successful reconnect: banner disappears, full state is refreshed
- Session data is NOT cleared during reconnection (stale display is better than empty)

### US-SETUP-04: Port conflict handling
**As** Alex, **I want** pi-fleet to handle port 8314 being unavailable **so that** I get a clear error instead of a silent failure.

**Acceptance Criteria:**
- If port 8314 is already in use at startup: app shows an error dialog identifying the conflict
- Error message suggests: "Another instance of pi-fleet or pi-watch may be running on port 8314"
- App does NOT crash: it remains open with the error visible so the user can resolve and retry
- A "Retry" button attempts to bind the port again without restarting the app
