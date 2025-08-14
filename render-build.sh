#!/usr/bin/env bash
set -e  # Exit on any error

echo "🚀 Starting Render build process..."

echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

echo "🔧 Generating Prisma client..."
pnpm run generate

echo "🗄️ Running database migrations..."
# Use production migration command for Render
pnpm run migrate:deploy

echo "🏗️ Building application..."
pnpm run build

echo "✅ Build completed successfully!"

# Optional: Verify the build output
if [ -f "dist/index.js" ]; then
    echo "📁 Build output verified: dist/index.js exists"
else
    echo "❌ Build output not found!"
    exit 1
fi


