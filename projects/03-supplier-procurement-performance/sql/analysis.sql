-- Supplier procurement and delivery-performance analysis
-- SQL Server syntax; source data is synthetic portfolio data.

WITH supplier_metrics AS (
    SELECT
        po.supplier_id,
        SUM(po.ordered_value) AS purchase_spend,
        AVG(CASE WHEN po.actual_delivery_date <= po.promised_delivery_date
                      AND po.received_quantity >= po.ordered_quantity
                 THEN 1.0 ELSE 0.0 END) AS otif_rate,
        SUM(po.received_quantity) * 1.0 / NULLIF(SUM(po.ordered_quantity), 0) AS fill_rate,
        AVG(CASE WHEN po.actual_delivery_date > po.promised_delivery_date
                 THEN DATEDIFF(day, po.promised_delivery_date, po.actual_delivery_date)
                 ELSE 0 END) AS avg_delay_days,
        SUM(po.actual_unit_price * po.received_quantity)
            / NULLIF(SUM(po.ordered_unit_price * po.received_quantity), 0) - 1 AS price_variance,
        SUM(po.defect_quantity) * 1.0 / NULLIF(SUM(po.received_quantity), 0) AS defect_rate
    FROM dbo.purchase_orders AS po
    GROUP BY po.supplier_id
)
SELECT
    s.supplier_name,
    s.category,
    m.purchase_spend,
    m.otif_rate,
    m.fill_rate,
    m.avg_delay_days,
    m.price_variance,
    m.defect_rate,
    (1 - m.otif_rate) * 40
      + m.avg_delay_days * 3
      + ABS(m.price_variance) * 100
      + m.defect_rate * 100 AS risk_score
FROM supplier_metrics AS m
JOIN dbo.suppliers AS s ON s.supplier_id = m.supplier_id
ORDER BY risk_score DESC;
