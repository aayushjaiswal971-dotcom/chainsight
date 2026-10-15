"""
Inventory views: Warehouses, Products, Stock, Dashboard
All domain data stored in MongoDB.
"""
import csv
from datetime import datetime
from bson import ObjectId
from django.http import HttpResponse
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser

from common.mongo import get_db


def serialize_doc(doc):
    """Convert MongoDB doc to JSON-serializable dict."""
    if doc is None:
        return None
    doc = dict(doc)
    if '_id' in doc:
        doc['id'] = str(doc.pop('_id'))
    return doc


# ─── Warehouses ──────────────────────────────────────────────────────────────

class WarehouseListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        db = get_db()
        warehouses = [serialize_doc(w) for w in db.warehouses.find()]
        return Response(warehouses)

    def post(self, request):
        db = get_db()
        data = request.data
        if not data.get('name'):
            return Response({'error': 'name is required'}, status=400)
        doc = {
            'name': data['name'],
            'location': data.get('location', ''),
            'created_at': datetime.utcnow(),
        }
        result = db.warehouses.insert_one(doc)
        doc['id'] = str(result.inserted_id)
        doc.pop('_id', None)
        return Response(doc, status=201)


class WarehouseDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, warehouse_id):
        db = get_db()
        try:
            w = db.warehouses.find_one({'_id': ObjectId(warehouse_id)})
        except Exception:
            return Response({'error': 'Invalid ID'}, status=400)
        if not w:
            return Response({'error': 'Not found'}, status=404)
        return Response(serialize_doc(w))

    def put(self, request, warehouse_id):
        db = get_db()
        try:
            oid = ObjectId(warehouse_id)
        except Exception:
            return Response({'error': 'Invalid ID'}, status=400)
        update = {k: v for k, v in request.data.items() if k in ('name', 'location')}
        db.warehouses.update_one({'_id': oid}, {'$set': update})
        w = db.warehouses.find_one({'_id': oid})
        return Response(serialize_doc(w))

    def delete(self, request, warehouse_id):
        if request.user.role != 'admin':
            return Response({'error': 'Admin only'}, status=403)
        db = get_db()
        try:
            oid = ObjectId(warehouse_id)
        except Exception:
            return Response({'error': 'Invalid ID'}, status=400)
        db.warehouses.delete_one({'_id': oid})
        return Response(status=204)


# ─── Products ─────────────────────────────────────────────────────────────────

class ProductListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        db = get_db()
        products = [serialize_doc(p) for p in db.products.find()]
        return Response(products)

    def post(self, request):
        db = get_db()
        data = request.data
        required = ('sku', 'name')
        for field in required:
            if not data.get(field):
                return Response({'error': f'{field} is required'}, status=400)

        if db.products.find_one({'sku': data['sku']}):
            return Response({'error': 'SKU already exists'}, status=400)

        doc = {
            'sku': data['sku'],
            'name': data['name'],
            'category': data.get('category', ''),
            'reorder_level': int(data.get('reorder_level', 0)),
            'unit_cost': float(data.get('unit_cost', 0)),
            'daily_usage': float(data.get('daily_usage', 1)),
            'created_at': datetime.utcnow(),
        }
        result = db.products.insert_one(doc)
        doc['id'] = str(result.inserted_id)
        doc.pop('_id', None)
        return Response(doc, status=201)


class ProductDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_product(self, product_id):
        db = get_db()
        try:
            return db, db.products.find_one({'_id': ObjectId(product_id)})
        except Exception:
            return None, None

    def get(self, request, product_id):
        db, product = self._get_product(product_id)
        if product is None:
            return Response({'error': 'Not found'}, status=404)
        return Response(serialize_doc(product))

    def put(self, request, product_id):
        db, product = self._get_product(product_id)
        if product is None:
            return Response({'error': 'Not found'}, status=404)
        allowed = ('name', 'category', 'reorder_level', 'unit_cost', 'daily_usage')
        update = {k: request.data[k] for k in allowed if k in request.data}
        if 'reorder_level' in update:
            update['reorder_level'] = int(update['reorder_level'])
        if 'unit_cost' in update:
            update['unit_cost'] = float(update['unit_cost'])
        if 'daily_usage' in update:
            update['daily_usage'] = float(update['daily_usage'])
        db.products.update_one({'_id': product['_id']}, {'$set': update})
        updated = db.products.find_one({'_id': product['_id']})
        return Response(serialize_doc(updated))

    def delete(self, request, product_id):
        if request.user.role != 'admin':
            return Response({'error': 'Admin only'}, status=403)
        db, product = self._get_product(product_id)
        if product is None:
            return Response({'error': 'Not found'}, status=404)
        db.products.delete_one({'_id': product['_id']})
        return Response(status=204)


# ─── Inventory ────────────────────────────────────────────────────────────────

class InventoryListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        db = get_db()
        # Enrich stock with product and warehouse info
        stocks = list(db.stock.find())
        result = []
        for s in stocks:
            s = serialize_doc(s)
            # attach product info
            try:
                product = db.products.find_one({'_id': ObjectId(s['product_id'])})
                if product:
                    s['product'] = serialize_doc(product)
            except Exception:
                pass
            try:
                warehouse = db.warehouses.find_one({'_id': ObjectId(s['warehouse_id'])})
                if warehouse:
                    s['warehouse'] = serialize_doc(warehouse)
            except Exception:
                pass
            # low-stock flag
            reorder_level = s.get('product', {}).get('reorder_level', 0)
            s['is_low_stock'] = s.get('quantity', 0) <= reorder_level
            result.append(s)
        return Response(result)


class InventoryAdjustView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        db = get_db()
        data = request.data
        product_id = data.get('product_id')
        warehouse_id = data.get('warehouse_id')
        qty_change = data.get('quantity_change')
        reason = data.get('reason', '')

        if not all([product_id, warehouse_id, qty_change is not None]):
            return Response({'error': 'product_id, warehouse_id, quantity_change required'}, status=400)

        try:
            qty_change = int(qty_change)
        except (TypeError, ValueError):
            return Response({'error': 'quantity_change must be integer'}, status=400)

        # Atomic $inc update
        result = db.stock.find_one_and_update(
            {'product_id': product_id, 'warehouse_id': warehouse_id},
            {
                '$inc': {'quantity': qty_change},
                '$set': {'updated_at': datetime.utcnow()},
                '$setOnInsert': {'created_at': datetime.utcnow()},
            },
            upsert=True,
            return_document=True,
        )

        # Guard against negative stock
        if result and result.get('quantity', 0) < 0:
            # Undo the adjustment
            db.stock.update_one(
                {'product_id': product_id, 'warehouse_id': warehouse_id},
                {'$inc': {'quantity': -qty_change}}
            )
            return Response({'error': 'Insufficient stock'}, status=400)

        # Log adjustment
        db.stock_adjustments.insert_one({
            'product_id': product_id,
            'warehouse_id': warehouse_id,
            'quantity_change': qty_change,
            'reason': reason,
            'user': request.user.email,
            'timestamp': datetime.utcnow(),
        })

        return Response(serialize_doc(result))


class InventoryCSVView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        db = get_db()
        stocks = list(db.stock.find())
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="inventory.csv"'
        writer = csv.writer(response)
        writer.writerow(['SKU', 'Product Name', 'Warehouse', 'Quantity', 'Reorder Level', 'Low Stock'])
        for s in stocks:
            product = db.products.find_one({'_id': ObjectId(s['product_id'])}) if s.get('product_id') else {}
            warehouse = db.warehouses.find_one({'_id': ObjectId(s['warehouse_id'])}) if s.get('warehouse_id') else {}
            reorder = (product or {}).get('reorder_level', 0)
            qty = s.get('quantity', 0)
            writer.writerow([
                (product or {}).get('sku', ''),
                (product or {}).get('name', ''),
                (warehouse or {}).get('name', ''),
                qty,
                reorder,
                'Yes' if qty <= reorder else 'No',
            ])
        return response
