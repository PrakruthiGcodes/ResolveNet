# ResolveNet

**AI-assisted civic issue reporting, routing, and escalation.**

ResolveNet is a college project that lets citizens report everyday civic problems (potholes, garbage, water leakage, and broken streetlights) with a description and optional photo and location. Each complaint is routed to the responsible department, tracked against a deadline, escalated automatically when the deadline passes, and only marked resolved after an independent monitor approves the completed work.

> **Project status:** a working prototype for demonstration. It is not a production system and has not been deployed. See [Known limitations](#known-limitations).

---

## Table of contents

1. [Problem statement](#problem-statement)
2. [Features](#features)
3. [User roles](#user-roles)
4. [Technology stack](#technology-stack)
5. [Architecture](#architecture)
6. [Complaint lifecycle](#complaint-lifecycle)
7. [Prerequisites (Windows)](#prerequisites-windows)
8. [Installation and local setup](#installation-and-local-setup)
9. [Environment variables](#environment-variables)
10. [MongoDB setup](#mongodb-setup)
11. [Running the application](#running-the-application)
12. [Creating department and monitor accounts](#creating-department-and-monitor-accounts)
13. [Running tests and the production build](#running-tests-and-the-production-build)
14. [AI image classification](#ai-image-classification)
15. [API overview](#api-overview)
16. [Project structure](#project-structure)
17. [Current implementation status](#current-implementation-status)
18. [Known limitations](#known-limitations)
19. [Future improvements](#future-improvements)

---

## Problem statement

Civic problems are often reported informally, with no way for the citizen to see who is responsible, how long the fix should take, or whether the work was actually completed. ResolveNet provides a single workflow for these reports:

- A citizen reports the problem, and the system suggests an issue type from the description and photo.
- The complaint goes to the department responsible for that issue type, with a deadline based on the issue type.
- If the deadline passes without action, the complaint is escalated and the relevant people are notified.
- When a department says the work is done, an independent monitor must approve it, or return it for rework with a reason.

---

## Features

**Citizen**
- Register and sign in.
- Report an issue with a description, an optional photo (JPEG, PNG, GIF, or WEBP, up to 5 MB), and an optional location.
- Confirm or correct the issue type when the system is not sure (see [AI image classification](#ai-image-classification)).
- View "My Complaints" and each complaint's status, deadline, escalation, and history.
- Receive notifications about submission, work starting, escalation, rejection, and resolution.

**Department authority**
- See complaints assigned to the department (its own complaints only).
- Mark work as in progress.
- Submit completed work for monitor verification.
- View escalated complaints and the department dashboard.

**Monitor**
- See the **Pending Verification** queue: completed work from all departments waiting for a decision.
- **Approve** completed work (the complaint becomes resolved), or **return it for rework** with a reason.
- See **All Complaints** (read-only): every complaint with its status and recorded history.

**System**
- Automatic SLA deadlines per issue type, and a 24-hour rework deadline after a rejection.
- Escalation check at server startup and then every minute.
- Role-based access control on every API route.

---

## User roles

| Role | How the account is created | What it can do |
| --- | --- | --- |
| **Citizen** | Self-registration on the Create Account page | Report issues, confirm issue types, track own complaints |
| **Department** | Seed script only (see [Creating department and monitor accounts](#creating-department-and-monitor-accounts)) | Work on complaints assigned to its own department only |
| **Monitor** | Seed script only | Approve or return completed work; read all complaints |
| **Admin** | Seed script only | Reserved in the data model. No admin screens or admin-only routes exist yet. |

Public registration always creates a citizen. The registration handler ignores any role sent in the request, so a client cannot assign itself a department, monitor, or admin role.

---

## Technology stack

| Area | Technology |
| --- | --- |
| Backend | Node.js, Express 5 |
| Database | MongoDB, accessed with Mongoose 9 |
| Authentication | JSON Web Tokens (`jsonwebtoken`), passwords hashed with `bcryptjs` |
| File uploads | `multer` (images stored on local disk in `backend/uploads/`) |
| Image classification | TensorFlow.js (`@tensorflow/tfjs`) running a Teachable Machine image model, with `jimp` for resizing |
| Frontend | React 19, Vite 8, React Router 7, Axios, Leaflet (map picker) |
| Linting | oxlint |
| Automated tests | Node's built-in test runner (`node --test`) |
| Legacy AI pipeline | Python, Ultralytics YOLOv8 (not used by the running application; see [AI image classification](#ai-image-classification)) |

---

## Architecture

```
 Browser (React, Vite dev server on :5173)
        │  JSON API calls with a Bearer token (Axios)
        ▼
 Express API (Node.js, :5000)
   ├── Auth, role checks, complaint workflow, notifications
   ├── Image upload (multer) ──► backend/uploads/  (local disk)
   ├── Image classification ──► TensorFlow.js + Teachable Machine model
   │                            (ai-engine/model/teachable_machine/)
   ├── Text classification ──► keyword rules (backend/services/issueClassifier.js)
   └── Escalation scheduler (checks at startup, then every minute)
        │
        ▼
 MongoDB (complaints, users, notifications)
```

- The **backend** is the only component that talks to the database.
- The **frontend** holds the token in the browser and sends it with each request.
- **Uploaded photos** are not stored in the database. The complaint record stores only the file's details: stored name, URL, original name, MIME type, and size.

---

## Complaint lifecycle

| Status | Meaning | What happens next |
| --- | --- | --- |
| `needs_confirmation` | The photo could not be classified reliably, or the photo and description disagree. No department or deadline is assigned yet. | The citizen confirms or corrects the issue type. This moves the complaint to `submitted`. |
| `submitted` | Assigned to a department with a deadline. The department can mark work as in progress. | The department submits completed work. If the deadline passes first, the complaint is escalated. |
| `pending_verification` | The department says the work is done. The department's deadline is paused. | A monitor approves (→ `resolved`) or returns it for rework (→ `submitted`, with a 24-hour rework deadline). |
| `resolved` | Approved by a monitor. Final. | None. |

**Work status** is a separate field on a `submitted` complaint: `not_started`, or `in_progress` once the department starts work. A monitor's return for rework sets it back to `in_progress`.

**Issue types, departments, and deadlines** (from `backend/services/departmentRouter.js` and `backend/services/slaConfig.js`):

| Issue type | Department | Deadline from submission |
| --- | --- | --- |
| Pothole | Road Department | 24 hours |
| Garbage | Sanitation Department | 12 hours |
| Water leakage | Water Department | 12 hours |
| Streetlight | Electrical Department | 24 hours |
| Other | General/Municipal Department | 48 hours |

After a monitor returns work for rework, the new deadline is 24 hours for every issue type.

**Escalation.** A `submitted` complaint whose deadline has passed is escalated once. It is marked with an escalation level and time, and notifications go to the citizen, the department's accounts, and all monitor accounts. Escalation does not change the complaint's status or department. The current setup has one escalation level, applied at the deadline.

---

## Prerequisites (Windows)

- **Windows 10 or 11.** Commands below use PowerShell.
- **Node.js** (the current LTS release) with npm. The project does not pin a Node version in `package.json`.
- **Git** (to clone the repository).
- **MongoDB**, either:
  - a local MongoDB Community Server, or
  - a MongoDB Atlas cluster, whose connection string you copy from the Atlas dashboard.
- **Python is not required** to run the application. It is only needed for the legacy YOLO scripts in `ai-engine/` (see [AI image classification](#ai-image-classification)).

---

## Installation and local setup

Open PowerShell and run each step from the project root.

**1. Clone the repository**

```powershell
git clone <repository-url> ResolveNet
cd ResolveNet
```

**2. Install and configure the backend**

```powershell
cd backend
npm install
Copy-Item .env.example .env
notepad .env
```

Fill in the values described in [Environment variables](#environment-variables), then save the file. The `.env` file stays on your machine and is never committed.

**3. Install and configure the frontend**

```powershell
cd ..\frontend
npm install
Copy-Item .env.example .env
```

The default `VITE_API_BASE_URL` is `http://localhost:5000`, which matches the backend default port. Change it only if you change the backend port.

**4. Confirm the AI model files are present**

The image classifier needs these three files, which must be in `ai-engine/model/teachable_machine/`:

- `model.json`
- `weights.bin`
- `metadata.json`

If they are missing, the application still runs, but every photo is treated as "not classified" and the citizen must confirm the issue type.

---

## Environment variables

Real values go in `backend/.env` and `frontend/.env`. Both files are git-ignored. The `.env.example` files show the variable names with placeholder values.

**Backend (`backend/.env`)**

| Variable | Required | Example (placeholder) | Purpose |
| --- | --- | --- | --- |
| `PORT` | No (defaults to 5000) | `5000` | Port the API listens on |
| `MONGO_URI` | Yes | `mongodb://127.0.0.1:27017/<your-database-name>` | MongoDB connection string. Use your own database name. |
| `JWT_SECRET` | Yes | `<a-long-random-string>` | Secret used to sign login tokens. Use a long random value, for example from `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Never share it. |
| `JWT_EXPIRES_IN` | No (defaults to `7d`) | `7d` | How long a login token stays valid |
| `CLIENT_URL` | Yes | `http://localhost:5173` | Allowed browser origin(s), comma-separated. Local addresses on any port are also accepted outside production. |

**Frontend (`frontend/.env`)**

| Variable | Required | Example (placeholder) | Purpose |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | No (defaults to `http://localhost:5000`) | `http://localhost:5000` | Backend address the frontend calls |

Do not put secrets in frontend variables. Anything prefixed with `VITE_` is visible to anyone who opens the app in a browser.

---

## MongoDB setup

The backend reads the database name from the path at the end of `MONGO_URI`. Mongoose creates the collections (`users`, `complaints`, `notifications`) the first time data is written, so you do not need to create them by hand.

- **Local MongoDB:** install MongoDB Community Server, start its service, and use `mongodb://127.0.0.1:27017/<your-database-name>`.
- **MongoDB Atlas:** create a cluster, add a database user, allow your IP address, and copy the connection string into `MONGO_URI`. Replace the password placeholder with your own database user's password.

**Use a dedicated database for development and demonstration.** Do not point this project at a database that holds real people's data. A database name is not evidence that its contents are safe to change. Check what is in a database before you run the backend against it. The backend's startup escalation check and index sync write to that database.

When the backend starts, it also syncs one index on the `notifications` collection. This is safe on a new database.

---

## Running the application

Use two PowerShell windows.

**Window 1: backend**

```powershell
cd backend
npm start
```

Use `npm run dev` instead for automatic restarts while you edit backend code (it uses nodemon).

You should see `Server running on port 5000` and `MongoDB connected: ...`. If you see `MongoDB connection error`, check `MONGO_URI` and that MongoDB is running.

To check the server, open `http://localhost:5000/api/health` in a browser. It should show `{"status":"ok"}`.

**Window 2: frontend**

```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173` in a browser. Vite may choose another port (for example 5174) if 5173 is busy. Add that address to `CLIENT_URL` in `backend/.env` and restart the backend.

**Typical first run**

1. Go to **Create Account** and register a citizen account.
2. Sign in and go to **Report an Issue** to submit a complaint.
3. Create department and monitor accounts with the seed script (below) to try the other roles.

---

## Creating department and monitor accounts

Department and monitor accounts cannot be created from the website. This is deliberate, so that no visitor can give themselves an authority role. Accounts are created with a script that you run on your own computer. **Do not run it against a database you are not allowed to change.**

The script is `backend/seed/createAuthorityUser.js`. Run it from the `backend` folder. Its usage is:

```powershell
node seed/createAuthorityUser.js <email> <department|-> [role] [--update-existing]
```

- `<email>`: the account's email address.
- `<department|->`: the department name, in quotes if it contains spaces. Use `-` for a monitor, which has no department.
- `[role]`: `department` (the default), `monitor`, or `admin`. The script requires a department name for `admin` as well.
- `--update-existing`: optional. See the warning below.

Examples (replace the placeholders with your own values):

```powershell
# Department account
node seed/createAuthorityUser.js you@example.com "Road Department"

# Monitor account (no department, so pass a dash)
node seed/createAuthorityUser.js monitor@example.com - monitor
```

The password is **never** a command-line argument. After you run the command, the script asks for the password at a hidden prompt and asks you to type it again to confirm. Nothing is shown while you type. The password must be at least 6 characters. The script needs an interactive terminal and refuses piped or scripted input.

Valid department names, exactly as shown (quote names that contain spaces or slashes):

- `Road Department`
- `Sanitation Department`
- `Water Department`
- `Electrical Department`
- `General/Municipal Department`

**Existing accounts are not changed by default.** If the email already has an account, the script stops and changes nothing. Pass `--update-existing` only when you intend to replace that account's role, department, and password. The script prints the change before saving it, and the old password stops working. Use a new, unique email for each demonstration account. Choose passwords you are willing to share only with people who need them, and do not reuse your real passwords.

The script connects using `MONGO_URI` from `backend/.env`, so the account is created in whichever database that points to.

---

## Running tests and the production build

**Backend automated tests** (no MongoDB needed; the tests stub the database):

```powershell
cd backend
npm test
```

The tests cover complaint input validation, issue confirmation rules, location validation, the department and monitor workflows, notifications, escalation, role checks, the image classifier's decision rules, complaint photo access, and the seed script. The latest run passed **241 tests across 53 suites**, with 0 failures. The test list is in the `test` script in `backend/package.json`. A new test file must be added to that list to run.

The file `backend/test/teachableMachineModelLoad.js` loads the real model. It is not part of `npm test`.

**Frontend production build** (writes to `frontend/dist/`, which is git-ignored). The latest run succeeded:

```powershell
cd frontend
npm run build
```

**Frontend lint** (`oxlint`). The code is **not warning-free**. The lint command exits successfully, but it reports warnings, mainly the React `set-state-in-effect` rule in several page load effects and one `react-refresh` export warning in the auth context:

```powershell
cd frontend
npm run lint
```

**Frontend unit tests** cover two utility modules: work-status display rules and complaint location helpers. The latest run passed all **19 tests**. They are not in an npm script, so run them directly from the `frontend` folder:

```powershell
cd frontend
node --test src/utils/complaintHelpers.test.js src/utils/complaintLocation.test.js
```

The pages and components have no automated tests. Their behaviour has been checked by building the app and by manual testing in a browser. The photo-display and photo-privacy checks listed under [Verified demo status](#verified-demo-status) were manual browser checks, not automated end-to-end tests.

---

## AI image classification

### What runs in the application

- **Image classifier:** `backend/services/teachableMachineClassifier.js` loads a **Teachable Machine** image model in TensorFlow.js format from `ai-engine/model/teachable_machine/` and classifies each uploaded photo as a whole image.
- **Text classifier:** `backend/services/issueClassifier.js` uses **keyword rules**, not a trained machine learning model. It looks for words such as "pothole", "garbage", "water leak", and "street light" in the description.

### Model location and input

| Item | Value |
| --- | --- |
| Model files | `ai-engine/model/teachable_machine/model.json`, `weights.bin`, `metadata.json` |
| Accepted uploads | JPEG, PNG, GIF, WEBP, up to 5 MB |
| Preprocessing | Resized (stretched, not cropped) to 224 × 224 pixels; RGB values scaled to the range −1 to 1 |
| Output | One probability per class |

### Class labels

The labels come from `metadata.json`. The app maps them to its issue types:

| Model label (exact) | App issue type | Department |
| --- | --- | --- |
| `pathhole` (the model's spelling of "pothole") | pothole | Road Department |
| `Garbageoverflow` | garbage | Sanitation Department |
| `waterleakage` | water_leakage | Water Department |
| `streetlight` | streetlight | Electrical Department |
| `fallentree` | other | General/Municipal Department |

### Decision rules

These values are set in the code and are **provisional**: they are policy choices, not validated accuracy figures.

1. If the top class has a probability below **0.25**, the photo is "not detected". The complaint needs confirmation.
2. If the top class and the runner-up are within **0.15** of each other, the photo is "ambiguous". The complaint needs confirmation.
3. Otherwise the photo is "detected". It is **auto-routed only** when all of these hold:
   - the class is pothole, garbage, or streetlight (water leakage and "other" always need confirmation);
   - the probability is at least **0.5**; and
   - the citizen's description does not point to a different specific issue type.
4. Anything else is saved as `needs_confirmation`, and the citizen confirms the issue type.

### Measured result (read-only evaluation)

The project's evaluation script, `backend/scripts/evaluateImageModel.js`, was run on the **test split of the `Civic-issues-v2` dataset**:

- **Labelled images evaluated:** 195
- **Correct predictions:** 78 of 195, an **overall accuracy of 40.0%**
- **Undecided (uncertain) predictions:** 5

Results by class in this split:

| Class | Images in split | Result |
| --- | --- | --- |
| Pothole | 67 | Recall 100%; precision 80.7% (83 predicted as pothole, of which 16 were other classes: 14 streetlight and 2 water leakage) |
| Streetlight | 123 | Recall **8.9%** (11 of 123 correct). The 11 streetlight predictions were all correct. The other 112 were missed: 53 predicted as "other", 37 as "garbage", 14 as "pothole", 3 as "water leakage", and 5 undecided. |
| Water leakage | 5 | 0 of 5 correct |
| Garbage | 0 | No labelled garbage images in this split. All 37 garbage predictions were streetlight images. |
| Other | 0 | No labelled "other" images in this split |

The live model has five labels: pothole, streetlight, garbage, water leakage, and fallen tree (which is mapped to "other"). The rows above account for all 195 images, so this split has no fallen-tree images, and that class is not evaluated by these results.

**What this means**

- The split is **heavily imbalanced**: streetlight (123) and pothole (67) dominate, with 5 water-leakage images and no garbage or "other" images. Accuracy figures on such a split say little about the other classes.
- The model **misses most streetlight images**. The streetlight auto-route rule still applies when the model does predict streetlight, so the 8.9% recall should be kept in mind when reading the app's results.
- **Real-world performance has not been established.** The evaluation used one dataset of photos, and no independent field test has been done.
- The probability thresholds (0.25, 0.15, 0.5) have not been tuned or validated on labelled data.

The evaluation script does not change the model, the thresholds, or the data. Run it with:

```powershell
cd backend
node scripts/evaluateImageModel.js --dataset Civic-issues-v2 --split test
```

This needs the dataset folder under `ai-engine/dataset/`. The dataset is not in the repository (it is git-ignored).

### Legacy YOLOv8 pipeline (not used by the running app)

The `ai-engine/` folder also contains a YOLOv8 object-detection pipeline: `train.py`, `inference.py`, `validate_dataset.py`, `colab_train.py`, and `model/best.pt`. The running application does not use it. `backend/services/imageClassifier.js`, which would call it, is not imported anywhere. These files are kept for reference. Training notes are in `ai-engine/COLAB_TRAINING.md`.

---

## API overview

All routes are under `/api`. Routes marked **Auth** need a `Authorization: Bearer <token>` header.

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | Health check |
| `POST /api/auth/register` | Public | Create a citizen account |
| `POST /api/auth/login` | Public | Sign in and receive a token |
| `GET /api/auth/me` | Auth | Current user |
| `POST /api/complaints` | Citizen | Submit a complaint (multipart form with optional `image`) |
| `GET /api/complaints` | Citizen | Own complaints |
| `GET /api/complaints/:id` | Citizen | One own complaint |
| `GET /api/complaints/:id/image` | Auth: citizen, department, or monitor | The complaint's photo. Requires login. Access is checked per complaint: a citizen gets only their own complaints, a department user gets complaints assigned to their department, and a monitor gets any complaint, as on the monitor list. Anyone else gets a 404 (admin accounts get a 403). Old direct `/uploads/` URLs are not served. |
| `PATCH /api/complaints/:id/confirm-issue-type` | Citizen | Confirm or correct the issue type |
| `GET /api/complaints/department` | Department | Complaints for the department |
| `PATCH /api/complaints/department/:id/work-status` | Department | Mark work as in progress |
| `PATCH /api/complaints/department/:id/status` | Department | Submit completed work for verification |
| `GET /api/complaints/monitor` | Monitor | All complaints with history (read-only) |
| `GET /api/complaints/monitor/pending-verification` | Monitor | Completed work awaiting a decision |
| `PATCH /api/complaints/monitor/:id/review` | Monitor | Approve, or return with a reason |
| `GET /api/notifications` | Auth | Own notifications |
| `PATCH /api/notifications/:id/read` | Auth | Mark one notification read |
| `PATCH /api/notifications/read-all` | Auth | Mark all own notifications read |

**Frontend pages:** Home, Sign In, Create Account; citizen: Dashboard, Report an Issue, My Complaints, Complaint Details; department: Dashboard, Department Complaints, Complaint Details; monitor: Pending Verification, All Complaints.

---

## Project structure

```
ResolveNet/
├── backend/
│   ├── config/          Database connection
│   ├── controllers/     Request handlers (auth, complaints, notifications)
│   ├── middleware/      Authentication, role checks, image upload
│   ├── models/          Mongoose schemas (User, Complaint, Notification)
│   ├── routes/          API routes
│   ├── scripts/         evaluateImageModel.js (read-only model evaluation)
│   ├── seed/            createAuthorityUser.js (manual account creation)
│   ├── services/        Classifiers, routing, SLA, escalation, notifications
│   ├── test/            Automated tests (node:test)
│   ├── uploads/         Citizen photos (git-ignored, local only)
│   └── server.js        Entry point
├── frontend/
│   ├── src/             React application (pages, components, services)
│   └── README.md        Frontend-specific instructions
├── ai-engine/
│   ├── model/teachable_machine/   Runtime image model (used by the app)
│   ├── model/best.pt              Legacy YOLO weights (not used at runtime)
│   ├── classes.json, data.yaml    Class definitions for the YOLO pipeline
│   ├── train.py, inference.py, validate_dataset.py, colab_train.py   Legacy YOLO scripts
│   └── README.md        AI engine notes
└── README.md            This file
```

---

## Current implementation status

**Covered by automated backend tests (241 tests across 53 suites, all passing in the latest run):**
- Complaint submission validation and location handling.
- Issue confirmation rules for photos that are unclear or conflict with the description.
- Department status changes, work-status changes, and the monitor approve and return decisions, including refusals for the wrong role, the wrong department, or the wrong status.
- Notifications for work started, approval, rejection, and escalation, including duplicate protection.
- Escalation rules and the guard that stops pending-verification complaints from being escalated.
- Role checks on protected routes.
- The image classifier's decision rules.

- Complaint photo access: authentication, the per-role access rules, and rejection of missing or unsafe image names.
- The seed script: account creation, refusal to overwrite by default, the `--update-existing` requirement, and password handling.

**Frontend utility tests (19 tests, passing in the latest run):** work-status display rules and complaint location helpers. Run with `node --test` (see [Running tests](#running-tests-and-the-production-build)).

**Built and checked by running (not by automated tests):**
- The frontend production build (`npm run build`) succeeded in the latest run.
- The health endpoint responds (`/api/health`).
- Protected API routes refuse requests without a valid token.

**Implemented but checked only by manual use, not by automated tests:**
- Registration, sign-in, complaint submission with photo and map location, My Complaints, and status tracking.
- Department and monitor pages, including the All Complaints page.

### Verified demo status

These checks were run by hand in a browser and confirmed by the project owner. They are **manual browser checks, not automated end-to-end tests**:

- Citizen complaint photo display: passed.
- Department dashboard photo display: passed.
- Monitor photo display: passed.
- Unauthenticated access to an old direct `/uploads/` image URL: blocked.

**Not implemented:**
- Admin screens or admin-only functions.
- Pagination or search on lists.
- Multiple escalation levels.
- Email or SMS notifications. Notifications are in-app only.
- Deployment configuration.

---

## Known limitations

- **Image classification is not accurate enough to trust alone.** On the test split, overall accuracy is 40.0%, and streetlight recall is 8.9%. Streetlight, water-leakage, garbage, and "other" results are not established. The app is designed to ask the citizen to confirm uncertain results, but that is a safeguard, not a measure of accuracy.
- **Thresholds are provisional.** The values 0.25, 0.15, and 0.5 were chosen in code and have not been validated on labelled data.
- **Text classification is rule-based.** It only recognises the keywords listed in `backend/services/issueClassifier.js`. Descriptions that do not use them are classified as "other".
- **No real-world validation.** The model has only been evaluated on one dataset.
- **Local file storage.** Uploaded photos are saved on the server's disk in `backend/uploads/`. They are not backed up or moved with the database. They are served only through the authenticated image endpoint.
- **Single-process escalation.** The escalation check runs inside the backend process, so it only works while the backend is running.
- **Limited roles.** Only the citizen role has self-registration. Department and monitor accounts need the seed script.
- **Limited frontend tests.** Only two utility modules have tests (19 tests, run directly with `node --test`). Pages and components are untested.
- **No deployment or HTTPS configuration** is included.
- **Legacy code.** The YOLO pipeline and `backend/services/imageClassifier.js` are not used by the running app.

---

## Future improvements

- Validate and tune the classifier on a balanced, independent dataset with labelled garbage, water-leakage, and "other" images. Report per-class precision and recall.
- Replace the keyword text classifier with a trained model, or document it as deliberately rule-based.
- Add frontend tests and a set of end-to-end browser tests for each role.
- Add an admin interface for creating and managing authority accounts, instead of the seed script.
- Add pagination, search, and filters to complaint lists.
- Add multi-level escalation with configurable delays.
- Add email or SMS notifications.
- Store photos in object storage, not on the local disk.
- Add deployment instructions and production configuration.
