# CampusFlow — College Paperless Academic Request & Approval System

> **A modern, responsive, full-stack paperless academic request and multi-tier approval management portal for colleges and universities.**

---

## 1. Project Overview

**CampusFlow** is a college-project MVP built to digitize student administrative and academic requests. It replaces manual paper forms and in-person coordination with an online request and review workflow.

Students can submit requests online with supporting documentation, monitor approval stages, view faculty remarks, and receive in-app notifications. Staff dashboards show requests assigned to the current staff member and requests on which they have acted. Administrators can inspect requests system-wide but cannot approve, reject, or return them.

**MongoDB Atlas** stores all application data and document metadata. **Cloudinary** stores actual uploaded document contents using authenticated (private) delivery — documents are never publicly accessible.

---

## 2. Problem Statement Addressed

In traditional collegiate setups, students encounter friction across several common administrative workflows:

1. **Attendance Correction:** Students incorrectly marked absent during lectures must physically locate the respective subject faculty to obtain signatures and submit written memos.
2. **Event Attendance / Participation Credit:** Students representing the institution in hackathons, sports, or cultural fests must present proofs to individual class teachers manually to receive academic attendance credits.
3. **Medical Leave:** Often the most cumbersome process — students fill physical leave slips, attach paper hospital records/prescriptions, and seek signatures sequentially across Class Coordinator, Mentor, HOD, and the Dean's office.
4. **Other Academic Grievances:** Grievances regarding exams, evaluations, or departmental issues lack transparent tracking and auditability.

**CampusFlow solves this** by centralizing all 4 workflows into a transparent, paperless platform with automated backend routing.

---

## 3. Technology Stack

### Frontend
- **Framework:** React.js (JSX) with Vite
- **Routing:** React Router DOM (v7)
- **Styling:** Tailwind CSS (v4) with custom academic color palette
- **HTTP Client:** Axios (configured with credentials for httpOnly cookies)
- **Icons:** Lucide React
- **Forms & Notifications:** React Hook Form & React Hot Toast
- **Dates & Formatting:** date-fns

### Backend
- **Runtime:** Node.js (v24+)
- **Framework:** Express.js (REST API architecture)
- **Database:** MongoDB & Mongoose (v9+)
- **File Storage:** **Cloudinary** (authenticated delivery, server-side SDK only)
- **Authentication:** JWT stored in secure `httpOnly` cookies + bcryptjs password hashing (12 salt rounds)
- **File Handling:** Multer (memory buffer) with file signature (magic number) verification and 5 MB limit
- **Security:** Helmet headers, CORS origin whitelisting, rate limiting on authentication routes

### Database & Deployment
- **Database:** MongoDB Atlas (all application records and document metadata)
- **Document Storage:** Cloudinary (authenticated binary storage, `resource_type: raw`, `type: authenticated`)
- **Deployment Targets:**
  - Frontend: Vercel
  - Backend: Render

---

## 4. Application Architecture & Folder Structure

