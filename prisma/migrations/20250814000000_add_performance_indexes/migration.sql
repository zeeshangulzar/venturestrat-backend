-- Add critical performance indexes for filtering queries
-- This migration adds indexes to optimize the 'some' queries used in investor filters

-- Index for filtering by past investments
CREATE INDEX IF NOT EXISTS "investor_past_investments_past_investment_investor_idx" 
ON "public"."investor_past_investments"("past_investment_id", "investor_id");

-- Index for filtering by markets
CREATE INDEX IF NOT EXISTS "investor_markets_market_investor_idx" 
ON "public"."investor_markets"("market_id", "investor_id");

-- Index for filtering by stages
CREATE INDEX IF NOT EXISTS "investor_stages_stage_investor_idx" 
ON "public"."investor_stages"("stage_id", "investor_id");

-- Index for filtering by investor types
CREATE INDEX IF NOT EXISTS "investor_investor_types_investor_type_investor_idx" 
ON "public"."investor_investor_types"("investor_type_id", "investor_id");
