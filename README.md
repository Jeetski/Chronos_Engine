# Chronos Engine (Alpha v0.2)

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
- **Data Cards**: A flexible card-based system for managing arbitrary collections (RPGs, Collections, Inventories) with custom schemas and visualizations.
- **Extensible Logic**: Dynamic Registries for Wizards and Themes allow drop-in extensions without code changes.
- **Agent-Ready**: Explicit "Pilot Directives" and "Mental Models" for AI agents to interact with the system.

## Documentation
- [**Quickstart**](docs/readme.md): How to get set up.
- [**Architecture**](docs/dev/architecture.md): Deep dive into the Internal Loop, Scheduler, and Listener.
- [**CLI Reference**](docs/reference/cli_commands.md): Complete list of all commands.
- [**Scripting Guide**](docs/dev/chs_scripting.md): Learn the CHS syntax.
- [**Agent Guide**](docs/agents/agents.md): How Nia (the AI) sees the world.
- Settings Guide: `docs/guides/settings.md`
- Scripting: `docs/dev/chs_scripting.md`, `docs/guides/conditions_cookbook.md`
- Cockpit Panels: `docs/guides/cockpit.md`
- Sequence Mirrors: `docs/dev/sequence.md`
- Agent Guides: `docs/agents/agents.md`, `docs/agents/skills/skills_index.md`

License
- See `docs/legal/license.md`. Commercial terms in `docs/legal/commercial_license.md`.
