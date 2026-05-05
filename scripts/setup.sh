#!/usr/bin/env bash
set -e
echo "Setting up NexRAD..."
cp -n .env.example .env || true
pnpm install
echo "Setup complete. Run: pnpm docker:dev"
