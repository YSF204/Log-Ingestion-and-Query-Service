# Eventline dashboard

The React/Vite dashboard for the Log Ingestion and Query Service. Its Overview, Explore, and Ingest views use the real `/health`, `/logs`, and `/logs/aggregate` endpoints.

## UI structure

The dashboard is configured for TypeScript, Tailwind CSS v4, and the shadcn CLI. The `@` alias resolves to `dashboard/src`.

- Reusable shadcn-style components: `src/components/ui`
- Global styles and Tailwind entry point: `src/index.css`
- Product-level components: `src/components`
- shadcn configuration: `components.json`

Keeping reusable primitives in `src/components/ui` gives the shadcn CLI and application imports one predictable location. Add future primitives from the `dashboard` directory with:

```bash
npx shadcn@latest add <component>
```

The integrated entry component is `src/components/ui/efferd-dashboard-2.tsx`; `src/demo.tsx` mounts it as the application demo.

## Development

Start the API at `localhost:8080`, then run from the repository root:

```bash
npm install
npm --prefix dashboard run dev
```

Open `http://localhost:5173`. Vite proxies API requests to port 8080.

## Verification

```bash
npm --prefix dashboard run build
npm --prefix dashboard run lint
```

The production build is emitted to `dashboard/dist` and served by Express at `http://localhost:8080`.
