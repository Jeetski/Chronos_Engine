import importlib

_ALIAS_MAP = {
    "Conditions": "conditions",
    "Console": "console",
    "DataCardManager": "data_card_manager",
    "FilterManager": "filter_manager",
    "ItemManager": "item_manager",
    "Logger": "logger",
    "MacroEngine": "macro_engine",
    "OnboardingWizard": "onboarding_wizard",
    "Planner": "planner",
    "SoundFX": "sound_fx",
    "Variables": "variables",
    "Achievement": "achievement",
    "Alarm": "alarm",
    "Appointment": "appointment",
    "Commitment": "commitment",
    "Day": "day",
    "Dream_Diary_Entry": "dream_diary_entry",
    "Goal": "goal",
    "Habit": "habit",
    "Inventory": "inventory",
    "Inventory_item": "inventory_item",
    "Journal_Entry": "journal_entry",
    "List": "list",
    "Listener": "listener",
    "Microroutine": "microroutine",
    "Milestone": "milestone",
    "Note": "note",
    "Person": "person",
    "Place": "place",
    "Plan": "plan",
    "Project": "project",
    "Reminder": "reminder",
    "Reward": "reward",
    "Ritual": "ritual",
    "Routine": "routine",
    "Scheduler": "scheduler",
    "Sequence": "sequence",
    "Subroutine": "subroutine",
    "Task": "task",
    "Timeblock": "timeblock",
    "Timer": "timer",
    "Tool": "tool",
    "User": "user",
    "Week": "week",
    "Window": "window",
}


def __getattr__(name: str):
    target = _ALIAS_MAP.get(name)
    if not target:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    mod = importlib.import_module(f"{__name__}.{target}")
    globals()[name] = mod
    return mod


__all__ = sorted(_ALIAS_MAP.keys())
