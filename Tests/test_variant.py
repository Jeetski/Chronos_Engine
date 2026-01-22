from Modules.Scheduler import resolve_variant

print("Imported resolve_variant.")

mock_item = {
    'name': 'evening routine',
    'variants': [
        {
            'name': 'Low Energy Mode',
            'status_requirements': {'energy': 'low'},
            'items': [{'name': 'rest'}]
        }
    ],
    'items': [{'name': 'work'}]
}

mock_status = {'energy': 'low'}

print(f"Testing with status: {mock_status}")
print(f"Mock Item Variants: {mock_item['variants']}")

try:
    resolved = resolve_variant(mock_item, mock_status)
    print(f"Resolved Name: {resolved.get('name')}")
    print(f"Resolved Items: {resolved.get('items')}")
    print(f"Variant Applied: {resolved.get('variant_applied')}")
except Exception as e:
    print(f"Error during resolution: {e}")
