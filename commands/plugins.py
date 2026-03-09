from modules import console as Console


def _fmt_loaded_row(row):
    pid = str(row.get("id") or "")
    cmds = int(row.get("commands") or 0)
    aliases = int(row.get("aliases") or 0)
    return f"- {pid} (commands:{cmds}, aliases:{aliases})"


def _plugin_commands(snapshot, plugin_id):
    out = []
    for cmd, meta in (snapshot.get("command_meta") or {}).items():
        if str((meta or {}).get("plugin_id") or "") == plugin_id:
            out.append(cmd)
    return sorted(out)


def _plugin_aliases(snapshot, plugin_id):
    cmdset = set(_plugin_commands(snapshot, plugin_id))
    out = []
    for alias, target in (snapshot.get("aliases") or {}).items():
        if target in cmdset:
            out.append((alias, target))
    return sorted(out)


def run(args, properties):
    sub = str(args[0]).strip().lower() if args else "list"

    if sub in {"-h", "--help"}:
        print(get_help_message())
        return

    if sub == "reload":
        snapshot = Console.get_plugins_snapshot(force=True)
        print("Plugins reloaded.")
        for row in snapshot.get("loaded", []):
            print(f"Loaded plugin {row.get('id')}")
        for pid in snapshot.get("disabled", []):
            print(f"Skipped plugin {pid} (disabled)")
        for row in snapshot.get("failed", []):
            print(f"Failed plugin {row.get('id')} ({row.get('reason')})")
        return

    if sub in {"list", "status"}:
        force = str((properties or {}).get("refresh", "")).strip().lower() in {"1", "true", "yes", "on"}
        snapshot = Console.get_plugins_snapshot(force=force)
        loaded = snapshot.get("loaded", []) or []
        disabled = snapshot.get("disabled", []) or []
        failed = snapshot.get("failed", []) or []
        print(f"Plugins: loaded={len(loaded)} disabled={len(disabled)} failed={len(failed)}")
        if loaded:
            print("Loaded:")
            for row in loaded:
                print(_fmt_loaded_row(row))
        if disabled:
            print("Disabled:")
            for pid in sorted(disabled):
                print(f"- {pid}")
        if failed:
            print("Failed:")
            for row in failed:
                print(f"- {row.get('id')} ({row.get('reason')})")
        return

    if sub == "show":
        if len(args) < 2:
            print("Usage: plugins show <plugin_id>")
            return
        plugin_id = str(args[1]).strip().lower()
        snapshot = Console.get_plugins_snapshot(force=False)
        loaded_ids = {str(r.get("id") or "") for r in (snapshot.get("loaded") or [])}
        disabled_ids = {str(x or "") for x in (snapshot.get("disabled") or [])}
        failed_rows = [r for r in (snapshot.get("failed") or []) if str(r.get("id") or "") == plugin_id]

        if plugin_id in loaded_ids:
            print(f"Plugin: {plugin_id}")
            cmds = _plugin_commands(snapshot, plugin_id)
            aliases = _plugin_aliases(snapshot, plugin_id)
            print(f"State: loaded ({len(cmds)} command(s), {len(aliases)} alias(es))")
            if cmds:
                print("Commands:")
                for c in cmds:
                    print(f"- {c}")
            if aliases:
                print("Aliases:")
                for alias, target in aliases:
                    print(f"- {alias} -> {target}")
            return

        if plugin_id in disabled_ids:
            print(f"Plugin: {plugin_id}")
            print("State: disabled")
            return

        if failed_rows:
            print(f"Plugin: {plugin_id}")
            for row in failed_rows:
                print(f"State: failed ({row.get('reason')})")
            return

        print(f"Plugin not found: {plugin_id}")
        return

    if sub == "help":
        if len(args) < 2:
            print("Usage: plugins help <command>")
            return
        command_name = str(args[1]).strip()
        text = Console.get_plugin_help(command_name)
        if text:
            print(text)
            return
        print(f"No plugin help found for command: {command_name}")
        return

    print(get_help_message())


def get_help_message():
    return """
Usage:
  plugins list [refresh:true|false]
  plugins status
  plugins reload
  plugins show <plugin_id>
  plugins help <plugin_command>

Alias:
  plugin -> plugins

Description:
  Inspects and reloads CLI plugins configured in user/plugins/plugins.yml.
  Plugins are loaded from user/plugins/<id>/plugin.py only.
"""
