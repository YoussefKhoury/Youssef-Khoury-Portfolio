-- Customer receivables and collections analysis
-- SQL Server syntax; source data is synthetic portfolio data.

WITH invoice_risk AS (
    SELECT
        i.invoice_id,
        i.customer_id,
        i.invoice_amount,
        i.amount_paid,
        i.outstanding_amount,
        i.due_date,
        i.days_overdue,
        i.dispute_flag,
        i.promise_date,
        i.promise_amount,
        CASE
            WHEN i.outstanding_amount = 0 THEN 'Paid'
            WHEN i.days_overdue <= 0 THEN 'Current'
            WHEN i.days_overdue <= 30 THEN '1-30'
            WHEN i.days_overdue <= 60 THEN '31-60'
            WHEN i.days_overdue <= 90 THEN '61-90'
            ELSE '90+'
        END AS aging_bucket,
        CASE
            WHEN i.dispute_flag = 'Yes' THEN 'Resolve dispute'
            WHEN i.days_overdue > 90 AND i.promise_amount = 0 THEN 'Escalate immediately'
            WHEN i.promise_date < CAST(GETDATE() AS date) AND i.outstanding_amount > 0 THEN 'Broken promise follow-up'
            WHEN i.days_overdue > 30 THEN 'Collection call'
            ELSE 'Monitor'
        END AS next_action
    FROM dbo.invoices AS i
)
SELECT
    c.customer_name,
    r.aging_bucket,
    r.next_action,
    COUNT(*) AS invoice_count,
    SUM(r.outstanding_amount) AS outstanding_amount,
    MAX(r.days_overdue) AS max_days_overdue,
    SUM(r.promise_amount) AS promise_amount
FROM invoice_risk AS r
JOIN dbo.customers AS c ON c.customer_id = r.customer_id
WHERE r.outstanding_amount > 0
GROUP BY c.customer_name, r.aging_bucket, r.next_action
ORDER BY outstanding_amount DESC;
