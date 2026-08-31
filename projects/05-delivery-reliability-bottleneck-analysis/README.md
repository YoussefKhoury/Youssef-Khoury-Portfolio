# Delivery Reliability & Bottleneck Analysis

## Executive summary

I analyzed 108,449 item-level records from the public Olist marketplace dataset and normalized them to 94,480 unique orders. 8.0% missed the estimated delivery timestamp; late orders were a median 5.8 days late. Carrier-handoff age was a useful early-warning flag: orders handed off after seven days had a 22.8% late rate versus 5.0% within two days. It did not explain the sharp monthly spikes, including 21.1% late in Mar 2018 with a median handoff of 2.4 days, so root cause remains unresolved.

## Business question

Where should operations focus first to reduce late deliveries and protect customer satisfaction?

## Method

1. Normalized the item-level source to one record per order to prevent multi-item orders from inflating delivery counts.
2. Defined a late order as `delivery_delay_hours > 0`, matching the source definition of actual minus estimated delivery time.
3. Excluded 186 orders with conflicting review scores from satisfaction comparisons only.
4. Restricted seller and route analysis to 93,247 single-seller orders so one delivery outcome was not attributed to multiple sellers.
5. Ranked sellers, routes, states, and categories by excess late orders relative to the 8.0% network rate, balancing volume and reliability.
6. Used descriptive comparisons only; no causal claims were made.

## Findings

- 7,543 of 94,480 orders were late (8.0%); 6.7% were more than 24 hours late.
- Late orders averaged 2.57/5 versus 4.30/5 for on-time orders. Low reviews occurred on 54.0% of late orders versus 9.1% of on-time orders.
- Late delivery spiked to 14.0% in Nov 2017, 16.0% in Feb 2018, and 21.1% in Mar 2018 while monthly median handoff time stayed within 1.8-3.2 days.
- Purchase-to-carrier handoff beyond seven days was associated with 4.6x the late-delivery rate of handoff within two days, making it a practical warning threshold rather than a proven cause.
- The highest-excess high-volume seller contributed roughly 56 more late orders than expected at the network rate (Seller 06A2C3 in the audit table).
- SP to RJ was the largest volume-adjusted seller-to-customer state route gap at roughly 587 excess late orders.
- RJ had the largest volume-adjusted state opportunity: roughly 640 excess late orders versus the network rate.
- Health Beauty had the largest excess late-order volume among categories with at least 500 orders.

## Recommendations

1. Apply seller-neutral handoff alerts at four days and escalation at seven, then rank the queue by excess late-order volume.
2. Investigate the Nov 2017 and Feb-Mar 2018 spikes with promised-service windows, carrier scans, warehouse events, and seller deadlines before assigning root cause.
3. Cross-audit SP to RJ, RJ deliveries, and the Health Beauty category, then contact customers before likely promise-date misses.

## Limitations

- The anonymized Brazilian data covers 2016-2018, so the findings demonstrate analytical method rather than current company performance.
- The source lacks promised-service tiers, carrier scans, warehouse events, and last-mile checkpoints; it cannot explain the monthly spikes or prove which party caused a delay.
- Seller analysis excludes multi-seller orders, retaining 98.7% of complete orders for unambiguous seller attribution.
- Small positive delays can include deliveries later on the promised calendar date because the estimate is timestamp-based.
- Multi-category orders contribute once to each applicable category.

## Sources

- Original dataset: https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce
- Cleaned analytical derivative: https://huggingface.co/datasets/miminmoons/olist-ecommerce-for-delivery-and-review-prediction
