"""
Validation and commit logic for each importable entity.
"""
from datetime import datetime, date
import re
from typing import Optional


VALID_SHIPMENT_STATUSES = {'ordered', 'in_transit', 'delayed', 'delivered'}


# ─── Date Parsing ────────────────────────────────────────────────────────────

_MONTH_ABBR = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
}


def parse_date(value: str) -> Optional[datetime]:
    """
    Parse date in ISO (YYYY-MM-DD), DD/MM/YYYY, or DD-MMM-YYYY.
    Returns datetime at midnight UTC or None on failure.
    """
    if not value or not value.strip():
        return None
    v = value.strip()
    # ISO: 2026-04-15 or 2026-04-15T... 
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', v)
    if m:
        try:
            return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass
    # DD/MM/YYYY
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', v)
    if m:
        try:
            return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            pass
    # DD-MMM-YYYY
    m = re.match(r'^(\d{1,2})-([A-Za-z]{3})-(\d{4})$', v)
    if m:
        month = _MONTH_ABBR.get(m.group(2).lower())
        if month:
            try:
                return datetime(int(m.group(3)), month, int(m.group(1)))
            except ValueError:
                pass
    return None


# ─── Validators ──────────────────────────────────────────────────────────────

def validate_warehouses(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """Validate warehouse rows. Returns (valid_rows, error_rows)."""
    valid, errors = [], []
    seen_codes = set()
    for i, row in enumerate(rows, start=2):
        errs = []
        code = (row.get('code') or '').strip()
        name = (row.get('name') or '').strip()
        if not code:
            errs.append({'row': i, 'column': 'code', 'message': 'code is required', 'value': code})
        elif code in seen_codes:
            errs.append({'row': i, 'column': 'code', 'message': f"Duplicate code '{code}' in this file", 'value': code})
        if not name:
            errs.append({'row': i, 'column': 'name', 'message': 'name is required', 'value': name})
        if errs:
            errors.extend(errs)
        else:
            seen_codes.add(code)
            valid.append(row)
    return valid, errors


def validate_products(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """Validate product rows. Returns (valid_rows, error_rows)."""
    valid, errors = [], []
    seen_skus = set()
    for i, row in enumerate(rows, start=2):
        errs = []
        sku = (row.get('sku') or '').strip()
        name = (row.get('name') or '').strip()
        if not sku:
            errs.append({'row': i, 'column': 'sku', 'message': 'sku is required', 'value': sku})
        elif sku in seen_skus:
            errs.append({'row': i, 'column': 'sku', 'message': f"Duplicate SKU '{sku}' in this file", 'value': sku})
        if not name:
            errs.append({'row': i, 'column': 'name', 'message': 'name is required', 'value': name})

        # Numeric fields
        for field in ('unit_cost', 'reorder_level', 'daily_usage'):
            val = row.get(field, '')
            if val:
                try:
                    fval = float(val)
                    if fval < 0:
                        errs.append({'row': i, 'column': field, 'message': f'{field} must be non-negative', 'value': val})
                except (ValueError, TypeError):
                    errs.append({'row': i, 'column': field, 'message': f'{field} must be a number', 'value': val})

        if errs:
            errors.extend(errs)
        else:
            seen_skus.add(sku)
            valid.append(row)
    return valid, errors


def validate_inventory(rows: list[dict], db) -> tuple[list[dict], list[dict]]:
    """Validate inventory rows; checks sku and warehouse_code referential integrity."""
    valid, errors = [], []
    seen_pairs = set()
    for i, row in enumerate(rows, start=2):
        errs = []
        sku = (row.get('sku') or '').strip()
        wh_code = (row.get('warehouse_code') or '').strip()
        qty_str = (row.get('quantity') or '0').strip()

        if not sku:
            errs.append({'row': i, 'column': 'sku', 'message': 'sku is required', 'value': sku})
        if not wh_code:
            errs.append({'row': i, 'column': 'warehouse_code', 'message': 'warehouse_code is required', 'value': wh_code})

        # Referential integrity
        if sku and not db.products.find_one({'sku': sku}):
            errs.append({'row': i, 'column': 'sku', 'message': f"SKU '{sku}' does not exist in products", 'value': sku})
        if wh_code and not db.warehouses.find_one({'code': wh_code}):
            errs.append({'row': i, 'column': 'warehouse_code', 'message': f"warehouse_code '{wh_code}' does not exist", 'value': wh_code})

        # Quantity
        if qty_str:
            try:
                qty = int(float(qty_str))
                if qty < 0:
                    errs.append({'row': i, 'column': 'quantity', 'message': 'quantity must be non-negative', 'value': qty_str})
            except (ValueError, TypeError):
                errs.append({'row': i, 'column': 'quantity', 'message': 'quantity must be an integer', 'value': qty_str})

        pair = (sku, wh_code)
        if pair in seen_pairs and not errs:
            errs.append({'row': i, 'column': 'sku', 'message': f"Duplicate (sku, warehouse_code) pair in file", 'value': sku})
        
        if errs:
            errors.extend(errs)
        else:
            seen_pairs.add(pair)
            valid.append(row)
    return valid, errors


def validate_shipments(rows: list[dict], db) -> tuple[list[dict], list[dict]]:
    """Validate shipment rows; checks destination_warehouse_code and status enum."""
    valid, errors = [], []
    seen_ids = set()
    for i, row in enumerate(rows, start=2):
        errs = []
        shp_id = (row.get('shipment_id') or '').strip()
        dest_wh = (row.get('destination_warehouse_code') or '').strip()
        status = (row.get('status') or '').strip().lower()
        orig_eta_str = (row.get('original_eta') or '').strip()
        curr_eta_str = (row.get('current_eta') or '').strip()

        if not shp_id:
            errs.append({'row': i, 'column': 'shipment_id', 'message': 'shipment_id is required', 'value': shp_id})
        elif shp_id in seen_ids:
            errs.append({'row': i, 'column': 'shipment_id', 'message': f"Duplicate shipment_id '{shp_id}' in this file", 'value': shp_id})

        if not dest_wh:
            errs.append({'row': i, 'column': 'destination_warehouse_code', 'message': 'destination_warehouse_code is required', 'value': dest_wh})
        elif not db.warehouses.find_one({'code': dest_wh}):
            errs.append({'row': i, 'column': 'destination_warehouse_code',
                         'message': f"warehouse_code '{dest_wh}' does not exist", 'value': dest_wh})

        if status and status not in VALID_SHIPMENT_STATUSES:
            errs.append({'row': i, 'column': 'status',
                         'message': f"status '{status}' is not valid; must be one of: {', '.join(VALID_SHIPMENT_STATUSES)}",
                         'value': status})

        # Date validation
        if orig_eta_str:
            dt = parse_date(orig_eta_str)
            if dt is None:
                errs.append({'row': i, 'column': 'original_eta',
                             'message': f"'{orig_eta_str}' is not a valid date (use YYYY-MM-DD, DD/MM/YYYY, or DD-MMM-YYYY)",
                             'value': orig_eta_str})
        if curr_eta_str:
            dt = parse_date(curr_eta_str)
            if dt is None:
                errs.append({'row': i, 'column': 'current_eta',
                             'message': f"'{curr_eta_str}' is not a valid date (use YYYY-MM-DD, DD/MM/YYYY, or DD-MMM-YYYY)",
                             'value': curr_eta_str})

        if errs:
            errors.extend(errs)
        else:
            seen_ids.add(shp_id)
            valid.append(row)
    return valid, errors


def validate_tracking_events(rows: list[dict], db) -> tuple[list[dict], list[dict]]:
    """Validate tracking event rows; checks shipment_id exists and timestamp is parseable."""
    valid, errors = [], []
    for i, row in enumerate(rows, start=2):
        errs = []
        shp_id = (row.get('shipment_id') or '').strip()
        ts_str = (row.get('timestamp') or '').strip()

        if not shp_id:
            errs.append({'row': i, 'column': 'shipment_id', 'message': 'shipment_id is required', 'value': shp_id})
        elif not db.shipments.find_one({'shipment_id': shp_id}):
            errs.append({'row': i, 'column': 'shipment_id',
                         'message': f"shipment_id '{shp_id}' does not exist in shipments", 'value': shp_id})

        if ts_str:
            dt = parse_date(ts_str)
            if dt is None:
                errs.append({'row': i, 'column': 'timestamp',
                             'message': f"'{ts_str}' is not a valid timestamp", 'value': ts_str})

        if errs:
            errors.extend(errs)
        else:
            valid.append(row)
    return valid, errors


# ─── Commit ──────────────────────────────────────────────────────────────────

def commit_warehouses(rows: list[dict], mode: str, job_id: str, user_email: str, db) -> dict:
    """Upsert warehouses by code. Returns {created, updated, skipped, failed}."""
    created = updated = skipped = failed = 0
    ops = []
    from pymongo import UpdateOne
    now = datetime.utcnow()
    for row in rows:
        code = row['code'].strip()
        doc = {
            'code': code,
            'name': row.get('name', '').strip(),
            'city': row.get('city', '').strip(),
            'state': row.get('state', '').strip(),
            'location': f"{row.get('city','').strip()}, {row.get('state','').strip()}",
            'is_demo': False,
            'source': 'import',
            'import_job_id': job_id,
            'updated_by': user_email,
            'updated_at': now,
        }
        existing = db.warehouses.find_one({'code': code})
        if existing and mode == 'add_only':
            skipped += 1
            continue
        ops.append(UpdateOne(
            {'code': code},
            {'$set': doc, '$setOnInsert': {'created_at': now}},
            upsert=True,
        ))

    if ops:
        from pymongo import UpdateOne
        result = db.warehouses.bulk_write(ops, ordered=False)
        created += result.upserted_count
        updated += result.modified_count
    return {'created': created, 'updated': updated, 'skipped': skipped, 'failed': failed}


def commit_products(rows: list[dict], mode: str, job_id: str, user_email: str, db) -> dict:
    from pymongo import UpdateOne
    created = updated = skipped = failed = 0
    now = datetime.utcnow()
    ops = []
    for row in rows:
        sku = row['sku'].strip()
        existing = db.products.find_one({'sku': sku})
        if existing and mode == 'add_only':
            skipped += 1
            continue
        def _safe_float(v, default=None):
            try: return float(v) if v else default
            except: return default
        def _safe_int(v, default=0):
            try: return int(float(v)) if v else default
            except: return default
        doc = {
            'sku': sku,
            'name': row.get('name', '').strip(),
            'category': row.get('category', '').strip(),
            'unit': row.get('unit', '').strip(),
            'unit_cost': _safe_float(row.get('unit_cost'), 0.0),
            'reorder_level': _safe_int(row.get('reorder_level'), 0),
            'is_demo': False,
            'source': 'import',
            'import_job_id': job_id,
            'updated_by': user_email,
            'updated_at': now,
        }
        du = _safe_float(row.get('daily_usage'))
        if du is not None:
            doc['daily_usage'] = du
        ops.append(UpdateOne(
            {'sku': sku},
            {'$set': doc, '$setOnInsert': {'created_at': now}},
            upsert=True,
        ))
    if ops:
        result = db.products.bulk_write(ops, ordered=False)
        created += result.upserted_count
        updated += result.modified_count
    return {'created': created, 'updated': updated, 'skipped': skipped, 'failed': failed}


def commit_inventory(rows: list[dict], mode: str, job_id: str, user_email: str, db) -> dict:
    """Snapshot SET of inventory quantities (not additive)."""
    from pymongo import UpdateOne
    created = updated = skipped = failed = 0
    now = datetime.utcnow()
    ops = []
    for row in rows:
        sku = row['sku'].strip()
        wh_code = row['warehouse_code'].strip()
        qty_str = row.get('quantity', '0')
        try:
            qty = int(float(qty_str)) if qty_str else 0
        except:
            qty = 0
            failed += 1
            continue

        existing = db.stock.find_one({'sku': sku, 'warehouse_code': wh_code})
        if existing and mode == 'add_only':
            skipped += 1
            continue

        # Get product and warehouse by natural keys for internal IDs
        product = db.products.find_one({'sku': sku})
        warehouse = db.warehouses.find_one({'code': wh_code})
        product_id = str(product['_id']) if product else None
        warehouse_id = str(warehouse['_id']) if warehouse else None

        doc = {
            'sku': sku,
            'warehouse_code': wh_code,
            'product_id': product_id,
            'warehouse_id': warehouse_id,
            'quantity': qty,
            'is_demo': False,
            'source': 'import',
            'import_job_id': job_id,
            'updated_by': user_email,
            'updated_at': now,
        }
        ops.append(UpdateOne(
            {'sku': sku, 'warehouse_code': wh_code},
            {'$set': doc, '$setOnInsert': {'created_at': now}},
            upsert=True,
        ))
    if ops:
        result = db.stock.bulk_write(ops, ordered=False)
        created += result.upserted_count
        updated += result.modified_count
    return {'created': created, 'updated': updated, 'skipped': skipped, 'failed': failed}


def commit_shipments(rows: list[dict], mode: str, job_id: str, user_email: str, db) -> dict:
    from pymongo import UpdateOne
    created = updated = skipped = failed = 0
    now = datetime.utcnow()
    ops = []
    for row in rows:
        shp_id = row['shipment_id'].strip()
        existing = db.shipments.find_one({'shipment_id': shp_id})
        if existing and mode == 'add_only':
            skipped += 1
            continue

        dest_wh_code = (row.get('destination_warehouse_code') or '').strip()
        dest_wh = db.warehouses.find_one({'code': dest_wh_code}) if dest_wh_code else None
        dest_wh_id = str(dest_wh['_id']) if dest_wh else None

        orig_eta = parse_date(row.get('original_eta', ''))
        curr_eta = parse_date(row.get('current_eta', ''))

        status = (row.get('status') or 'ordered').strip().lower()
        if status not in VALID_SHIPMENT_STATUSES:
            status = 'ordered'

        doc = {
            'shipment_id': shp_id,
            'supplier': (row.get('supplier') or '').strip(),
            'carrier': (row.get('carrier') or '').strip(),
            'origin': (row.get('origin') or '').strip(),
            'destination_warehouse_code': dest_wh_code,
            'destination_warehouse_id': dest_wh_id,
            'status': status,
            'eta': curr_eta.isoformat() if curr_eta else None,
            'original_eta': orig_eta.isoformat() if orig_eta else None,
            'current_eta': curr_eta.isoformat() if curr_eta else None,
            'delay_days': 0,
            'items': [],
            'tracking_events': [],
            'is_demo': False,
            'source': 'import',
            'import_job_id': job_id,
            'updated_by': user_email,
            'updated_at': now,
        }
        ops.append(UpdateOne(
            {'shipment_id': shp_id},
            {'$set': doc, '$setOnInsert': {'created_at': now}},
            upsert=True,
        ))
    if ops:
        result = db.shipments.bulk_write(ops, ordered=False)
        created += result.upserted_count
        updated += result.modified_count
    return {'created': created, 'updated': updated, 'skipped': skipped, 'failed': failed}


def commit_tracking_events(rows: list[dict], mode: str, job_id: str, user_email: str, db) -> dict:
    created = updated = skipped = failed = 0
    for row in rows:
        shp_id = row['shipment_id'].strip()
        ts = parse_date(row.get('timestamp', ''))
        event = {
            'location': (row.get('location') or '').strip(),
            'status': (row.get('status') or '').strip(),
            'note': (row.get('note') or '').strip(),
            'timestamp': ts.isoformat() if ts else datetime.utcnow().isoformat(),
            'delay_days': 0,
            'created_by': user_email,
            'import_job_id': job_id,
        }
        result = db.shipments.update_one(
            {'shipment_id': shp_id},
            {'$push': {'tracking_events': event}, '$set': {'updated_at': datetime.utcnow()}}
        )
        if result.modified_count:
            created += 1
        else:
            failed += 1
    return {'created': created, 'updated': 0, 'skipped': skipped, 'failed': failed}
