# RoadAssist project structure

This document is the navigation map for the repository. Root-level tooling files stay at the root because Vite, TypeScript, Firebase, and npm expect them there.

```text
RoadAssist/
├── src/                    Frontend React + TypeScript application
│   ├── app/                Auth context and application-level state
│   ├── components/         Reusable UI, guards, icons, and map components
│   ├── layouts/            Public, auth, customer, mechanic, and admin shells
│   ├── lib/                Firebase services, validation, domain logic, and tests
│   ├── pages/
│   │   ├── public/         Landing, marketing, and onboarding pages
│   │   ├── auth/           Login, signup, password reset, verification
│   │   ├── customer/       Customer request, tracking, history, vehicles, guide
│   │   ├── mechanic/       Workshop application, jobs, earnings, profile
│   │   └── admin/          Operations, approvals, users, analytics, reports
│   ├── styles/             Global CSS and Tailwind entry styles
│   ├── routes.tsx          Single route map and portal guards
│   └── main.tsx            Frontend entry point
│
├── functions/
│   └── src/                Trusted Firebase Cloud Functions
│       ├── approval.ts     Mechanic approval and admin actions
│       ├── dispatch.ts     Dispatch and offer workflows
│       ├── notifications.ts Server-created notifications
│       └── projection.ts   Public mechanic projections and aggregates
│
├── ml/                     Optional mechanic-ranking service and research assets
│   ├── api/                FastAPI ranking service
│   ├── data/               Synthetic training/evaluation data
│   ├── features/           Generated feature matrices and schemas
│   ├── model/              RoadAssist ranking model artifacts
│   ├── reports/            Evaluation and data-quality reports
│   ├── tests/              Python ML tests
│   └── README.md           ML workflow instructions
│
├── emulator/               Firebase emulator integration tests
├── scripts/                Rules checks, admin setup, and data backfill scripts
├── docs/                   Architecture and schema documentation
├── legacy/                 Historical reference implementation; not the active app
│
├── firestore.rules         Firestore security rules
├── storage.rules           Storage security rules
├── firestore.indexes.json  Firestore indexes
├── firebase.json           Firebase services and emulator configuration
├── package.json             Frontend scripts and dependencies
├── functions/package.json   Cloud Functions scripts and dependencies
├── vite.config.ts           Vite configuration
├── tsconfig*.json           TypeScript project configurations
└── .env.example             Safe environment-variable template
```

The full route catalogue, data authority, workflow diagrams, verification evidence, and phase matrix are in [ARCHITECTURE-AND-WORKFLOWS.md](./ARCHITECTURE-AND-WORKFLOWS.md). Trusted append-only admin events are implemented in `functions/src/audit.ts` and exposed to claim-admins through `/admin/logs`.

## Where to make common changes

| Need | Edit here |
| --- | --- |
| Add or change a page | `src/pages/<portal>/` |
| Add a route | `src/routes.tsx` |
| Change portal navigation | `src/lib/nav.ts` |
| Change Firebase client reads/writes | `src/lib/` |
| Change backend authority or side effects | `functions/src/` and security rules |
| Change reusable UI | `src/components/` |
| Change mechanic ranking | `ml/` and `src/lib/mlRank.ts` |
| Change environment configuration | `.env.local` locally, `.env.example` for documented keys |

## Generated files

Do not hand-edit or permanently organize generated output. These folders are intentionally recreated by commands:

- `node_modules/` — `npm install`
- `dist/` — `npm run build`
- `functions/lib/` — `npm run build:functions`
- Python `__pycache__/` and `.pytest_cache/` — created by Python tests
