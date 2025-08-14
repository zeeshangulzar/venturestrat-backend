-- CreateIndex
CREATE INDEX "addresses_state_idx" ON "public"."addresses"("state");

-- CreateIndex
CREATE INDEX "addresses_city_state_idx" ON "public"."addresses"("city", "state");

-- CreateIndex
CREATE INDEX "addresses_location_hierarchy_idx" ON "public"."addresses"("country", "state", "city");

-- CreateIndex
CREATE INDEX "investor_emails_status_idx" ON "public"."investor_emails"("status");

-- CreateIndex
CREATE INDEX "investors_created_at_id_idx" ON "public"."investors"("createdAt", "id");

-- CreateIndex for performance on junction tables
CREATE INDEX "investor_past_investments_past_investment_investor_idx" ON "public"."investor_past_investments"("past_investment_id", "investor_id");

CREATE INDEX "investor_markets_market_investor_idx" ON "public"."investor_markets"("market_id", "investor_id");

CREATE INDEX "investor_stages_stage_investor_idx" ON "public"."investor_stages"("stage_id", "investor_id");

CREATE INDEX "investor_investor_types_investor_type_investor_idx" ON "public"."investor_investor_types"("investor_type_id", "investor_id");
