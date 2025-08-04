#!/usr/bin/env bash
pnpm install
pnpm run generate
pnpm run migrate
pnpm run build
cp src/seed/broker.json dist/seed/
node dist/seed/seed.js

