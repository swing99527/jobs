"""
Translate occupation titles from English to Chinese using an LLM via OpenRouter.

Reads from occupations.json and saves incremental results to translations.json.

Usage:
    uv run python translate.py
"""

import argparse
import json
import os
import time
import httpx
from dotenv import load_dotenv

load_dotenv()

DEFAULT_MODEL = "google/gemini-3-flash-preview"
OUTPUT_FILE = "translations.json"
API_URL = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_PROMPT = """\
You are an expert translator specializing in labor economics and occupational \
titles. You will be given a list of US Bureau of Labor Statistics (BLS) \
occupational titles in English.

Your task is to provide the most accurate, natural-sounding, and standard \
simplified Chinese translation for each title. Provide ONLY a JSON object \
mapping the exact English title provided to its Chinese translation.

Respond with ONLY a JSON object returning the translation like this:
{
  "title_zh": "中文职业名称"
}
"""

def translate_occupation(client, title, model):
    """Send one occupation title to the LLM for translation."""
    response = client.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": title},
            ],
            "temperature": 0.1,
        },
        timeout=60,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]

    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1]  # remove first line
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

    return json.loads(content)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--delay", type=float, default=0.2)
    parser.add_argument("--force", action="store_true", help="Re-translate even if already cached")
    args = parser.parse_args()

    with open("occupations.json") as f:
        occupations = json.load(f)

    # Load existing translations
    translations = {}
    if os.path.exists(OUTPUT_FILE) and not args.force:
        with open(OUTPUT_FILE) as f:
            for entry in json.load(f):
                translations[entry["slug"]] = entry

    print(f"Translating {len(occupations)} occupations with {args.model}")
    print(f"Already cached: {len(translations)}")
    
    # We will translate in small batches if possible, but for simplicity we'll do 1 by 1 for robustness.
    # To save time, we can optionally batch them later if it's too slow.
    client = httpx.Client()
    errors = []
    
    for i, occ in enumerate(occupations):
        slug = occ["slug"]
        
        if slug in translations:
            continue
            
        title = occ["title"]
        print(f"  [{i+1}/{len(occupations)}] Translating '{title}'...", end=" ", flush=True)

        try:
            result = translate_occupation(client, title, args.model)
            translations[slug] = {
                "slug": slug,
                "title": title,
                "title_zh": result.get("title_zh", title)
            }
            print(f"-> {translations[slug]['title_zh']}")
        except Exception as e:
            print(f"ERROR: {e}")
            errors.append(slug)
            
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(list(translations.values()), f, indent=2, ensure_ascii=False)
            
        time.sleep(args.delay)

    client.close()
    print(f"\nDone. Translated {len(translations)} occupations. {len(errors)} errors.")


if __name__ == "__main__":
    main()
