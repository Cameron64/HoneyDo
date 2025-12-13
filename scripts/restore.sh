#!/bin/bash
# =============================================================================
# HoneyDo Restore Script
# =============================================================================
# Restores from a backup archive to a specific environment.
#
# Usage:
#   ./scripts/restore.sh dev <backup_file.tar.gz>   # Restore to dev
#   ./scripts/restore.sh prod <backup_file.tar.gz>  # Restore to prod
#
# Run from project root
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Get environment from argument
ENV="$1"
BACKUP_FILE="$2"

if [[ "$ENV" != "dev" && "$ENV" != "prod" ]] || [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <dev|prod> <backup_file.tar.gz>"
    echo ""
    echo "Available dev backups:"
    ls -lt "$PROJECT_ROOT/backups/dev"/*.tar.gz 2>/dev/null | head -5 || echo "  (none found)"
    echo ""
    echo "Available prod backups:"
    ls -lt "$PROJECT_ROOT/backups/prod"/*.tar.gz 2>/dev/null | head -5 || echo "  (none found)"
    exit 1
fi

# Handle relative or absolute path
if [ ! -f "$BACKUP_FILE" ]; then
    BACKUP_FILE="$PROJECT_ROOT/backups/$ENV/$2"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file not found: $2${NC}"
    exit 1
fi

echo "=== HoneyDo Restore ($ENV) ==="
echo "Backup: $BACKUP_FILE"
echo ""

# Safety check for production
if [ "$ENV" = "prod" ]; then
    echo -e "${YELLOW}WARNING: You are about to restore PRODUCTION data!${NC}"
    read -p "Are you sure? (type 'yes' to confirm): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        echo "Restore cancelled."
        exit 1
    fi
    echo ""
fi

# Determine which docker-compose to use
if [ "$ENV" = "prod" ]; then
    COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
    DB_TARGET="$PROJECT_ROOT/docker/data/prod/api"
else
    COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
    DB_TARGET="$PROJECT_ROOT/docker/data/dev/api"
fi

# Stop containers first
echo "Stopping $ENV containers..."
cd "$PROJECT_ROOT"
$COMPOSE_CMD down 2>/dev/null || true

# Extract backup
echo "Extracting backup..."
TEMP_DIR=$(mktemp -d)
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"
BACKUP_NAME=$(ls "$TEMP_DIR")

# Check metadata
if [ -f "$TEMP_DIR/$BACKUP_NAME/metadata.json" ]; then
    BACKUP_ENV=$(grep -o '"environment": "[^"]*"' "$TEMP_DIR/$BACKUP_NAME/metadata.json" | cut -d'"' -f4)
    if [ "$BACKUP_ENV" != "$ENV" ]; then
        echo -e "${YELLOW}WARNING: Backup was created from '$BACKUP_ENV' but restoring to '$ENV'${NC}"
        read -p "Continue anyway? (y/N): " REPLY
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$TEMP_DIR"
            echo "Restore cancelled."
            exit 1
        fi
    fi
fi

echo "Restoring to $ENV environment..."

# 1. Database
if [ -f "$TEMP_DIR/$BACKUP_NAME/honeydo.db" ]; then
    echo "  - Database"
    mkdir -p "$DB_TARGET"
    cp "$TEMP_DIR/$BACKUP_NAME/honeydo.db" "$DB_TARGET/"
fi

# 2. Recipe history (shared)
if [ -f "$TEMP_DIR/$BACKUP_NAME/recipes/history.json" ]; then
    echo "  - Recipe history"
    mkdir -p "$PROJECT_ROOT/data/recipes"
    cp "$TEMP_DIR/$BACKUP_NAME/recipes/history.json" "$PROJECT_ROOT/data/recipes/"
fi

# 3. Home Assistant config (shared)
if [ -d "$TEMP_DIR/$BACKUP_NAME/homeassistant" ]; then
    echo "  - Home Assistant config"
    mkdir -p "$PROJECT_ROOT/docker/data/homeassistant"
    cp -r "$TEMP_DIR/$BACKUP_NAME/homeassistant/"* "$PROJECT_ROOT/docker/data/homeassistant/" 2>/dev/null || true
fi

# 4. Environment file (dev only, ask first)
if [ "$ENV" = "dev" ] && [ -f "$TEMP_DIR/$BACKUP_NAME/.env" ]; then
    if [ -f "$PROJECT_ROOT/.env" ]; then
        echo ""
        read -p "Overwrite existing .env file? (y/N): " REPLY
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cp "$TEMP_DIR/$BACKUP_NAME/.env" "$PROJECT_ROOT/"
            echo "  - Environment variables restored"
        else
            echo "  - Environment variables skipped"
        fi
    else
        cp "$TEMP_DIR/$BACKUP_NAME/.env" "$PROJECT_ROOT/"
        echo "  - Environment variables"
    fi
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo -e "${GREEN}=== Restore Complete ===${NC}"
echo ""
if [ "$ENV" = "prod" ]; then
    echo "Start production with: pnpm docker:prod"
else
    echo "Start dev Docker with: pnpm docker:dev"
    echo "Or run locally with:   pnpm dev"
fi
