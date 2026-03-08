# Requirements Specification

> Kanban AI - AI-Powered Project Management  
> Version: 1.0  
> Last Updated: March 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [User Stories](#2-user-stories)
3. [Acceptance Criteria](#3-acceptance-criteria)
4. [Business Rules](#4-business-rules)
5. [Non-Functional Requirements](#5-non-functional-requirements)

---

## 1. Project Overview

### 1.1 Purpose

Kanban AI is a web-based project management application that integrates Headless OpenCode for automated task execution via AI agents. The system combines traditional Kanban board functionality with AI-assisted task completion, enabling development teams to automate repetitive work and accelerate project delivery.

### 1.2 Goals

- Provide intuitive Kanban-style task management with drag-and-drop
- Enable AI agents to automatically execute tasks through OpenCode integration
- Support customizable workflows with signal-driven state transitions
- Deliver real-time updates across all connected clients
- Maintain project context for intelligent AI task execution

### 1.3 Target Users

| User Role | Description |
|-----------|-------------|
| Developer | Creates tasks, monitors AI execution, reviews completed work |
| Team Lead | Manages projects, configures workflows, assigns priorities |
| QA Engineer | Tests completed tasks, reports issues, verifies AI outputs |

### 1.4 High-Level Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Project Management | Create and manage multiple projects with local file system integration | P0 |
| Kanban Board | Visual task management with customizable columns and drag-and-drop | P0 |
| Task Management | Full CRUD operations with tags, priorities, dependencies, and estimates | P0 |
| AI Task Execution | Automated task completion via OpenCode integration | P0 |
| Workflow Engine | Signal-driven state machine for automatic status transitions | P1 |
| Real-Time Updates | Server-Sent Events for instant UI synchronization | P1 |
| Run Queue Management | Concurrent execution control with per-provider limits | P1 |
| User Story Generation | AI-powered user story creation from task descriptions | P2 |

---

## 2. User Stories

### 2.1 Project Management

| ID | User Story | Priority |
|----|------------|----------|
| PM-01 | As a developer, I want to create a project linked to a local directory, so that AI agents can access project files | P0 |
| PM-02 | As a team lead, I want to view all projects in a list, so that I can quickly navigate between them | P0 |
| PM-03 | As a developer, I want to delete a project, so that I can remove obsolete workspaces | P0 |
| PM-04 | As a team lead, I want to browse the project directory structure, so that I can understand the codebase | P1 |
| PM-05 | As a developer, I want to see project statistics (task counts, run history), so that I can track progress | P2 |

### 2.2 Board/Kanban Management

| ID | User Story | Priority |
|----|------------|----------|
| KB-01 | As a developer, I want to view tasks organized in columns, so that I can see project status at a glance | P0 |
| KB-02 | As a developer, I want to drag and drop tasks between columns, so that I can update task status visually | P0 |
| KB-03 | As a team lead, I want to customize column names and colors, so that the board reflects our workflow | P1 |
| KB-04 | As a developer, I want to see task counts per column, so that I can identify bottlenecks | P1 |
| KB-05 | As a developer, I want to collapse/expand columns, so that I can focus on relevant work areas | P2 |

### 2.3 Task Management

| ID | User Story | Priority |
|----|------------|----------|
| TM-01 | As a developer, I want to create a task with title and description, so that I can capture work items | P0 |
| TM-02 | As a developer, I want to edit task details (title, description, tags), so that I can keep information current | P0 |
| TM-03 | As a developer, I want to delete a task, so that I can remove cancelled or duplicate items | P0 |
| TM-04 | As a developer, I want to assign priority levels to tasks, so that urgent work is highlighted | P0 |
| TM-05 | As a team lead, I want to set task difficulty (easy/medium/hard/epic), so that AI models can be matched appropriately | P0 |
| TM-06 | As a developer, I want to tag tasks with labels, so that I can categorize and filter work | P1 |
| TM-07 | As a developer, I want to link tasks as dependencies (blocks/relates), so that the system respects execution order | P1 |
| TM-08 | As a developer, I want to set start and due dates, so that I can track timelines | P2 |
| TM-09 | As a developer, I want to estimate effort in points or hours, so that I can plan sprints | P2 |
| TM-10 | As a developer, I want to see the task drawer with full details, so that I can review all information | P0 |

### 2.4 AI-Assisted Task Execution (Runs)

| ID | User Story | Priority |
|----|------------|----------|
| AR-01 | As a developer, I want to start an AI run on a task, so that the AI agent can execute it | P0 |
| AR-02 | As a developer, I want to select an agent role for the run (BA/DEV/QA), so that the right AI persona is used | P0 |
| AR-03 | As a developer, I want to see run status in real-time, so that I know execution progress | P0 |
| AR-04 | As a developer, I want to cancel a running task, so that I can stop erroneous execution | P0 |
| AR-05 | As a developer, I want to view run history for a task, so that I can review past attempts | P1 |
| AR-06 | As a developer, I want to see run queue statistics, so that I know current load | P1 |
| AR-07 | As a developer, I want to answer AI questions during execution, so that blocked runs can resume | P1 |
| AR-08 | As a developer, I want to generate a user story from a task description, so that requirements are well-documented | P2 |
| AR-09 | As a developer, I want to view run artifacts (logs, patches), so that I can review AI outputs | P1 |
| AR-10 | As a developer, I want to retry a failed run, so that transient issues can be overcome | P1 |

### 2.5 Workflow Configuration

| ID | User Story | Priority |
|----|------------|----------|
| WF-01 | As a team lead, I want statuses to transition automatically based on run outcomes, so that the board stays current | P1 |
| WF-02 | As a team lead, I want to configure which statuses are allowed per column, so that the workflow matches our process | P1 |
| WF-03 | As a team lead, I want to define signal rules for automatic transitions, so that tasks move through the pipeline | P1 |
| WF-04 | As a team lead, I want to see blocked tasks with reasons (question/paused/failed), so that I can address issues | P0 |
| WF-05 | As a developer, I want tasks to move automatically when runs complete, so that I don't have to update manually | P1 |

### 2.6 Real-Time Updates

| ID | User Story | Priority |
|----|------------|----------|
| RT-01 | As a developer, I want task changes to appear instantly without refresh, so that I see current state | P1 |
| RT-02 | As a developer, I want run status updates to stream live, so that I can monitor progress | P1 |
| RT-03 | As a developer, I want to see when other users move tasks, so that the team stays synchronized | P2 |
| RT-04 | As a developer, I want connection status indicators, so that I know if real-time updates are working | P2 |

---

## 3. Acceptance Criteria

### 3.1 Project Management

#### PM-01: Create Project

```
GIVEN the user is on the projects list screen
WHEN the user clicks "Add Project" and provides a name and valid directory path
THEN a new project is created with a unique ID
AND a default Kanban board is created with standard columns (Backlog, Ready, In Progress, Blocked, Review, Closed)
AND the project appears in the projects list
```

#### PM-02: View Projects List

```
GIVEN at least one project exists
WHEN the user navigates to the projects screen
THEN all projects are displayed with name, path, and creation date
AND projects are sorted by last updated date (most recent first)
```

#### PM-03: Delete Project

```
GIVEN a project exists with tasks and runs
WHEN the user confirms project deletion
THEN the project and all associated data (board, tasks, runs, events, artifacts) are permanently removed
AND the project no longer appears in the projects list
```

#### PM-04: Browse Project Directory

```
GIVEN a project with a valid directory path
WHEN the user opens the directory browser
THEN the file/folder structure is displayed
AND the user can navigate into subdirectories
AND the current path is shown
```

### 3.2 Board/Kanban Management

#### KB-01: View Kanban Board

```
GIVEN a project with a board and tasks
WHEN the user opens the board
THEN tasks are displayed in their respective columns
AND each task card shows title, status icon, and priority indicator
AND columns are displayed in order (Backlog, Ready, In Progress, Blocked, Review, Closed, Deferred)
```

#### KB-02: Drag and Drop Tasks

```
GIVEN a task exists in column A
WHEN the user drags the task to column B and releases
THEN the task's columnId is updated to column B
AND the task's orderInColumn is set to maintain relative position
AND the change is persisted to the database
AND other connected clients see the update in real-time
```

#### KB-03: Customize Columns

```
GIVEN a board with columns
WHEN the user edits a column name or color
THEN the column is updated in the database
AND the board reflects the changes immediately
AND the column's systemKey remains unchanged (for workflow compatibility)
```

### 3.3 Task Management

#### TM-01: Create Task

```
GIVEN the user is viewing a Kanban board
WHEN the user clicks "Add Task" in a column and provides a title
THEN a new task is created with:
  - Unique ID
  - Status: "pending"
  - Column: selected column
  - Created/Updated timestamps
AND the task appears at the bottom of the column
```

#### TM-02: Edit Task

```
GIVEN a task exists
WHEN the user modifies any editable field (title, description, tags, priority, difficulty, type)
THEN the task is updated in the database
AND the updatedAt timestamp is refreshed
AND other clients see the update in real-time
```

#### TM-04: Set Priority

```
GIVEN a task exists
WHEN the user selects a priority level (postpone, low, normal, urgent)
THEN the task displays the corresponding visual indicator
AND urgent tasks appear at the top of their column
AND postpone tasks appear at the bottom
```

#### TM-07: Link Dependencies

```
GIVEN two tasks exist (Task A and Task B)
WHEN the user creates a "blocks" link from Task A to Task B
THEN Task B cannot start execution until Task A completes
AND Task A shows "blocking" indicator
AND Task B shows "blocked by" indicator
```

### 3.4 AI-Assisted Task Execution

#### AR-01: Start Run

```
GIVEN a task with status "pending" in Ready or Backlog column
WHEN the user clicks "Run Task" and selects an agent role
THEN a new run is created with status "queued"
AND the run is added to the execution queue
AND the task status changes to "running"
AND the task moves to the In Progress column
```

#### AR-03: Real-Time Run Status

```
GIVEN a run is in progress
WHEN the AI agent produces output or status changes
THEN the UI displays streaming messages in the run panel
AND the task status reflects current run state (running, paused, failed, done)
AND the run event log is updated
```

#### AR-04: Cancel Run

```
GIVEN a run with status "queued" or "running"
WHEN the user clicks "Cancel"
THEN the run is aborted via OpenCode session termination
AND the run status changes to "cancelled"
AND the task status returns to "pending"
AND the task returns to Ready column
```

#### AR-07: Answer AI Question

```
GIVEN a run is paused with status "question"
WHEN the user provides an answer in the chat input
THEN the answer is sent to the OpenCode session
AND the run resumes execution
AND the task status changes from "question" to "running"
```

### 3.5 Workflow Configuration

#### WF-01: Automatic Status Transitions

```
GIVEN a task with active run
WHEN the run completes successfully (status: "completed")
THEN the task status changes to "done"
AND the task moves to Review column
WHEN the run fails (status: "failed")
THEN the task status changes to "failed"
AND the task moves to Blocked column
WHEN the run pauses with question (status: "paused")
THEN the task status changes to "question"
AND the task moves to Blocked column
```

#### WF-04: Blocked Task Display

```
GIVEN a task with blockedReason set
WHEN the user views the task
THEN a visual blocker indicator is shown with the reason
AND the task appears in the Blocked column
AND hovering shows additional context
```

### 3.6 Real-Time Updates

#### RT-01: Task Update Propagation

```
GIVEN multiple clients are viewing the same board
WHEN one client moves a task
THEN all other clients receive the update via SSE within 100ms
AND the task appears in the new column on all clients
AND no page refresh is required
```

#### RT-02: Run Status Streaming

```
GIVEN a user is viewing a run's messages
WHEN the AI agent generates a message part
THEN the message appears in the UI within 200ms
AND partial updates are streamed incrementally
AND the scroll position follows new content
```

---

## 4. Business Rules

### 4.1 Task Status Constraints

| Rule ID | Rule | Priority |
|---------|------|----------|
| TS-01 | Task status is a string type and defined by workflow configuration, not hardcoded values | P0 |
| TS-02 | Default statuses: pending, running, generating, question, paused, done, failed | P0 |
| TS-03 | Only one active run per task at any time | P0 |
| TS-04 | Task status must match an allowed status for its current column | P1 |
| TS-05 | Blocked tasks must have a blockedReason (question, paused, or failed) | P0 |
| TS-06 | Closed tasks must have a closedReason (done or failed) | P1 |

### 4.2 Column Constraints

| Rule ID | Rule | Priority |
|---------|------|----------|
| CC-01 | Each board has exactly 7 system columns: backlog, ready, in_progress, blocked, review, closed, deferred | P0 |
| CC-02 | Column names are customizable but systemKeys are immutable | P0 |
| CC-03 | Tasks in backlog or ready columns can only have status "pending" | P0 |
| CC-04 | Tasks in in_progress can have status "running" or "generating" | P0 |
| CC-05 | Tasks in blocked column must have status "question", "paused", or "failed" | P0 |
| CC-06 | Tasks in review or closed columns must have status "done" or "failed" | P1 |

### 4.3 Run Execution Rules

| Rule ID | Rule | Priority |
|---------|------|----------|
| RE-01 | Runs execute in queue order (FIFO within provider group) | P0 |
| RE-02 | Default concurrency: 1 run per provider at a time | P0 |
| RE-03 | Concurrency is configurable via RUNS_DEFAULT_CONCURRENCY env variable | P1 |
| RE-04 | Per-provider concurrency overrides via RUNS_PROVIDER_CONCURRENCY | P2 |
| RE-05 | Runs cannot start if task has unresolved blocking dependencies | P0 |
| RE-06 | Run must have a valid sessionId from OpenCode before execution begins | P0 |
| RE-07 | Run metadata captures kind (execution, user-story, qa-testing) and agent role | P1 |
| RE-08 | Cancelled runs restore task to pending status and Ready column | P0 |

### 4.4 Workflow Transition Rules

| Rule ID | Rule | Priority |
|---------|------|----------|
| WT-01 | Status transitions must follow defined workflow_status_transitions table | P1 |
| WT-02 | Column transitions must follow defined workflow_column_transitions table | P1 |
| WT-03 | Signal rules trigger automatic transitions when conditions match | P1 |
| WT-04 | Run signals: run_started, run_completed, run_failed, run_question, run_paused, run_cancelled | P1 |
| WT-05 | User action signals: task_reopened, task_closed, task_moved_to_column | P2 |
| WT-06 | Preferred column is determined by task status via workflow configuration | P1 |

### 4.5 Dependency Rules

| Rule ID | Rule | Priority |
|---------|------|----------|
| DR-01 | Tasks with "blocks" links to incomplete tasks cannot start runs | P0 |
| DR-02 | Circular dependencies are prevented at creation time | P1 |
| DR-03 | Self-referential links are not allowed | P0 |
| DR-04 | Task links are bi-directional in UI (A blocks B shows B blocked by A) | P1 |

### 4.6 AI Model Assignment Rules

| Rule ID | Rule | Priority |
|---------|------|----------|
| AM-01 | Each task can specify a preferred model name | P1 |
| AM-02 | Task difficulty maps to model capability (easy/medium/hard/epic) | P1 |
| AM-03 | Provider key is built from provider:model, provider, or model configuration | P1 |
| AM-04 | Fallback to role-based provider key if no model specified | P2 |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| ID | Requirement | Metric | Priority |
|----|-------------|--------|----------|
| PF-01 | Board load time for 100 tasks | < 500ms | P0 |
| PF-02 | Task drag-and-drop response | < 100ms visual, < 200ms persisted | P0 |
| PF-03 | Run queue processing start | < 1 second from enqueue | P0 |
| PF-04 | SSE event delivery latency | < 100ms from server event | P1 |
| PF-05 | Message streaming update rate | 10+ updates per second during active run | P1 |
| PF-06 | Database query response | < 50ms for single entity, < 200ms for lists | P0 |
| PF-07 | API response time | < 200ms for 95th percentile | P0 |

### 5.2 Reliability

| ID | Requirement | Metric | Priority |
|----|-------------|--------|----------|
| RB-01 | Data persistence | No data loss on server restart | P0 |
| RB-02 | Database integrity | All operations are atomic | P0 |
| RB-03 | Run recovery | Failed runs can be retried with same inputs | P1 |
| RB-04 | Connection resilience | SSE reconnects automatically on disconnect | P1 |
| RB-05 | Graceful degradation | UI remains responsive when OpenCode is unavailable | P1 |
| RB-06 | Error logging | All errors logged with context for debugging | P0 |

### 5.3 Usability

| ID | Requirement | Metric | Priority |
|----|-------------|--------|----------|
| UB-01 | Learning curve | New users can create and run tasks within 5 minutes | P0 |
| UB-02 | Status visibility | Current task/run status visible from board view | P0 |
| UB-03 | Error messages | User-facing errors include actionable guidance | P1 |
| UB-04 | Keyboard navigation | All core actions accessible via keyboard | P2 |
| UB-05 | Dark mode | Full dark theme support | P0 |
| UB-06 | Responsive feedback | All user actions have immediate visual feedback | P0 |

### 5.4 Security

| ID | Requirement | Metric | Priority |
|----|-------------|--------|----------|
| SC-01 | Local data storage | Database file has restrictive permissions (600) | P1 |
| SC-02 | API authentication | No external API exposure (localhost only) | P0 |
| SC-03 | Input validation | All user inputs sanitized before storage | P0 |
| SC-04 | Path traversal | Directory browsing restricted to project paths | P0 |
| SC-05 | Session isolation | OpenCode sessions are isolated per project | P1 |

### 5.5 Maintainability

| ID | Requirement | Metric | Priority |
|----|-------------|--------|----------|
| MN-01 | Code documentation | All public APIs documented with JSDoc | P1 |
| MN-02 | Type safety | 100% TypeScript with strict mode | P0 |
| MN-03 | Database migrations | Schema changes via versioned migrations | P0 |
| MN-04 | Logging | Structured logging with configurable levels | P1 |
| MN-05 | Error handling | No uncaught exceptions in production | P0 |

### 5.6 Scalability

| ID | Requirement | Metric | Priority |
|----|-------------|--------|----------|
| SC-01 | Concurrent tasks | Support 100+ tasks per board without degradation | P1 |
| SC-02 | Run queue depth | Support 50+ queued runs per provider | P2 |
| SC-03 | Message history | Support 1000+ messages per session | P1 |
| SC-04 | Projects per instance | Support 20+ projects | P2 |

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| Board | Kanban board containing columns and tasks for a project |
| Column | Vertical swim lane on a Kanban board (e.g., Ready, In Progress) |
| Task | Work item with title, description, status, and metadata |
| Run | Single AI execution attempt on a task |
| Run Queue | FIFO queue managing concurrent AI executions |
| Signal | Event that triggers automatic workflow transitions |
| Workflow | Configuration of statuses, columns, and transition rules |
| Agent Role | AI persona (BA, DEV, QA, Merge Resolver, Release Notes) |
| OpenCode | Headless AI server that executes runs |
| SSE | Server-Sent Events for real-time updates |

---

## Appendix B: Priority Definitions

| Priority | Definition |
|----------|------------|
| P0 | Critical - Must have for MVP, system is unusable without it |
| P1 | Important - Should have, significantly improves user experience |
| P2 | Nice to have - Can be deferred to future releases |

---

## Appendix C: References

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture and technical design
- [STYLE_GUIDE.md](./STYLE_GUIDE.md) - UI/UX guidelines and component patterns
