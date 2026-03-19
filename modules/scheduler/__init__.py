# Expose legacy Scheduler API for backward compatibility
from .v1 import *

# Expose new Kairos Engine
from .kairos import KairosScheduler
from .kairos_v2 import KairosV2Scheduler
from .weekly_generator import WeeklyGenerator, save_weekly_skeleton

# Backward-compatible alias used by existing patch targets/tests.
kairosScheduler = KairosScheduler
