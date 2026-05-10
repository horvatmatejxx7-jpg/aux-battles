# AUX Battles 🎵

Multiplayer music party game. Players compete to pick the best song for a random theme, then vote for the winner.

---

## Project structure

```
aux-battles/
├── index.html          ← Main app (all screens in one file)
├── style.css           ← All styles (glassmorphism dark theme)
├── app.js              ← Game logic + Supabase Realtime
├── supabase-config.js  ← ⚠️  Put YOUR credentials here
├── database.sql        ← Run this once in Supabase to set up tables
└── README.md           ← This file
```

---

## Step 1 — Set up Supabase (free, takes ~5 minutes)

1. Go to **https://supabase.com** and create a free account.
2. Click **New project**. Give it a name (e.g. `aux-battles`). Set a database password. Choose the region closest to you.
3. Wait ~1 minute for provisioning.
4. In the left sidebar, click **SQL Editor → New query**.
5. Open `database.sql`, copy everything, paste it into the editor, and click **Run**.
   - This creates the four tables and enables Realtime on them.
6. In the left sidebar, go to **Project Settings → API**.
7. Copy:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon / public** key (long JWT string)
8. Open `supabase-config.js` and paste your values:

```js
const SUPABASE_URL      = 'https://xxxxxxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

## Step 2 — Run locally

No build step needed — it's plain HTML/CSS/JS.

**Option A — VS Code Live Server**
1. Install the **Live Server** extension in VS Code.
2. Open the `aux-battles` folder.
3. Right-click `index.html` → **Open with Live Server**.

**Option B — Python (built-in)**
```bash
cd aux-battles
python -m http.server 3000
# open http://localhost:3000
```

**Option C — Node http-server**
```bash
npx http-server aux-battles -p 3000
# open http://localhost:3000
```

> ⚠️ You must serve via a local server (not `file://`) because the Supabase SDK uses browser APIs that require an HTTP context.

---

## Step 3 — Deploy online for free

### Vercel (recommended — fastest)
1. Push the `aux-battles` folder to a GitHub repo.
2. Go to **https://vercel.com**, import the repo.
3. No build settings needed — Vercel detects it as a static site.
4. Click **Deploy**. Done. You get a free `*.vercel.app` URL.

### Netlify
1. Go to **https://netlify.com → Add new site → Deploy manually**.
2. Drag and drop the `aux-battles` folder onto the Netlify upload area.
3. Done. You get a free `*.netlify.app` URL.

### GitHub Pages
1. Push the `aux-battles` folder contents to the root of a GitHub repo.
2. Repo Settings → Pages → Source: **main branch / root**.
3. Done. You get `https://yourusername.github.io/repo-name`.

---

## Step 4 — Test multiplayer

1. Open the deployed URL (or `localhost:3000`) in two different browser windows/tabs.
2. **Window 1** — Enter a nickname → click **Create Room**. Note the 6-character room code.
3. **Window 2** — Enter a different nickname → paste the room code → click **Join Room**.
4. In Window 1 (host), click **Start Game**.
5. Both windows receive the same random theme in real time.
6. Each window submits a song. Once both submit, the voting phase starts automatically.
7. Vote in each window (you can't vote for your own song).
8. Results appear automatically when all votes are in.

To test with real players: share the deployed URL and the room code with friends. Works on any device with a browser.

---

## How the game works

| Phase | What happens |
|-------|-------------|
| **Lobby** | Players join via room code. Host sees "Start Game" when ≥ 2 players are present. |
| **Submit** | Everyone sees the same random theme and submits a song (title + artist + optional link). |
| **Vote** | All submissions are shown. Everyone votes for the best song — you can't vote for your own. |
| **Results** | Votes are tallied. Winner gets 1 point. Scoreboard updates. |
| **Repeat** | Host starts the next round with a new theme. |
| **End** | First to 5 points (or host ends the game). Champion is revealed. |

---

## Customisation tips

- **Change number of rounds to win**: edit `max_score: 5` in `createRoom()` in `app.js`.
- **Add your own themes**: add strings to the `THEMES` array at the top of `app.js`.
- **Change colors**: edit the CSS custom properties in the `:root` block of `style.css`.
- **Minimum players**: change the `>= 2` check in `startGame()` in `app.js`.
