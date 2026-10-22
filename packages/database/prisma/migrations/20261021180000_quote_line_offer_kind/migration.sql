-- D-118: additive classification; existing rows stay NULL, with all amounts/FKs untouched.
CREATE TYPE "QuoteLineOfferKind" AS ENUM ('QUOTED', 'NOT_QUOTED', 'BONIFIED');
ALTER TABLE "procurement_quote_lines" ADD COLUMN "offerKind" "QuoteLineOfferKind";
