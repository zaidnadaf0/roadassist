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
