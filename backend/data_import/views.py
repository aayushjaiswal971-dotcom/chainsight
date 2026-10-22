"""
data_import views — Import Center backend.
All endpoints require JWT auth; commit/remove_demo requires admin or manager role.
"""
import csv
import io
import uuid
from datetime import datetime, timedelta

from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser

from common.mongo import get_db
from .file_parser import parse_file, MAX_FILE_SIZE, MAX_ROWS
from .column_mapper import auto_map
from .validators import (
    validate_warehouses, validate_products, validate_inventory,
    validate_shipments, validate_tracking_events,
    commit_warehouses, commit_products, commit_inventory,
    commit_shipments, commit_tracking_events,
)

# ─── Entity Config ────────────────────────────────────────────────────────────

ENTITY_CONFIG = {
    'warehouses': {
        'label': 'Warehouses',
        'required_fields': ['code', 'name'],
        'all_fields': ['code', 'name', 'city', 'state'],
        'example_rows': [
            ['MUM-01', 'Mumbai Central Hub', 'Mumbai', 'Maharashtra'],
            ['DEL-01', 'Delhi North Warehouse', 'Delhi', 'Delhi'],
        ],
    },
    'products': {
        'label': 'Products',
        'required_fields': ['sku', 'name'],
        'all_fields': ['sku', 'name', 'category', 'unit', 'unit_cost', 'reorder_level', 'daily_usage'],
        'example_rows': [
            ['SKU-001', 'Industrial Widget A', 'Electronics', 'pcs', '450.00', '100', '12.5'],
            ['SKU-002', 'Steel Bolt M8', 'Hardware', 'box', '85.50', '500', '25.0'],
        ],
    },
    'inventory': {
        'label': 'Inventory',
        'required_fields': ['sku', 'warehouse_code', 'quantity'],
        'all_fields': ['sku', 'warehouse_code', 'quantity'],
        'example_rows': [
            ['SKU-001', 'MUM-01', '250'],
            ['SKU-002', 'DEL-01', '1200'],
        ],
    },
    'shipments': {
        'label': 'Shipments',
        'required_fields': ['shipment_id', 'destination_warehouse_code', 'sku', 'quantity'],
        'all_fields': ['shipment_id', 'supplier', 'carrier', 'origin', 'destination_warehouse_code',
                       'status', 'original_eta', 'current_eta', 'sku', 'quantity'],
        'example_rows': [
            ['SHP-2026-001', 'Acme Supplies Ltd', 'FedEx', 'Chennai', 'MUM-01', 'in_transit', '2026-11-01', '2026-11-03', 'SKU-EL-001', '50'],
            ['SHP-2026-001', 'Acme Supplies Ltd', 'FedEx', 'Chennai', 'MUM-01', 'in_transit', '2026-11-01', '2026-11-03', 'SKU-HW-001', '100'],
            ['SHP-2026-002', 'Global Parts Co', 'DHL', 'Pune', 'DEL-01', 'ordered', '2026-11-15', '2026-11-15', 'SKU-PK-001', '500'],
        ],
    },
    'tracking_events': {
        'label': 'Tracking Events',
        'required_fields': ['shipment_id', 'timestamp', 'location', 'status'],
        'all_fields': ['shipment_id', 'timestamp', 'location', 'status', 'note'],
        'example_rows': [
            ['SHP-2026-001', '2026-10-28', 'Chennai Port', 'in_transit', 'Departed origin port'],
            ['SHP-2026-001', '2026-10-30', 'Mumbai Gateway', 'in_transit', 'Arrived at destination hub'],
        ],
    },
}

ENTITY_VALIDATORS = {
    'warehouses': validate_warehouses,
    'products': validate_products,
    'inventory': validate_inventory,
    'shipments': validate_shipments,
    'tracking_events': validate_tracking_events,
}

ENTITY_COMMITTERS = {
    'warehouses': commit_warehouses,
    'products': commit_products,
    'inventory': commit_inventory,
    'shipments': commit_shipments,
    'tracking_events': commit_tracking_events,
}

NEEDS_DB_VALIDATION = {'inventory', 'shipments', 'tracking_events'}


def _ensure_ttl_index(db):
    """Ensure import_jobs collection has TTL index (1 hour)."""
    try:
        db.import_jobs.create_index('expires_at', expireAfterSeconds=0)
    except Exception:
        pass


def _require_import_role(user) -> bool:
    """Admin and manager can import."""
    return getattr(user, 'role', None) in ('admin', 'manager')


from rest_framework.renderers import BaseRenderer, JSONRenderer


class CSVRenderer(BaseRenderer):
    media_type = 'text/csv'
    format = 'csv'
    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class XLSXRenderer(BaseRenderer):
    media_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    format = 'xlsx'
    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


# ─── Template Download ────────────────────────────────────────────────────────

