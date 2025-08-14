-- CreateIndex
CREATE INDEX "addresses_state_idx" ON "public"."addresses"("state");

-- CreateIndex
CREATE INDEX "addresses_city_state_idx" ON "public"."addresses"("city", "state");

-- CreateIndex
CREATE INDEX "addresses_location_hierarchy_idx" ON "public"."addresses"("country", "state", "city");

-- CreateIndex
CREATE INDEX "investor_emails_status_idx" ON "public"."investor_emails"("status");

-- CreateIndex
CREATE INDEX "investor_investor_types_created_at_idx" ON "public"."investor_investor_types"("createdAt");

-- CreateIndex
CREATE INDEX "investor_markets_created_at_idx" ON "public"."investor_markets"("createdAt");

-- CreateIndex
CREATE INDEX "investor_past_investments_created_at_idx" ON "public"."investor_past_investments"("createdAt");

-- CreateIndex
CREATE INDEX "investor_stages_created_at_idx" ON "public"."investor_stages"("createdAt");

-- CreateIndex
CREATE INDEX "investors_created_at_id_idx" ON "public"."investors"("createdAt", "id");
