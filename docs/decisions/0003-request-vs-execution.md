# ADR 0003: Request and execution are distinct

A request identifies input. An execution identifies one processing attempt. This preserves stable request identity across future retries, fallback, replay, and evaluation while allowing every attempt to be observed and cancelled independently.
