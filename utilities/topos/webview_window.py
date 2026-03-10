import os
import sys


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


def main():
    try:
        import webview
    except Exception as exc:
        print(f"pywebview import failed: {exc}", file=sys.stderr)
        return 1

    url = "https://www.google.com"
    title = "Topos Webview"
    if len(sys.argv) > 1 and str(sys.argv[1]).strip():
        url = str(sys.argv[1]).strip()
    if len(sys.argv) > 2 and str(sys.argv[2]).strip():
        title = str(sys.argv[2]).strip()

    window = webview.create_window(
        title,
        url=url,
        width=1180,
        height=760,
        resizable=True,
        text_select=True,
    )
    webview.start()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())