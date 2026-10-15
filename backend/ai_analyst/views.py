"""
AI Analyst views: analyze risk and analysis history.
"""
import logging
from datetime import datetime
from bson import ObjectId
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import UserRateThrottle

from common.mongo import get_db
from inventory.views import serialize_doc
from ai_analyst.services.gemini_service import analyze_risk

logger = logging.getLogger(__name__)


class AIAnalyzeThrottle(UserRateThrottle):
    rate = '10/min'
    scope = 'ai_analyze'


def build_context(db) -> dict:
    """Gather all inventory and shipment data for AI analysis."""
    # All stock with product info
    skus = []
    sku_map = {}
    stocks = list(db.stock.find())
    for s in stocks:
        try:
            product = db.products.find_one({'_id': ObjectId(s['product_id'])})
        except Exception:
            continue
        if not product:
            continue
        pid = s['product_id']
        sku_info = {
            'product_id': pid,
            'sku': product.get('sku', ''),
            'name': product.get('name', ''),
            'stock': s.get('quantity', 0),
            'daily_usage': product.get('daily_usage', 1),
            'reorder_level': product.get('reorder_level', 0),
        }
        skus.append(sku_info)
        sku_map[pid] = sku_info

    # All in-transit or delayed shipments
    shipments_raw = list(db.shipments.find({'status': {'$in': ['ordered', 'in_transit', 'delayed']}}))
    shipments = []
    for ship in shipments_raw:
        # Enrich items with sku
        items = []
        for item in ship.get('items', []):
            pid = item['product_id']
            sku = sku_map.get(pid, {}).get('sku', pid)
            items.append({**item, 'sku': sku})
        shipments.append({
            'id': str(ship['_id']),
            'supplier': ship.get('supplier', ''),
            'status': ship.get('status', ''),
            'delay_days': ship.get('delay_days', 0),
            'eta': ship.get('eta', ''),
            'items': items,
        })

    return {'skus': skus, 'shipments': shipments, 'sku_map': sku_map}


class AnalyzeRiskView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AIAnalyzeThrottle]

    def post(self, request):
        db = get_db()
        context = build_context(db)

        if not context['skus']:
            return Response({'error': 'No inventory data found. Run seed_demo first.'}, status=400)

        result = analyze_risk(context)

        # Store analysis in MongoDB
        analysis_doc = {
            **result,
            'requested_by': request.user.email,
            'created_at': datetime.utcnow(),
        }
        inserted = db.ai_analyses.insert_one(analysis_doc)
        analysis_doc['id'] = str(inserted.inserted_id)
        analysis_doc.pop('_id', None)
        analysis_doc['created_at'] = analysis_doc['created_at'].isoformat()

        # Optional: SES email on high risk
        if result.get('overall_risk') == 'high':
            _try_send_alert_email(result, request.user.email)

        return Response(analysis_doc)


class AnalysisHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        db = get_db()
        analyses = []
        for a in db.ai_analyses.find().sort('created_at', -1).limit(20):
            a = serialize_doc(a)
            if 'created_at' in a and hasattr(a['created_at'], 'isoformat'):
                a['created_at'] = a['created_at'].isoformat()
            analyses.append(a)
        return Response(analyses)


def _try_send_alert_email(result: dict, user_email: str):
    """Optionally send SES email on high risk — silently skip if not configured."""
    import os
    from_email = os.environ.get('SES_FROM_EMAIL', '')
    if not from_email:
        return
    try:
        import boto3
        client = boto3.client('ses', region_name=os.environ.get('AWS_REGION', 'ap-south-1'))
        at_risk = result.get('at_risk_skus', [])
        body = f"Overall Risk: {result['overall_risk'].upper()}\n\n"
        body += f"Summary: {result['summary']}\n\n"
        body += "At-Risk SKUs:\n"
        for s in at_risk:
            body += f"  - {s['sku']}: {s['days_until_stockout']} days until stockout. {s['recommended_action']}\n"
        client.send_email(
            Source=from_email,
            Destination={'ToAddresses': [user_email]},
            Message={
                'Subject': {'Data': f"ChainSight ALERT: High Supply Chain Risk"},
                'Body': {'Text': {'Data': body}},
            },
        )
    except Exception as e:
        logger.warning(f"SES alert failed (non-critical): {e}")
