# ChainSight — Enterprise Supply Chain Intelligence & Operations

ChainSight is an enterprise-grade B2B supply chain control tower designed for operational speed, high information density, and proactive disruption risk management. Built with Django REST Framework, MongoDB, React, Vite, Tailwind CSS, Recharts, and Google Gemini AI.

---

## Key Features

### 1. Operational "Calm & Dense" Design System
- **Typography**: IBM Plex Sans for crisp tabular scannability; IBM Plex Mono for SKUs, codes, tracking IDs, and timestamps.
- **Design Tokens**: Standardized 1px border lines, 4–6px border radius, high-contrast badges, zero AI gradients or decorative glassmorphism.
- **Light / Dark Mode**:
  - Full support for **Light**, **Dark**, and **System** preference.
  - Zero initial flash via pre-mount script in `index.html`.
  - CSS variables in `src/styles/tokens.css` with 120ms transitions.
  - Synchronized Recharts charts adapting tooltips, Cartesian grids, and axis labels dynamically to the active theme.

### 2. Guided Data Import System (`/import`)
Allows logistics managers and administrators to import their own business data instead of relying on demo fixtures:
- **Guided 6-Step Wizard**:
  1. **Select Entity**: Warehouses, Products, Inventory, Shipments, or Tracking Events.
  2. **Download Template**: Pre-formatted CSV or XLSX with headers and example records.
  3. **Upload File**: Drag-and-drop or file picker with client-side preview.
  4. **Map Columns**: Intelligent auto-detection matching headers via synonym tables, tokenization, and substring heuristics.
  5. **Review & Validate**: Pre-commit validation detecting schema violations, missing required keys, date errors, and referential integrity issues before touching the database.
  6. **Commit & Summary**: Execution with real-time feedback (created, updated, skipped, failed) and one-click error report CSV downloads.
- **Security & Limits**:
  - Max file size: **5 MB**.
  - Max rows: **10,000 rows**; max columns: **30 columns**.
  - Spreadsheet Formula Neutralization: Strips or prefixes dangerous formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) with single quotes to prevent CSV injection.
  - File signature verification: Magic byte checks for `.xlsx` and valid UTF-8 encoding checks for `.csv`.
- **Referential Integrity**:
  - **Inventory**: Requires existing SKU and warehouse code.
  - **Shipments**: One row per line item grouped by `shipment_id`. Validates destination warehouse code and SKU existence.
  - **Tracking Events**: Requires valid `shipment_id`.
- **Commit Modes & Snapshot Behavior**:
  - **Upsert**: Updates existing records matching natural key without duplicates.
  - **Add-Only**: Inserts new records; skips existing matching records.
  - **Inventory Snapshot**: Overwrites `quantity` to accurately represent point-in-time warehouse physical counts (non-additive).
- **Demo Data Isolation & Clean-Up**:
  - All demo fixtures are tagged with `is_demo: True`.
  - Custom imported records receive `is_demo: False`, `source: "import"`, and an `import_job_id`.
  - Administrators can check **"Remove demo data first"** to delete `is_demo: True` records while leaving user-imported records intact.

---

## Architecture & Technology Stack

| Layer | Technologies |
|---|---|
| **Backend** | Python 3.13, Django 6.1, Django REST Framework, PyJWT |
| **Database** | MongoDB (`chainsight` database via PyMongo & MongoMock for testing) |
| **Spreadsheet Engine** | Python stdlib `csv` for CSV, `openpyxl` for XLSX |
| **Frontend** | React 18, Vite, Tailwind CSS v4, Lucide Icons, Recharts |
| **AI Analyst** | Google Gemini API (Interactions API / Flash) for note NLP extraction & stockout risk forecasting |

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+ & npm
- MongoDB running locally on `localhost:27017` (or remote URI specified in `.env`)

### 1. Backend Setup
```bash
cd backend
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo --flush
python manage.py runserver 8000
```
Backend API will be running at `http://127.0.0.1:8000`.

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Frontend web application will be accessible at `http://127.0.0.1:5173`.

### 3. Default Demo Credentials
| Role | Email | Password |
|---|---|---|
| **Administrator** | `admin@demo.com` | `Demo@12345` |
| **Warehouse Manager** | `manager@demo.com` | `Demo@12345` |

---

## Sample Import Files

Ready-to-use sample CSVs are provided in `docs/sample_imports/`:
- [`warehouses.csv`](docs/sample_imports/warehouses.csv): Warehouse codes (`MUM-01`, `DEL-01`, etc.), names, cities, and states.
- [`products.csv`](docs/sample_imports/products.csv): SKUs, categories, unit prices, reorder thresholds, and average daily usage.
- [`inventory.csv`](docs/sample_imports/inventory.csv): Physical stock snapshot mapping SKUs to warehouse codes.
- [`shipments.csv`](docs/sample_imports/shipments.csv): Multi-line shipment consignments with carrier, origin, destination warehouse, ETAs, SKUs, and quantities.
- [`tracking_events.csv`](docs/sample_imports/tracking_events.csv): Milestones and transit event logs linked to shipment IDs.
- [`broken_import_sample.csv`](docs/sample_imports/broken_import_sample.csv): Test file containing intentional errors (invalid dates, non-existent warehouse code, negative quantity, invalid status, formula injection) to verify schema validation and error reporting.

---

## Running Automated Tests

Run backend tests using pytest:
```bash
cd backend
python -m pytest
```
All 21 unit & integration tests covering core stock adjustments, AI fallbacks, column auto-mapping, date parsing, referential integrity, upsert logic, snapshot quantity assignment, formula sanitization, and demo isolation will execute.
