"""
Rule-based fallback analyst when Gemini is unavailable.
days_until_stockout = current_stock / daily_usage  (adjusted for delays)
"""
from datetime import datetime, timezone


def run_fallback(context: dict) -> dict:
    """
    context keys:
        skus: list of {sku, name, stock, daily_usage, reorder_level}
        shipments: list of {id, status, delay_days, eta, items: [{product_id, sku, quantity}]}
        sku_map: dict product_id -> sku info
    """
    skus = context.get('skus', [])
    shipments = context.get('shipments', [])
    sku_map = context.get('sku_map', {})

    # Build delayed shipment incoming stock map: product_id -> days_delay
    delayed_incoming = {}
    for ship in shipments:
        if ship['status'] in ('delayed', 'in_transit'):
            delay = ship.get('delay_days', 0)
            for item in ship.get('items', []):
                pid = item['product_id']
                if pid not in delayed_incoming or delayed_incoming[pid]['delay'] < delay:
                    delayed_incoming[pid] = {
                        'delay': delay,
                        'qty': item['quantity'],
                        'shipment_id': ship['id'],
                    }

    at_risk_skus = []
    for sku_info in skus:
        stock = sku_info.get('stock', 0)
        daily = max(sku_info.get('daily_usage', 1), 0.1)
        reorder = sku_info.get('reorder_level', 0)
        pid = sku_info.get('product_id', '')

        # Days until stockout without any incoming
        days_until_stockout = stock / daily

        cause = 'Normal consumption rate'
        severity = 'low'

        if pid in delayed_incoming:
            delay = delayed_incoming[pid]['delay']
            incoming_qty = delayed_incoming[pid]['qty']
            # If delay pushes us below reorder before shipment arrives
            stock_at_arrival = stock - daily * delay
            if stock_at_arrival <= reorder:
                days_until_stockout = max(0, stock / daily)
                cause = f"Delayed shipment ({delay}d delay), stock will hit reorder before arrival"
                severity = 'high' if days_until_stockout < 3 else 'medium'
        elif stock <= reorder:
            cause = 'Already below reorder level'
            severity = 'high' if stock <= reorder * 0.5 else 'medium'
        elif stock < reorder * 2:
            cause = 'Approaching reorder level'
            severity = 'low'

        if severity in ('medium', 'high') or stock <= reorder:
            suggested_qty = max(int(daily * 14), reorder * 2)
            at_risk_skus.append({
                'sku': sku_info['sku'],
                'days_until_stockout': round(days_until_stockout, 1),
                'cause': cause,
                'severity': severity,
                'recommended_action': (
                    'Place emergency reorder immediately' if severity == 'high'
                    else 'Schedule reorder this week'
                ),
                'suggested_reorder_qty': suggested_qty,
            })

    # Sort by severity then days_until_stockout
    severity_order = {'high': 0, 'medium': 1, 'low': 2}
    at_risk_skus.sort(key=lambda x: (severity_order[x['severity']], x['days_until_stockout']))

    shipment_actions = []
    for ship in shipments:
        if ship['status'] == 'delayed':
            action = 'expedite' if ship.get('delay_days', 0) > 3 else 'monitor'
            shipment_actions.append({
                'shipment_id': ship['id'],
                'action': action,
                'reason': f"Shipment delayed by {ship.get('delay_days', 0)} days",
            })
        elif ship['status'] == 'in_transit':
            shipment_actions.append({
                'shipment_id': ship['id'],
                'action': 'monitor',
                'reason': 'Currently in transit, monitor for delays',
            })

    overall_risk = 'low'
    if any(s['severity'] == 'high' for s in at_risk_skus):
        overall_risk = 'high'
    elif any(s['severity'] == 'medium' for s in at_risk_skus):
        overall_risk = 'medium'

    summary = (
        f"Rule-based analysis: {len(at_risk_skus)} SKUs at risk. "
        f"Overall supply chain risk is {overall_risk}. "
        f"{sum(1 for s in shipments if s['status'] == 'delayed')} delayed shipments detected."
    )

    return {
        'summary': summary,
        'overall_risk': overall_risk,
        'at_risk_skus': at_risk_skus,
        'shipment_actions': shipment_actions,
        'source': 'fallback',
    }
