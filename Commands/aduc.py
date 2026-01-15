import os
import sys
import subprocess
from pathlib import Path
from Modules.Console import log, error, Color

def run(args, properties):
    """
    Launches ADUC in Chronos Mode (Pilot Mode).
    Usage: aduc
    """
    
    # Paths
    chronos_root = Path.cwd()
    launcher = chronos_root / "CHRONOS_ADUC_LAUNCHER.bat"
    
    if not launcher.exists():
        error("Launcher not found: CHRONOS_ADUC_LAUNCHER.bat")
        return

    log("Starting ADUC Pilot Mode...", Color.CYAN)
    
    try:
        if sys.platform == "win32":
            # Use 'start' to launch in a new cmd window so it doesn't block this console
            subprocess.Popen(
                ["start", "Chronos ADUC", str(launcher)], 
                shell=True, 
                cwd=str(chronos_root)
            )
        else:
            # Linux fallback (not main target but good to have)
            subprocess.Popen(
                ["bash", str(chronos_root / "CHRONOS_ADUC_LAUNCHER.sh")], # If we had one
                cwd=str(chronos_root)
            )
        log("Launcher started.", Color.GREEN)
        
    except Exception as e:
        error(f"Failed to launch ADUC: {e}")