```
CampusFlow/
├── package.json                    # Root workspace automation scripts
├── .gitignore                      # Git ignore rules
├── README.md                       # Comprehensive project documentation
│
├── client/                         # React Frontend (Vite)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js              # Vite config with backend API proxy
│   ├── .env.example                # Frontend environment template
│   ├── .env                        # Local environment variables
│   └── src/
│       ├── App.jsx                 # Protected route definitions & role guards
│       ├── main.jsx                # App bootstrap & toast notification wrapper
│       ├── index.css               # Global styles & Tailwind base/components
│       ├── context/
│       │   └── AuthContext.jsx     # User authentication state & session provider
│       ├── services/
│       │   ├── api.js              # Central Axios instance with credentials
│       │   ├── auth.service.js     # Auth API client
│       │   ├── request.service.js  # Request & workflow API client
│       │   └── user.service.js     # User directory, notifications & file access client
│       ├── utils/
│       │   ├── constants.js        # Roles, request types, statuses, stages
│       │   └── formatters.js       # Date formatting, relative time, file size
│       ├── layouts/
│       │   └── AppLayout.jsx       # Responsive sidebar, navbar, and mobile navigation
│       ├── components/
│       │   ├── common/             # StatusBadge, LoadingSpinner, Modal, Pagination, StatCard
│       │   └── requests/           # RequestCard, ApprovalTimeline (with 4-stage visual tracker)
│       └── pages/
│           ├── public/             # Public landing page
│           ├── auth/               # LoginPage, RegisterPage
│           ├── student/            # StudentDashboard, NewRequestPage, MyRequestsPage
│           ├── staff/              # StaffDashboard (Teacher/Coordinator/Mentor/HOD/Dean)
│           ├── admin/              # AdminDashboard, UserManagementPage
│           └── common/             # RequestDetailPage, NotificationsPage, ProfilePage
│
└── server/                         # Express.js REST API Backend
    ├── package.json
    ├── server.js                   # HTTP Server entry, DB connection, Cloudinary init
    ├── app.js                      # Express middleware, CORS, security, route mounting
    ├── .env.example                # Backend environment template
    ├── .env                        # Local environment variables (never commit)
    ├── config/
    │   ├── db.js                   # MongoDB connection logic
    │   └── cloudinary.js           # Cloudinary SDK initialization & validation
    ├── models/
    │   ├── User.js                 # Users & faculty assignments schema
    │   ├── Request.js              # Academic requests schema (all 4 categories)
    │   ├── ApprovalHistory.js      # Append-only-by-application review history
    │   ├── Notification.js         # In-app notifications
    │   └── FileRecord.js           # Cloudinary asset identifiers & document metadata
    ├── middleware/
    │   ├── auth.middleware.js      # JWT cookie & header token verification
    │   ├── role.middleware.js      # Role-based access control (RBAC) guards
    │   ├── upload.middleware.js    # Multer configuration & file type filters (memoryStorage)
    │   └── error.middleware.js     # Centralized error handler
    ├── controllers/
    │   ├── auth.controller.js      # Student register, login, logout, current user
    │   ├── request.controller.js   # Assigned-approver workflow actions
    │   └── file.controller.js      # Authenticated Cloudinary signed URL generation
    ├── routes/
    │   ├── auth.routes.js          # Authentication endpoints
    │   ├── request.routes.js       # Request CRUD and workflow endpoints
    │   ├── user.routes.js          # Current-user profile endpoints
    │   ├── admin.routes.js         # Admin statistics and user management
    │   ├── notification.routes.js  # Notification list and read-state endpoints
    │   └── file.routes.js          # Authorized document access
    ├── services/
    │   ├── workflow.service.js     # Core approval state machine & sequential routing
    │   ├── storage.service.js      # Cloudinary upload, signed URL generation & deletion
    │   └── notification.service.js # Automated notification triggers
    └── scripts/
        ├── seed.js                 # Demo data generator
        ├── verify-api.js           # Integration test suite (10 automated checks)
        ├── verify-medical-workflow.js # 4-stage sequential approval chain test suite
        └── verify-cloudinary.js    # Comprehensive 20-point Cloudinary storage & security test suite
```

---

## 5. File Storage Architecture — Cloudinary

CampusFlow uses **Cloudinary** for all document storage. Documents are uploaded server-side using the official Cloudinary Node.js SDK, stored with private (authenticated) delivery, and accessed via time-limited signed URLs.

