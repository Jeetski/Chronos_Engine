ARCHIVE_PATH = r"C:\Users\david\Desktop\Hivemind Studio\Chronos Engine\META\LEGACY_SCHEDULING\modules\scheduler\kairos.py"


class KairosScheduler:
    def __init__(self, *args, **kwargs):
        raise RuntimeError(
            f"Legacy Kairos scheduling has been archived to {ARCHIVE_PATH}. "
            "Use KairosV2Scheduler instead."
        )
