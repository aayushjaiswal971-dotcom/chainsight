"""
Column mapping: auto-match uploaded headers to target fields.
Synonym table + edit-distance fallback.
"""
import re

# Synonym table: canonical_field -> [synonyms (lowercased, stripped)]
SYNONYMS = {
    'code':                     ['code', 'warehouse_code', 'wh_code', 'wh code', 'warehouse code'],
    'name':                     ['name', 'warehouse_name', 'product_name', 'description', 'desc', 'title'],
    'city':                     ['city', 'town', 'municipality'],
    'state':                    ['state', 'province', 'region'],
    'sku':                      ['sku', 'item_code', 'item code', 'product_code', 'product code',
                                 'part_number', 'part number', 'article', 'style'],
    'category':                 ['category', 'cat', 'product_category', 'product category',
                                 'type', 'product_type'],
    'unit':                     ['unit', 'uom', 'unit_of_measure', 'unit of measure', 'measure'],
    'unit_cost':                ['unit_cost', 'unit cost', 'cost', 'price', 'unit_price', 'unit price'],
    'reorder_level':            ['reorder_level', 'reorder level', 'reorder', 'safety_stock',
                                 'safety stock', 'min_qty', 'minimum quantity', 'min qty'],
    'daily_usage':              ['daily_usage', 'daily usage', 'daily_demand', 'daily demand',
                                 'avg_daily_usage', 'average daily usage', 'usage_rate'],
    'warehouse_code':           ['warehouse_code', 'warehouse code', 'wh_code', 'wh code',
                                 'destination', 'destination_code', 'location_code'],
    'quantity':                 ['quantity', 'qty', 'amount', 'units', 'stock', 'on_hand', 'on hand'],
    'shipment_id':              ['shipment_id', 'shipment id', 'shipment_no', 'shipment no',
                                 'shp_id', 'shp id', 'tracking_no', 'tracking no', 'consignment_id'],
    'supplier':                 ['supplier', 'vendor', 'vendor_name', 'supplier_name'],
    'carrier':                  ['carrier', 'logistics', 'shipping_company', 'freight_company'],
    'origin':                   ['origin', 'source', 'from', 'origin_city', 'ship_from'],
    'destination_warehouse_code': ['destination_warehouse_code', 'destination warehouse code',
                                   'dest_warehouse', 'dest warehouse', 'destination_wh',
                                   'destination', 'to_warehouse'],
    'status':                   ['status', 'shipment_status', 'current_status', 'state'],
    'original_eta':             ['original_eta', 'original eta', 'planned_eta', 'planned eta',
                                 'eta_original', 'scheduled_eta', 'scheduled eta'],
    'current_eta':              ['current_eta', 'current eta', 'eta', 'revised_eta', 'revised eta',
                                 'expected_delivery', 'expected delivery'],
    'timestamp':                ['timestamp', 'time', 'date', 'event_time', 'event time',
                                 'occurred_at', 'occurred at'],
    'location':                 ['location', 'event_location', 'checkpoint', 'city', 'place'],
    'note':                     ['note', 'notes', 'remarks', 'comment', 'comments', 'description'],
}


def _normalize(s: str) -> str:
    """Lowercase, strip, remove underscores and extra spaces."""
    return re.sub(r'[\s_]+', ' ', s.strip().lower())


def auto_map(headers: list[str], target_fields: list[str]) -> dict:
    """
    Returns {target_field: matched_header or None} for each target_field.
    Matching priority:
      1. Exact match (normalized)
      2. Synonym match
      3. Substring match
    """
    normalized_headers = {_normalize(h): h for h in headers}
    mapping = {}

    for field in target_fields:
        norm_field = _normalize(field)
        matched = None

        # 1. Exact match
        if norm_field in normalized_headers:
            matched = normalized_headers[norm_field]

        # 2. Synonym match
        if matched is None:
            synonyms = SYNONYMS.get(field, [])
            for syn in synonyms:
                if _normalize(syn) in normalized_headers:
                    matched = normalized_headers[_normalize(syn)]
                    break

        # 3. Substring: header contains field name
        if matched is None:
            for nh, orig_h in normalized_headers.items():
                if norm_field in nh or nh in norm_field:
                    matched = orig_h
                    break

        mapping[field] = matched

    return mapping
