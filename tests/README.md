# Production Regression QA

This directory is reserved for deterministic production-regression tests covering authentication, product reads, checkout validation, inventory reservation, order cancellation, and payment/refund transitions.

The tests must use isolated test data and must never mutate the live production database.
