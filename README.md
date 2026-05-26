# thoughtpad

Minimal self-hosted synced text pad.

Thoughtpad is a single-user Markdown-first note editor. The URL is the note name, notes are stored as plain files, images are stored on disk, and live editing is synced through Yjs over a Bun WebSocket server.

## Features

- Single password login with a signed HTTP-only session cookie.
- One note per URL: `/home`, `/work`, `/journal`, `/random`.
- Plain text and Markdown editing with CodeMirror 6.
- Real-time multi-tab and multi-device sync with Yjs.
- Filesystem persistence under `server/data`.
- Paste images into the editor and automatically insert Markdown image syntax.
- Inline image previews inside the editor.
- Vim keybindings on desktop only.
- Native mobile editing behavior on iPhone and Android.
- No accounts, OAuth, database, telemetry, sidebars, tags, dashboards, or SSR.

## Repository Layout

```txt
thoughtpad/
├── docker-compose.yml
├── .env.example
├── README.md
├── server/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── auth.ts
│   │   ├── notes.ts
│   │   ├── uploads.ts
│   │   └── persistence.ts
│   └── data/
│       ├── notes/
│       └── uploads/
└── web/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── editor.ts
        ├── api.ts
        ├── auth.ts
        ├── mobile.ts
        ├── styles.css
        └── components/
            └── Editor.tsx
```

## Environment

Create `.env` from `.env.example`:

```env
PASSWORD=change_me
PORT=3000
SESSION_SECRET=change_me
```

Use a real password and a long random `SESSION_SECRET` before exposing the app to a network.

## Run With Docker

```sh
cp .env.example .env
docker compose up --build
```

Open `http://localhost:3000`.

The compose file mounts `./server/data` into the container at `/app/data`, so notes and uploads survive container rebuilds.

## Local Development

Install dependencies:

```sh
cd server
bun install

cd ../web
npm install
```

Run the backend:

```sh
cd server
PASSWORD=change_me SESSION_SECRET=dev_secret bun run dev
```

Run the frontend in another terminal:

```sh
cd web
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api`, `/uploads`, and `/ws` to `localhost:3000`.

## Build

The production Docker image builds the Vite app and copies `web/dist` into the Bun server image. The server then serves static assets and falls back to `index.html` for note routes.

Frontend-only build:

```sh
cd web
npm run build
```

Backend typecheck:

```sh
cd server
bun run typecheck
```

## Notes

The note name comes from the URL path. `/work` opens the `work` note. `/` opens `home`.

HTTP API:

```txt
GET  /api/note/:name
POST /api/note/:name
```

If a note does not exist, the server creates an empty file automatically.

Notes are stored as Markdown text files under:

```txt
server/data/notes/
```

File names are URL-encoded for filesystem safety. For example, `/work` becomes `work.md`; `/my note` becomes `my%20note.md`.

## Sync

Each note is a Yjs room:

```txt
/ws/:name
```

The server keeps an in-memory Yjs document per active note, initializes it from the matching Markdown file, broadcasts Yjs updates to connected clients, and debounces writes back to disk.

The HTTP note API remains available for simple reads and writes, while the editor itself syncs through WebSockets.

## Authentication

There is one password and no usernames. Login flow:

1. The browser posts the password to `POST /api/login`.
2. The server compares it with `PASSWORD`.
3. The server sets a signed `thoughtpad_session` cookie.
4. API, upload, image, and WebSocket routes require the cookie.

Sessions are stateless and signed with `SESSION_SECRET`.

## Images

Paste flow:

1. The editor intercepts pasted clipboard images.
2. The browser converts the image to WebP.
3. The browser posts it to `POST /api/upload`.
4. The server stores the file under `server/data/uploads`.
5. The editor inserts Markdown:

```md
![](/uploads/uuid.webp)
```

Markdown image syntax remains editable, and the editor renders an inline preview beside it.

Uploads accept WebP, PNG, JPEG, and GIF. Pasted images are converted to WebP by the browser before upload.

## Mobile And Vim

Mobile is detected with:

```ts
/iPhone|Android/i.test(navigator.userAgent)
```

Desktop sessions enable Vim keybindings through `@replit/codemirror-vim`. Mobile sessions skip Vim mode so native editing, selection, and keyboard behavior work normally.

## Data Backup

Back up this directory:

```txt
server/data/
```

It contains both notes and uploaded images.

## Security Notes

Thoughtpad is intentionally small and single-user. It is suitable for personal self-hosting, especially behind a private network, reverse proxy, VPN, or Tailscale.

Before public exposure:

- Set a strong `PASSWORD`.
- Set a long random `SESSION_SECRET`.
- Put it behind HTTPS.
- Consider reverse-proxy rate limiting for `/api/login`.

## Design Constraints

Thoughtpad intentionally avoids:

- user accounts
- OAuth
- sidebar trees
- tags
- database-heavy architecture
- Electron
- SSR complexity
- markdown block editors
- rich text abstractions
- CRDT image blobs
- AI integrations
- notifications
- telemetry

The goal is to stay small, fast, hackable, and understandable.
