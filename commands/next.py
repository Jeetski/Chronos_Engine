ARCHIVE_PATH = r"C:\Users\david\Desktop\Hivemind Studio\Chronos Engine\META\LEGACY_SCHEDULING\commands\next.py"

WEEKDAYS = {}


def run(args, properties):
    print(
        "Legacy preview scheduling has been archived.\n"
        f"Archived implementation: {ARCHIVE_PATH}\n"
        "A Kairos v2-native future preview path has not been implemented yet."
    )


def get_help_message():
    return (
        "Usage: next <date expression>\n"
        "Description: Legacy preview scheduling has been archived until a v2-native preview path exists."
    )
