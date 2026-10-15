"""
pytest configuration for ChainSight backend.
"""
import django
from django.conf import settings


def pytest_configure():
    if not settings.configured:
        settings.configure(
            DJANGO_SETTINGS_MODULE='config.settings',
        )
