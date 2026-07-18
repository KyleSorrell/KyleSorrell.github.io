# Sorrell Aviation – Developer Guide

## Overview

Flight lesson scheduling website for Jake Sorrell (Sorrell Aviation).  
Live at: **https://sorrellaviation.com**  
Admin panel: **https://sorrellaviation.com/admin.html** (PIN: 2007)

---

## Tech Stack

| Layer | Service |
|-------|---------|
| Hosting | Firebase Hosting |
| Database | Firebase Firestore |
| Backend | Firebase Cloud Functions (Node.js 24) |
| Email | EmailJS (client-side) |
| Font | Carlito via Google Fonts |
| Source control | GitHub – KyleSorrell/KyleSorrell.github.io |
| Domain registrar | Namecheap |

---

## First-Time Setup on a New Machine

### 1. Install prerequisites

- [Node.js](https://nodejs.org) (v18 or higher)
- [Git](https://git-scm.com)
- Firebase CLI:
  ```
  npm install -g firebase-tools
  ```

### 2. Clone the repo

```
git clone https://github.com/KyleSorrell/KyleSorrell.github.io.git
cd KyleSorrell.github.io
```

### 3. Log into Firebase

```
firebase login
```

Log in with **kylesorrell29@gmail.com** (the Google account that owns the Firebase project).

### 4. Set the Firebase project

```
firebase use jake-sorrell-flight-lessons
```

### 5. Install Cloud Function dependencies

```
cd functions
npm install
cd ..
```

You're ready to develop and deploy.

---

## Project Structure

```
/
├── index.html          Main page (scheduler + footer)
├── about.html          About Jake / Sorrell Aviation
├── confirm.html        Jake's confirm/deny page (linked from email)
├── admin.html          Admin dashboard (PIN protected)
├── script.js           All frontend JavaScript (calendar, form, mobile wheel)
├── style.css           All styles
├── firebase.json       Firebase config (hosting + functions + firestore)
├── firestore.rules     Firestore security rules (deny all direct client access)
├── CNAME               Custom domain file (sorrellaviation.com) — for GitHub Pages fallback
├── functions/
│   └── index.js        All Cloud Functions (Node.js)
└── GUIDE.md            This file
```

---

## Making Changes

Edit files locally in any editor (VS Code recommended). The site has no build step — it's plain HTML/CSS/JS.

### Deploy website changes

```
firebase deploy --only hosting
```

### Deploy Cloud Function changes

```
firebase deploy --only functions
```

### Deploy Firestore rules changes

```
firebase deploy --only firestore:rules
```

### Deploy everything at once

```
firebase deploy
```

### Save to Git (do this alongside deploying)

```
git add .
git commit -m "your message"
git push
```

---

## Cloud Functions

All backend logic lives in `functions/index.js`. Deployed to:  
`https://us-central1-jake-sorrell-flight-lessons.cloudfunctions.net/`

| Function | Method | Purpose |
|----------|--------|---------|
| `submitLessonRequest` | POST | Saves booking to Firestore |
| `getLessonRequest` | GET | Fetches a single booking (used by confirm.html) |
| `processLessonDecision` | POST | Confirms or denies a booking |
| `getUnavailableTimes` | GET | Returns confirmed lessons + custom blocks (used by calendar + admin) |
| `addUnavailableTime` | POST | Admin: adds a custom unavailable block |
| `deleteUnavailableTime` | POST | Admin: removes a custom unavailable block |
| `deleteLessonRequest` | POST | Admin: deletes a confirmed lesson |

Admin functions require PIN `2007` in the request body as `adminPassword`.

---

## Services & Credentials

### Firebase
- Project: `jake-sorrell-flight-lessons`
- Console: https://console.firebase.google.com
- Account: kylesorrell29@gmail.com

### EmailJS
- Public key: `IA_nnwX8_TyVgF09H`
- Service ID: `service_qjt49i4`
- Template — lesson request to Jake: `template_sjocyhw`
- Template — result to student: `template_c1jb6qq`
- Dashboard: https://emailjs.com (log in with Jake's account)

### Namecheap
- Domains managed: `sorrellaviation.com`, `jakesorrell.com`
- Dashboard: https://namecheap.com

### GitHub
- Repo: https://github.com/KyleSorrell/KyleSorrell.github.io
- Account: KyleSorrell

---

## EmailJS Template Variables

**template_sjocyhw** (notification to Jake):
- `{{name}}` — student full name
- `{{time}}` — date and time string
- `{{full_name}}`, `{{email}}`, `{{lesson_date}}`, `{{time_slot}}`, `{{tail_number}}`
- `{{confirmation_link}}` — link to confirm.html?action=confirm
- `{{deny_link}}` — link to confirm.html?action=deny

**template_c1jb6qq** (result to student):
- `{{name}}`, `{{time}}`
- `{{full_name}}`, `{{email}}`, `{{lesson_date}}`, `{{time_slot}}`, `{{tail_number}}`
- `{{result_message}}` — confirmed or denied message text

---

## Admin Page

URL: `https://sorrellaviation.com/admin.html`  
PIN: `2007`

Features:
- **Add Unavailable Time** — block a specific date or recurring day of the week
- **Custom Unavailable Times** — list and delete custom blocks
- **Lesson Requests** — pending bookings with a Review button (opens confirm/deny page)
- **Upcoming Lessons** — confirmed future lessons (can delete to free the slot)
- **Past Lessons** — confirmed past lessons

---

## Domains

| Domain | Hosting | Purpose |
|--------|---------|---------|
| sorrellaviation.com | Firebase Hosting | Primary live site |
| jakesorrell.com | Namecheap redirect | Redirects to sorrellaviation.com |

To update DNS for `sorrellaviation.com`, log into Namecheap → Domain List → Manage → Advanced DNS.

---

## Firestore Collections

| Collection | Purpose |
|------------|---------|
| `lesson_requests` | All lesson bookings (status: pending / confirmed / denied) |
| `unavailable_times` | Admin-added blocks (type: date or recurring) |

All Firestore access goes through Cloud Functions (admin SDK). Direct client access is denied by security rules.

---

## Common Tasks

### Add an unavailable date or day
Go to `sorrellaviation.com/admin.html` → enter PIN → Add Unavailable Time.

### Confirm or deny a lesson request
Either click the link in Jake's notification email, or go to the admin page → Lesson Requests → Review.

### Update EmailJS templates
Log into emailjs.com → Email Templates → edit `template_sjocyhw` or `template_c1jb6qq`.

### View Firestore data directly
Firebase Console → Firestore Database → browse `lesson_requests` and `unavailable_times`.

### Update Cloud Function environment / secrets
Functions use the hardcoded admin PIN `"2007"` in `functions/index.js`. To change it, update the `ADMIN_PIN` constant and run `firebase deploy --only functions`.

---

## Notes

- The mobile calendar uses an iOS-style wheel picker (24-hour range, defaults to 8 AM)
- The desktop calendar uses a drag-to-resize grid (8 AM – 5:30 PM, 30-min slots)
- Confirmed lessons are automatically greyed out on the public calendar
- The confirmation modal appears before any booking is submitted so users can review their details