### How to Create a Cloudinary Account
1. Go to [https://cloudinary.com](https://cloudinary.com) and click **Sign Up Free**.
2. Complete registration (a free plan supports up to 25 GB storage and 25 GB bandwidth per month).

### Where to Find Cloudinary Credentials
1. Log in to your Cloudinary dashboard.
2. Go to **Settings → Account** (or the **Dashboard** home page).
3. Copy:
   - **Cloud Name** (e.g., `dxxxxxx`)
   - **API Key** (a 15-digit number)
   - **API Secret** (a 27-character string — keep this secret!)

### How to Configure Backend Environment Variables
Add these to `server/.env` (never commit real values):
```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

The backend validates these at startup and throws a clear error if any are missing.

### How Document Uploads Work

```
1. Student selects file in React (PDF, JPG, PNG — max 5 MB)
2. React sends multipart/form-data to Express backend
3. Express authenticates the user via JWT cookie
4. Multer buffers the file in memory (never written to disk)
5. storage.service.js validates:
   - File extension (.pdf, .jpg, .jpeg, .png)
   - Declared MIME type
   - Magic bytes (actual file signature — cannot be spoofed)
   - File size (≤ 5 MB)
6. Cloudinary SDK uploads the buffer via upload_stream:
   - resource_type: "raw"      ← preserves original file
   - type: "authenticated"     ← private delivery, no public access
   - folder: "campusflow/documents"
   - public_id: UUID           ← random, no user-controlled paths
7. Cloudinary returns asset identifiers
8. FileRecord is saved to MongoDB with stable Cloudinary identifiers
9. Request.attachments[] is updated with the FileRecord ObjectId
10. If Cloudinary upload succeeds but MongoDB save fails → Cloudinary asset is deleted (cleanup)
```

### How Authenticated Delivery Works

All documents are stored with `type: "authenticated"` in Cloudinary, meaning:
- No public URL exists for any document
- Files cannot be accessed by guessing a URL
- Access requires a signed URL generated server-side using the API secret

### How to Access Documents (Signed URL Architecture)

```
1. User clicks "View" on an attached document
2. React calls GET /api/files/:fileRecordId
3. Backend verifies JWT authentication
4. Backend loads FileRecord from MongoDB
5. Backend loads associated Request and checks authorization:
   - Student: must be the request owner
   - Staff: must be current approver OR have acted on the request (ApprovalHistory)
6. Backend calls cloudinary.utils.private_download_url() with the API secret
7. A signed URL valid for 5 minutes is returned as JSON
8. React opens the signed URL in a new browser tab
9. The document is delivered directly from Cloudinary's CDN
10. The signed URL expires automatically — no permanent link is created
```

**Important:** The signed URL is a temporary bearer link. CampusFlow always performs its own authorization check before generating one. Knowing a FileRecord ID alone is not sufficient to access a document.

### How to Test Document Uploads
```bash
npm run test:cloudinary
```

This runs 20 automated tests covering:
- Upload of PDF, JPEG, PNG
- Rejection of oversized/invalid/spoofed files
- Authorization checks (owner access, cross-student blocking, approver access)
- Signed URL generation with expiry timestamp
- Cleanup on upload failure
- 4-stage medical leave workflow with real Cloudinary attachment
- Zero Supabase/GridFS dependency verification

If `CLOUDINARY_*` environment variables are not set, storage-dependent tests are clearly marked as `SKIP`. Non-storage tests (validation, RBAC, workflow routing) still run.

---

## 6. User Roles and Permissions

The system implements 7 strictly separated roles:

| Role | Responsibilities & Permissions |
|------|-------------------------------|
| **Student** | Self-registers via public signup. Submits requests, uploads documents, tracks live progress, reviews remarks, and resubmits returned requests. Can only access own requests and documents. |
| **Teacher** | Reviews requests assigned to their subjects. A teacher with an explicit `assignedClass` also serves as that class's Coordinator; the assignment is distinct from subject teaching. Can act only when currently assigned to the request's stage. |
| **Class Coordinator** | Stage 1 approver for Medical Leave for their assigned class section. Can Approve (forwards to Mentor), Reject, or Return. Can access medical documents for assigned requests. |
| **Mentor** | Stage 2 approver for Medical Leave for their mentored classes. Can Approve (forwards to HOD), Reject, or Return. Can access medical documents for assigned requests. |
| **HOD** | Stage 3 approver for Medical Leave (forwards to Dean). Receives departmental requests only when assigned to the requester's department. Can access relevant documents. |
| **Dean** | Final Stage 4 authority for Medical Leave approvals. Approves or Rejects with institutional remarks. Can access forwarded documents. |
| **Admin** | Configures staff accounts, role assignments, department/subject allocations, and monitors system-wide activity. Can inspect all requests but cannot take approval actions, skip a stage, or alter approval audit history. |

### Critical Security Rule
- **Public registration ALWAYS creates a Student account.** The role is hardcoded on the backend.
- Staff accounts cannot be registered publicly; they must be created by an Admin.
- Initial Admin access is created via an explicit seed script.
- Request lists and details are scoped server-side: students see their own requests; staff see current assignments and requests on which they acted; Admins have read-only system-wide request visibility.
- Admin assignment writes are validated on the backend. Active Coordinator, Mentor, HOD, and subject assignments must be structurally valid and cannot conflict with another active assignment for the same class, department, or subject/class.

---

## 7. Approval Workflow Logic

### A. Attendance Correction Workflow
1. Student submits subject, attendance date, and lecture period.
2. The backend dynamically finds the designated faculty assigned to that Subject, Branch, Year, and Section.
3. If no subject teacher is assigned, the request routes only to an HOD assigned to the student's department; if neither exists, submission fails with an assignment error.
4. Only the current approver with a role permitted for that stage may approve, reject, or return the request.

### B. Event Attendance Workflow
1. Student provides event name, date, details, and optional evidence.
2. Routed to a matching subject teacher when a subject is provided; otherwise it routes to the class Coordinator, then to the student's department HOD if needed.
3. Event Attendance does not fall back to the Dean. If no eligible staff assignment exists, submission fails.
4. Once approved, the record is finalized and credit is logged.

### C. Medical Leave Sequential Approval Chain
Medical leave enforces a non-bypassable 4-stage sequence:

```
[Student Submits with Medical Certificate → Cloudinary]
                      │
                      ▼
          [Stage 1: Class Coordinator]
             ├── Reject ─────────────────► [Status: Rejected (End)]
             ├── Return for Correction ──► [Status: Returned (Student Resubmits)]
             └── Approve & Forward
                      │
                      ▼
          [Stage 2: Faculty Mentor]
             ├── Reject ─────────────────► [Status: Rejected (End)]
             ├── Return for Correction ──► [Status: Returned (Student Resubmits)]
             └── Approve & Forward
                      │
                      ▼
          [Stage 3: Head of Department (HOD)]
             ├── Reject ─────────────────► [Status: Rejected (End)]
             ├── Return for Correction ──► [Status: Returned (Student Resubmits)]
             └── Approve & Forward
                      │
                      ▼
          [Stage 4: Dean]
             ├── Reject ─────────────────► [Status: Rejected (End)]
             └── Approve & Finalize
                      │
                      ▼
            [Status: Approved (Completed)]
```

- If **Returned for Correction**, the student can edit the description and add documents. When resubmitted, the request returns to the exact stage that requested the correction without erasing previous history.
- Every action writes an immutable record to `ApprovalHistory` containing actor ID, name, role, action, previous stage, next stage, timestamp, and remarks.

### D. Other Academic Grievance
The request routes to the HOD assigned to its selected target department; if no target department is supplied, the student's department (or branch) is used. If no matching HOD is available, the existing Dean fallback applies. Resubmission returns to the original review stage and department.

---

## 8. Installation and Local Setup

### Prerequisites
- Node.js (v18 or higher; v24 recommended)
- MongoDB running locally on port 27017 or a MongoDB Atlas connection string
- A Cloudinary account (free tier available at [cloudinary.com](https://cloudinary.com))

### Step 1: Install Dependencies
From the repository root:
```bash
npm run install:all
```

### Step 2: Environment Variables Setup

#### Backend (`server/.env`):
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/campusflow
JWT_SECRET=your_super_secret_jwt_key_campusflow_2026
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# Cloudinary — required for file uploads
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

#### Frontend (`client/.env`):
```env
VITE_API_URL=/api
```

**Important:** Never put Cloudinary credentials in frontend environment variables. Never commit `server/.env` to Git.

### Step 3: Populate Database with Demo Data
```bash
npm run seed
```

### Step 4: Run the Application
Open two terminal windows:

**Terminal 1 (Backend Server):**
```bash
npm run server
# Starts backend on http://localhost:5000
```

**Terminal 2 (Frontend Client):**
```bash
npm run client
# Starts Vite frontend on http://localhost:5173
```

Open `http://localhost:5173` in your browser.

---

## 9. Demo Accounts and Credentials

Password for all pre-seeded demo accounts is: **`Demo@1234`**

| Role | Email | Assigned Responsibility / Context |
|------|-------|-----------------------------------|
| **Admin** | `admin@campusflow.edu` | System Administration & Faculty Directory |
| **Teacher** | `ramesh.kumar@campusflow.edu` | Prof. of Computer Science (CS301 Data Structures, CS302) |
| **Coordinator** | `sunita.sharma@campusflow.edu` | Class Coordinator (CSE Year 3 Section A) |
| **Mentor** | `vijay.mehta@campusflow.edu` | Faculty Mentor (CSE Year 3) |
| **HOD** | `priya.verma@campusflow.edu` | Head of Department (Computer Science / CSE) |
| **Dean** | `anil.gupta@campusflow.edu` | College Dean |
| **Student 1** | `arjun.singh@campusflow.edu` | Arjun Singh (CSE Year 3 Section A, Roll: CSE21001) |
| **Student 2** | `priya.patel@campusflow.edu` | Priya Patel (CSE Year 3 Section A, Roll: CSE21002) |

---

## 10. Automated Test Suites

CampusFlow includes automated test suites covering API contracts, approval workflows, and Cloudinary storage security.

### 1. Cloudinary Storage & Security Test Suite:
```bash
npm run test:cloudinary
```
**Tests executed (20 checks):**
1. Cloudinary configuration loads correctly (or throws clear error when missing)
2. Valid PDF uploads successfully to Cloudinary
3. Valid JPEG uploads successfully to Cloudinary
4. Valid PNG uploads successfully to Cloudinary
5. MongoDB FileRecord stores correct Cloudinary identifiers (no GridFS fields)
6. Cloudinary assets use authenticated delivery (private, not public)
7. Unsupported file formats rejected
8. Files exceeding 5 MB rejected
9. Invalid file signatures (spoofed PDFs) rejected
10. Student can access their own document (signed URL returned)
11. Another student is blocked (HTTP 403)
12. Unauthorized faculty is blocked (HTTP 403)
13. Authorized approver can access assigned request's document
14. Missing/invalid file IDs return appropriate errors
15. Signed URLs include expiresAt timestamp (5-minute window)
16. Failed uploads leave no placeholder FileRecord entries
17. Cloudinary cleanup code exists for MongoDB-failure scenario
18. 4-Stage Medical Leave approval chain works with real Cloudinary attachment
19. Existing API and RBAC guards remain intact
20. No Supabase or GridFS dependency in storage layer

If `CLOUDINARY_*` variables are missing, storage tests are clearly marked `SKIP`.

### 2. General API Integration Test Suite:
```bash
npm run test:api
```

### 3. Medical Leave Sequential Workflow Test:
```bash
# Point this to a dedicated test database whose name ends with "_test".
# PowerShell example:
$env:CAMPUSFLOW_TEST_MONGODB_URI="mongodb://127.0.0.1:27017/campusflow_workflow_test"
npm run test:workflow
```

This verification does not load `server/.env`, use demo accounts, or contact Cloudinary. It creates uniquely named test users and requests in the configured test database and removes only those fixtures afterward. It refuses to connect unless `CAMPUSFLOW_TEST_MONGODB_URI` names a database ending in `test` or `tests`. It tests workflow services and database state; it does not exercise the HTTP upload route.

---

## 11. API Specification Overview

### Authentication (`/api/auth`)
- `POST /api/auth/register` — Public student registration (Role: student)
- `POST /api/auth/login` — Login with email and password (sets `token` httpOnly cookie)
- `POST /api/auth/logout` — Clears authentication cookie
- `GET /api/auth/me` — Retrieves authenticated user profile

### Academic Requests (`/api/requests`)
- `POST /api/requests` — Submit request (supports multipart form data; files uploaded to Cloudinary)
- `GET /api/requests` — List requests (filtered by user role and permissions)
- `GET /api/requests/stats` — Dashboard counters (pending, approved, rejected, returned)
- `GET /api/requests/:id` — Full details of a request with attached document metadata
- `GET /api/requests/:id/history` — Complete audit trail of all review steps
- `PUT /api/requests/:id/approve` — Approver action: Approve and advance stage
- `PUT /api/requests/:id/reject` — Approver action: Reject with mandatory remarks
- `PUT /api/requests/:id/return` — Approver action: Return for correction with remarks
- `PUT /api/requests/:id/resubmit` — Student action: Update returned request and resubmit

### Document Files (`/api/files`)
- `GET /api/files/:id` — Returns a time-limited signed Cloudinary URL (JSON) after authorization check
- `GET /api/files/:id?meta=true` — Retrieve JSON metadata for the file (no signed URL)

### User Profile (`/api/users`)
- `GET /api/users/profile` — Get authenticated user's profile
- `PUT /api/users/profile` — Update name or change password

### Administration (`/api/admin`) — Admin role required
- `GET /api/admin/stats` — Get live user and request counts
- `GET /api/admin/users` — Search and list campus users
- `POST /api/admin/users` — Create an account with role and class assignments
- `GET /api/admin/users/:id` — Retrieve a user
- `PUT /api/admin/users/:id` — Update user details and responsibilities
- `PATCH /api/admin/users/:id/status` — Activate or deactivate a user

### Notifications (`/api/notifications`)
- `GET /api/notifications` — Fetch user's notification list and unread count
- `PATCH /api/notifications/:id/read` — Mark notification as read
- `PATCH /api/notifications/read-all` — Mark all notifications as read

Notifications are stored per recipient and cover request assignment, forwarding, rejection, return, resubmission, and completion. Users can list and mark only their own notifications as read; notifications contain request references and messages, not document contents.

---

## 12. Deployment Guide

### Database (MongoDB Atlas)
1. Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a database user and whitelist your server's IP address (`0.0.0.0/0` for cloud hosting).
3. Copy the connection string and set `MONGODB_URI` in the backend environment.

### Cloudinary (Production)
1. Use the same Cloudinary account as local development, or create a separate production cloud.
2. In Cloudinary Dashboard, go to **Settings → Security** and verify:
   - **Restricted image types** is enabled for stricter upload controls
   - **Return error on notification URL failure** is enabled
3. Optionally create a dedicated **Folder** (`campusflow/documents`) in the Media Library for organization.
4. Set the same `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in Render's environment variables.
5. Documents uploaded with `type: "authenticated"` will remain private in production.

### Backend (Render)
1. Connect your Git repository to [Render](https://render.com).
2. Create a new **Web Service**.
3. Set Root Directory to `server`.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Add environment variables:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `FRONTEND_URL` (your Vercel deployment URL)
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
7. Keep the frontend and backend on HTTPS in production. Cookie-authenticated state-changing requests require the CSRF token flow handled by the frontend API client; do not bypass it with direct browser requests.

### Frontend (Vercel)
1. Import your Git repository into [Vercel](https://vercel.com).
2. Set Root Directory to `client`.
3. Framework Preset: **Vite**.
4. Set `VITE_API_URL` to your live Render backend URL (e.g. `https://campusflow-api.onrender.com/api`).
5. Deploy.

> **Note:** Only `VITE_API_URL` should ever be set as a Vercel/frontend environment variable. Cloudinary credentials belong exclusively in the backend environment.
>
> Password changes invalidate previously issued JWT sessions. Users must sign in again after changing a password.

---

## 13. License
ISC License — Developed for academic and institutional deployment.
