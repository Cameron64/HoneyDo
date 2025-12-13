#!/usr/bin/env python3
"""
Recipe scraper using Python's recipe-scrapers library.
Called from Node.js for better instruction extraction.

Usage: python scrape-recipe.py <url>
Output: JSON with recipe data including nutrition info
"""

import sys
import json
import requests
from recipe_scrapers import scrape_html

def scrape_recipe(url):
    try:
        # Fetch the page with a browser-like user agent
        response = requests.get(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }, timeout=30)
        response.raise_for_status()

        # Parse with wild mode (supported_only=False) to handle any recipe site
        scraper = scrape_html(response.text, url, supported_only=False)

        # Get all available data
        data = {
            "success": True,
            "title": scraper.title(),
            "ingredients": scraper.ingredients(),
            "instructions": scraper.instructions_list(),
            "prepTime": None,
            "cookTime": None,
            "totalTime": None,
            "servings": None,
            "image": None,
            "description": None,
            "nutrients": None,
        }

        # These can throw exceptions if not available
        try:
            data["prepTime"] = scraper.prep_time()
        except:
            pass

        try:
            data["cookTime"] = scraper.cook_time()
        except:
            pass

        try:
            data["totalTime"] = scraper.total_time()
        except:
            pass

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
