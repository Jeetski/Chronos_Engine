import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import yaml


def slugify(name: str) -> str:
    return (
        "".join(ch.lower() if ch.isalnum() else "-" for ch in name.strip())
        .replace("--", "-")
        .strip("-")
    )


def prompt(text: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"{text}{suffix}: ").strip()
    return value or (default or "")


def prompt_yes_no(text: str, default: bool = True) -> bool:
    suffix = "[Y/n]" if default else "[y/N]"
    while True:
        value = input(f"{text} {suffix}: ").strip().lower()
        if not value:
            return default
        if value in ("y", "yes"):
            return True
        if value in ("n", "no"):
            return False
        print("Please respond with y or n.")


class OnboardingWizard:
    def __init__(self) -> None:
        self.root = Path(__file__).resolve().parent.parent
        self.user_dir = self.root / "User"
        self.settings_dir = self.user_dir / "Settings"
        self.profile_path = self.user_dir / "Profile" / "profile.yml"
        self.current_status_path = self.user_dir / "current_status.yml"
        self.nickname = "Pilot"
        self.changes: list[str] = []

    # ---- helpers ---------------------------------------------------------
    def load_yaml(self, path: Path, default):
        if not path.exists():
            return default
        with path.open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle) or default
        return data

    def save_yaml(self, path: Path, data) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as handle:
            yaml.safe_dump(data, handle, sort_keys=False, allow_unicode=True)

    def status_slug(self, name: str) -> str:
        return name.lower().replace(" ", "_")

    def status_file(self, name: str) -> Path:
        return self.settings_dir / f"{self.status_slug(name)}_settings.yml"

    def ensure_examples(self) -> None:
        # Examples were added to the repo, so this mostly verifies presence and
        # nudges the user if files are missing.
        expected = [
            self.user_dir / "Days" / "weekday_example.yml",
            self.user_dir / "Routines" / "morning_routine_example.yml",
            self.user_dir / "Habits" / "creative_practice_example.yml",
            self.user_dir / "Goals" / "learn_guitar_example.yml",
        ]
        missing = [str(path.relative_to(self.root)) for path in expected if not path.exists()]
        if missing:
            print("Heads up — some example files are missing:")
            for rel in missing:
                print(f"  - {rel}")
            print("The wizard will continue, but consider restoring them.")

    def intro(self) -> None:
        print("=" * 72)
        print("Chronos Onboarding Wizard")
        print("=" * 72)
        print(
            textwrap.fill(
                "This guided flow introduces Chronos concepts, sets defaults, "
                "and helps you clone the example templates. Every step is optional "
                "— you can press Enter to accept defaults or type 'skip'.",
                width=72,
            )
        )
        print()

    # ---- steps -----------------------------------------------------------
    def step_profile(self):
        data = self.load_yaml(self.profile_path, {})
        current = data.get("nickname") or "Pilot"
        print(f"Hi {current}! Chronos works best when it can greet you properly.")
        new_name = prompt("Nickname (leave blank to keep)", current)
        if new_name and new_name != current:
            data["nickname"] = new_name
            self.save_yaml(self.profile_path, data)
            self.changes.append(f"Updated nickname to {new_name}")
        self.nickname = data.get("nickname", current)
        print(f"Great, I'll use @{self.nickname} throughout this session.\n")

    def step_categories(self):
        path = self.settings_dir / "category_settings.yml"
        data = self.load_yaml(path, {})
        categories = data.get("Category_Settings") or {}
        print("Current categories and order:")
        ordered = sorted(
            categories.items(),
            key=lambda item: item[1].get("value", 0),
        )
        for idx, (name, meta) in enumerate(ordered, start=1):
            desc = meta.get("Description", "")
            print(f" {idx}. {name} — {desc}")
        if not ordered:
            print("No categories found; let's add at least one.")
        if prompt_yes_no("Would you like to reorder the categories?", False):
            new_order = prompt(
                "Enter comma-separated order using the numbers shown", ""
            )
            if new_order:
                try:
                    positions = [int(x.strip()) for x in new_order.split(",")]
                    reordered = [ordered[i - 1] for i in positions]
                except (ValueError, IndexError):
                    print("Invalid order; keeping the existing arrangement.")
                else:
                    ordered = reordered
                    for pos, (name, meta) in enumerate(ordered, start=1):
                        meta["value"] = pos
                    data["Category_Settings"] = {name: meta for name, meta in ordered}
                    self.save_yaml(path, data)
                    self.changes.append("Updated category order")
        while prompt_yes_no("Add or rename a category?", False):
            name = prompt("Category name").strip()
            if not name:
                break
            desc = prompt("Description", "Personal focus area")
            categories[name] = {
                "value": len(categories) + 1,
                "Description": desc,
            }
            data["Category_Settings"] = categories
            self.save_yaml(path, data)
            self.changes.append(f"Added/updated category '{name}'")
        print()

    def step_status_settings(self):
        path = self.settings_dir / "status_settings.yml"
        data = self.load_yaml(path, {})
        statuses = data.get("Status_Settings") or []
        if not statuses:
            print("No status dimensions found; seeding defaults.")
            statuses = [
                {"Name": "Energy", "Rank": 1, "Description": "How charged do you feel?"},
                {"Name": "Focus", "Rank": 2, "Description": "Mental clarity level."},
            ]
        statuses.sort(key=lambda entry: entry.get("Rank", 0))
        print("Chronos is status-aware. Here are the current dimensions:")
        for idx, entry in enumerate(statuses, start=1):
            print(f" {idx}. {entry.get('Name')} — {entry.get('Description')}")
        if prompt_yes_no("Reorder the status dimensions?", False):
            new_order = prompt("Comma-separated order (e.g., 2,1,3)", "")
            if new_order:
                try:
                    order = [int(x.strip()) for x in new_order.split(",")]
                    statuses = [statuses[i - 1] for i in order]
                    for idx, entry in enumerate(statuses, start=1):
                        entry["Rank"] = idx
                    data["Status_Settings"] = statuses
                    self.save_yaml(path, data)
                    self.changes.append("Adjusted status order")
                except (ValueError, IndexError):
                    print("Invalid order; keeping current ranking.")
        for entry in statuses:
            name = entry.get("Name")
            desc = entry.get("Description", "")
            if not prompt_yes_no(f"Would you like to tweak {name}?", False):
                continue
            entry["Description"] = prompt("Description", desc or "Status dimension")
            values_path = self.status_file(name)
            values_data = self.load_yaml(values_path, {})
            if not values_data:
                root_key = f"{name.replace(' ', '_')}_Settings"
                values_map = {}
            else:
                root_key, values_map = next(iter(values_data.items()))
            print(f"Values for {name}:")
            for val_name, meta in values_map.items():
                print(f" - {val_name} ({meta.get('value')}): {meta.get('description')}")
            while prompt_yes_no(f"Add or edit {name} values?", False):
                val_name = prompt("Value label (e.g., High)").title()
                desc_val = prompt("Value description", "Describe how this feels")
                values_map[val_name] = {
                    "value": len(values_map) + 1,
                    "description": desc_val,
                }
                values_data = {root_key: values_map}
                self.save_yaml(values_path, values_data)
                self.changes.append(f"Updated {name} scale")
        self.save_yaml(path, {"Status_Settings": statuses})
        print()

    def step_current_status(self):
        path = self.current_status_path
        data = self.load_yaml(path, {})
        status_config = self.load_yaml(self.settings_dir / "status_settings.yml", {})
        statuses = status_config.get("Status_Settings") or []
        if not statuses:
            print("No statuses configured; skipping current status setup.\n")
            return
        print("Let’s log how you feel right now so Chronos can adjust templates.")
        for entry in statuses:
            name = entry.get("Name")
            key = self.status_slug(name)
            values_path = self.status_file(name)
            values_data = self.load_yaml(values_path, {})
            values_map = {}
            if values_data:
                values_map = next(iter(values_data.values()))
            options = list(values_map.keys())
            current = data.get(key) or (options[0] if options else "")
            if options:
                print(f"{name} options: {', '.join(options)}")
                choice = prompt(f"{name} value", current)
                if choice:
                    data[key] = choice
            else:
                value = prompt(f"{name} value", data.get(key, ""))
                if value:
                    data[key] = value
        self.save_yaml(path, data)
        self.changes.append("Updated current status defaults")
        print()

    def step_template(self):
        print(
            "Templates keep your day consistent. The Weekday Example template "
            "includes the demo routines you can clone."
        )
        if not prompt_yes_no("Clone Weekday Example into your own template?", True):
            print("Okay, you can copy it later via the CLI.\n")
            return
        new_name = prompt("New day template name", "My Weekday Flow")
        filename = f"{slugify(new_name) or 'my-weekday'}.yml"
        src = self.user_dir / "Days" / "weekday_example.yml"
        dest = self.user_dir / "Days" / filename
        data = self.load_yaml(src, {})
        data["name"] = new_name
        self.save_yaml(dest, data)
        self.changes.append(f"Created day template '{new_name}'")
        print(f"Saved to {dest.relative_to(self.root)}\n")

    def step_example_items(self):
        print("Next, let’s clone the example routines and items you care about.")
        example_map = [
            ("routine", "Morning Routine (Example)", self.user_dir / "Routines" / "morning_routine_example.yml"),
            ("routine", "Evening Routine (Example)", self.user_dir / "Routines" / "evening_routine_example.yml"),
            ("routine", "Bedtime Routine (Example)", self.user_dir / "Routines" / "bedtime_routine_example.yml"),
            ("habit", "Creative Practice (Example)", self.user_dir / "Habits" / "creative_practice_example.yml"),
            ("habit", "Morning Check-In (Example)", self.user_dir / "Habits" / "morning_check_in_example.yml"),
        ]
        for item_type, display_name, src in example_map:
            if not src.exists():
                continue
            if not prompt_yes_no(f"Copy {display_name}?", False):
                continue
            new_name = prompt(f"Name for your {item_type}", display_name.replace("(Example)", self.nickname))
            filename = f"{slugify(new_name)}.yml"
            dest = src.with_name(filename)
            data = self.load_yaml(src, {})
            data["name"] = new_name
            self.save_yaml(dest, data)
            self.changes.append(f"Copied {display_name} -> {new_name}")
        print()

    def step_goal(self):
        src = self.user_dir / "Goals" / "learn_guitar_example.yml"
        if not src.exists():
            print("Goal example not found; skipping goal setup.\n")
            return
        print("Goals keep big milestones visible. The Learn Guitar Example shows count/checklist milestones.")
        if prompt_yes_no("Clone the goal example now?", True):
            new_name = prompt("Goal name", "Ship Personal Project")
            filename = f"{slugify(new_name)}.yml"
            dest = src.with_name(filename)
            data = self.load_yaml(src, {})
            data["name"] = new_name
            self.save_yaml(dest, data)
            self.changes.append(f"Created goal '{new_name}' from example")
        print()

    def step_commitment(self):
        src = self.user_dir / "Commitments" / "practice_rhythm_commitment_example.yml"
        if not src.exists():
            print("Commitment example missing; skipping.\n")
            return
        print(
            "Commitments are promises with frequency rules. The practice example ties to the Creative Practice habit."
        )
        if prompt_yes_no("Clone and rename the commitment example?", True):
            new_name = prompt("Commitment name", "Weekly Focus Promise")
            filename = f"{slugify(new_name)}.yml"
            dest = src.with_name(filename)
            data = self.load_yaml(src, {})
            data["name"] = new_name
            self.save_yaml(dest, data)
            self.changes.append(f"Created commitment '{new_name}'")
        print()

    def step_points_rewards(self):
        settings_path = self.settings_dir / "points_settings.yml"
        data = self.load_yaml(settings_path, {"earn": {}})
        earn = data.get("earn", {})
        print("Points reward consistency. Set earn values per item type (blank keeps current).")
        for key, value in list(earn.items()):
            new_value = prompt(f"Points for {key}", str(value))
            if new_value.strip():
                try:
                    earn[key] = int(new_value)
                except ValueError:
                    print("Invalid number; keeping old value.")
        data["earn"] = earn
        self.save_yaml(settings_path, data)
        self.changes.append("Updated points earn settings")
        reward_src = self.user_dir / "Rewards" / "game_break_reward_example.yml"
        if reward_src.exists() and prompt_yes_no("Clone the example reward?", True):
            new_name = prompt("Reward name", "Creative Break")
            filename = f"{slugify(new_name)}.yml"
            dest = reward_src.with_name(filename)
            data = self.load_yaml(reward_src, {})
            data["name"] = new_name
            self.save_yaml(dest, data)
            self.changes.append(f"Created reward '{new_name}'")
        achievement_src = self.user_dir / "Achievements" / "practice_streak_achievement_example.yml"
        if achievement_src.exists() and prompt_yes_no("Clone the example achievement?", True):
            new_name = prompt("Achievement name", "Momentum Spark")
            filename = f"{slugify(new_name)}.yml"
            dest = achievement_src.with_name(filename)
            data = self.load_yaml(achievement_src, {})
            data["name"] = new_name
            self.save_yaml(dest, data)
            self.changes.append(f"Created achievement '{new_name}'")
        print()

    def step_preferences(self):
        prefs_path = self.user_dir / "Profile" / "preferences_settings.yml"
        data = self.load_yaml(prefs_path, {})
        print("Chronos pairs nicely with agents. Customize their tone and initiative.")
        for key, value in list(data.items()):
            if key.startswith("#"):
                continue
            new_value = prompt(f"{key}", str(value))
            if new_value:
                data[key] = (
                    new_value.lower()
                    if isinstance(value, str)
                    else (new_value.lower() in ("true", "1", "yes"))
                )
        self.save_yaml(prefs_path, data)
        self.changes.append("Updated agent preferences")
        print()

    def step_today_walkthrough(self):
        if not prompt_yes_no("Run 'today' now to see your template?", True):
            print("You can run console_launcher.bat later and type 'today'.\n")
            return
        cmd = [sys.executable, str(self.root / "Modules" / "Console.py"), "today"]
        print("Running:", " ".join(cmd))
        subprocess.run(cmd, check=False)
        if prompt_yes_no("Kick off a timer using your default profile?", False):
            profile = prompt("Timer profile", "classic_pomodoro")
            cmd = [
                sys.executable,
                str(self.root / "Modules" / "Console.py"),
                "timer",
                "start",
                profile,
            ]
            subprocess.run(cmd, check=False)
        print()

    def wrap_up(self):
        print("=" * 72)
        print(f"All done, @{self.nickname}! Changes made this run:")
        if self.changes:
            for item in self.changes:
                print(f" - {item}")
        else:
            print("No files were changed this time.")
        print(
            "\nNext steps: launch the dashboard (`dashboard_launcher.bat`), start the "
            "listener, and feel free to rerun onboarding_wizard.bat if you want to "
            "review these steps again."
        )

    # ---- entry -----------------------------------------------------------
    def run(self):
        self.ensure_examples()
        self.intro()
        self.step_profile()
        self.step_categories()
        self.step_status_settings()
        self.step_current_status()
        self.step_template()
        self.step_example_items()
        self.step_goal()
        self.step_commitment()
        self.step_points_rewards()
        self.step_preferences()
        self.step_today_walkthrough()
        self.wrap_up()


if __name__ == "__main__":
    wizard = OnboardingWizard()
    try:
        wizard.run()
    except KeyboardInterrupt:
        print("\nWizard cancelled.")
