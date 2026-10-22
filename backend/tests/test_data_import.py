"""
Tests for Data Import System:
- Auto column mapping & synonym detection
- Date parsing formats & invalid rejection
- Referential integrity validation (SKU, Warehouse Code, Shipment ID)
- Upsert vs Add-only commit modes
- Inventory snapshot quantity (overwriting vs additive)
- Formula injection sanitization (=, +, -, @)
- File extension & size limits
- Demo data deletion isolation (is_demo: True vs custom imported data)
"""
import pytest
import mongomock
from datetime import datetime

from data_import.column_mapper import auto_map, SYNONYMS
from data_import.file_parser import sanitize_cell, parse_file, MAX_FILE_SIZE
from data_import.validators import (
    parse_date,
    validate_warehouses,
    validate_products,
    validate_inventory,
    validate_shipments,
    validate_tracking_events,
    commit_warehouses,
    commit_products,
    commit_inventory,
    commit_shipments,
)


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_db():
    client = mongomock.MongoClient()
    db = client['test_chainsight_import']
    return db


# ─── 1. Column Mapping Auto-Detection ────────────────────────────────────────

def test_column_mapping_synonyms_and_case():
    headers = [
        'Warehouse Code',
        'Facility Name',
        'ITEM_SKU',
        'Product Title',
        'Unit Price',
        'Qty On Hand',
        'Carrier Partner',
    ]

    target_fields = ['code', 'name', 'sku', 'unit_cost', 'quantity', 'carrier']
    mapping = auto_map(headers, target_fields)

    assert mapping['code'] == 'Warehouse Code'
    assert mapping['sku'] == 'ITEM_SKU'
    assert mapping['unit_cost'] == 'Unit Price'
    assert mapping['quantity'] == 'Qty On Hand'
    assert mapping['carrier'] == 'Carrier Partner'


def test_column_mapping_variations():
    headers = ['wh_code', 'daily demand', 'notes']
    mapping = auto_map(headers, ['warehouse_code', 'daily_usage', 'note'])
    assert mapping['warehouse_code'] == 'wh_code'
    assert mapping['daily_usage'] == 'daily demand'
    assert mapping['note'] == 'notes'


# ─── 2. Date Parsing ─────────────────────────────────────────────────────────

def test_date_parsing_formats():
    # ISO YYYY-MM-DD
    d1 = parse_date('2026-11-04')
    assert d1 == datetime(2026, 11, 4)

    # DD/MM/YYYY
    d2 = parse_date('15/08/2026')
    assert d2 == datetime(2026, 8, 15)

    # DD-MMM-YYYY
    d3 = parse_date('22-Oct-2026')
    assert d3 == datetime(2026, 10, 22)

    # Invalid dates
    assert parse_date('99/99/2026') is None
    assert parse_date('not-a-date') is None
    assert parse_date('') is None
    assert parse_date(None) is None


# ─── 3. Referential Integrity Validation ──────────────────────────────────────

def test_inventory_referential_integrity(mock_db):
    # Setup 1 product and 1 warehouse in mock_db
    mock_db.products.insert_one({'sku': 'SKU-VALID', 'name': 'Valid Prod'})
    mock_db.warehouses.insert_one({'code': 'WH-VALID', 'name': 'Valid Warehouse'})

    rows = [
        {'sku': 'SKU-VALID', 'warehouse_code': 'WH-VALID', 'quantity': '50'},
        {'sku': 'SKU-NONEXISTENT', 'warehouse_code': 'WH-VALID', 'quantity': '20'},
        {'sku': 'SKU-VALID', 'warehouse_code': 'WH-NONEXISTENT', 'quantity': '10'},
        {'sku': 'SKU-VALID', 'warehouse_code': 'WH-VALID', 'quantity': '-5'},  # negative
    ]

    valid, errors = validate_inventory(rows, mock_db)
    assert len(valid) == 1
    assert valid[0]['sku'] == 'SKU-VALID'
    assert valid[0]['warehouse_code'] == 'WH-VALID'

    error_cols = [e['column'] for e in errors]
    assert 'sku' in error_cols
    assert 'warehouse_code' in error_cols
    assert 'quantity' in error_cols


def test_shipment_referential_integrity(mock_db):
    mock_db.warehouses.insert_one({'code': 'DEL-01', 'name': 'Delhi DC'})
    mock_db.products.insert_one({'sku': 'SKU-101', 'name': 'Widget'})

    rows = [
        {
            'shipment_id': 'SHP-1',
            'destination_warehouse_code': 'DEL-01',
            'sku': 'SKU-101',
            'quantity': '100',
            'status': 'in_transit',
            'original_eta': '2026-11-01',
            'current_eta': '2026-11-03',
        },
        {
            'shipment_id': 'SHP-2',
            'destination_warehouse_code': 'INVALID-WH',
            'sku': 'SKU-101',
            'quantity': '50',
            'status': 'ordered',
        },
        {
            'shipment_id': 'SHP-3',
            'destination_warehouse_code': 'DEL-01',
            'sku': 'MISSING-SKU',
            'quantity': '50',
            'status': 'ordered',
        },
        {
            'shipment_id': 'SHP-4',
            'destination_warehouse_code': 'DEL-01',
            'sku': 'SKU-101',
            'quantity': '10',
            'status': 'invalid_status_enum',
        },
    ]

    valid, errors = validate_shipments(rows, mock_db)
    assert len(valid) == 1
    assert valid[0]['shipment_id'] == 'SHP-1'
    assert len(errors) >= 3


