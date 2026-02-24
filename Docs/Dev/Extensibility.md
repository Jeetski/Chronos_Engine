# Extensibility Guide

Chronos Dashboard is designed to be **fully extensible** through a plug-and-play architecture. All components (Wizards, Themes, Views, Widgets, Panels, and Popups) are automatically discovered by scanning the filesystem - no configuration files or code editing required.

## Auto-Discovery System

The extensibility system is powered by `Utilities/registry_builder.py`, which scans dashboard directories on server startup and builds dynamic registries. The frontend fetches these registries via API and dynamically builds menus and loaders.

**How it works:**
1. Server scans component directories (e.g., `Widgets/`, `Views/`)
2. Registry builder creates JSON with metadata for each component
3. Frontend fetches registries via `/api/registry?name=<type>`
4. Menus and loaders are built dynamically from registry data

**Result:** Drop a folder with an `index.js` file → Component appears in the dashboard menu automatically.

---

## Component Types

### 1. Wizards

Interactive flows that guide users through step-by-step processes (e.g., goal creation, onboarding).

**Location:** `Utilities/Dashboard/Wizards/<Name>/`

**Required Files:**
- `index.js` - Main wizard module with step definitions

**Optional Files:**
- `wizard.yml` - Metadata to override defaults

**Example Structure:**
```
Wizards/
  └── MyWizard/
      ├── index.js       # Required: Wizard implementation
      ├── wizard.yml     # Optional: Metadata
      └── style.css      # Optional: Custom styling
```

**Metadata Schema (`wizard.yml`):**
```yaml
id: "my_wizard"                    # Override auto-generated ID
label: "My Custom Wizard"          # Override auto-generated label
description: "Does something cool" # Optional description
postRelease: true                  # Shows "later" badge (optional)
enabled: true                      # Enable/disable (default: true)
```

**How Labels Work:**
- No `wizard.yml`: Label auto-generated from folder name
  - `NewYearResolutions` → **New Year Resolutions**
  - `SelfAuthoring` → **Self Authoring**
- With `wizard.yml`: Uses `label` field from YAML

**API Access:**
```bash
GET /api/registry?name=wizards
```

---

### 2. Themes

CSS files that define the visual appearance of the dashboard.

**Location:** `Utilities/Dashboard/Themes/<name>.css`

