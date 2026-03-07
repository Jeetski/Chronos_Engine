def run_completion_effects(
    item_type: str,
    item_name: str,
    *,
    minutes: int | None = None,
    count_as_completion: bool = True,
    run_milestones: bool = True,
) -> None:
    """
    Shared side effects for completion-style flows.

    - Evaluates commitments (can trigger scripts/rewards/achievements)
    - Optionally evaluates milestones
    - Awards points only when this event counts as a completion
    """
    try:
        from modules.commitment import main as CommitmentModule  # type: ignore
        CommitmentModule.evaluate_and_trigger()
    except Exception as e:
        print(f"Warning: Could not evaluate commitments: {e}")

    if run_milestones:
        try:
            from modules.milestone import main as MilestoneModule  # type: ignore
            MilestoneModule.evaluate_and_update_milestones()
        except Exception:
            pass

    if not count_as_completion:
        return

    try:
        from Utilities import points as Points
        pts = Points.award_on_complete(
            item_type,
            item_name,
            minutes=minutes if isinstance(minutes, int) else None,
        )
        if isinstance(pts, int) and pts > 0:
            print(f"+{pts} points awarded.")
    except Exception:
        pass
