"""
Core tests: atomic stock adjustment, delivered-shipment stock update,
AI response validation, fallback path.
"""
import pytest
import mongomock
from unittest.mock import patch, MagicMock
from datetime import datetime

# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_db():
    """In-memory MongoDB mock."""
    client = mongomock.MongoClient()
    return client['test_chainsight']


@pytest.fixture
def sample_product(mock_db):
    result = mock_db.products.insert_one({
        'sku': 'TEST-001',
        'name': 'Test Product',
        'reorder_level': 10,
        'daily_usage': 5.0,
        'unit_cost': 100.0,
    })
    return {'_id': result.inserted_id, 'sku': 'TEST-001', 'reorder_level': 10, 'daily_usage': 5.0}


@pytest.fixture
def sample_warehouse(mock_db):
    result = mock_db.warehouses.insert_one({'name': 'Test WH', 'location': 'Test City'})
    return result.inserted_id


# ─── 1. Atomic Stock Adjustment ──────────────────────────────────────────────

def test_atomic_stock_increment(mock_db, sample_product, sample_warehouse):
    pid = str(sample_product['_id'])
    wid = str(sample_warehouse)

    # Insert initial stock
    mock_db.stock.insert_one({'product_id': pid, 'warehouse_id': wid, 'quantity': 100})

    # Atomic increment
    mock_db.stock.find_one_and_update(
        {'product_id': pid, 'warehouse_id': wid},
        {'$inc': {'quantity': 50}},
        upsert=True,
        return_document=True,
    )
    doc = mock_db.stock.find_one({'product_id': pid, 'warehouse_id': wid})
    assert doc['quantity'] == 150


def test_atomic_stock_decrement(mock_db, sample_product, sample_warehouse):
    pid = str(sample_product['_id'])
    wid = str(sample_warehouse)

    mock_db.stock.insert_one({'product_id': pid, 'warehouse_id': wid, 'quantity': 100})

    # Atomic decrement
    mock_db.stock.find_one_and_update(
        {'product_id': pid, 'warehouse_id': wid},
        {'$inc': {'quantity': -30}},
        return_document=True,
    )
    doc = mock_db.stock.find_one({'product_id': pid, 'warehouse_id': wid})
    assert doc['quantity'] == 70


def test_atomic_upsert_creates_stock(mock_db, sample_product, sample_warehouse):
    """Verify upsert creates a new stock record."""
    pid = str(sample_product['_id'])
    wid = str(sample_warehouse)

    result = mock_db.stock.find_one_and_update(
        {'product_id': pid, 'warehouse_id': wid},
        {'$inc': {'quantity': 200}, '$setOnInsert': {'created_at': datetime.utcnow()}},
        upsert=True,
        return_document=True,
    )
    assert result is not None
    # mongomock upsert: quantity might be 200 or the doc after
    doc = mock_db.stock.find_one({'product_id': pid, 'warehouse_id': wid})
    assert doc['quantity'] == 200


# ─── 2. Delivered Shipment Stock Update ──────────────────────────────────────

def test_delivery_adds_stock(mock_db, sample_product, sample_warehouse):
    """When status -> delivered, stock should increase atomically."""
    pid = str(sample_product['_id'])
    wid = str(sample_warehouse)

    # Set initial stock
    mock_db.stock.insert_one({'product_id': pid, 'warehouse_id': wid, 'quantity': 50})

    # Simulate shipment delivery logic
    items = [{'product_id': pid, 'quantity': 100}]
    for item in items:
        mock_db.stock.find_one_and_update(
            {'product_id': item['product_id'], 'warehouse_id': wid},
            {'$inc': {'quantity': item['quantity']}, '$set': {'updated_at': datetime.utcnow()}},
            upsert=True,
        )

    doc = mock_db.stock.find_one({'product_id': pid, 'warehouse_id': wid})
    assert doc['quantity'] == 150


# ─── 3. AI Response Validation ───────────────────────────────────────────────

