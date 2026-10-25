# RoadAssist

RoadAssist is a roadside-assistance web application with separate customer, mechanic, and admin workspaces.

## Start here

```powershell
npm install
npm run dev
```

Useful checks:

```powershell
npm run typecheck
npm test
npm run build
npm run build:functions
```

## Testing

There are two test layers:

| Layer | Command | Needs |
| --- | --- | --- |
| Unit suite (`src/`, `functions/src/`, rules-linter regressions) | `npm test` | Nothing — runs in seconds |
| Firestore rules integration (`emulator/`) | `npm run test:emulator:rules` | Java; boots the Firebase emulator itself via `firebase-tools` |

The integration suites prove the security boundary against the real rules engine: request idempotency, offer ownership, server-only assignment, concurrent accept races, active-job limits, invalid transitions, notifications and admin boundaries. They only run under the emulator — `npm test` will skip them.

Pushes and pull requests run typecheck, lint, the unit suite, the rules linter, and both builds in CI (`.github/workflows/ci.yml`).

The Firebase project configuration belongs in `.env.local`. Use `.env.example` as the template. Never commit `.env.local`.

## Main routes

| Area | Entry points |
| --- | --- |
| Public | `/`, `/features`, `/pricing`, `/about`, `/contact`, `/onboarding` |
| Customer | `/app`, `/services`, `/guide`, `/request`, `/track`, `/history`, `/vehicles`, `/profile` |
| Mechanic | `/m`, `/m/requests`, `/m/job`, `/m/history`, `/m/earnings`, `/m/profile` |
| Admin | `/admin`, `/admin/dispatch`, `/admin/approvals`, `/admin/mechanics`, `/admin/users`, `/admin/requests`, `/admin/analytics`, `/admin/reports`, `/admin/audit`, `/admin/logs` |

## Important notes

- The Mechanic Guide is deterministic safety guidance. It does not use Ollama, Qwen, or another model provider.
- Admin access requires the Firebase `admin` custom claim.
- Mechanic workspace access requires an approved mechanic record.
- `dist`, `node_modules`, `functions/lib`, and Python cache folders are generated files. They can be recreated and should not be edited manually.

For the full folder map, see [`docs/PROJECT-STRUCTURE.md`](docs/PROJECT-STRUCTURE.md).
