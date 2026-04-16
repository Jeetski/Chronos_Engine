ARCHIVE_PATH = r"C:\Users\david\Desktop\Hivemind Studio\Chronos Engine\META\LEGACY_SCHEDULING\commands\tomorrow.py"


def run(args, properties):
    print(
        "Legacy preview scheduling has been archived.\n"
        f"Archived implementation: {ARCHIVE_PATH}\n"
        "A Kairos v2-native tomorrow preview has not been implemented yet."
    )


def get_help_message():
    return (
        "Usage: tomorrow\n"
        "Description: Legacy preview scheduling has been archived until a v2-native preview path exists."
    )
