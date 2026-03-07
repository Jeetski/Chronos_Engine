"""
Sequence module scaffolding.

Future phases will populate the SQLite mirrors (`chronos_core.db`, `chronos_matrix.db`,
etc.) and behavior logging. For now we expose helper utilities that manage the local
`User/Data/` workspace and registry metadata so commands can inspect the state.
"""

from .registry import (  # noqa: F401
    ensure_data_home,
    load_registry,
    save_registry,
    update_database_entry,
    describe_registry,
    DATA_DIR,
    REGISTRY_PATH,
    DEFAULT_DATABASES,
)

__all__ = [
    "ensure_data_home",
    "load_registry",
    "save_registry",
    "update_database_entry",
    "describe_registry",
    "DATA_DIR",
    "REGISTRY_PATH",
    "DEFAULT_DATABASES",
]
