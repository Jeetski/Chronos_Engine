# Expose legacy Scheduler API for backward compatibility
from .v1 import *

# Expose new Kairos Engine
from .Kairos import KairosScheduler
from .WeeklyGenerator import WeeklyGenerator, save_weekly_skeleton
