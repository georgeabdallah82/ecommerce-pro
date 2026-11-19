-- "Once per customer" discount codes (Admin > Discounts): an account, email or phone number can use the code on one order that is not cancelled.
ALTER TABLE "Coupon" ADD COLUMN "oncePerCustomer" BOOLEAN NOT NULL DEFAULT false;
