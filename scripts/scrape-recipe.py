#!/usr/bin/env python3
"""
Recipe scraper using Python's recipe-scrapers library.
Called from Node.js for better instruction extraction.

Usage: python scrape-recipe.py <url>
Output: JSON with recipe data including nutrition info

Enhanced: Detects multi-method recipes (Instant Pot, Slow Cooker, Stovetop)
and extracts stovetop times when available.
"""

import sys
import json
import re
import requests
from recipe_scrapers import scrape_html


def detect_cooking_methods(instructions):
    """
    Detect which cooking methods are mentioned in the instructions.
    Returns a dict with detected methods and their likely cook times.

    Note: A brief browning/searing step before slow cooking doesn't make it
    a "stovetop" recipe - we need to detect the PRIMARY cooking method.
    """
    methods = {
        "instant_pot": False,
        "slow_cooker": False,
        "stovetop": False,
        "oven": False,
        "primary_method": None,  # Will be set to the main cooking method
    }

    text = " ".join(instructions).lower()

    # Instant Pot indicators
    instant_pot_patterns = [
        r"instant\s*pot",
        r"pressure\s*cook",
        r"high\s*pressure",
        r"manual.*pressure",
        r"quick\s*release",
        r"natural\s*release",
        r"sealing\s*position",
        r"venting\s*position",
    ]
    for pattern in instant_pot_patterns:
        if re.search(pattern, text):
            methods["instant_pot"] = True
            break

    # Slow cooker indicators
    slow_cooker_patterns = [
        r"slow\s*cooker",
        r"crock\s*pot",
        r"crockpot",
        r"cook\s+on\s+(the\s+)?(low|high)\s+(setting\s+)?(for\s+)?\d+.*hours?",
    ]
    for pattern in slow_cooker_patterns:
        if re.search(pattern, text):
            methods["slow_cooker"] = True
            break

    # Stovetop indicators - need significant stovetop cooking, not just browning
    # A "primary" stovetop method includes simmering for extended time
    stovetop_primary_patterns = [
        r"simmer\s+(for\s+)?\d+\s*minutes?(?!.*slow\s*cooker)",  # Simmer but not followed by slow cooker
        r"simmer\s+until",  # Simmer until done
        r"cook\s+(for\s+)?\d+\s*minutes?.*until.*cooked\s+through",  # Cook on stovetop until done
        r"reduce\s+heat.*simmer",  # Classic stovetop pattern
    ]

    # Secondary stovetop (browning, prep) - doesn't count as primary method
    stovetop_secondary_patterns = [
        r"(large\s+)?(skillet|pan)\s+over\s+(medium|high|low).*brown",
        r"sear",
        r"transfer.*to\s+(the\s+)?(slow\s*cooker|instant\s*pot|oven)",  # Brown then transfer = not stovetop
    ]

    has_primary_stovetop = False
    for pattern in stovetop_primary_patterns:
        if re.search(pattern, text):
            has_primary_stovetop = True
            break

    # Check if stovetop is just prep for another method
    transfers_to_other = False
    for pattern in stovetop_secondary_patterns:
        if re.search(pattern, text):
            transfers_to_other = True
            break

    # Only mark as stovetop if it's a primary cooking method
    if has_primary_stovetop and not (methods["slow_cooker"] or methods["instant_pot"]):
        methods["stovetop"] = True
    elif has_primary_stovetop and not transfers_to_other:
        # Has both stovetop and another method, and doesn't transfer - multiple methods
        methods["stovetop"] = True

    # General stovetop for recipes without slow cooker/instant pot
    if not methods["slow_cooker"] and not methods["instant_pot"]:
        general_stovetop_patterns = [
            r"(large\s+)?(skillet|pan|pot|dutch\s+oven)\s+over\s+(medium|high|low)",
            r"saute|sauté",
            r"simmer",
            r"bring\s+to\s+a\s+boil",
            r"heat.*over\s+(medium|high|low)",
        ]
        for pattern in general_stovetop_patterns:
            if re.search(pattern, text):
                methods["stovetop"] = True
                break

    # Oven indicators
    oven_patterns = [
        r"preheat.*oven",
        r"bake\s+(for\s+)?\d+",
        r"roast\s+(for\s+)?\d+",
        r"transfer\s+to\s+(the\s+)?oven",
    ]
    for pattern in oven_patterns:
        if re.search(pattern, text):
            methods["oven"] = True
            break

    # Determine primary method
    # Priority for users without Instant Pot or Slow Cooker:
    # 1. If stovetop is available, use it
    # 2. If only oven, use oven
    # 3. If only slow cooker/instant pot, warn user

    # Count available methods
    method_count = sum(1 for k, v in methods.items() if v)

    if method_count > 1 and methods["stovetop"]:
        # Multi-method recipe with stovetop available - prefer stovetop
        methods["primary_method"] = "stovetop"
    elif methods["stovetop"]:
        methods["primary_method"] = "stovetop"
    elif methods["oven"]:
        methods["primary_method"] = "oven"
    elif methods["slow_cooker"]:
        methods["primary_method"] = "slow_cooker"
    elif methods["instant_pot"]:
        methods["primary_method"] = "instant_pot"

    return methods


