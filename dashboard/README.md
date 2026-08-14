# Eventline dashboard

The dashboard is the React/Vite client for the log service. It uses the required health, ingestion, query, and aggregation endpoints.

## Structure

- `src/api.ts`: API types and HTTP client
- `src/App.tsx`: application composition root
- `src/components`: reusable dashboard components
- `src/views`: Overview, Explore, and Ingest screens
- `src/dashboard-types.ts`: dashboard state types
- `src/utils.ts`: formatting and filter helpers
- `src/index.css` and `src/App.css`: global and product styles

## Development

Start the API on port `8080`, then run:

```bash
npm --prefix dashboard run dev
```

Vite serves the dashboard on `http://localhost:5173` and proxies API requests to the service.

## Verification

```bash
npm --prefix dashboard run build
npm --prefix dashboard run lint
```

The production build is emitted to `dashboard/dist` and served by Express.
