-- The previous live visitor feature stored proxy-derived coordinates.
-- Clear them before enabling consent-based browser coordinates so any
-- coordinate visible in the admin map is from an explicit visitor grant.
UPDATE "LiveVisitorSession"
SET "latitude" = NULL,
    "longitude" = NULL;