def extract_stovetop_time_from_instructions(instructions):
    """
    Try to extract stovetop cooking time from instructions text.
    Returns estimated cook time in minutes or None.

    For multi-method recipes, we try to identify the stovetop section
    and only extract times from that section.
    """
    text = " ".join(instructions).lower()

    # First, try to identify stovetop-only section
    # Look for patterns like "Stovetop:" or content between stovetop start and transfer to appliance
    stovetop_section = None

    # Check if text has multiple methods - look for section markers
    if "instant pot" in text or "slow cooker" in text:
        # Multi-method recipe - try to isolate stovetop section
        # Stovetop section typically starts with "pot over medium" or "skillet over"
        # and ends with "serve over" or transitions to IP/slow cooker section

        # Find stovetop cooking section by looking for Dutch oven/pot patterns
        stovetop_patterns_start = [
            r"(place a large pot|dutch oven|large skillet).*?over\s+(medium|high)",
            r"(pot or dutch oven).*?over\s+(medium|high)",
        ]

        for pattern in stovetop_patterns_start:
            match = re.search(pattern, text)
            if match:
                start_pos = match.start()
                # Find end - "serve over" is the clearest end marker for stovetop section
                # IP/slow cooker patterns should be very specific
                end_patterns = [
                    r"serve over (?:hot )?(?:cooked )?rice",  # Common ending
                    r"serve (?:with|over)",
                    r"place\s+(?:the\s+)?(?:onions|chicken|ingredients).*?(?:into|in)\s+(?:the\s+)?(?:inner\s+pot\s+of\s+(?:the\s+)?)?instant\s*pot",
                    r"place\s+the\s+lid\s+on\s+the\s+(?:instant\s*pot|slow\s*cooker)",
                    r"(?:into|in)\s+the\s+(?:inner\s+pot\s+of\s+(?:the\s+)?)?instant\s*pot",
                ]
                end_pos = len(text)
                for end_pat in end_patterns:
                    end_match = re.search(end_pat, text[start_pos:])
                    if end_match:
                        end_pos = min(end_pos, start_pos + end_match.start())

                stovetop_section = text[start_pos:end_pos]
                break

    # Use stovetop section if found, otherwise use full text (for single-method recipes)
    search_text = stovetop_section if stovetop_section else text
    found_times = []

    # Look for stovetop-specific cooking times - be more specific
    # Avoid "cool for X minutes" or "rest for X minutes"
    stovetop_time_patterns = [
        r"simmer(?:\s+until)?.*?(?:about\s+)?(\d+)(?:\s*(?:to|-)\s*(\d+))?\s*minutes?",
        r"cook\s+(?:for\s+)?(\d+)(?:\s*(?:to|-)\s*(\d+))?\s*minutes?(?:\s+or\s+until)?",
        r"sauté?\s+(?:for\s+)?(\d+)(?:\s*(?:to|-)\s*(\d+))?\s*minutes?",
        r"(?:veggies?\s+are\s+tender|stirring\s+occasionally).*?(\d+)(?:\s*(?:to|-)\s*(\d+))?\s*minutes?",
    ]

    # Patterns to EXCLUDE (cooling, resting, pressure release, waiting)
    exclude_patterns = [
        r"cool\s+(?:for\s+)?(?:about\s+)?(\d+)",
        r"let.*?sit.*?(\d+)",
        r"rest\s+(?:for\s+)?(?:about\s+)?(\d+)",
        r"natural.*?release.*?(\d+)",
        r"pressure\s+(?:for\s+)?(\d+)",
        r"high\s+pressure\s+(?:for\s+)?(\d+)",
        r"(?:after|wait)\s+(?:about\s+)?(\d+)",  # "after about 5-10 minutes"
        r"stops?\s+simmering.*?(?:after|about)\s+(\d+)",  # "stops simmering (after about..."
        r"cool\s+down.*?(\d+)",
        r"(?:wait|let)\s+(?:it\s+)?(?:cool|sit|rest).*?(\d+)",
    ]

    # Extract times - track by position to avoid counting same time twice
    found_times_with_pos = {}  # position -> minutes

    for pattern in stovetop_time_patterns:
        matches = re.finditer(pattern, search_text)
        for match in matches:
            # Check if this match is part of an excluded pattern
            match_start = match.start()
            match_text = search_text[max(0, match_start-30):match.end()+10]

            is_excluded = False
            for excl in exclude_patterns:
                if re.search(excl, match_text):
                    is_excluded = True
                    break

            if not is_excluded:
                groups = match.groups()
                if groups:
                    # Take the higher end of the range if available
                    mins = int(groups[1]) if len(groups) > 1 and groups[1] else int(groups[0])
                    if mins <= 60:  # Only count reasonable cooking steps (≤1 hour each)
                        # Find the position of the number in the match to dedupe
                        num_match = re.search(str(mins), match.group())
                        if num_match:
                            num_pos = match.start() + num_match.start()
                            # Only add if we haven't seen a time at this position
                            if num_pos not in found_times_with_pos:
                                found_times_with_pos[num_pos] = mins

    if found_times_with_pos:
        # Return the sum of unique cooking steps (capped at 90 min for multi-step stovetop)
        total = sum(found_times_with_pos.values())
        return min(total, 90)

    return None


