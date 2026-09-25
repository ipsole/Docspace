# Docdril Local Chat Server

Docdril Local Chat Server is a high-performance, self-hosted, and entirely portable local chat application built using Next.js (App Router), TypeScript, and Tailwind CSS. 

Every user, chat, uploaded file, log, and setting is stored directly inside the application folder under a custom file-based database. This application operates entirely without external dependencies like Firebase, Supabase, PostgreSQL, SQLite, or Redis, making the workspace fully portable: copy the folder to another machine, run it, and all data is preserved.

---

## 🚀 Installation & Getting Started

### Prerequisites
- Node.js (v18.x or later recommended)
- npm (Node Package Manager)

### Step 1: Install Dependencies
From the root of the project directory, run:
```bash
npm install
```

### Step 2: Run in Development Mode
Start the local server in development mode:
```bash
npm run dev
```
Open your browser and navigate to [http://localhost:3000](http://localhost:3000) to access the application.

### Step 3: Production Build & Run
To compile a production-ready bundle and run the server:
```bash
npm run build
npm start
```

---

## 📁 Workspace Folder Structure

```
.
├── src/
│   ├── app/                    # Next.js App Router Pages and APIs
│   │   ├── api/                # REST and SSE API Route Handlers
│   │   ├── dashboard/          # Chat workspace page
│   │   ├── login/              # Login card page
│   │   ├── register/           # Registration page
│   │   ├── globals.css         # Custom Tailwind v4 styling system
│   │   └── layout.tsx          # Root provider context wrappers
│   ├── components/             # Reusable UI modal components
│   │   ├── AdminModal.tsx      # Disk stats, backups, and event log search
│   │   ├── CreateChatModal.tsx # Direct message & Group chat forms
│   │   └── SettingsModal.tsx   # Profile edits & Theme preferences
│   ├── context/                # Theme and Auth context states
│   └── lib/
│       ├── auth.ts             # Session cookies & Bcrypt hashing
│       ├── storage/            # JSON-database file operations
│       │   ├── backup.ts       # Adm-zip compression scripts
│       │   ├── logger.ts       # Structured JSONL logging utility
│       │   └── storage.ts      # Core file-read/write and locks
│       └── ai/                 # Extension layer (prepared for Ollama/Gemini/etc.)
├── storage/                    # Self-contained database directory (Auto-created)
│   ├── users/                  # User accounts JSON profiles
│   ├── sessions/               # Active user session records
│   ├── conversations/          # Chat meta metadata JSON files
│   ├── messages/               # Sequential message logs per chat
│   ├── uploads/                # Safe attachments folder
│   ├── avatars/                # Uploaded profile photos
│   ├── backups/                # ZIP snapshots of database files
│   ├── settings/               # Server-wide JSON configuration
│   ├── memory/                 # Future AI memory storage
│   └── logs/                   # events.jsonl log outputs
├── scripts/
│   └── test-storage.ts         # Automated concurrency & storage test
└── README.md
```

---

## 💾 Local Storage Design & Data Integrity

The server reads and writes all records directly into `storage/` as JSON documents. 

### Concurrency Lock System
To prevent file corruption and array overrides during simultaneous requests (e.g. concurrent message sending or profile edits), Docdril utilizes an **in-memory transaction queue** (`enqueueTask`) mapped by file path combined with **atomic renaming** (`fs.rename` in Node). 
- Concurrent writes are serialized sequentially.
- Read-modify-write cycles (like appending a message to a history list) run inside sequential locks.
- Files are written to `.tmp` first and renamed to their target path, ensuring partial or half-writes never occur.

---

## 🔌 API Endpoints Documentation

All requests return JSON data and use standard HTTP status codes.

### Authentication & Sessions
- `POST /api/auth/register` — Creates a new account. The first registered account is automatically promoted to `role: 'admin'`.
- `POST /api/auth/login` — Verifies credentials, starts session, sets HTTP-only `docdril_session` cookie.
- `POST /api/auth/logout` — Destroys session file and deletes cookie.
- `GET /api/auth/me` — Fetches current user profile and updates `lastSeen` timestamp.

### Chats & Messages
- `GET /api/chat` — Lists all conversations current user is a participant of.
- `POST /api/chat` — Starts a DM or Group Chat. Resolves existing DM if matching participants.
- `POST /api/chat/action` — Handles pinning, unpinning, archiving, unarchiving, renaming, and deleting conversations.
- `GET /api/chat/message?chatId={id}` — Loads message history.
- `POST /api/chat/message` — Sends message (text or attachment).
- `PUT /api/chat/message` — Edits message content or toggles reaction emoji list.
- `DELETE /api/chat/message?chatId={id}&messageId={id}` — Deletes/redacts a message.
- `POST /api/chat/typing` — Emits typing notifications over active streams.
- `GET /api/chat/stream` — SSE endpoint pushing real-time messages, typing indicators, and presence updates.

### File Manager
- `POST /api/files` — Uploads attachments or avatars. Enforces file size limits (5MB for avatars, configurable in settings for uploads) and MIME types.
- `GET /api/files?name={filename}&type={upload|avatar}` — Serves files directly with streaming buffers and caching.

### Admin Dashboard (Restricted)
- `GET /api/admin/stats` — Generates disk space usage, users count, active sessions, and system uptimes.
- `PATCH /api/admin/users` — Disables accounts or changes roles. Terminated sessions are instantly wiped.
- `GET /api/admin/backups` — Lists all backup records.
- `POST /api/admin/backups` — Generates a manual ZIP backup of database folders.
- `PUT /api/admin/backups` — Restores database state from filename.
- `GET /api/admin/logs` — Reads/searches structured event logs with limit/offset pagination.

---

## 🔮 Future AI Abstraction Integration

The architecture contains a prepared abstraction module under `src/lib/ai/` to plugin AI models (OpenAI, Gemini, Claude, Ollama, LM Studio) without rewriting the core chat database:

1. **`providers/`**: Define LLM providers implementing the `LLMProvider` interface to standardise parameter passing, text output, and SSE token streaming.
2. **`memory/`**: Vector database simulations or key-value memory trackers to retain local context.
3. **`context/`**: Context builders compiling system instructions, chat history, user bios, and memories.
4. **`agents/`**: Core orchestrator to route user messages to different sub-agents (e.g. searching, file formatting, system monitoring).
