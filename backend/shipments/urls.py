from django.urls import path
from .views import (
    ShipmentListView, ShipmentDetailView,
    ShipmentStatusView, ShipmentEventsView, NLPEventView,
)

urlpatterns = [
    path('shipments', ShipmentListView.as_view(), name='shipment-list'),
    path('shipments/<str:shipment_id>', ShipmentDetailView.as_view(), name='shipment-detail'),
    path('shipments/<str:shipment_id>/status', ShipmentStatusView.as_view(), name='shipment-status'),
    path('shipments/<str:shipment_id>/events', ShipmentEventsView.as_view(), name='shipment-events'),
    path('shipments/<str:shipment_id>/parse-note', NLPEventView.as_view(), name='shipment-parse-note'),
]
