# ProSafe---Smart-Helmet-System

| Part | Folder | Role |
|---|---|---|
| Helmet firmware (ESP32) | `ProSafe-Helmet/` | 1 Hz sensor samples, batched upload, LED (SAFE / WARNING / CRITICAL / UNCERTAIN), emergency button |
| Backend (Node/Express, MongoDB) | `ProSafe-Web/backend/` | ingestion, worker baselines, post-processing, alerts, API |
| Frontend (React/Vite) | `ProSafe-Web/frontend/` | dashboards, user management, alerts |
| Risk model service (Python) | `ProSafe-ML-V2/` | streaming preprocessing + data-quality gate + XGBoost (EXTENDED, 38 features) |
| Old ML service | `ProSafe-ML/` | v1, kept for reference, no longer called |

How the parts fit together, how to start them (ML V2 on port 8001 first, then the backend, then the frontend), the
configuration and the known limitations are documented in
[`ProSafe-ML-V2/BACKEND_INTEGRATION_V2.md`](ProSafe-ML-V2/BACKEND_INTEGRATION_V2.md).
