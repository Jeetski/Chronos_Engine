ARCHIVE_PATH = r"C:\Users\david\Desktop\Hivemind Studio\Chronos Engine\META\LEGACY_SCHEDULING\commands\this.py"


def run(args, properties):
    print(
        "Legacy preview scheduling has been archived.\n"
        f"Archived implementation: {ARCHIVE_PATH}\n"
        "A Kairos v2-native current-week preview path has not been implemented yet."
    )


def get_help_message():
    return (
        "Usage: this <weekday>\n"
        "Description: Legacy preview scheduling has been archived until a v2-native preview path exists."
    )
