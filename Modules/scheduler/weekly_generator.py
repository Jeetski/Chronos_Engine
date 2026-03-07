import os
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from Modules.commitment.main import get_commitment_status
from Modules.item_manager import list_all_items
from Modules.scheduler.kairos import KairosScheduler


class WeeklyGenerator:
    """
    Generates a rolling N-day Kairos skeleton and a lightweight commitment
    load-balancing recommendation across the horizon.
    """

    def __init__(self, user_context: Optional[Dict[str, Any]] = None):
        self.user_context = user_context or {}

    def generate_skeleton(self, days: int = 7, start_date: Optional[date] = None) -> Dict[str, Any]:
        horizon = max(1, int(days or 7))
        start = start_date or date.today()

        day_rows: List[Dict[str, Any]] = []
        per_day_blocks: Dict[str, List[Dict[str, Any]]] = {}
        for idx in range(horizon):
            d = start + timedelta(days=idx)
            ks = KairosScheduler(user_context=self.user_context)
            schedule = ks.generate_schedule(d) or {}
            stats = schedule.get("stats", {}) if isinstance(schedule, dict) else {}
            blocks = schedule.get("blocks", []) if isinstance(schedule, dict) else []
            if not isinstance(stats, dict):
                stats = {}
            if not isinstance(blocks, list):
                blocks = []
            day_rows.append(
                {
                    "date": d.isoformat(),
                    "weekday": d.strftime("%A"),
                    "valid": bool(stats.get("valid", True)),
                    "invalid_reason": stats.get("invalid_reason"),
                    "scheduled_items": int(stats.get("scheduled_items", len(blocks)) or 0),
                    "template": (ks.phase_notes.get("template", {}) if isinstance(ks.phase_notes, dict) else {}).get("template_path"),
                    "windows_found": (ks.phase_notes.get("template", {}) if isinstance(ks.phase_notes, dict) else {}).get("windows_found", 0),
                    "anchors": (ks.phase_notes.get("anchors", {}) if isinstance(ks.phase_notes, dict) else {}).get("placed", 0),
                    "top_blocks": [
                        {
                            "start_time": b.get("start_time"),
                            "end_time": b.get("end_time"),
                            "name": b.get("name"),
                            "type": b.get("type"),
                            "score": b.get("kairos_score"),
                        }
                        for b in blocks[:8]
                    ],
                }
            )
            per_day_blocks[d.isoformat()] = blocks

        commitment_plan = self._build_commitment_plan(start, horizon, per_day_blocks)
        return {
            "start_date": start.isoformat(),
            "days": horizon,
            "skeleton": day_rows,
            "commitment_plan": commitment_plan,
            "generated_at": date.today().isoformat(),
        }

    def _build_commitment_plan(self, start: date, horizon: int, day_blocks: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        plans: List[Dict[str, Any]] = []
        try:
            commitments = list_all_items("commitment")
        except Exception:
            commitments = []
        if not isinstance(commitments, list):
            commitments = []

        day_keys = [(start + timedelta(days=i)).isoformat() for i in range(horizon)]
        seen_commitments = set()
        for c in commitments:
            if not isinstance(c, dict):
                continue
            if str(c.get("status") or "active").strip().lower() not in ("", "active", "pending"):
                continue
            status = get_commitment_status(c, today=start)
            if not isinstance(status, dict):
                continue
            if str(status.get("kind") or "").lower() != "frequency":
                continue
            period = str(status.get("period") or "week").lower()
            if period not in ("week", "day"):
                continue
            try:
                times = int(status.get("required_total") or status.get("times") or 0)
            except Exception:
                times = 0
            try:
                progress = int(status.get("progress") or 0)
            except Exception:
                progress = 0
            try:
                remaining = int(status.get("remaining"))
            except Exception:
                remaining = max(0, times - progress)
            if remaining <= 0:
                continue

            targets = status.get("targets") if isinstance(status.get("targets"), list) else []
            target_names = {str(t.get("name") or "").strip().lower() for t in targets if isinstance(t, dict)}
            target_names = {n for n in target_names if n}
            dedupe_key = (
                str(c.get("name") or "").strip().lower(),
                str(status.get("kind") or "").strip().lower(),
                int(times),
                str(period),
                tuple(sorted(target_names)),
            )
            if dedupe_key in seen_commitments:
                continue
            seen_commitments.add(dedupe_key)

            ranked_days: List[tuple] = []
            for dk in day_keys:
                blocks = day_blocks.get(dk, []) if isinstance(day_blocks.get(dk, []), list) else []
                target_present = 0
                anchor_count = 0
                scheduled_count = len(blocks)
                for b in blocks:
                    bname = str(b.get("name") or "").strip().lower()
                    if bname in target_names:
                        target_present += 1
                    if str(b.get("window_name") or "").upper() == "ANCHOR":
                        anchor_count += 1
                score = (target_present * -3) + (anchor_count * 0.25) + (scheduled_count * 0.05)
                ranked_days.append((score, dk))

            ranked_days.sort(key=lambda x: (x[0], x[1]))
            picks = [dk for _, dk in ranked_days[:remaining]]
            plans.append(
                {
                    "commitment": c.get("name"),
                    "rule": {"kind": "frequency", "times": times, "period": period},
                    "progress": progress,
                    "remaining": remaining,
                    "targets": sorted(list(target_names)),
                    "recommended_days": picks,
                }
            )
        plans.sort(key=lambda x: (str(x.get("commitment") or "").lower()))
        return plans


def save_weekly_skeleton(path: str, payload: Dict[str, Any]) -> None:
    import yaml

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        yaml.safe_dump(payload, fh, default_flow_style=False, sort_keys=False, allow_unicode=True)