def extract_slow_cooker_time(instructions):
    """
    Extract slow cooker time from instructions.
    Returns time in minutes or None.
    """
    text = " ".join(instructions).lower()

    # Look for "cook on low/high for X hours"
    patterns = [
        r"cook\s+on\s+(?:the\s+)?low\s+(?:setting\s+)?(?:for\s+)?(\d+)(?:\s*(?:to|-)\s*(\d+))?\s*hours?",
        r"cook\s+on\s+(?:the\s+)?high\s+(?:setting\s+)?(?:for\s+)?(\d+)(?:\s*(?:to|-)\s*(\d+))?\s*hours?",
        r"slow\s+cook.*?(\d+)(?:\s*(?:to|-)\s*(\d+))?\s*hours?",
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            # Take the higher end of the range
            hours = int(match.group(2)) if match.group(2) else int(match.group(1))
            return hours * 60

    return None


def extract_instant_pot_time(instructions):
    """
    Extract Instant Pot pressure cooking time from instructions.
    Returns time in minutes or None (just the pressure time, not natural release).
    """
    text = " ".join(instructions).lower()

    patterns = [
        r"(?:cook|pressure)\s+(?:on\s+)?(?:high\s+)?(?:pressure\s+)?(?:for\s+)?(\d+)\s*minutes?",
        r"manual.*?(\d+)\s*minutes?",
        r"high\s+pressure.*?(\d+)\s*minutes?",
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return int(match.group(1))

    return None


def scrape_recipe(url):
    try:
        # Fetch the page with a browser-like user agent
        response = requests.get(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }, timeout=30)
        response.raise_for_status()

        # Parse with wild mode (supported_only=False) to handle any recipe site
        scraper = scrape_html(response.text, url, supported_only=False)

        instructions = scraper.instructions_list()

        # Get all available data
        data = {
            "success": True,
            "title": scraper.title(),
            "ingredients": scraper.ingredients(),
            "instructions": instructions,
            "prepTime": None,
            "cookTime": None,
            "totalTime": None,
            "servings": None,
            "image": None,
            "description": None,
            "nutrients": None,
            "cookingMethods": None,
            "detectedMethod": None,
            "methodWarning": None,
        }

        # These can throw exceptions if not available
        try:
            data["prepTime"] = scraper.prep_time()
        except:
            pass

        try:
            cook_time = scraper.cook_time()
            # Sanity check: cook time should not exceed 24 hours (1440 min)
            if cook_time and cook_time <= 1440:
                data["cookTime"] = cook_time
            elif cook_time and cook_time > 1440:
                # Invalid cook time from website - will try to calculate from total - prep
                data["cookTime"] = None
        except:
            pass

        try:
            data["totalTime"] = scraper.total_time()
        except:
            pass

        # If cookTime is None but we have totalTime and prepTime, calculate it
        if data["cookTime"] is None and data["totalTime"] and data["prepTime"]:
            calculated_cook = data["totalTime"] - data["prepTime"]
            if calculated_cook > 0:
                data["cookTime"] = calculated_cook

        try:
            data["servings"] = scraper.yields()
        except:
            pass

        try:
            data["image"] = scraper.image()
        except:
            pass

        try:
            data["description"] = scraper.description()
        except:
            pass

        try:
            nutrients = scraper.nutrients()
            if nutrients:
                data["nutrients"] = nutrients
        except:
            pass

        # Detect cooking methods and adjust times if needed
        methods = detect_cooking_methods(instructions)
        primary_method = methods.pop("primary_method", None)  # Remove from dict before storing

        data["cookingMethods"] = methods
        data["detectedMethod"] = [k for k, v in methods.items() if v and k != "primary_method"]

        # Extract times for different methods
        stovetop_time = extract_stovetop_time_from_instructions(instructions)
        slow_cooker_time = extract_slow_cooker_time(instructions)
        instant_pot_time = extract_instant_pot_time(instructions)

        # Check if this is a multi-method recipe with stovetop
        has_multiple_methods = sum(1 for k, v in methods.items() if v) > 1
        has_special_appliance = methods["instant_pot"] or methods["slow_cooker"]

        # Use primary_method to determine correct times
        if primary_method == "stovetop" and has_multiple_methods and has_special_appliance:
            # Multi-method recipe - user prefers stovetop, extract those times
            if stovetop_time and stovetop_time > 10:
                original_cook = data["cookTime"]
                data["cookTime"] = stovetop_time
                if data["prepTime"]:
                    data["totalTime"] = data["prepTime"] + stovetop_time
                else:
                    data["totalTime"] = stovetop_time

                # List other available methods
                other_methods = []
                if methods["instant_pot"]:
                    other_methods.append(f"Instant Pot ({instant_pot_time}min)" if instant_pot_time else "Instant Pot")
                if methods["slow_cooker"]:
                    hours = slow_cooker_time // 60 if slow_cooker_time else "?"
                    other_methods.append(f"Slow Cooker ({hours}hr)")
                others = ", ".join(other_methods)
                data["methodWarning"] = f"Using STOVETOP time ({stovetop_time}min). Also available: {others}"
            else:
                # Couldn't extract good stovetop time
                data["methodWarning"] = "Multiple methods available but couldn't extract stovetop time. Check instructions."

        elif primary_method == "slow_cooker":
            # This is a slow cooker only recipe
            if slow_cooker_time:
                hours = slow_cooker_time // 60
                data["methodWarning"] = f"⚠️ SLOW COOKER recipe ({hours} hours). Plan ahead or find a stovetop alternative."
                data["cookTime"] = slow_cooker_time
                if data["prepTime"]:
                    data["totalTime"] = data["prepTime"] + slow_cooker_time
                else:
                    data["totalTime"] = slow_cooker_time
            else:
                data["methodWarning"] = "⚠️ SLOW COOKER recipe detected. Check instructions for actual cook time."

        elif primary_method == "instant_pot":
            # This is an Instant Pot only recipe
            ip_time = instant_pot_time or data["cookTime"] or "?"
            data["methodWarning"] = f"⚠️ INSTANT POT recipe ({ip_time}min pressure). No stovetop alternative found."

        return data

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No URL provided"}))
        sys.exit(1)

    url = sys.argv[1]
    result = scrape_recipe(url)
    print(json.dumps(result))