class TemplateDownloadView(APIView):
    """GET /api/import/templates/{entity}?format=csv|xlsx"""
    permission_classes = [IsAuthenticated]
    renderer_classes = [CSVRenderer, XLSXRenderer, JSONRenderer]

    def get(self, request, entity):
        if entity not in ENTITY_CONFIG:
            return Response({'error': f"Unknown entity '{entity}'"}, status=400)
        fmt = request.query_params.get('format', 'csv').lower()
        if fmt not in ('csv', 'xlsx'):
            return Response({'error': "format must be csv or xlsx"}, status=400)

        config = ENTITY_CONFIG[entity]
        headers = config['all_fields']
        example_rows = config['example_rows']

        if fmt == 'csv':
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="template_{entity}.csv"'
            writer = csv.writer(response)
            writer.writerow(headers)
            for row in example_rows:
                writer.writerow(row)
            return response
        else:
            import openpyxl
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = entity
            ws.append(headers)
            for row in example_rows:
                ws.append(row)
            out = io.BytesIO()
            wb.save(out)
            out.seek(0)
            response = HttpResponse(
                out.read(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="template_{entity}.xlsx"'
            return response


# ─── Preview ─────────────────────────────────────────────────────────────────

class ImportPreviewView(APIView):
    """POST /api/import/{entity}/preview — upload file, get job_id + suggested mapping."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, entity):
        if entity not in ENTITY_CONFIG:
            return Response({'error': f"Unknown entity '{entity}'"}, status=400)
        if not _require_import_role(request.user):
            return Response({'error': 'Only admin or manager can import.'}, status=403)

        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response({'error': 'file is required'}, status=400)

        file_bytes = uploaded_file.read()
        filename = uploaded_file.name

        try:
            headers, rows = parse_file(filename, file_bytes)
        except ValueError as e:
            return Response({'error': str(e)}, status=400)
        except Exception as e:
            return Response({'error': f'Parse error: {str(e)}'}, status=400)

        db = get_db()
        _ensure_ttl_index(db)

        job_id = str(uuid.uuid4())
        # Build rows as list of dicts using header indices
        rows_as_dicts = [dict(zip(headers, row)) for row in rows]

        sample_rows = rows_as_dicts[:20]

        db.import_jobs.insert_one({
            'job_id': job_id,
            'entity': entity,
            'filename': filename,
            'headers': headers,
            'rows': rows_as_dicts,
            'total_rows': len(rows_as_dicts),
            'created_by': request.user.email,
            'created_at': datetime.utcnow(),
            'expires_at': datetime.utcnow() + timedelta(hours=1),
        })

        config = ENTITY_CONFIG[entity]
        suggested_mapping = auto_map(headers, config['all_fields'])

        return Response({
            'job_id': job_id,
            'headers': headers,
            'suggested_mapping': suggested_mapping,
            'total_rows': len(rows_as_dicts),
            'sample_rows': sample_rows,
            'filename': filename,
        })


# ─── Validate ────────────────────────────────────────────────────────────────

class ImportValidateView(APIView):
    """POST /api/import/{entity}/validate — validate with given mapping."""
    permission_classes = [IsAuthenticated]

    def post(self, request, entity):
        if entity not in ENTITY_CONFIG:
            return Response({'error': f"Unknown entity '{entity}'"}, status=400)

        job_id = request.data.get('job_id')
        mapping = request.data.get('mapping', {})

        if not job_id:
            return Response({'error': 'job_id is required'}, status=400)

        db = get_db()
        job = db.import_jobs.find_one({'job_id': job_id})
        if not job:
            return Response({'error': 'Import job not found or expired. Please re-upload.'}, status=404)

        # Remap rows using user-provided column mapping
        raw_rows = job.get('rows', [])
        config = ENTITY_CONFIG[entity]

        # Apply mapping: {target_field: source_header}
        mapped_rows = []
        for raw_row in raw_rows:
            mapped = {}
            for target_field in config['all_fields']:
                source_header = mapping.get(target_field)
                mapped[target_field] = raw_row.get(source_header, '') if source_header else ''
            mapped_rows.append(mapped)

        # Run entity-specific validation
        validator = ENTITY_VALIDATORS[entity]
        if entity in NEEDS_DB_VALIDATION:
            valid_rows, error_rows = validator(mapped_rows, db)
        else:
            valid_rows, error_rows = validator(mapped_rows)

        warnings = []
        if entity == 'products':
            missing_usage = sum(1 for r in valid_rows if not r.get('daily_usage'))
            if missing_usage > 0:
                total = len(valid_rows) + len(error_rows)
                pct = (missing_usage / total * 100) if total else 0
                if pct > 20:
                    warnings.append(f"{missing_usage} products ({pct:.0f}%) are missing daily_usage. Risk analysis will label those as 'Insufficient usage data'.")

        # Store mapped rows in job for commit
        db.import_jobs.update_one({'job_id': job_id}, {'$set': {'mapped_rows': mapped_rows, 'mapping': mapping}})

        return Response({
            'valid_rows': len(valid_rows),
            'error_rows': len(error_rows),
            'total_rows': len(mapped_rows),
            'warnings': warnings,
            'errors': error_rows,
            'preview_rows': valid_rows[:20],
        })


# ─── Commit ──────────────────────────────────────────────────────────────────

class ImportCommitView(APIView):
    """POST /api/import/{entity}/commit — execute the import."""
    permission_classes = [IsAuthenticated]

    def post(self, request, entity):
        if entity not in ENTITY_CONFIG:
            return Response({'error': f"Unknown entity '{entity}'"}, status=400)
        if not _require_import_role(request.user):
            return Response({'error': 'Only admin or manager can import.'}, status=403)

        job_id = request.data.get('job_id')
        mapping = request.data.get('mapping', {})
        mode = request.data.get('mode', 'add_only')  # 'add_only' or 'upsert'
        remove_demo = request.data.get('remove_demo_data', False)

        if mode not in ('add_only', 'upsert'):
            return Response({'error': "mode must be 'add_only' or 'upsert'"}, status=400)
        if remove_demo and getattr(request.user, 'role', None) != 'admin':
            return Response({'error': 'Only admin can remove demo data.'}, status=403)

        db = get_db()
        job = db.import_jobs.find_one({'job_id': job_id})
        if not job:
            return Response({'error': 'Import job not found or expired. Please re-upload.'}, status=404)

        # Re-apply mapping to get clean rows
        raw_rows = job.get('rows', [])
        config = ENTITY_CONFIG[entity]
        mapped_rows = []
        for raw_row in raw_rows:
            mapped = {}
            for target_field in config['all_fields']:
                source_header = mapping.get(target_field)
                mapped[target_field] = raw_row.get(source_header, '') if source_header else ''
            mapped_rows.append(mapped)

        # Validate again
        validator = ENTITY_VALIDATORS[entity]
        if entity in NEEDS_DB_VALIDATION:
            valid_rows, error_rows = validator(mapped_rows, db)
        else:
            valid_rows, error_rows = validator(mapped_rows)

        # Remove demo data if requested (admin only)
        demo_deleted = 0
        if remove_demo:
            collection_map = {
                'warehouses': 'warehouses',
                'products': 'products',
                'inventory': 'stock',
                'shipments': 'shipments',
                'tracking_events': None,
            }
            coll_name = collection_map.get(entity)
            if coll_name:
                result = db[coll_name].delete_many({'is_demo': True})
                demo_deleted = result.deleted_count

        # Commit valid rows
        committer = ENTITY_COMMITTERS[entity]
        result = committer(valid_rows, mode, job_id, request.user.email, db)

        # Record import history
        history_doc = {
            'job_id': job_id,
            'entity': entity,
            'filename': job.get('filename', ''),
            'mode': mode,
            'created': result['created'],
            'updated': result['updated'],
            'skipped': result['skipped'],
            'failed': result['failed'] + len(error_rows),
            'demo_deleted': demo_deleted,
            'total_rows': len(raw_rows),
            'error_count': len(error_rows),
            'user': request.user.email,
            'status': 'completed',
            'errors': error_rows,
            'created_at': datetime.utcnow(),
        }
        db.import_history.insert_one(history_doc)
        history_id = str(history_doc.get('_id', ''))

        return Response({
            'created': result['created'],
            'updated': result['updated'],
            'skipped': result['skipped'],
            'failed': result['failed'] + len(error_rows),
            'demo_deleted': demo_deleted,
            'error_count': len(error_rows),
            'job_id': job_id,
            'history_id': history_id,
            'error_report_url': f'/api/import/jobs/{job_id}/errors',
        })


# ─── Import Jobs / History ────────────────────────────────────────────────────

class ImportJobListView(APIView):
    """GET /api/import/jobs — import history."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        db = get_db()
        cursor = db.import_history.find().sort('created_at', -1).limit(50)
        results = []
        for doc in cursor:
            doc['id'] = str(doc.pop('_id'))
            doc.pop('errors', None)  # exclude full error list from list view
            results.append(doc)
        return Response(results)


class ImportJobErrorsView(APIView):
    """GET /api/import/jobs/{id}/errors — download error report as CSV."""
    permission_classes = [IsAuthenticated]
    renderer_classes = [CSVRenderer, JSONRenderer]

    def get(self, request, job_id):
        db = get_db()
        doc = db.import_history.find_one({'job_id': job_id})
        if not doc:
            return Response({'error': 'Job not found'}, status=404)

        errors = doc.get('errors', [])
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="import_errors_{job_id[:8]}.csv"'
        writer = csv.writer(response)
        writer.writerow(['Row', 'Column', 'Problem', 'Value'])
        for e in errors:
            writer.writerow([e.get('row', ''), e.get('column', ''), e.get('message', ''), e.get('value', '')])
        return response
