#!/usr/bin/env bash
pnpm install
pnpm run generate
pnpm run migrate
pnpm run build
cp -r src/seed/ibra dist/seed/ibra
node dist/seed/seed.js