**How it Works:**
- Registry builder scans for `.css` files in the Themes directory
- Parses CSS to extract metadata (theme name, accent color, description)
- `theme-base.css` is filtered out (it's the internal foundation stylesheet)

**Theme File Format:**
```css
/* 
 * Theme: Midnight Blue
 * Accent: #3b82f6
 * Description: A deep blue theme for late nights.
 */

:root {
    --chronos-bg: #0f172a;
    --chronos-text: #f8fafc;
    --chronos-accent: #3b82f6;
    --chronos-surface: rgba(15, 23, 42, 0.8);
    /* ... other CSS variables ... */
}
```

**Shipped Themes:**
- `chronos-blue.css` (default)
- `chronos-amber.css`
- `chronos-emerald.css`
- `chronos-rose.css`

**API Access:**
```bash
GET /api/registry?name=themes
```

---

### 3. Views

Full-screen layouts that provide different perspectives on your data (e.g., Calendar, Cockpit, Editor).

**Location:** `Utilities/Dashboard/Views/<Name>/`

**Required Files:**
- `index.js` - Must export `mount(container, context)` function

**Optional Files:**
- `view.yml` - Metadata to override defaults
- `*.css` - View-specific styles
- `*.js` - Additional modules

**Example Structure:**
```
Views/
  └── MyView/
      ├── index.js       # Required: mount() export
      ├── view.yml       # Optional: Metadata
      └── styles.css     # Optional: Styling
```

**index.js Template:**
```javascript
export async function mount(container, context) {
  container.innerHTML = `
    <div class="my-view">
      <h1>My Custom View</h1>
      <p>Content here...</p>
    </div>
  `;
  
  // Optional: Add event listeners, fetch data, etc.
}
```

**Metadata Schema (`view.yml`):**
```yaml
label: "My Custom View"   # Override folder-based label
postRelease: true          # Shows "later" badge
enabled: true              # Enable/disable
```

**API Access:**
```bash
GET /api/registry?name=views
```

---

### 4. Widgets

Modular UI components that can be toggled on/off in the dashboard (e.g., Today, Timer, Notes).

**Location:** `Utilities/Dashboard/Widgets/<Name>/`

**Required Files:**
- `index.js` - Must export `mount(element, context)` function

**Optional Files:**
- `widget.yml` - Metadata
- `*.css` - Widget styles

**Example Structure:**
```
Widgets/
  └── MyWidget/
      ├── index.js       # Required: mount() export
      ├── widget.yml     # Optional: Metadata
      └── styles.css     # Optional: Styling
```

**index.js Template:**
```javascript
export function mount(el, context) {
  el.innerHTML = `
    <div class="widget-glass">
      <h2>My Widget</h2>
      <p>Widget content...</p>
    </div>
  `;
  
  // Use context for API access, state management
  const { apiBase } = context;
}
```

**Metadata Schema (`widget.yml`):**
```yaml
label: "My Custom Widget"
postRelease: true           # Shows "later" badge
enabled: true
```

**API Access:**
```bash
GET /api/registry?name=widgets
```

---

### 5. Panels

Drag-and-drop components for the Cockpit view (e.g., Schedule, Matrix, Status Strip).

**Location:** `Utilities/Dashboard/Panels/<Name>/`

**Required Files:**
- `index.js` - Must export `register(manager)` function

**Optional Files:**
- `panel.yml` - Metadata
- `*.css` - Panel styles

**Example Structure:**
```
Panels/
  └── MyPanel/
      ├── index.js       # Required: register() export
      ├── panel.yml      # Optional: Metadata
      └── styles.css     # Optional: Styling
```

**index.js Template:**
```javascript
export function register(manager) {
  manager.registerPanel({
    id: 'my-panel',
    label: 'My Panel',
    mount: (container, context) => {
      container.innerHTML = '<div>Panel content</div>';
    }
  });
}
```

**Metadata Schema (`panel.yml`):**
```yaml
label: "My Custom Panel"
postRelease: true
enabled: true
```

**API Access:**
```bash
GET /api/registry?name=panels
```

---

### 6. Popups

Notification overlays that appear automatically on dashboard load (e.g., Welcome, StatusNudge).

**Location:** `Utilities/Dashboard/Popups/<Name>/`

**Required Files:**
- `index.js` - Must export `mount(element)` function

**Optional Files:**
- `popup.yml` - Metadata
- `*.css` - Popup styles

**Example Structure:**
```
Popups/
  └── MyPopup/
      ├── index.js       # Required: mount() export
      ├── popup.yml      # Optional: Metadata
      └── styles.css     # Optional: Styling
```

**index.js Template:**
```javascript
export function mount(el) {
  el.innerHTML = `
    <div class="chronos-overlay">
      <div class="chronos-shell">
        <h2>Notification</h2>
        <p>Important message...</p>
        <button onclick="this.closest('.chronos-overlay').remove()">Close</button>
      </div>
    </div>
  `;
}
```

**Metadata Schema (`popup.yml`):**
```yaml
label: "My Popup"
postRelease: true
enabled: true
```

**API Access:**
```bash
GET /api/registry?name=popups
```

---

## Quick Start: Adding a Component

### Example: Adding a Simple Widget

```bash
# 1. Create widget folder
mkdir "Utilities/Dashboard/Widgets/HelloWorld"

# 2. Create index.js
cat > "Utilities/Dashboard/Widgets/HelloWorld/index.js" <<EOF
export function mount(el, context) {
  el.innerHTML = \`
    <div class="widget-glass">
      <h2>Hello World!</h2>
      <p>My first custom widget</p>
      <button onclick="alert('Clicked!')">Click Me</button>
    </div>
  \`;
}
EOF

# 3. (Optional) Add metadata
cat > "Utilities/Dashboard/Widgets/HelloWorld/widget.yml" <<EOF
label: "My Hello World Widget"
EOF

# 4. Refresh dashboard → Widget appears in menu automatically!
```

**That's it!** No code editing, no configuration files to update.

---

## Common Metadata Properties

All component types support these optional metadata fields:

| Field | Type | Description |
|-------|------|-------------|
| `label` | string | Custom display name (overrides auto-generated) |
| `postRelease` | boolean | Shows "later" badge (marks as post-release feature) |
| `enabled` | boolean | Enable/disable without deleting folder (default: true) |

**Label Auto-Generation:**
- Folder names are converted from PascalCase to Spaced Names
- `ProjectManager` → **Project Manager**
- `NewYearResolutions` → **New Year Resolutions**
- `MP3Player` → **MP3 Player**

---

## API Endpoints

All registries are accessible via the `/api/registry` endpoint:

```bash
# Available registry types
GET /api/registry?name=wizards
GET /api/registry?name=themes
GET /api/registry?name=views
GET /api/registry?name=widgets
GET /api/registry?name=panels
GET /api/registry?name=popups

# Legacy registries (also available)
GET /api/registry?name=commands    # CLI command syntax
GET /api/registry?name=items       # Item types and names
GET /api/registry?name=properties  # Property definitions
```

**Response Format:**
```json
{
  "ok": true,
  "registry": {
    "generated_at": "2026-01-28T00:00:00Z",
    "widgets": [
      {
        "name": "HelloWorld",
        "label": "Hello World",
        "enabled": true
      }
    ]
  }
}
```

---

## Best Practices

### 1. Use Semantic Folder Names
✅ Good: `ProjectManager`, `GoalTracker`, `WeeklyReview`  
❌ Bad: `widget1`, `temp`, `test`

### 2. Follow Component Patterns
- **Widgets/Views**: Use `widget-glass` class for glassmorphic styling
- **Panels**: Register via `manager.registerPanel()`
- **Popups**: Use `chronos-overlay` and `chronos-shell` classes

### 3. Leverage Context
```javascript
export function mount(el, context) {
  const { apiBase, state } = context;
  
  // Make API calls
  fetch(apiBase() + '/api/items')
    .then(r => r.json())
    .then(data => updateUI(data));
}
```

### 4. Test Incrementally
1. Create basic component with static content
2. Refresh dashboard to verify auto-discovery
3. Add dynamic features and API calls
4. Add optional metadata as needed

---

## Troubleshooting

### Component Doesn't Appear
- ✅ Check folder is in correct location (`Widgets/`, `Views/`, etc.)
- ✅ Verify `index.js` exists with correct export function
- ✅ Check for JavaScript errors in browser console
- ✅ Refresh dashboard (hard refresh: Ctrl+Shift+R)
- ✅ Restart server if `registry_builder.py` was modified

### Wrong Label Showing
- Create `widget.yml` (or appropriate metadata file) with custom `label` field
- Refresh dashboard

### Component Shows "later" Badge
- Check metadata file for `postRelease: true`
- Remove or set to `false` to remove badge

---

## Advanced: Registry Builder Internals

For developers wanting to understand the system:

**File:** `Utilities/registry_builder.py`

**Key Functions:**
- `build_widgets_registry()` - Scans `Dashboard/Widgets/`
- `build_views_registry()` - Scans `Dashboard/Views/`
- `build_panels_registry()` - Scans `Dashboard/Panels/`
- `build_popups_registry()` - Scans `Dashboard/Popups/`
- `build_wizards_registry()` - Scans `Dashboard/Wizards/`
- `build_themes_registry()` - Scans `Dashboard/Themes/`

Each builder:
1. Uses `os.scandir()` to find directories/files
2. Auto-generates metadata from folder/file names
3. Optionally merges in custom metadata from `.yml` files
4. Returns sorted registry data

**Server Integration:** `Utilities/Dashboard/server.py` dynamically routes `/api/registry?name=<type>` to the appropriate builder function.
