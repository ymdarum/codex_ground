# Todo Breeze (PWA)

A tiny, **offline‑first**, no‑backend **todo app** you can publish straight to **GitHub Pages** and install on your iPhone as a PWA.

> Zero build, zero frameworks — just HTML, CSS, and vanilla JavaScript with `localStorage` persistence.

## Features
- ✅ Add / edit / delete tasks
- ✅ Priorities (none / low / medium / high)
- ✅ Due dates with **overdue** / **today** indicators
- ✅ #Hashtags in title + extra comma‑separated tags
- ✅ Search, filter (by tag & date), and sort
- ✅ Dark / light theme toggle (persists)
- ✅ Import / export tasks as JSON
- ✅ Works **offline** (service worker)
- ✅ **PWA**: Add to Home Screen (iOS & Android)
- ✅ Ask the browser for **persistent storage** so tasks survive automatic cleanups
- ✅ Auto-refreshes itself when you publish an update

## Live Demo (after you enable Pages)
Your site will be available at: `https://<your-username>.github.io/<your-repo>/`

---

## 1) Quick Start (iPhone‑only, GitHub App + Safari)

### A. Get the project files
1. Download the ZIP attached in this chat to your **Files** app.
2. In the **Files** app, tap the ZIP to extract it into a folder (named `todobreeze-pwa`).

### B. Create the repository
1. Open the **GitHub** iOS app → **+** → **New repository**.
2. Name it, e.g. `todobreeze-pwa`. Make it **Public**.
3. Create the repo.

### C. Upload the files (mobile Safari works best)
1. In Safari, open your new repo on **github.com**.
2. Tap **Add file** → **Upload files**.
3. Tap **Browse**, then pick the extracted folder in **Files**.
4. Select **all files** inside the folder (you can multi‑select).
5. Commit to the **main** branch.

> Tip: If the GitHub app’s “Upload from this device” is easier for you, you can also upload the files from the extracted folder there.

### D. Enable GitHub Pages
1. In your repo, go to **Settings** → **Pages**.
2. **Source**: *Deploy from a branch* → Branch: **main**, Folder: **/** (root) → **Save**.
3. Open the site URL shown on the Pages screen.

### E. Install on iPhone (PWA)
1. Open your Pages site in Safari.
2. Tap **Share** → **Add to Home Screen** → **Add**.

---

## 2) Local Usage (no server needed)
Just open `index.html` in any browser. Tasks are saved to `localStorage` in your device.
Use the **Keep data on this device** button in the footer to request persistent storage so the browser keeps your list even when space runs low.

## 3) Project Structure
```
todobreeze-pwa/
├─ index.html
├─ style.css
├─ app.js
├─ sw.js
├─ manifest.webmanifest
├─ icons/
│  ├─ icon-192.png
│  └─ icon-512.png
├─ data/
│  └─ sample-tasks.json
├─ LICENSE
├─ CHANGELOG.md
└─ .gitignore
```

## 4) How to Use
- **Add a task**: type a title (use `#tags` in the title if you like), pick a due date & priority → **Add**.
- **Search & filter**: text search, tag dropdown, and date filter (All / Today / Overdue / Upcoming / Completed / Active).
- **Sort**: by Priority, Due date, Created time, or Title.
- **Edit**: tap **Edit** on a task (uses simple prompts — easy on mobile).
- **Complete**: check the box on the left.
- **Export**: tap **Export** to download a JSON file.
- **Import**: tap **Import** and select a previously exported JSON file.
- **Sample data**: click **load sample data** under the task list.

## 4.1) How updates roll out
- The service worker precaches the core files listed in `sw.js`.
- When you ship a change, bump the `CACHE_NAME` in `sw.js` to ensure the new bundle is cached separately.
- Open tabs detect when a fresh worker is ready, ask it to activate right away, and reload themselves after the update is in control.
- The first visit stays on the same page (no unexpected refresh) while still taking advantage of the new worker afterward.

## 5) Privacy
All data lives **only in your browser** (`localStorage`). Tap **Keep data on this device** to ask your browser to protect the stored tasks from automatic cleanup. No servers, no tracking.

## 6) Customize
- Change colors in `style.css`.
- App name & theme color in `manifest.webmanifest`.
- Icons in `icons/` (PNG, 192×192 and 512×512).

## 7) License
MIT — see `LICENSE`.

---

## Step‑by‑Step: Commit Messages (suggested)
- `feat: bootstrap vanilla PWA structure`
- `feat: add task CRUD, filters, sorting, import/export`
- `feat: offline support via service worker`
- `feat: add icons and manifest`
- `docs: add README & changelog`

## Roadmap Ideas
- [ ] Reorder tasks via drag‑and‑drop
- [ ] Subtasks & checklists
- [ ] Recurring tasks (daily/weekly/monthly)
- [ ] Reminders via calendar export (.ics)
- [ ] Multi‑device sync via GitHub Gists or a tiny server (optional)
