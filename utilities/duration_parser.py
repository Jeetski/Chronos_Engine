import re

def parse_duration_string(duration_str):
    """
    Parses a duration string (e.g., "120m", "1h", "2h30m") into total minutes as an integer.
    """
    if duration_str == "parallel":
        return 0 # Parallel items don't contribute to sequential duration
    if isinstance(duration_str, (int, float)):
        return int(duration_str)
    
    # If the string is just a number, treat it as minutes
    if isinstance(duration_str, str) and duration_str.isdigit():
        return int(duration_str)

    total_minutes = 0
    # Match hours (e.g., 1h, 2H)
    hours_match = re.search(r'(\d+)\s*[hH]', duration_str)
    if hours_match:
        total_minutes += int(hours_match.group(1)) * 60
    
    # Match minutes (e.g., 30m, 45M)
    minutes_match = re.search(r'(\d+)\s*[mM]', duration_str)
    if minutes_match:
        total_minutes += int(minutes_match.group(1))
        
    return total_minutes
