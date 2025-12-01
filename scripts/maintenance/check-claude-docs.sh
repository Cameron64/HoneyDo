#!/usr/bin/env bash
# check-claude-docs.sh
# Pre-commit hook script to warn when module files change without CLAUDE.md updates
#
# This script checks if source files in a module have changed but the corresponding
# CLAUDE.md file has not been staged for commit.
#
# Usage:
#   ./scripts/maintenance/check-claude-docs.sh [--strict]
#
#   --strict: Exit with error code 1 if warnings are generated (blocks commit)
#
# Install as pre-commit hook:
#   cp scripts/maintenance/check-claude-docs.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Parse arguments
STRICT_MODE=false
if [[ "$1" == "--strict" ]]; then
    STRICT_MODE=true
fi

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track warnings
WARNINGS=()

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || echo "")

if [[ -z "$STAGED_FILES" ]]; then
    echo -e "${GREEN}No staged files to check${NC}"
    exit 0
fi

# Define module-to-CLAUDE.md mappings
declare -A MODULE_DOCS=(
    # API modules
    ["apps/api/src/modules/shopping"]="apps/api/src/modules/shopping/CLAUDE.md"
    ["apps/api/src/modules/home"]="apps/api/src/modules/home/CLAUDE.md"
    ["apps/api/src/modules/recipes"]="apps/api/src/modules/recipes/CLAUDE.md"

    # Web modules
    ["apps/web/src/modules/shopping"]="apps/web/src/modules/shopping/CLAUDE.md"
    ["apps/web/src/modules/home"]="apps/web/src/modules/home/CLAUDE.md"
    ["apps/web/src/modules/recipes"]="apps/web/src/modules/recipes/CLAUDE.md"

    # Core layers
    ["apps/api/src/db"]="apps/api/src/db/CLAUDE.md"
    ["apps/web/src/components"]="apps/web/src/components/CLAUDE.md"
    ["packages/shared/src/schemas"]="packages/shared/src/schemas/CLAUDE.md"
    ["packages/shared/src/constants"]="packages/shared/src/constants/CLAUDE.md"

    # App-level
    ["apps/api/src"]="apps/api/CLAUDE.md"
    ["apps/web/src"]="apps/web/CLAUDE.md"
    ["packages/shared/src"]="packages/shared/CLAUDE.md"

    # Infrastructure
    ["docker"]="docker/CLAUDE.md"
    ["docs"]="docs/CLAUDE.md"
)

# File patterns that typically require doc updates
SIGNIFICANT_PATTERNS=(
    "router.ts"       # New tRPC procedures
    "schema.ts"       # Database changes
    "*.schema.ts"     # Zod schemas
    "constants.ts"    # New constants
    "events.ts"       # WebSocket events
    "service.ts"      # Service layer changes
    "types.ts"        # Type definitions
)

# Check if a file matches significant patterns
is_significant_file() {
    local file="$1"
    local basename=$(basename "$file")

    for pattern in "${SIGNIFICANT_PATTERNS[@]}"; do
        if [[ "$basename" == $pattern ]]; then
            return 0
        fi
    done
    return 1
}

# Check each module for changes
check_module() {
    local module_path="$1"
    local doc_path="$2"

    local module_changed=false
    local significant_change=false
    local doc_updated=false
    local changed_files=()

    for file in $STAGED_FILES; do
        # Check if file is in this module
        if [[ "$file" == "$module_path"/* ]]; then
            # Skip the CLAUDE.md file itself
            if [[ "$file" != "$doc_path" ]]; then
                module_changed=true
                changed_files+=("$file")

                if is_significant_file "$file"; then
                    significant_change=true
                fi
            fi
        fi

        # Check if doc file is staged
        if [[ "$file" == "$doc_path" ]]; then
            doc_updated=true
        fi
    done

    # Generate warning if significant changes without doc update
    if $significant_change && ! $doc_updated; then
        local warning="Module '$module_path' has significant changes but '$doc_path' not updated"
        WARNINGS+=("$warning")
        echo -e "${YELLOW}WARNING:${NC} $warning"
        echo -e "  ${BLUE}Changed files:${NC}"
        for f in "${changed_files[@]}"; do
            echo -e "    - $f"
        done
        return 1
    fi

    return 0
}

echo -e "${BLUE}=== CLAUDE.md Documentation Check ===${NC}"
echo ""

# Check each module mapping
for module_path in "${!MODULE_DOCS[@]}"; do
    doc_path="${MODULE_DOCS[$module_path]}"
    check_module "$module_path" "$doc_path"
done

echo ""

# Summary
if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}Found ${#WARNINGS[@]} documentation warning(s)${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo ""
    echo -e "Consider updating the relevant CLAUDE.md files to document:"
    echo -e "  - New tRPC procedures"
    echo -e "  - Database schema changes"
    echo -e "  - New Zod schemas"
    echo -e "  - WebSocket event changes"
    echo -e "  - New constants or types"
    echo ""
    echo -e "To skip this check, use: ${BLUE}git commit --no-verify${NC}"

    if $STRICT_MODE; then
        echo -e "${RED}Commit blocked due to strict mode.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}All documentation appears up to date!${NC}"
fi

exit 0
