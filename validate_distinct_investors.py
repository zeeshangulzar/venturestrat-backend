# RUN Command python3 validate_distinct_investors.py Vietnam  

import os
import sys
import json
from collections import defaultdict

# Usage: python3 count_countries.py <country_name> [folder_path]
# Example: python3 count_countries.py Vietnam ./neda-backend/src/seed/ibra/

if len(sys.argv) < 2:
    print("❌ Please provide a country name.\nUsage: python3 count_countries.py <country_name> [folder_path]")
    sys.exit(1)

country_arg = sys.argv[1]
FOLDER_PATH = sys.argv[2] if len(sys.argv) > 2 else "./src/seed/ibra/"

names = set()
ids_or_names = set()

name_to_ids = defaultdict(set)
id_to_names = defaultdict(set)
no_name_has_id = []

for filename in os.listdir(FOLDER_PATH):
    if not filename.endswith(".json"): 
        continue
    with open(os.path.join(FOLDER_PATH, filename), "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            continue

    for inv in data:
        country = (inv.get("country") or {}).get("title")
        if country != country_arg:
            continue

        inv_id = inv.get("id")
        name = inv.get("name")

        # Script B logic
        if name:
            names.add(name)

        # Script A logic
        unique_id = inv_id or name
        if unique_id:
            ids_or_names.add(unique_id)

        # Diagnostics
        if name and inv_id:
            name_to_ids[name].add(inv_id)
            id_to_names[inv_id].add(name)
        if (not name) and inv_id:
            no_name_has_id.append(inv_id)

print(f"📊 Results for country: {country_arg}\n")
print("Script A (id OR name) unique:", len(ids_or_names))
print("Script B (name only) unique :", len(names))

print("\nNames used by multiple different IDs:")
for n, s in name_to_ids.items():
    if len(s) > 1:
        print(f"  {n} -> IDs: {sorted(s)}")

print("\nIDs that map to multiple different names:")
for i, s in id_to_names.items():
    if len(s) > 1:
        print(f"  {i} -> Names: {sorted(s)}")

if no_name_has_id:
    print("\nEntries with ID but missing name (counted in A, not in B):")
    print(" ", sorted(set(no_name_has_id)))