def test_pydantic_validation_passes():
    from ai_analyst.schemas import RiskAnalysisSchema
    data = {
        'summary': 'Test summary',
        'overall_risk': 'high',
        'at_risk_skus': [{
            'sku': 'TEST-001',
            'days_until_stockout': 3.5,
            'cause': 'Delayed shipment',
            'severity': 'high',
            'recommended_action': 'Reorder now',
            'suggested_reorder_qty': 100,
        }],
        'shipment_actions': [{
            'shipment_id': 'abc123',
            'action': 'expedite',
            'reason': 'Critical delay',
        }],
    }
    validated = RiskAnalysisSchema(**data)
    assert validated.overall_risk == 'high'
    assert len(validated.at_risk_skus) == 1
    assert validated.at_risk_skus[0].sku == 'TEST-001'


def test_pydantic_validation_rejects_bad_severity():
    from ai_analyst.schemas import RiskAnalysisSchema
    import pydantic
    data = {
        'summary': 'Test',
        'overall_risk': 'critical',  # invalid
        'at_risk_skus': [],
        'shipment_actions': [],
    }
    with pytest.raises(Exception):
        RiskAnalysisSchema(**data)


def test_hallucinated_skus_filtered():
    """Hallucinated SKUs not in database should be removed."""
    from ai_analyst.services.gemini_service import analyze_risk

    valid_skus = [{'sku': 'REAL-001', 'stock': 5, 'daily_usage': 5, 'reorder_level': 10, 'product_id': 'p1', 'name': 'Real Product'}]
    context = {'skus': valid_skus, 'shipments': [], 'sku_map': {}}

    # Mock gemini to return hallucinated SKU
    fake_gemini_response = {
        'summary': 'Test',
        'overall_risk': 'high',
        'at_risk_skus': [
            {'sku': 'REAL-001', 'days_until_stockout': 1, 'cause': 'Low', 'severity': 'high', 'recommended_action': 'Order', 'suggested_reorder_qty': 50},
            {'sku': 'FAKE-999', 'days_until_stockout': 2, 'cause': 'Fake', 'severity': 'medium', 'recommended_action': 'Order', 'suggested_reorder_qty': 20},
        ],
        'shipment_actions': [],
        'source': 'gemini',
    }

    with patch('ai_analyst.services.gemini_service.call_gemini', return_value=fake_gemini_response):
        result = analyze_risk(context)

    sku_codes = [s['sku'] for s in result['at_risk_skus']]
    assert 'REAL-001' in sku_codes
    assert 'FAKE-999' not in sku_codes, 'Hallucinated SKU should have been filtered out'


# ─── 4. Fallback Path ────────────────────────────────────────────────────────

def test_fallback_detects_delayed_stockout():
    from ai_analyst.services.fallback import run_fallback

    context = {
        'skus': [
            {'product_id': 'p1', 'sku': 'LOW-001', 'name': 'Low Stock Item', 'stock': 10, 'daily_usage': 5.0, 'reorder_level': 20},
        ],
        'shipments': [
            {
                'id': 'ship1',
                'status': 'delayed',
                'delay_days': 5,
                'eta': '2024-12-01',
                'items': [{'product_id': 'p1', 'sku': 'LOW-001', 'quantity': 100}],
                'supplier': 'Test',
            }
        ],
        'sku_map': {'p1': {'sku': 'LOW-001', 'stock': 10}},
    }

    result = run_fallback(context)

    assert result['source'] == 'fallback'
    assert result['overall_risk'] in ('medium', 'high')
    assert len(result['at_risk_skus']) > 0
    assert result['at_risk_skus'][0]['sku'] == 'LOW-001'


def test_fallback_source_is_fallback():
    from ai_analyst.services.fallback import run_fallback
    result = run_fallback({'skus': [], 'shipments': [], 'sku_map': {}})
    assert result['source'] == 'fallback'


def test_fallback_used_when_gemini_fails():
    """When Gemini raises an exception, fallback should be returned."""
    from ai_analyst.services.gemini_service import analyze_risk

    context = {
        'skus': [{'product_id': 'p1', 'sku': 'SKU-A', 'name': 'Product A', 'stock': 5, 'daily_usage': 2, 'reorder_level': 10}],
        'shipments': [],
        'sku_map': {'p1': {'sku': 'SKU-A'}},
    }

    with patch('ai_analyst.services.gemini_service.call_gemini', side_effect=Exception('API timeout')):
        result = analyze_risk(context)

    assert result['source'] == 'fallback'
    assert 'summary' in result
