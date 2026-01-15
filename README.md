# Chronos Engine

YAML-first life management engine with a scriptable CLI, background listener (alarms, reminders, timer), and a lightweight dashboard.

Quickstart
- Onboarding: run `onboarding_wizard.bat` for a guided CLI setup, or open the dashboard and launch **Chronos Onboarding Wizard** from the Wizards menu.
- Install: run `install_dependencies.bat` (creates `.venv`, installs deps)
- CLI: `console_launcher.bat` then `help`
- Listener: `listener_launcher.bat`
- Dashboard: run `dashboard_launcher.bat`, or in the Console run `dashboard` (alias `dash`)
- Platform: developed and tested primarily on Windows 10/11; Linux/macOS support via the `.sh` launch scripts is currently experimental.

## Features
- **YAML-Based Data**: All your data (tasks, goals, configs) lives in human-readable YAML files.
- **Fractal Scheduling**: Recursive time management that handles infinite nesting of tasks and subroutines.
- **Reactive Listener**: A background service that triggers alarms, scripts, and audio in real-time.
- **Scripting Engine**: A custom `.chs` scripting language with conditional logic (`Conditions.py`) to automate your life.
- **Data Mirroring**: The `Sequence` system builds a relational "Memory" (SQLite) of your history for trend analysis.
- **Rich Dashboard**: A local web interface (Static HTML + Python Server) with widgets, wizards, and visualizations.
- **Agent-Ready**: Explicit "Pilot Directives" and "Mental Models" for AI agents to interact with the system.

## Documentation
- [**Quickstart**](Docs/README.md): How to get set up.
- [**Architecture**](Docs/Dev/Architecture.md): Deep dive into the Internal Loop, Scheduler, and Listener.
- [**CLI Reference**](Docs/Reference/CLI_Commands.md): Complete list of all commands.
- [**Scripting Guide**](Docs/Dev/CHS_Scripting.md): Learn the CHS syntax.
- [**Agent Guide**](Docs/Agents/agents.md): How Nia (the AI) sees the world.
- Settings Guide: `Docs/Guides/Settings.md`
- Scripting: `Docs/Dev/CHS_Scripting.md`, `Docs/Guides/Conditions_Cookbook.md`
- Cockpit Panels: `Docs/Guides/Cockpit.md`
- Sequence Mirrors: `Docs/Dev/Sequence.md`
- Agent Guides: `Docs/Agents/agents.md`, `Docs/Agents/agents.dev.md`

License
- See `Docs/Legal/LICENSE.md`. Commercial terms in `Docs/Legal/COMMERCIAL_LICENSE.md`.
