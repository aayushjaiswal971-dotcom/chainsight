from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/', include('inventory.urls')),
    path('api/', include('shipments.urls')),
    path('api/', include('ai_analyst.urls')),
    path('api/dashboard/', include('inventory.dashboard_urls')),
    path('api/', include('data_import.urls')),
]
