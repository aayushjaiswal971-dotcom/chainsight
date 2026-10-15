"""Dashboard summary endpoint."""
from datetime import datetime
from bson import ObjectId
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from common.mongo import get_db
from inventory.views import serialize_doc


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        db = get_db()

        total_skus = db.products.count_documents({})
        total_warehouses = db.warehouses.count_documents({})

        # Low-stock count
        stocks = list(db.stock.find())
        low_stock_count = 0
        stock_chart = []
        for s in stocks:
            try:
                product = db.products.find_one({'_id': ObjectId(s['product_id'])})
            except Exception:
                continue
            if product:
                reorder = product.get('reorder_level', 0)
                qty = s.get('quantity', 0)
                if qty <= reorder:
                    low_stock_count += 1
                stock_chart.append({
                    'sku': product.get('sku'),
                    'name': product.get('name'),
                    'quantity': qty,
                    'reorder_level': reorder,
                    'is_low_stock': qty <= reorder,
                })

        in_transit = db.shipments.count_documents({'status': 'in_transit'})
        delayed = db.shipments.count_documents({'status': 'delayed'})

        # Recent shipments
        recent_shipments = []
        for ship in db.shipments.find().sort('created_at', -1).limit(10):
            ship = serialize_doc(ship)
            recent_shipments.append(ship)

        # Low-stock SKUs detail
        low_stock_skus = [s for s in stock_chart if s['is_low_stock']]

        return Response({
            'total_skus': total_skus,
            'total_warehouses': total_warehouses,
            'low_stock_count': low_stock_count,
            'in_transit_count': in_transit,
            'delayed_count': delayed,
            'stock_chart': sorted(stock_chart, key=lambda x: x['quantity'])[:20],
            'recent_shipments': recent_shipments,
            'low_stock_skus': low_stock_skus,
        })
