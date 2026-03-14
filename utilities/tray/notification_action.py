import json
import sys
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT_DIR = Path(__file__).resolve().parents[2]
ACTION_DIR = ROOT_DIR / "user" / "temp" / "notification_actions" / "inbox"


def parse_notification_uri(raw):
    uri = str(raw or "").strip()
    if not uri:
        return {}
    parsed = urlparse(uri)
    query = parse_qs(parsed.query or "", keep_blank_values=False)
    action = str((query.get("action") or [""])[0]).strip().lower()
    payload = {}
    for key, values in query.items():
        if key == "action" or not values:
            continue
        payload[str(key)] = str(values[0])
    return {
        "action": action,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "source": "toast",
        "payload": payload,
    }


def main():
    payload = parse_notification_uri(sys.argv[1] if len(sys.argv) > 1 else "")
    if not payload.get("action"):
        return
    ACTION_DIR.mkdir(parents=True, exist_ok=True)
    path = ACTION_DIR / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex}.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
