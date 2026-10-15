from django.urls import path
from .views import (
    TemplateDownloadView,
    ImportPreviewView,
    ImportValidateView,
    ImportCommitView,
    ImportJobListView,
    ImportJobErrorsView,
)

urlpatterns = [
    path('import/templates/<str:entity>', TemplateDownloadView.as_view(), name='import-template'),
    path('import/<str:entity>/preview', ImportPreviewView.as_view(), name='import-preview'),
    path('import/<str:entity>/validate', ImportValidateView.as_view(), name='import-validate'),
    path('import/<str:entity>/commit', ImportCommitView.as_view(), name='import-commit'),
    path('import/jobs', ImportJobListView.as_view(), name='import-jobs'),
    path('import/jobs/<str:job_id>/errors', ImportJobErrorsView.as_view(), name='import-job-errors'),
]
