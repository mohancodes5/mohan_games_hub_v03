# Play anywhere — deploy online

Your game needs a **small server** running on the internet so you and friends can open it **any time, anywhere** (phone data, other Wi‑Fi, etc.).  
Easiest free option: **Render** (or **Railway**, **Fly.io**).

---

## Option A: Render (free)

1. **Put the project on GitHub**
   - Create a new repository at [github.com/new](https://github.com/new).
   - Upload this folder (or use Git: `git init`, `git add .`, `git commit`, `git remote add`, `git push`).

2. **Create a Render account**  
   [render.com](https://render.com) → sign up with GitHub.

3. **New Web Service**
   - **Connect** your GitHub repo.
   - **Runtime:** Node  
   - **Build command:** `npm install`  
   - **Start command:** `npm start`  
   - **Instance type:** Free  

4. **Health check path:** `/health` (optional but nice for Render).

5. Click **Create Web Service**. Wait for deploy. You get a URL like:
   ```text
   https://friends-game-hub.onrender.com
   ```

6. **Bookmark that URL** on your phone (or **Add to Home Screen**).  
   Everyone uses **the same link**; room codes work worldwide.

7. **Optional — log your URL on the server**  
   In Render → your service → **Environment** → add:
   - `PUBLIC_URL` = `https://your-service.onrender.com`  
   (So the server logs remind you of the live address.)

### Free tier note

On the **free** plan, Render **sleeps** after ~15 minutes with no traffic. The **first visit** after sleep can take **30–60 seconds** to wake up. After that it’s fast. For always-on, you’d upgrade the plan.

---

## Option B: Railway / Fly.io

- **Railway:** New project → deploy from GitHub → set start `npm start`.  
- **Fly.io:** `fly launch` with the included `Dockerfile` if you use Fly’s Docker flow.

Same idea: you get one **HTTPS URL**; open it on any phone.

---

## After deploy

- **Solo games:** work immediately.  
- **With friends:** both open the **same deployed URL** → Create room / Join room.  
- **Do not** use `localhost` or your home IP for remote friends — use the **Render (or other) URL** only.

---

## Security note

This is a **small demo** for friends. Don’t use it for sensitive data. For a public product you’d add rate limits, auth, etc.
