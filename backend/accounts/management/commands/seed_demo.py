"""
Seed demo data: 3 warehouses, 25 products, 10 shipments (3 delayed), 2 users.
Run: python manage.py seed_demo
"""
import os
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from common.mongo import get_db

User = get_user_model()


class Command(BaseCommand):
    help = 'Seed demo data for ChainSight'

    def add_arguments(self, parser):
        parser.add_argument('--flush', action='store_true', help='Clear existing data first')

    def handle(self, *args, **options):
        db = get_db()
        now = datetime.utcnow()

        if options['flush']:
            for col in ['warehouses', 'products', 'stock', 'shipments', 'ai_analyses', 'stock_adjustments']:
                db[col].drop()
            self.stdout.write('Existing data cleared.')

        # ── 1. Users ──────────────────────────────────────────────────────────
        admin_user, _ = User.objects.get_or_create(
            email='admin@demo.com',
            defaults={'username': 'admin_demo', 'role': 'admin', 'is_staff': True, 'is_superuser': True}
        )
        admin_user.set_password('Demo@12345')
        admin_user.save()

        manager_user, _ = User.objects.get_or_create(
            email='manager@demo.com',
            defaults={'username': 'manager_demo', 'role': 'manager'}
        )
        manager_user.set_password('Demo@12345')
        manager_user.save()
        self.stdout.write('[OK] Users created')

        # ── 2. Warehouses ─────────────────────────────────────────────────────
        warehouses_data = [
            {'name': 'Delhi North DC', 'location': 'Narela, Delhi'},
            {'name': 'Mumbai West Hub', 'location': 'Bhiwandi, Mumbai'},
            {'name': 'Bengaluru Central', 'location': 'Peenya, Bengaluru'},
        ]
        wh_ids = []
        for wh in warehouses_data:
            existing = db.warehouses.find_one({'name': wh['name']})
            if existing:
                wh_ids.append(existing['_id'])
            else:
                r = db.warehouses.insert_one({**wh, 'created_at': now})
                wh_ids.append(r.inserted_id)
        self.stdout.write('[OK] Warehouses created')

        # ── 3. Products (25 SKUs) ─────────────────────────────────────────────
        products_data = [
            # Electronics
            {'sku': 'ELE-001', 'name': 'USB-C Charging Cable 2m', 'category': 'Electronics', 'reorder_level': 50, 'unit_cost': 299.0, 'daily_usage': 12},
            {'sku': 'ELE-002', 'name': 'Wireless Earbuds Pro', 'category': 'Electronics', 'reorder_level': 30, 'unit_cost': 2499.0, 'daily_usage': 5},
            {'sku': 'ELE-003', 'name': 'Power Bank 20000mAh', 'category': 'Electronics', 'reorder_level': 40, 'unit_cost': 1299.0, 'daily_usage': 8},
            {'sku': 'ELE-004', 'name': 'HDMI Cable 3m', 'category': 'Electronics', 'reorder_level': 25, 'unit_cost': 399.0, 'daily_usage': 4},
            {'sku': 'ELE-005', 'name': 'Smart LED Bulb 9W', 'category': 'Electronics', 'reorder_level': 100, 'unit_cost': 349.0, 'daily_usage': 20},
            # NEAR STOCKOUT 1
            {'sku': 'ELE-006', 'name': 'Bluetooth Speaker Mini', 'category': 'Electronics', 'reorder_level': 20, 'unit_cost': 899.0, 'daily_usage': 6},
            # Office
            {'sku': 'OFF-001', 'name': 'A4 Printer Paper 500s', 'category': 'Office', 'reorder_level': 200, 'unit_cost': 450.0, 'daily_usage': 50},
            {'sku': 'OFF-002', 'name': 'Ballpoint Pen Box 50s', 'category': 'Office', 'reorder_level': 100, 'unit_cost': 250.0, 'daily_usage': 25},
            {'sku': 'OFF-003', 'name': 'Stapler Heavy Duty', 'category': 'Office', 'reorder_level': 15, 'unit_cost': 750.0, 'daily_usage': 2},
            {'sku': 'OFF-004', 'name': 'Whiteboard Marker Set', 'category': 'Office', 'reorder_level': 40, 'unit_cost': 320.0, 'daily_usage': 8},
            # NEAR STOCKOUT 2
            {'sku': 'OFF-005', 'name': 'Sticky Notes Bulk Pack', 'category': 'Office', 'reorder_level': 60, 'unit_cost': 199.0, 'daily_usage': 15},
            # Packaging
            {'sku': 'PKG-001', 'name': 'Bubble Wrap Roll 50m', 'category': 'Packaging', 'reorder_level': 30, 'unit_cost': 1200.0, 'daily_usage': 5},
            {'sku': 'PKG-002', 'name': 'Cardboard Box Medium', 'category': 'Packaging', 'reorder_level': 500, 'unit_cost': 35.0, 'daily_usage': 120},
            {'sku': 'PKG-003', 'name': 'Packing Tape 72mm', 'category': 'Packaging', 'reorder_level': 100, 'unit_cost': 85.0, 'daily_usage': 20},
            # NEAR STOCKOUT 3
            {'sku': 'PKG-004', 'name': 'Stretch Wrap Film 500g', 'category': 'Packaging', 'reorder_level': 50, 'unit_cost': 380.0, 'daily_usage': 10},
            # Safety
            {'sku': 'SAF-001', 'name': 'Safety Gloves Nitrile L', 'category': 'Safety', 'reorder_level': 100, 'unit_cost': 150.0, 'daily_usage': 30},
            {'sku': 'SAF-002', 'name': 'Safety Helmet Yellow', 'category': 'Safety', 'reorder_level': 20, 'unit_cost': 550.0, 'daily_usage': 3},
            {'sku': 'SAF-003', 'name': 'High-Vis Vest L', 'category': 'Safety', 'reorder_level': 30, 'unit_cost': 450.0, 'daily_usage': 5},
            # NEAR STOCKOUT 4
            {'sku': 'SAF-004', 'name': 'First Aid Kit Standard', 'category': 'Safety', 'reorder_level': 15, 'unit_cost': 1800.0, 'daily_usage': 2},
            # Cleaning
            {'sku': 'CLN-001', 'name': 'Industrial Cleaner 5L', 'category': 'Cleaning', 'reorder_level': 40, 'unit_cost': 650.0, 'daily_usage': 8},
            {'sku': 'CLN-002', 'name': 'Mop & Bucket Set', 'category': 'Cleaning', 'reorder_level': 10, 'unit_cost': 950.0, 'daily_usage': 1},
            # NEAR STOCKOUT 5
            {'sku': 'CLN-003', 'name': 'Hand Sanitizer 500ml', 'category': 'Cleaning', 'reorder_level': 80, 'unit_cost': 120.0, 'daily_usage': 20},
            # Tools
            {'sku': 'TLS-001', 'name': 'Screwdriver Set 12pc', 'category': 'Tools', 'reorder_level': 15, 'unit_cost': 780.0, 'daily_usage': 2},
            {'sku': 'TLS-002', 'name': 'Cable Ties Assorted 200s', 'category': 'Tools', 'reorder_level': 50, 'unit_cost': 180.0, 'daily_usage': 10},
            {'sku': 'TLS-003', 'name': 'Digital Multimeter', 'category': 'Tools', 'reorder_level': 10, 'unit_cost': 1450.0, 'daily_usage': 1},
        ]

        prod_ids = {}  # sku -> ObjectId
        for prod in products_data:
            existing = db.products.find_one({'sku': prod['sku']})
            if existing:
                prod_ids[prod['sku']] = existing['_id']
            else:
                r = db.products.insert_one({**prod, 'created_at': now})
                prod_ids[prod['sku']] = r.inserted_id
        self.stdout.write('[OK] Products created')

        # ── 4. Stock levels (per warehouse) ───────────────────────────────────
        # Warehouse 0 = Delhi, 1 = Mumbai, 2 = Bengaluru
        stock_data = [
            # Normal stock
            ('ELE-001', 0, 280), ('ELE-001', 1, 150), ('ELE-001', 2, 95),
            ('ELE-002', 0, 120), ('ELE-002', 1, 85),
            ('ELE-003', 0, 200), ('ELE-003', 2, 110),
            ('ELE-004', 0, 60), ('ELE-004', 1, 45),
            ('ELE-005', 0, 450), ('ELE-005', 1, 320), ('ELE-005', 2, 200),
            # NEAR STOCKOUT: ELE-006 — only 18 units, daily_usage=6, reorder=20
            ('ELE-006', 0, 18),
            ('OFF-001', 0, 800), ('OFF-001', 1, 600),
            ('OFF-002', 0, 350), ('OFF-002', 2, 200),
            ('OFF-003', 0, 40), ('OFF-003', 1, 25),
            ('OFF-004', 0, 120), ('OFF-004', 2, 80),
            # NEAR STOCKOUT: OFF-005 — only 30 units, daily_usage=15, reorder=60
            ('OFF-005', 0, 30),
            ('PKG-001', 0, 85), ('PKG-001', 1, 60),
            ('PKG-002', 0, 1500), ('PKG-002', 1, 900), ('PKG-002', 2, 600),
            ('PKG-003', 0, 300), ('PKG-003', 1, 200),
            # NEAR STOCKOUT: PKG-004 — only 22 units, daily_usage=10, reorder=50
            ('PKG-004', 1, 22),
            ('SAF-001', 0, 350), ('SAF-001', 2, 200),
            ('SAF-002', 0, 45), ('SAF-002', 1, 30),
            ('SAF-003', 0, 80), ('SAF-003', 2, 50),
            # NEAR STOCKOUT: SAF-004 — only 8 units, daily_usage=2, reorder=15
            ('SAF-004', 0, 8),
            ('CLN-001', 0, 120), ('CLN-001', 2, 80),
            ('CLN-002', 0, 22), ('CLN-002', 1, 15),
            # NEAR STOCKOUT: CLN-003 — only 45 units, daily_usage=20, reorder=80
            ('CLN-003', 0, 45),
            ('TLS-001', 0, 35), ('TLS-001', 1, 20),
            ('TLS-002', 0, 180), ('TLS-002', 2, 120),
            ('TLS-003', 0, 18), ('TLS-003', 1, 12),
        ]

        for sku, wh_idx, qty in stock_data:
            pid = str(prod_ids[sku])
            wid = str(wh_ids[wh_idx])
            existing = db.stock.find_one({'product_id': pid, 'warehouse_id': wid})
            if not existing:
                db.stock.insert_one({
                    'product_id': pid,
                    'warehouse_id': wid,
                    'quantity': qty,
                    'created_at': now,
                    'updated_at': now,
                })
        self.stdout.write('[OK] Stock levels set')

        # ── 5. Shipments (10 total, 3 delayed) ───────────────────────────────
        def make_items(sku_qty_list):
            return [{'product_id': str(prod_ids[sku]), 'quantity': qty} for sku, qty in sku_qty_list]

        shipments_data = [
            # 3 DELAYED — will cause stockouts
            {
                'supplier': 'Alpha Electronics Pvt Ltd',
                'origin': 'Shenzhen, China',
                'destination_warehouse_id': str(wh_ids[0]),
                'items': make_items([('ELE-006', 300), ('ELE-002', 100)]),
                'eta': (now + timedelta(days=2)).strftime('%Y-%m-%d'),
                'status': 'delayed',
                'delay_days': 7,
                'created_at': now - timedelta(days=10),
                'tracking_events': [
                    {'location': 'Shanghai Port', 'status': 'in_transit', 'note': 'Shipment loaded', 'delay_days': 0, 'timestamp': (now - timedelta(days=10)).isoformat()},
                    {'location': 'Customs, Mumbai', 'status': 'delayed', 'note': 'Held at customs due to documentation issue', 'delay_days': 7, 'timestamp': (now - timedelta(days=3)).isoformat()},
                ],
            },
            {
                'supplier': 'OfficeMax Supplies',
                'origin': 'Pune, India',
                'destination_warehouse_id': str(wh_ids[0]),
                'items': make_items([('OFF-005', 500), ('OFF-001', 1000)]),
                'eta': (now + timedelta(days=1)).strftime('%Y-%m-%d'),
                'status': 'delayed',
                'delay_days': 5,
                'created_at': now - timedelta(days=8),
                'tracking_events': [
                    {'location': 'Pune Depot', 'status': 'ordered', 'note': 'Order confirmed', 'delay_days': 0, 'timestamp': (now - timedelta(days=8)).isoformat()},
                    {'location': 'Nashik Highway', 'status': 'delayed', 'note': 'Truck breakdown near Nashik, awaiting replacement', 'delay_days': 5, 'timestamp': (now - timedelta(days=2)).isoformat()},
                ],
            },
            {
                'supplier': 'SafeGuard Industries',
                'origin': 'Surat, India',
                'destination_warehouse_id': str(wh_ids[0]),
                'items': make_items([('SAF-004', 100), ('CLN-003', 400), ('PKG-004', 200)]),
                'eta': (now + timedelta(days=3)).strftime('%Y-%m-%d'),
                'status': 'delayed',
                'delay_days': 8,
                'created_at': now - timedelta(days=12),
                'tracking_events': [
                    {'location': 'Surat Factory', 'status': 'ordered', 'note': 'Production complete, awaiting dispatch', 'delay_days': 0, 'timestamp': (now - timedelta(days=12)).isoformat()},
                    {'location': 'Ahmedabad Hub', 'status': 'in_transit', 'note': 'Departed Surat', 'delay_days': 0, 'timestamp': (now - timedelta(days=6)).isoformat()},
                    {'location': 'Rajasthan Border', 'status': 'delayed', 'note': 'State border tax dispute causing detention', 'delay_days': 8, 'timestamp': (now - timedelta(days=1)).isoformat()},
                ],
            },
            # 4 normal in-transit
            {
                'supplier': 'TechParts Global',
                'origin': 'Hyderabad, India',
                'destination_warehouse_id': str(wh_ids[1]),
                'items': make_items([('ELE-003', 200), ('ELE-004', 150)]),
                'eta': (now + timedelta(days=5)).strftime('%Y-%m-%d'),
                'status': 'in_transit',
                'delay_days': 0,
                'created_at': now - timedelta(days=3),
                'tracking_events': [
                    {'location': 'Hyderabad Depot', 'status': 'in_transit', 'note': 'Departed on schedule', 'delay_days': 0, 'timestamp': (now - timedelta(days=3)).isoformat()},
                ],
            },
            {
                'supplier': 'PackRight Solutions',
                'origin': 'Silvassa, India',
                'destination_warehouse_id': str(wh_ids[2]),
                'items': make_items([('PKG-002', 2000), ('PKG-003', 500)]),
                'eta': (now + timedelta(days=4)).strftime('%Y-%m-%d'),
                'status': 'in_transit',
                'delay_days': 0,
                'created_at': now - timedelta(days=2),
                'tracking_events': [
                    {'location': 'Silvassa Plant', 'status': 'in_transit', 'note': 'Loaded and dispatched', 'delay_days': 0, 'timestamp': (now - timedelta(days=2)).isoformat()},
                ],
            },
            {
                'supplier': 'CleanPro Distributors',
                'origin': 'Kolkata, India',
                'destination_warehouse_id': str(wh_ids[2]),
                'items': make_items([('CLN-001', 200), ('CLN-002', 50)]),
                'eta': (now + timedelta(days=7)).strftime('%Y-%m-%d'),
                'status': 'in_transit',
                'delay_days': 0,
                'created_at': now - timedelta(days=1),
                'tracking_events': [
                    {'location': 'Kolkata Hub', 'status': 'in_transit', 'note': 'En route to Bengaluru', 'delay_days': 0, 'timestamp': (now - timedelta(days=1)).isoformat()},
                ],
            },
            {
                'supplier': 'ToolTech India',
                'origin': 'Chennai, India',
                'destination_warehouse_id': str(wh_ids[1]),
                'items': make_items([('TLS-001', 80), ('TLS-002', 300), ('TLS-003', 30)]),
                'eta': (now + timedelta(days=6)).strftime('%Y-%m-%d'),
                'status': 'in_transit',
                'delay_days': 0,
                'created_at': now - timedelta(days=4),
                'tracking_events': [
                    {'location': 'Chennai Port', 'status': 'in_transit', 'note': 'Collected by logistics partner', 'delay_days': 0, 'timestamp': (now - timedelta(days=4)).isoformat()},
                ],
            },
            # 3 ordered (not yet shipped)
            {
                'supplier': 'Global Safety Co',
                'origin': 'China',
                'destination_warehouse_id': str(wh_ids[2]),
                'items': make_items([('SAF-001', 500), ('SAF-003', 200)]),
                'eta': (now + timedelta(days=14)).strftime('%Y-%m-%d'),
                'status': 'ordered',
                'delay_days': 0,
                'created_at': now - timedelta(hours=12),
                'tracking_events': [],
            },
            {
                'supplier': 'ElecSource Ltd',
                'origin': 'Taiwan',
                'destination_warehouse_id': str(wh_ids[0]),
                'items': make_items([('ELE-001', 500), ('ELE-005', 800)]),
                'eta': (now + timedelta(days=18)).strftime('%Y-%m-%d'),
                'status': 'ordered',
                'delay_days': 0,
                'created_at': now - timedelta(hours=6),
                'tracking_events': [],
            },
            {
                'supplier': 'Office Galaxy',
                'origin': 'Noida, India',
                'destination_warehouse_id': str(wh_ids[1]),
                'items': make_items([('OFF-002', 400), ('OFF-003', 60), ('OFF-004', 200)]),
                'eta': (now + timedelta(days=10)).strftime('%Y-%m-%d'),
                'status': 'ordered',
                'delay_days': 0,
                'created_at': now - timedelta(hours=2),
                'tracking_events': [],
            },
        ]

        for ship_data in shipments_data:
            existing = db.shipments.find_one({
                'supplier': ship_data['supplier'],
                'eta': ship_data['eta'],
            })
            if not existing:
                ship_data['updated_at'] = now
                ship_data['created_by'] = 'admin@demo.com'
                db.shipments.insert_one(ship_data)

        self.stdout.write('[OK] Shipments created')

        # ── 6. Indexes ────────────────────────────────────────────────────────
        db.products.create_index('sku', unique=True)
        db.stock.create_index([('product_id', 1), ('warehouse_id', 1)], unique=True)
        db.shipments.create_index('status')
        db.ai_analyses.create_index('created_at')

        self.stdout.write(self.style.SUCCESS(
            '\n[SUCCESS] Demo data seeded successfully!\n'
            'Credentials:\n'
            '  admin@demo.com  / Demo@12345\n'
            '  manager@demo.com / Demo@12345\n'
            '\nRun `python manage.py runserver` to start the backend.'
        ))
