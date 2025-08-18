#!/usr/bin/env bash
pnpm install
pnpm run generate
pnpm run migrate
pnpm run build
pnpm fix:country

