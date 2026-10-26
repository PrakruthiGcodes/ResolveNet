# ResolveNet Frontend

The React web application for ResolveNet: citizens report civic issues, department staff work on them, and monitors verify the completed work. For the project overview, the backend setup, and the full workflow, see the [root README](../README.md).

## Tech stack

- React 19 with React Router 7
- Vite 8 for the development server and production build
- Axios for API calls
- Leaflet for the location picker on the report form
- oxlint for linting

## Prerequisites

- Node.js (current LTS) and npm
- The backend running on `http://localhost:5000` (see the [root README](../README.md#running-the-application))

## Setup (Windows PowerShell)

```powershell
cd frontend
npm install
Copy-Item .env.example .env
```

`frontend/.env` holds one variable:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:5000` | Address of the backend API |

Only change this if the backend runs somewhere else. Values beginning with `VITE_` are visible to anyone who opens the app, so never put secrets in this file.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the Vite development server at `http://localhost:5173` with hot reload |
| `npm run build` | Creates a production build in `frontend/dist/` (git-ignored) |
| `npm run preview` | Serves the last production build locally for a check |
| `npm run lint` | Runs oxlint. The codebase currently reports some warnings, which do not stop the build. |

## Development workflow

1. Start the backend first (`npm start` in `backend/`).
2. Start the frontend with `npm run dev`.
3. Open `http://localhost:5173`.

If Vite opens on another port (for example 5174), add that address to `CLIENT_URL` in `backend/.env` and restart the backend, or the browser will block API calls.

## Folder layout

```
src/
├── App.jsx                 Routes and role guards
├── components/
│   ├── auth/               ProtectedRoute (role-based route guard)
│   ├── complaints/         Complaint card, status timeline, SLA and escalation indicators,
│   │                       issue-type confirmation, location picker, ComplaintHistory
│   ├── layout/             Header and page layouts (navigation per role)
│   ├── notifications/      Notification bell
│   └── ui/                 Shared components (buttons, cards, alerts, badges, forms)
├── context/                Authentication and notification state
├── hooks/                  Shared hooks
├── pages/
│   ├── public/             Home, Sign In, Create Account
│   ├── citizen/            Dashboard, Report an Issue, My Complaints, Complaint Details
│   ├── authority/          Department Dashboard, Department Complaints, Complaint Details
│   └── monitor/            Pending Verification, All Complaints
├── services/               API client (Axios) and complaint service functions
└── utils/                  Formatters, constants, complaint helpers
```

## Routes and access

| Path | Role | Page |
| --- | --- | --- |
| `/`, `/login`, `/register` | Public | Home, Sign In, Create Account |
| `/citizen/dashboard` | Citizen | Dashboard |
| `/citizen/report` | Citizen | Report an Issue |
| `/citizen/complaints` | Citizen | My Complaints |
| `/citizen/complaints/:id` | Citizen | Complaint Details |
| `/authority/dashboard` | Department | Department Dashboard |
| `/authority/complaints` | Department | Department Complaints |
| `/authority/complaints/:id` | Department | Complaint Details |
| `/monitor/pending` | Monitor | Pending Verification (approve or return) |
| `/monitor/complaints` | Monitor | All Complaints (read-only history) |

Route guards only control what the browser shows. The backend enforces the same roles on every API request, so a hidden or typed-in URL cannot bypass them.

## Testing

Two utility modules have unit tests (19 tests in total, using Node's built-in test runner). They are not in an npm script, so run them directly from this folder:

```powershell
node --test src/utils/complaintHelpers.test.js src/utils/complaintLocation.test.js
```

The pages and components have no automated tests. Check other changes by:

1. Running `npm run build`, which must finish without errors.
2. Running `npm run dev` and walking through the workflow for each role.

## Troubleshooting

- **"Network Error" or nothing loads:** confirm the backend is running and that `http://localhost:5000/api/health` returns `{"status":"ok"}`.
- **Blocked by CORS in the browser console:** the frontend's address is not in `CLIENT_URL`. Add it and restart the backend.
- **Changed `.env` but no effect:** restart `npm run dev`. Vite reads environment variables only at startup.
- **Requests start failing with 401 after a while:** your login token has expired (default 7 days), or `JWT_SECRET` was changed on the backend, which invalidates existing tokens. Sign in again.
