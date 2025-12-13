#!/bin/bash
# =============================================================================
# HoneyDo Backup Script
# =============================================================================
# Creates a timestamped backup of all persistent data for a specific environment.
#
# Usage:
#   ./scripts/backup.sh dev      # Backup development environment
#   ./scripts/backup.sh prod     # Backup production environment
#   ./scripts/backup.sh          # Defaults to dev
#
# Run from project root or via npm script:
#   pnpm backup:dev
#   pnpm backup:prod
# =============================================================================

set -e

# Get environment from argument (default: dev)
ENV="${1:-dev}"

if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
    echo "Error: Invalid environment '$ENV'"
    echo "Usage: $0 [dev|prod]"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/backups/$ENV"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="honeydo_${ENV}_backup_$TIMESTAMP"

echo "=== HoneyDo Backup ($ENV) ==="
echo "Timestamp: $TIMESTAMP"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create temp directory for this backup
TEMP_DIR="$BACKUP_DIR/$BACKUP_NAME"
mkdir -p "$TEMP_DIR"

echo "Backing up $ENV environment..."

# Determine database path based on environment
if [ "$ENV" = "prod" ]; then
    DB_PATH="$PROJECT_ROOT/docker/data/prod/api/honeydo.db"
else
    # Dev can be either local or Docker
    if [ -f "$PROJECT_ROOT/docker/data/dev/api/honeydo.db" ]; then
        DB_PATH="$PROJECT_ROOT/docker/data/dev/api/honeydo.db"
    elif [ -f "$PROJECT_ROOT/apps/api/data/honeydo.db" ]; then
        DB_PATH="$PROJECT_ROOT/apps/api/data/honeydo.db"
    else
        DB_PATH=""
    fi
fi

# 1. SQLite database
if [ -n "$DB_PATH" ] && [ -f "$DB_PATH" ]; then
    echo "  - Database (honeydo.db) from: $DB_PATH"
    # Use sqlite3 backup if available (safer for active databases)
    if command -v sqlite3 &> /dev/null; then
        sqlite3 "$DB_PATH" ".backup '$TEMP_DIR/honeydo.db'"
    else
        cp "$DB_PATH" "$TEMP_DIR/"
    fi
else
    echo "  - Database: NOT FOUND (skipping)"
fi

# 2. Recipe history (shared between environments)
if [ -f "$PROJECT_ROOT/data/recipes/history.json" ]; then
    echo "  - Recipe history"
    mkdir -p "$TEMP_DIR/recipes"
    cp "$PROJECT_ROOT/data/recipes/history.json" "$TEMP_DIR/recipes/"
fi

# 3. Home Assistant config (shared between environments)
if [ -d "$PROJECT_ROOT/docker/data/homeassistant" ]; then
    echo "  - Home Assistant config"
    mkdir -p "$TEMP_DIR/homeassistant"
    [ -f "$PROJECT_ROOT/docker/data/homeassistant/configuration.yaml" ] && \
        cp "$PROJECT_ROOT/docker/data/homeassistant/configuration.yaml" "$TEMP_DIR/homeassistant/"
    [ -f "$PROJECT_ROOT/docker/data/homeassistant/automations.yaml" ] && \
        cp "$PROJECT_ROOT/docker/data/homeassistant/automations.yaml" "$TEMP_DIR/homeassistant/"
    [ -f "$PROJECT_ROOT/docker/data/homeassistant/scenes.yaml" ] && \
        cp "$PROJECT_ROOT/docker/data/homeassistant/scenes.yaml" "$TEMP_DIR/homeassistant/"
    [ -f "$PROJECT_ROOT/docker/data/homeassistant/secrets.yaml" ] && \
        cp "$PROJECT_ROOT/docker/data/homeassistant/secrets.yaml" "$TEMP_DIR/homeassistant/"
    [ -d "$PROJECT_ROOT/docker/data/homeassistant/.storage" ] && \
        cp -r "$PROJECT_ROOT/docker/data/homeassistant/.storage" "$TEMP_DIR/homeassistant/"
fi

# 4. Environment file (only for dev, never backup prod secrets this way)
if [ "$ENV" = "dev" ] && [ -f "$PROJECT_ROOT/.env" ]; then
    echo "  - Environment variables (.env)"
    cp "$PROJECT_ROOT/.env" "$TEMP_DIR/"
fi

# 5. Record environment metadata
echo "  - Backup metadata"
cat > "$TEMP_DIR/metadata.json" << EOF
{
  "environment": "$ENV",
  "timestamp": "$TIMESTAMP",
  "hostname": "$(hostname)",
  "created_at": "$(date -Iseconds)"
}
EOF

# Create compressed archive
echo ""
echo "Creating archive..."
cd "$BACKUP_DIR"
tar -czf "$BACKUP_NAME.tar.gz" "$BACKUP_NAME"
rm -rf "$TEMP_DIR"

# Keep only last 10 backups per environment
echo "Cleaning old backups (keeping last 10)..."
ls -t "$BACKUP_DIR"/*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm

BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_NAME.tar.gz" | cut -f1)
echo ""
echo "=== Backup Complete ==="
echo "Environment: $ENV"
echo "File: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
echo "Size: $BACKUP_SIZE"
echo ""
echo "To restore, run: ./scripts/restore.sh $ENV $BACKUP_NAME.tar.gz"
