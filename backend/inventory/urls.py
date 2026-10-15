from django.urls import path
from .views import (
    WarehouseListView, WarehouseDetailView,
    ProductListView, ProductDetailView,
    InventoryListView, InventoryAdjustView,
    InventoryCSVView,
)

urlpatterns = [
    path('warehouses', WarehouseListView.as_view(), name='warehouse-list'),
    path('warehouses/<str:warehouse_id>', WarehouseDetailView.as_view(), name='warehouse-detail'),
    path('products', ProductListView.as_view(), name='product-list'),
    path('products/<str:product_id>', ProductDetailView.as_view(), name='product-detail'),
    path('inventory', InventoryListView.as_view(), name='inventory-list'),
    path('inventory/adjust', InventoryAdjustView.as_view(), name='inventory-adjust'),
    path('inventory/export', InventoryCSVView.as_view(), name='inventory-export'),
]
