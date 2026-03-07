import sys
import os

# Ensure we can import matching the project structure
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

try:
    print("--- 1. Syncing Core DB ---")
    from modules.sequence.core_builder import sync_core_db
    sync_core_db()
    print("Core DB Synced.")
except Exception as e:
    print(f"Error syncing DB: {e}")

try:
    print("\n--- 2. Running Kairos Scheduler ---")
    from modules.scheduler.kairos import KairosScheduler
    from datetime import date
    
    scheduler = KairosScheduler()
    today = date.today()
    schedule = scheduler.generate_schedule(today)
    
    print("\n--- 3. Results ---")
    print(f"Stats: {schedule['stats']}")
    count = len(schedule['blocks'])
    print(f"Generated {count} blocks.")
    for block in schedule['blocks']:
         print(f" - [{block.get('start_time')}] {block.get('name')} (Score: {block.get('kairos_score')})")

except Exception as e:
    print(f"Error running scheduler: {e}")
    import traceback
    traceback.print_exc()
