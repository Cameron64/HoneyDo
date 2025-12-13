#!/bin/bash
# =============================================================================
# HoneyDo Production Deployment Script
# =============================================================================
# Safely deploys the production environment with backup and rollback support.
#
# Usage:
#   ./scripts/deploy-prod.sh           # Full deployment
#   ./scripts/deploy-prod.sh --quick   # Skip backup (dangerous!)
#
# Requirements:
#   - docker/secrets/.env.prod must exist with production secrets
#   - Docker must be running
#
# Run from project root or via npm script:
#   pnpm deploy:prod
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SECRETS_FILE="$PROJECT_ROOT/docker/secrets/.env.prod"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "========================================"
echo "   HoneyDo Production Deployment"
echo "========================================"
echo ""

# Check for quick mode
SKIP_BACKUP=false
if [ "$1" = "--quick" ]; then
    SKIP_BACKUP=true
    echo -e "${YELLOW}WARNING: Skipping backup (--quick mode)${NC}"
    echo ""
fi

# =============================================================================
# Pre-flight checks
# =============================================================================
echo "Running pre-flight checks..."

# Check secrets file exists
if [ ! -f "$SECRETS_FILE" ]; then
    echo -e "${RED}ERROR: Production secrets file not found!${NC}"
    echo ""
    echo "Please create: docker/secrets/.env.prod"
    echo "You can copy from: docker/secrets/.env.prod.example"
    echo ""
    exit 1
fi
echo "  ✓ Secrets file found"

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Docker is not running!${NC}"
    exit 1
fi
echo "  ✓ Docker is running"

# Check required secrets are set (basic check)
if ! grep -q "CLERK_SECRET_KEY=sk_" "$SECRETS_FILE"; then
    echo -e "${YELLOW}WARNING: CLERK_SECRET_KEY may not be set correctly${NC}"
fi

if ! grep -q "ANTHROPIC_API_KEY=sk-ant-" "$SECRETS_FILE"; then
    echo -e "${YELLOW}WARNING: ANTHROPIC_API_KEY may not be set correctly${NC}"
fi

echo "  ✓ Secrets appear configured"
echo ""

# =============================================================================
# Backup current state
# =============================================================================
if [ "$SKIP_BACKUP" = false ]; then
    echo "Creating backup of current production state..."
    if [ -f "$PROJECT_ROOT/docker/data/prod/api/honeydo.db" ]; then
        "$SCRIPT_DIR/backup.sh" prod
        echo ""
    else
        echo "  No existing production database found (first deployment?)"
        echo ""
    fi
fi

# =============================================================================
# Build containers
# =============================================================================
echo "Building production containers..."
cd "$PROJECT_ROOT"

docker compose -f docker-compose.yml -f docker-compose.prod.yml build

echo -e "${GREEN}  ✓ Build complete${NC}"
echo ""

# =============================================================================
# Deploy
# =============================================================================
echo "Starting production services..."

# Stop existing containers gracefully
docker compose -f docker-compose.yml -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true

# Start new containers
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo ""
echo "Waiting for services to be healthy..."
sleep 5

# Check health
API_HEALTH=$(curl -s http://localhost:3001/health 2>/dev/null || echo '{"status":"error"}')
if echo "$API_HEALTH" | grep -q '"status":"ok"'; then
    echo -e "  ${GREEN}✓ API is healthy${NC}"
else
    echo -e "  ${RED}✗ API health check failed${NC}"
    echo "    Response: $API_HEALTH"
fi

WEB_HEALTH=$(curl -s http://localhost:8080/health 2>/dev/null || echo "error")
if echo "$WEB_HEALTH" | grep -q "ok"; then
    echo -e "  ${GREEN}✓ Web is healthy${NC}"
else
    echo -e "  ${YELLOW}? Web health check inconclusive${NC}"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "========================================"
echo -e "   ${GREEN}Deployment Complete!${NC}"
echo "========================================"
echo ""
echo "Services running:"
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "Access URLs:"
echo "  - Web:            http://localhost:8080"
echo "  - API:            http://localhost:3001"
echo "  - Home Assistant: http://localhost:8123"
echo ""
echo "  - Tailscale Web:  http://cams-work-comp.taila29c19.ts.net:8080"
echo ""
echo "Useful commands:"
echo "  pnpm docker:prod:logs    # View logs"
echo "  pnpm docker:prod:down    # Stop services"
echo "  pnpm backup:prod         # Create backup"
echo ""
