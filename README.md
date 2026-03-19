# Friends Game Hub

A **mobile-friendly** web app with **solo** mini-games and **2-player online** games using a **6-character room code**.

## Play any time, anywhere

Games run in the **browser**; multiplayer needs a **server on the internet** (not just your PC).

👉 **Step-by-step (free hosting):** open **[DEPLOY.md](./DEPLOY.md)** and deploy to **Render** (or similar). You’ll get a link like `https://your-game.onrender.com` — use that on **any phone, any network**, and share it with friends.

- **Solo:** open your live link → Play solo.  
- **Friends:** everyone opens the **same link** → Create room / Join room.

> Free tiers may **sleep** when nobody uses the site; the **first load** after a long idle can take **~30–60 seconds**.

## Games

| Mode | Games |
|------|--------|
| **Solo** | Free draw, Find them all (no timer), Reflex tap, Memory match |
| **With friends** | **Draw & guess** (pick a word → draw on a timer → friend guesses), Tic-tac-toe, Rock Paper Scissors |

## Run on your PC only (local / same Wi‑Fi)

1. Install [Node.js](https://nodejs.org/) (LTS).
2. In this folder:
   ```bash
   npm install
   npm start
   ```
3. Browser: **http://localhost:3000**  
4. Phone on same Wi‑Fi: **http://YOUR_PC_IP:3000** (`ipconfig` → IPv4).

## Project layout

| File | Role |
|------|------|
| `server.js` | Web server + Socket.IO (rooms, sync) |
| `public/` | HTML, CSS, client JS |
| `DEPLOY.md` | **Deploy online** so you can play anywhere |
| `render.yaml` | Optional Render blueprint |

## License

Use and modify freely for you and your friends.
