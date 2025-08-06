#!/usr/bin/env bash
pnpm install
pnpm run generate
pnpm run migrate
pnpm run build
node dist/seed/seed.js

