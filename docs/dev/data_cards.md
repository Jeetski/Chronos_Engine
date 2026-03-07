# Data Cards System Architecture

## Overview
The Data Cards system is a generic collection management feature designed to handle arbitrary structured data. Unlike specific "Items" (e.g., Projects, Tasks) which have hardcoded schemas, Data Cards are defined by user-generated "Series" and "Rules".

## Core Components

### 1. Backend (`modules/data_card_manager.py`)
- **Series Management**: CRUD operations for Series (folders in `User/Data_Cards/`).
- **Rules Engine**: Parses `rules.yml` to determine the schema of a card (fields, types, options).
- **Card Serialization**: Reads/Writes individual cards as YAML files in `cards/` subdirectory.

### 2. API Layer (`utilities/dashboard/server.py`)
- `GET /api/datacards/series`: List all available series.
- `GET /api/datacards/series/<name>`: Get rules and metadata for a series.
- `GET /api/datacards/series/<name>/cards`: Get all cards in a series.
- `POST /api/datacards/series/<name>/cards`: Create or update a card.
- `POST /api/datacards/import`: Import generic items (e.g., from CSV or other sources) into a series.

### 3. Frontend (`utilities/dashboard/panels/data_cards/`)
- **Cockpit Panel**: Data Cards are implemented as a **Cockpit Panel**, allowing users to spawn multiple instances (e.g., one for "NPCs", one for "Locations") on the same canvas.
- **Deck Mode UI**:
  - **Sequential Navigation**: View one card at a time with "Next" and "Previous" controls, similar to a physical index card deck.
  - **Sorting**: Order cards by `order` field (if present), Name, or Import Date (Newest).
  - **Filtering**: Real-time search/filter bar to narrow down the deck.
  - **Series Selection**: Dropdown to switch the panel's active series.

## Storage Schema

### File Structure
```
User/Data_Cards/
  └── <Series_Name>/
      ├── rules.yml       # Schema definition
      └── cards/
          ├── card_1.yml  # Individual card data
          └── card_2.yml
```

### `rules.yml` Format
```yaml
schema:
  attributes:
    Strength: { type: "number", min: 0, max: 20 }
    Class: { type: "select", options: ["Warrior", "Mage"] }
  display:
    title_field: "name"
    image_field: "portrait"
```

## Extensibility
- **Dynamic Registries**: The system uses `utilities/registry_builder.py` to allow drop-in usage of new Wizards and Themes.
- **Visualization**: (Future) Potential for scatter plots or network graphs based on `rules.yml` data types.




