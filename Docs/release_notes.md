# Chronos Engine - Alpha 2.0 Release Notes

**Status**: Alpha
**Release Date**: 2026-01-22

## 🚀 Highlights
Alpha 2.0 focuses on **stability, observability, and hygiene**. We have introduced a centralized logging system, cleaned up development artifacts, and upgraded the dashboard for better debugging.

### ✨ New Features
*   **Centralized Logging**: The engine now writes structured logs to `Logs/engine.log`. No more flying blind when backend commands fail.
*   **Live Debug Console**: The Dashboard's Debug Widget now connects to the backend logs. You can see server-side errors, warnings, and info messages directly in the UI.
*   **Test Suite**: We have established a foundational test suite (`Tests/`) to ensure core stability covering Item Management and Scheduling basics.

### 🛠️ Improvements
*   **Debug Hygiene**: `debug_delete.txt` and other ad-hoc debug files are now neatly contained in the `Debug/` directory, keeping your project root clean.
*   **Error Handling**: `Console` and `ItemManager` now gracefully log errors instead of failing silently or crashing.
*   **API**: Added `/api/logs` endpoint to the local server.

### 🐛 Bug Fixes
*   Fixed silent failures in Item Manager during deletion.
*   Fixed hardcoded debug paths scattered across modules.

## 🔮 Next Steps
*   Expanding test coverage to Variables, Console Parsing, and Filtering.
*   Implementing Config-Driven Dashboard architecture (see `IDEAS/config_architecture.md`).
