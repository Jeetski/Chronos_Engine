# Wizards

Wizards follow the exact same structure as widgets: each wizard lives in its own folder and exposes an ES module entry point named `index.js`. The module **must** export an async `launch(context, options)` function that is invoked when the user selects the wizard from the dashboard dropdown. Use this folder to organize multi-step experiences (onboarding flows, guided planners, etc.) without cluttering the widget directory.

```
Utilities/
  Dashboard/
    Wizards/
      MyWizard/
        index.js
        template.html   (optional)
        styles.css      (optional)
        ...
```

Each wizard module receives the shared dashboard `context` (currently only exposing the event bus) plus the metadata from the catalog entry. Wizards may render their own overlays, reuse widgets, or emit events back into the system.
