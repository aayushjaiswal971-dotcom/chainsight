"""
Shipment views: CRUD, status transitions, tracking events, delivery stock update.
"""
import os
import json
from datetime import datetime
from bson import ObjectId
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from common.mongo import get_db
from inventory.views import serialize_doc

VALID_STATUSES = ['ordered', 'in_transit', 'delayed', 'delivered']


class ShipmentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        db = get_db()
        shipments = [serialize_doc(s) for s in db.shipments.find().sort('created_at', -1)]
        return Response(shipments)

    def post(self, request):
        db = get_db()
        data = request.data
        required = ('supplier', 'destination_warehouse_id', 'items', 'eta')
        for field in required:
            if not data.get(field):
                return Response({'error': f'{field} is required'}, status=400)

        items = data['items']
        if not isinstance(items, list) or len(items) == 0:
            return Response({'error': 'items must be non-empty list'}, status=400)

        # Validate items
        for item in items:
            if not item.get('product_id') or not item.get('quantity'):
                return Response({'error': 'Each item needs product_id and quantity'}, status=400)

        doc = {
            'supplier': data['supplier'],
            'origin': data.get('origin', ''),
            'destination_warehouse_id': data['destination_warehouse_id'],
            'items': items,
            'eta': data['eta'],  # ISO string
            'delay_days': int(data.get('delay_days', 0)),
            'status': 'ordered',
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
            'created_by': request.user.email,
            'tracking_events': [],
        }
        result = db.shipments.insert_one(doc)
        doc['id'] = str(result.inserted_id)
        doc.pop('_id', None)
        return Response(doc, status=201)


class ShipmentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, shipment_id):
        db = get_db()
        try:
            ship = db.shipments.find_one({'_id': ObjectId(shipment_id)})
        except Exception:
            return Response({'error': 'Invalid ID'}, status=400)
        if not ship:
            return Response({'error': 'Not found'}, status=404)

        ship = serialize_doc(ship)

        # Enrich items with product info
        enriched_items = []
        for item in ship.get('items', []):
            try:
                product = db.products.find_one({'_id': ObjectId(item['product_id'])})
                if product:
                    item['product'] = serialize_doc(product)
            except Exception:
                pass
            enriched_items.append(item)
        ship['items'] = enriched_items

        # Enrich warehouse
        try:
            wh = db.warehouses.find_one({'_id': ObjectId(ship['destination_warehouse_id'])})
            if wh:
                ship['destination_warehouse'] = serialize_doc(wh)
        except Exception:
            pass

        return Response(ship)


class ShipmentStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, shipment_id):
        db = get_db()
        try:
            oid = ObjectId(shipment_id)
        except Exception:
            return Response({'error': 'Invalid ID'}, status=400)

        ship = db.shipments.find_one({'_id': oid})
        if not ship:
            return Response({'error': 'Not found'}, status=404)

        new_status = request.data.get('status')
        if new_status not in VALID_STATUSES:
            return Response({'error': f'status must be one of {VALID_STATUSES}'}, status=400)

        update = {
            'status': new_status,
            'updated_at': datetime.utcnow(),
        }

        if 'delay_days' in request.data:
            update['delay_days'] = int(request.data['delay_days'])

        # On delivered: atomically add stock to destination warehouse
        if new_status == 'delivered' and ship.get('status') != 'delivered':
            dest_warehouse_id = ship['destination_warehouse_id']
            for item in ship.get('items', []):
                db.stock.find_one_and_update(
                    {
                        'product_id': item['product_id'],
                        'warehouse_id': dest_warehouse_id,
                    },
                    {
                        '$inc': {'quantity': int(item['quantity'])},
                        '$set': {'updated_at': datetime.utcnow()},
                        '$setOnInsert': {'created_at': datetime.utcnow()},
                    },
                    upsert=True,
                )
            update['delivered_at'] = datetime.utcnow()

        db.shipments.update_one({'_id': oid}, {'$set': update})
        updated = db.shipments.find_one({'_id': oid})
        return Response(serialize_doc(updated))


class ShipmentEventsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, shipment_id):
        db = get_db()
        try:
            oid = ObjectId(shipment_id)
        except Exception:
            return Response({'error': 'Invalid ID'}, status=400)

        ship = db.shipments.find_one({'_id': oid})
        if not ship:
            return Response({'error': 'Not found'}, status=404)

        data = request.data
        event = {
            'location': data.get('location', ''),
            'status': data.get('status', ''),
            'note': data.get('note', ''),
            'delay_days': int(data.get('delay_days', 0)),
            'timestamp': data.get('timestamp', datetime.utcnow().isoformat()),
            'created_by': request.user.email,
        }

        db.shipments.update_one(
            {'_id': oid},
            {
                '$push': {'tracking_events': event},
                '$set': {'updated_at': datetime.utcnow()},
            }
        )

        # Auto-update status if delay mentioned
        if data.get('delay_days', 0) > 0:
            db.shipments.update_one(
                {'_id': oid},
                {'$set': {'status': 'delayed', 'delay_days': int(data['delay_days'])}}
            )

        updated = db.shipments.find_one({'_id': oid})
        return Response(serialize_doc(updated), status=201)


class NLPEventView(APIView):
    """Parse natural-language note into structured tracking event via Gemini."""
    permission_classes = [IsAuthenticated]

    def post(self, request, shipment_id):
        db = get_db()
        try:
            oid = ObjectId(shipment_id)
        except Exception:
            return Response({'error': 'Invalid ID'}, status=400)

        ship = db.shipments.find_one({'_id': oid})
        if not ship:
            return Response({'error': 'Not found'}, status=404)

        note = request.data.get('note', '')
        if not note:
            return Response({'error': 'note is required'}, status=400)

        try:
            from ai_analyst.services.gemini_service import parse_tracking_note
            event = parse_tracking_note(note)
        except Exception as e:
            # Fallback
            event = {
                'location': '',
                'status': 'in_transit',
                'note': note,
                'delay_days': 0,
            }

        return Response(event)
