import os
import sys
import datetime
import traceback

# Setup paths
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOGS_DIR = os.path.join(ROOT_DIR, "Logs")
DEBUG_DIR = os.path.join(ROOT_DIR, "Debug")

if not os.path.exists(LOGS_DIR):
    try:
        os.makedirs(LOGS_DIR)
    except Exception:
        pass

if not os.path.exists(DEBUG_DIR):
    try:
        os.makedirs(DEBUG_DIR)
    except Exception:
        pass

LOG_FILE = os.path.join(LOGS_DIR, "engine.log")

class Logger:
    @staticmethod
    def _write(level, message):
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{timestamp}] {level.upper()}: {message}\n"
        
        # Write to file
        try:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(line)
        except Exception:
            pass
            
        # Print to console (optional, maybe filter debug?)
        # try:
        #     # We print to stderr for logs to avoid mixing with command output on stdout if needed,
        #     # but for now stdout is fine for general visibility.
        #     print(line.strip())
        # except Exception:
        #     pass

    @staticmethod
    def info(message):
        Logger._write("INFO", message)

    @staticmethod
    def warn(message):
        Logger._write("WARN", message)

    @staticmethod
    def error(message, exc=None):
        Logger._write("ERROR", message)
        if exc:
            try:
                tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
                Logger._write("ERROR", f"Traceback:\n{tb}")
            except Exception:
                pass

    @staticmethod
    def debug(message):
        # We can write debug logs to a separate file or the main log
        # For now, let's keep engine.log as the source of truth
        Logger._write("DEBUG", message)

    @staticmethod
    def debug_to_file(filename, message):
        """Writes raw debug info to a specific file in the Debug folder."""
        try:
            path = os.path.join(DEBUG_DIR, filename)
            timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            with open(path, "a", encoding="utf-8") as f:
                f.write(f"[{timestamp}] {message}\n")
        except Exception:
            pass

# Initialize by writing a session start marker
Logger.info("=== Chronos Engine Session Started ===")
