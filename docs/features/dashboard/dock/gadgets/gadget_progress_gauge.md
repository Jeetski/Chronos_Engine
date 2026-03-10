# Progress Gauge Gadget

## Overview
Single-gauge dock gadget for glanceable progress against a countdown, numeric target, or item-backed numeric property.

## Dashboard
- Runtime source: `utilities/dashboard/gadgets/progress_gauge/`
- Registry metadata: `utilities/dashboard/gadgets/progress_gauge/gadget.yml`
- API endpoints used by this gadget:
  - `/api/item?type=&name=`

## Data and Settings
- Gadget-specific configuration persists in browser local storage.
- Numeric gauges can be fully local; item-backed gauges read canonical item state through dashboard APIs.

## Operational Workflows
1. Enable the gadget from the topbar `Gadgets` menu.
2. Click the gadget to open its editor.
3. Configure a countdown, numeric, or item-backed gauge.
4. Refresh and verify the compact ring matches the configured state.

## Validation
1. Enable `Progress Gauge` in the dock.
2. Configure a countdown gauge.
3. Confirm the gadget persists across reload and refreshes without console errors.

## Related Docs
- `docs/guides/gadgets_and_dock.md`
- `docs/reference/dashboard_api.md`
