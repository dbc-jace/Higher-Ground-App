# Higher Ground Points

A phone-friendly web app for tracking points and attendance by week, shared live between leaders.

- **Points:** pick a person, then tap a category button to add its preset points. Undo is in the pop-up, and ✕ removes an entry.
- **Attendance:** tap names to mark who's here. Each person marked earns the attendance points set in Settings.
- **Board:** weekly and all-time rankings.
- **Settings (admins only):** people, categories and their point values, attendance points, leaders and PINs, and a CSV backup.
- Weeks run **Wednesday to Tuesday**. Use ◀ ▶ to move between weeks.

It's plain HTML/CSS/JS with no build step. Data lives in Firebase Firestore, so every phone sees changes within about a second.

## Set up the shared database (Firebase, free, ~5 min)

Until this is done the app runs in **demo mode**, with data saved on one device only.

1. Go to <https://console.firebase.google.com>, click **Create a project**, and name it (e.g. `higher-ground`). Google Analytics can be turned off.
2. In the left menu, open **Build → Firestore Database** and click **Create database**. Pick a location near you and start in **production mode**.
3. Open the **Rules** tab, replace everything with the contents of `firestore.rules` from this repo, and click **Publish**.
4. Go to **Project settings** (gear icon) → **Your apps**, click the **</>** (Web) icon, and register the app. A nickname is all it needs; leave Hosting unchecked.
5. Copy the values from the `firebaseConfig` it shows into `firebase-config.js` in this repo, then commit.

The free "Spark" plan allows 50,000 reads and 20,000 writes per day, far more than a youth group needs. No credit card is required.

## Put it online (free, works with a private repo)

GitHub Pages needs a paid plan for private repos, so use one of these free options instead.

### Option A: Netlify (easiest, all in the browser, auto-updates)
1. Go to <https://app.netlify.com>, sign up with GitHub, and choose **Add new site → Import an existing project → GitHub**.
2. Pick `Higher-Ground-App` and give Netlify access to it when asked.
3. Set the branch to deploy to `main`, leave **Build command** empty, set **Publish directory** to `.`, and click **Deploy**.
4. You'll get a link like `https://something.netlify.app`. You can rename it under **Site configuration → Change site name** (e.g. `higher-ground-points`).

Every time the code changes on `main`, Netlify updates the site on its own.

### Option B: Firebase Hosting (same Google project as the database, needs a computer)
```
npm install -g firebase-tools
firebase login
firebase use --add            # pick your project
firebase deploy
```
You get a link like `https://<project-id>.web.app`. Run `firebase deploy` again after any code change. This also publishes `firestore.rules`.

On a phone, use **Share → Add to Home Screen** so it opens like an app.

## First use

1. Open the link. The first person creates the **admin** account (name + PIN).
2. In **Settings**, add people, categories with point values, and other leaders. Each leader gets a PIN, and you can make some of them admins.
3. Leaders open the link, tap their name and enter their PIN. Phones stay logged in until someone taps **Log out**.

## About security

The PIN is a simple lock, not bank-grade security. Anyone with the link who knows a leader's PIN can enter points, and someone technical with the link could get at the data directly. That's fine for points and attendance, but don't store sensitive personal info in this app.

## Run locally

```
python3 -m http.server 8000
```
Then open http://localhost:8000.
