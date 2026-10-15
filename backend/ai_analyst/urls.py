from django.urls import path
from .views import AnalyzeRiskView, AnalysisHistoryView

urlpatterns = [
    path('ai/analyze-risk', AnalyzeRiskView.as_view(), name='analyze-risk'),
    path('ai/analyses', AnalysisHistoryView.as_view(), name='analysis-history'),
]
