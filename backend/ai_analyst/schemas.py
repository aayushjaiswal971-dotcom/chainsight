"""
Pydantic schemas for Gemini AI analysis response validation.
"""
from typing import List, Literal, Optional
from pydantic import BaseModel, field_validator


class AtRiskSku(BaseModel):
    sku: str
    days_until_stockout: float
    cause: str
    severity: Literal['low', 'medium', 'high']
    recommended_action: str
    suggested_reorder_qty: int


class ShipmentAction(BaseModel):
    shipment_id: str
    action: Literal['expedite', 'reroute', 'monitor', 'none']
    reason: str


class RiskAnalysisSchema(BaseModel):
    summary: str
    overall_risk: Literal['low', 'medium', 'high']
    at_risk_skus: List[AtRiskSku]
    shipment_actions: List[ShipmentAction]
    source: Optional[str] = 'gemini'


RESPONSE_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "overall_risk": {"type": "string", "enum": ["low", "medium", "high"]},
        "at_risk_skus": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "sku": {"type": "string"},
                    "days_until_stockout": {"type": "number"},
                    "cause": {"type": "string"},
                    "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                    "recommended_action": {"type": "string"},
                    "suggested_reorder_qty": {"type": "integer"},
                },
                "required": ["sku", "days_until_stockout", "cause", "severity",
                             "recommended_action", "suggested_reorder_qty"],
            }
        },
        "shipment_actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "shipment_id": {"type": "string"},
                    "action": {"type": "string", "enum": ["expedite", "reroute", "monitor", "none"]},
                    "reason": {"type": "string"},
                },
                "required": ["shipment_id", "action", "reason"],
            }
        },
    },
    "required": ["summary", "overall_risk", "at_risk_skus", "shipment_actions"],
}
