# Interview preparation

## Before you present it

Do not claim this as your work until you can reproduce the analysis, explain every metric, and defend the caveats. A dashboard you cannot explain makes you look worse, not better.

## 60-second explanation

I analyzed a public Brazilian e-commerce dataset to identify where delivery risk concentrated. I normalized 108,449 item-level rows to 94,480 unique orders and found an overall late rate of 8.0%. Handoff after seven days flagged a 22.8% late rate versus 5.0% within two days, but that did not explain the monthly pattern: Mar 2018 reached 21.1% late with a median handoff of only 2.4 days. I therefore treated handoff age as an escalation signal, ranked sellers, routes, states, and categories by excess late volume, and recommended focused audits plus proactive customer recovery. The conclusion is deliberately limited: the data shows where to look and when to intervene, not who caused the delay.

## Questions you must be able to answer

1. Why did you aggregate to order level? Multi-item orders otherwise inflate delivery counts.
2. Why not rank only by late rate? Tiny regions can show unstable rates; excess late orders balances exposure and performance.
3. Does slow handoff cause late delivery? Not proven. It is an order-level warning flag and does not explain the monthly spikes.
4. Why exclude some reviews? 186 orders had conflicting scores; excluding them avoids arbitrary selection.
5. Why exclude multi-seller orders from seller rankings? One final delivery outcome should not be assigned to several sellers; the retained single-seller population covers 98.7% of complete orders.
6. What would you request next? Carrier scans, warehouse events, promised-service tier, seller handoff deadlines, and last-mile timestamps.
7. What is the main caveat? The data is historical and anonymized; this demonstrates method, not current Olist performance.
