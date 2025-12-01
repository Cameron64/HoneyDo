#!/usr/bin/env bash
# run-audit.sh
#
# Master script to run all documentation audits
#
# Usage:
#   ./scripts/maintenance/run-audit.sh          # Run all audits
#   ./scripts/maintenance/run-audit.sh trpc     # Run tRPC audit only
#   ./scripts/maintenance/run-audit.sh db       # Run Drizzle audit only
#   ./scripts/maintenance/run-audit.sh docs     # Run CLAUDE.md check only

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║         HoneyDo Documentation Maintenance Audit          ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

run_trpc_audit() {
    echo -e "${BLUE}▶ Running tRPC Procedure Audit...${NC}"
    cd "$PROJECT_ROOT"
    if npx tsx scripts/maintenance/audit-trpc-docs.ts; then
        echo -e "${GREEN}✓ tRPC audit passed${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ tRPC audit found issues${NC}"
        return 1
    fi
}

run_db_audit() {
    echo -e "${BLUE}▶ Running Drizzle Schema Audit...${NC}"
    cd "$PROJECT_ROOT"
    if npx tsx scripts/maintenance/audit-drizzle-docs.ts; then
        echo -e "${GREEN}✓ Database audit passed${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ Database audit found issues${NC}"
        return 1
    fi
}

run_docs_check() {
    echo -e "${BLUE}▶ Running CLAUDE.md Check...${NC}"
    cd "$PROJECT_ROOT"
    if bash scripts/maintenance/check-claude-docs.sh 2>/dev/null; then
        echo -e "${GREEN}✓ Documentation check passed${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ Documentation check found issues${NC}"
        return 1
    fi
}

run_all() {
    local exit_code=0

    run_docs_check || exit_code=1
    echo ""
    run_trpc_audit || exit_code=1
    echo ""
    run_db_audit || exit_code=1

    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"

    if [[ $exit_code -eq 0 ]]; then
        echo -e "${GREEN}All audits passed! Documentation is up to date.${NC}"
    else
        echo -e "${YELLOW}Some audits found issues. Review output above.${NC}"
    fi

    return $exit_code
}

print_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  all     Run all audits (default)"
    echo "  trpc    Run tRPC procedure audit"
    echo "  db      Run Drizzle schema audit"
    echo "  docs    Run CLAUDE.md file check"
    echo "  help    Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0              # Run all audits"
    echo "  $0 trpc         # Only check tRPC procedures"
    echo "  $0 db           # Only check database schemas"
}

# Main
print_header

case "${1:-all}" in
    all)
        run_all
        ;;
    trpc)
        run_trpc_audit
        ;;
    db)
        run_db_audit
        ;;
    docs)
        run_docs_check
        ;;
    help|--help|-h)
        print_usage
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        print_usage
        exit 1
        ;;
esac