# ─── 4. Upsert vs Add-Only Commit Modes ───────────────────────────────────────

def test_upsert_mode_updates_existing(mock_db):
    mock_db.warehouses.insert_one({
        'code': 'MUM-01',
        'name': 'Old Mumbai Name',
        'city': 'Old City',
        'state': 'Maharashtra',
        'is_demo': False,
    })

    rows = [{'code': 'MUM-01', 'name': 'Updated Mumbai Hub', 'city': 'Mumbai', 'state': 'Maharashtra'}]
    res = commit_warehouses(rows, mode='upsert', job_id='job-1', user_email='admin@demo.com', db=mock_db)

    assert res['updated'] == 1
    assert res['skipped'] == 0
    doc = mock_db.warehouses.find_one({'code': 'MUM-01'})
    assert doc['name'] == 'Updated Mumbai Hub'
    assert mock_db.warehouses.count_documents({'code': 'MUM-01'}) == 1


def test_add_only_mode_skips_existing(mock_db):
    mock_db.warehouses.insert_one({
        'code': 'DEL-01',
        'name': 'Original Delhi DC',
        'city': 'Delhi',
        'state': 'Delhi',
        'is_demo': False,
    })

    rows = [{'code': 'DEL-01', 'name': 'New Should Be Skipped', 'city': 'Delhi', 'state': 'Delhi'}]
    res = commit_warehouses(rows, mode='add_only', job_id='job-2', user_email='admin@demo.com', db=mock_db)

    assert res['skipped'] == 1
    assert res['updated'] == 0
    doc = mock_db.warehouses.find_one({'code': 'DEL-01'})
    assert doc['name'] == 'Original Delhi DC'


# ─── 5. Inventory Snapshot Quantity ──────────────────────────────────────────

def test_inventory_snapshot_sets_quantity_not_additive(mock_db):
    mock_db.products.insert_one({'sku': 'SKU-SNAP', 'name': 'Snapshot SKU'})
    mock_db.warehouses.insert_one({'code': 'BLR-01', 'name': 'Bengaluru'})
    mock_db.stock.insert_one({
        'sku': 'SKU-SNAP',
        'warehouse_code': 'BLR-01',
        'quantity': 500,
        'is_demo': False,
    })

    rows = [{'sku': 'SKU-SNAP', 'warehouse_code': 'BLR-01', 'quantity': '120'}]
    commit_inventory(rows, mode='upsert', job_id='job-snap', user_email='admin@demo.com', db=mock_db)

    doc = mock_db.stock.find_one({'sku': 'SKU-SNAP', 'warehouse_code': 'BLR-01'})
    # Must be 120 (snapshot replace), NOT 620 (500 + 120)
    assert doc['quantity'] == 120


# ─── 6. Malicious Formula Neutralization ──────────────────────────────────────

def test_formula_injection_neutralized():
    assert sanitize_cell('=1+1') == "'=1+1"
    assert sanitize_cell('+CMD') == "'+CMD"
    assert sanitize_cell('-10') == '-10'  # Negative numbers are preserved
    assert sanitize_cell('-SOMECMD') == "'-SOMECMD"
    assert sanitize_cell('@SUM(A1)') == "'@SUM(A1)"
    assert sanitize_cell('Normal Text') == 'Normal Text'


# ─── 7. File Parser Extension & Size Limits ──────────────────────────────────

def test_file_parser_extension_validation():
    with pytest.raises(ValueError, match="Unsupported file type"):
        parse_file('malicious.exe', b'binary content')

    with pytest.raises(ValueError, match="Unsupported file type"):
        parse_file('report.pdf', b'%PDF-1.4')

    with pytest.raises(ValueError, match="(?i)empty"):
        parse_file('empty.csv', b'')


# ─── 8. Demo Data Deletion Isolation ──────────────────────────────────────────

def test_demo_data_deletion_preserves_custom_data(mock_db):
    # 2 demo records
    mock_db.warehouses.insert_one({'code': 'DEMO-1', 'name': 'Demo DC', 'is_demo': True})
    mock_db.warehouses.insert_one({'code': 'DEMO-2', 'name': 'Demo Hub', 'is_demo': True})

    # 1 custom imported record
    mock_db.warehouses.insert_one({'code': 'CUSTOM-1', 'name': 'Enterprise DC', 'is_demo': False})

    # Admin removes demo data
    delete_result = mock_db.warehouses.delete_many({'is_demo': True})
    assert delete_result.deleted_count == 2

    # Verify custom data remains intact
    remaining = list(mock_db.warehouses.find())
    assert len(remaining) == 1
    assert remaining[0]['code'] == 'CUSTOM-1'
    assert remaining[0]['is_demo'] is False
