# Frontend — Manpower Management Portal

Vite + React 19 + Tailwind CSS + shadcn/ui.

## Quickstart

```bash
# Node.js 20+
yarn install      # or: npm install
yarn dev          # or: npm run dev   →  http://localhost:3000
```

Production build:

```bash
yarn build        # outputs to ./build
yarn preview      # serves ./build on :3000
```

## Environment variables

Set in `frontend/.env`:

```
REACT_APP_BACKEND_URL=https://your-api-host.example.com
```

Vite is configured (see `vite.config.js`) to expose `REACT_APP_*` variables to the
client via `process.env.REACT_APP_*`, so the existing CRA-style code in `src/lib/api.js`
continues to work unchanged. New variables can use either `REACT_APP_` or `VITE_` prefix.

## Project layout

```
frontend/
├── index.html              # Vite entry HTML (root)
├── vite.config.js          # Vite config (port 3000, @-alias, REACT_APP_ env prefix)
├── tailwind.config.js
├── postcss.config.js
├── jsconfig.json           # @ → src/ path alias for editor tooling
├── src/
│   ├── main.jsx            # ReactDOM root + QueryClientProvider
│   ├── App.js              # Router + ProtectedRoute
│   ├── components/         # shadcn primitives + app components
│   ├── contexts/AuthContext.jsx
│   ├── lib/api.js          # axios with withCredentials + REACT_APP_BACKEND_URL
│   ├── pages/              # route components
│   └── index.css           # tailwind base + global styles
└── package.json
```

## Notes for contributors

- Components live in `src/components/`; UI primitives in `src/components/ui/` (shadcn/ui).
- Routes are in `src/pages/`. `App.js` wires them with role-based guards.
- The dev server is bound to `0.0.0.0:3000` to work inside the Emergent preview container.
