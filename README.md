# Higher Ground Points

A phone-friendly web app for tracking points and attendance by week, shared live between leaders.

- **Points:** pick a person, then tap a category button to add its preset points. Undo is in the pop-up, and ✕ removes an entry.
- **Attendance:** tap names to mark who's here. Each person marked earns the attendance points set in Settings.
- **Board:** weekly and all-time rankings.
- **Settings (admins only):** people, categories and their point values, attendance points, leaders (by email), and a CSV backup.
- **Sign-in:** leaders sign in with Google or email/password. Only emails on the leader list get in.
- Weeks run **Wednesday to Tuesday**. Use ◀ ▶ to move between weeks.

It's plain HTML/CSS/JS with no build step. Data lives in Firebase Firestore, so every phone sees changes within about a second.

## Set up Firebase (free, ~10 min)

Until this is done the app runs in **demo mode**, with no login and data saved on one device only.

1. Go to <https://console.firebase.google.com>, click **Create a project**, and name it (e.g. `higher-ground`). Google Analytics can be turned off.
2. **Database:** open **Build → Firestore Database**, click **Create database**, pick a location near you, and start in **production mode**.
3. **Rules:** in Firestore, open the **Rules** tab, replace everything with the contents of `firestore.rules` from this repo, and click **Publish**.
4. **Sign-in:** open **Build → Authentication → Get started**. Under **Sign-in method**, enable **Google** and **Email/Password**.
5. **Authorized domains:** in Authentication, go to **Settings → Authorized domains → Add domain** and add `dbc-jace.github.io`.
6. **Web app config:** go to **Project settings** (gear icon) → **Your apps**, click the **</>** (Web) icon, and register the app. A nickname is all it needs; leave Hosting unchecked. Copy the `firebaseConfig` values into `firebase-config.js` and commit. These values are meant to be public; the rules are what protect the data.

The free "Spark" plan is plenty for this app, and no credit card is required.

## Put it online (GitHub Pages)

The repo must be **public** for free GitHub Pages.

1. Merge this code into `main`.
2. On GitHub, go to **Settings → Pages**, set Source to **Deploy from a branch**, choose `main` and `/ (root)`, and click **Save**.
3. After a minute the app is live at `https://dbc-jace.github.io/Higher-Ground-App/`.

On a phone, use **Share → Add to Home Screen** so it opens like an app.

> Changing visibility on a phone: open github.com/dbc-jace/Higher-Ground-App/settings in the browser (the GitHub app can't do it), scroll to **Danger Zone → Change visibility**. If the page looks broken, turn on "Request Desktop Website."

## First use

1. **Right after it goes live**, open the link and sign in (Google, or create an email account). Since no one has set it up yet, you'll be offered **Set up as admin**. Do this right away, because the first person to do it becomes the admin.
2. In **Settings**, add people, categories with point values, and the attendance points.
3. Under **Leaders**, add each leader's **name and email**, and make some of them admins if you like.
4. Leaders open the link and sign in with that same email: with Google, or by tapping "Create account" and confirming the email. They stay signed in on their phone.

To remove a leader, delete them in Settings; they lose access immediately.

## About security & privacy

- The **code** is public, but the **data** (names, points, attendance) lives in Firebase and is only readable by signed-in leaders on the leader list. The rules in `firestore.rules` enforce this on Google's servers, not just in the app.
- Only admins can change people, categories, settings, or the leader list.
- Keep data light: first names (or first name + last initial) are enough. Don't store birthdays, phone numbers, or addresses.
- Never commit CSV exports or screenshots of the data to this repo.

## Run locally

```
python3 -m http.server 8000
```
Then open http://localhost:8000.
