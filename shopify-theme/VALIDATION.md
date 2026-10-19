# Validation notes — Shopify theme v3.0.1

- ZIP integrity: passed.
- Required root files: present: `layout/theme.liquid`, `config/settings_schema.json`, `config/settings_data.json`, `templates/index.json`.
- JSON files: all parsed successfully.
- Liquid section schema JSON: all parsed successfully.
- Template/section group order arrays: no duplicate IDs; each order matches the referenced sections.
- Template section types and block types: all references resolve to section schemas.
- Template/group setting IDs: all recognized by their section/block schemas.
- Select/radio values and range values: all validated against their schemas. Fixed the previous invalid homepage `story.gap=42` to `40`.
- Liquid asset/snippet references: local snippet references resolve; expected assets are present.
- JavaScript syntax: `assets/theme.js` passes `node --check`.
- Shopify Theme Check / live Shopify preview: not run in this environment because Shopify CLI/Theme Check installation requires network access and no store-authenticated preview session is connected. Run Shopify Theme Check and preview the uploaded draft before publishing.
