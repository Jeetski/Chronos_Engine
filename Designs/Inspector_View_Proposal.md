# Design Proposal: Calendar Inspector Split View

## 🎯 Objective
Upgrade the Dashboard Calendar from a simple full-screen view to a **sophisticated split-view interface**. This introduces an "Inspector" panel that provides rich, contextual details without losing the high-level context of the timeline or grid.

## 📐 Layout Architecture
We will adopt a **Master-Detail** layout (Split View).

```text
+-----------------------------------+-----------------------+
|  Main View (Canvas/DOM)           |  Inspector Panel      |
|                                   |                       |
|  [ Year / Month / Week Grids ]    |  [ Context Header ]   |
|              OR                   |                       |
|  [ Daily Timeline ]               |  [ Dynamic Content ]  |
|                                   |                       |
|                                   |  - Details            |
|                                   |  - Stats              |
|                                   |  - Quick Actions      |
|                                   |                       |
+-----------------------------------+-----------------------+
|  <--  65-75% width  -->           |  <--  25-35%  -->     |
```

### 1. Main View (The "Stage")
*   **Role**: Navigation and temporal context.
*   **Visuals**: The existing Canvas grids (Year/Month/Week) and Day timeline.
*   **Upgrade**: Instead of occupying 100% width, it adapts to the available space left of the inspector.

### 2. Inspector Panel (The "Brain")
*   **Role**: Precision editing and detailed analysis.
*   **Behavior**:
    *   **Sticky**: Stays fixed on the right.
    *   **Context-Aware**: Content changes instantly based on selection.
    *   **Glassmorphism**: A semi-transparent, blurred background to feel distinct from the main stage.

---

## 🖱️ Interaction Model

| Selection Scope | Inspector Content Strategy |
| :--- | :--- |
| **Year** | **Resolution Dashboard**: <br>• **Active Resolutions**: Top 3 tracked items with `resolution` property (Progress bars) <br>• **Year Compass**: "Busiest Month" heatmap stat <br>• **Goals**: List of high-priority Goals linked to this year |
| **Month** | **Tactical Overview**: <br>• "Focus of the Month" (Theme) <br>• **Project Deadlines** falling in this month <br>• **Habit Adherence** graph for this month <br>• Quick Summary: "42 Tasks Completed, 12 Pending" |
| **Week** | **Rhythm & Balance**: <br>• Work/Life Balance visualization <br>• "Weekly Review" checklist status <br>• Upcoming Events list |
| **Day** | **Ops Center**: <br>• **Injection Deck**: <br> &nbsp;&nbsp;- *Templates*: Standard routines (Morning/Evening) <br> &nbsp;&nbsp;- *Microroutines*: Quick blocks (Meditate, Stretch) <br> &nbsp;&nbsp;- *Items*: Quick-add single Tasks, Reminders, or Events <br>• **Broad Controls**: `Shift Day (+/- 15m)`, `Reschedule Pending`, `Compact Gaps`, `Clear Afternoon` <br>• **Granular Controls**: `Split Task`, `Delay This 10m`, `Merge Down`, `Lock Time` |
| **Item** | **Atomic Properties**: <br>• **Edit**: Direct inline edit of Title/Time <br>• **Metadata**: Tags, Priority, Energy cost <br>• **Links**: Related Project or Goal <br>• **Raw YAML**: View/Edit underlying data |

---

## 🎨 Visual Aesthetics
To match the "Premium" feel:

1.  **Motion**: The Inspector should slide in from the right or fade in with a microscopic blur transition.
2.  **Typography**:
    *   **Headers**: `Orbitron` or bold `Inter` for technical feel.
    *   **Data**: Monospace (`JetBrains Mono`) for times and IDs.
3.  **Color Palette**:
    *   **Panel**: Deep dark grey/blue (`#0f141d`) with `backdrop-filter: blur(10px)`.
    *   **Borders**: Subtle gradients (`rgba(255,255,255,0.1)`).

## 🛠️ Implementation Strategy
1.  **Refactor `Calendar/index.js`**:
    *   Wrap existing canvas/DOM in a `.calendar-stage` container.
    *   Add a sibling `.calendar-inspector` container.
2.  **State Management**:
    *   Add `selectedObject` state (separate from `viewMode`).
    *   When `selectedObject` changes, re-render the Inspector DOM.
3.  **CSS**:
    *   Use CSS Grid for the parent layout.
    *   Ensure the Canvas resizes correctly (listen to ResizeObserver on the stage, not just window).

## 🗣️ Open Questions
1.  **Width**: Should the Inspector be resizable by the user? (Start fixed 350px for simplicity?)
2.  **Editing**: Should we allow *direct* text editing in the Inspector (e.g. changing a task name), or just "View Only + Open in Editor"?
