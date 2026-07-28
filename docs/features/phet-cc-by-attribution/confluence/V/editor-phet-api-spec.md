<!--
==============================================================
SOURCE TRACKING — 更新 Confluence 後請同步更新此區塊與內文
==============================================================

page_id:        495059253
url:            https://viewsonic-vsi.atlassian.net/wiki/spaces/V/pages/495059253
space:          V
cloned_version: 12
cloned_at:      2026-07-28

Maintenance rule: 每次重新 clone 時，先 commit「同步前差異」說明，再覆寫此檔；
                  版號跟 cloned_at 要同步更新，commit 訊息附 Confluence URL。
==============================================================
-->

> | 來源頁面 | page_id | clone 版本 | clone 日期 |
> |---|---|---|---|
> | [[Editor] PhET API Spec](https://viewsonic-vsi.atlassian.net/wiki/spaces/V/pages/495059253) | 495059253 | v12 | 2026-07-28 |

# [Editor] PhET API Spec

Overview
========

Read-only catalog APIs used by the Editor to let teachers pick a PhET simulation and embed it inside `page.activity-layer.html-activity` (category `Activity_PHET`). See the companion page for end-to-end flow: Quiz & PhET in Editor — End-to-End Flow (Import → Edit → OLF Pack).

API Endpoints Summary
=====================

| # | Method | Endpoint | Purpose |
| --- | --- | --- | --- |
| 1 | GET | `/api/v3/phet/simulations` | Search simulations (filter by query, grade, category) |
| 2 | GET | `/api/v3/phet/simulations/{simulation_id}` | Get full simulation detail |
| 3 | GET | `/api/v3/phet/grade-levels` | List grade levels (filter UI source) |
| 4 | GET | `/api/v3/phet/categories` | Get category tree (filter UI source) |

Endpoint Details
================

1. Search Simulations
---------------------

**Endpoint:** `GET /api/v3/phet/simulations`

**Description:** Returns a list of PhET simulations filtered by optional query, grade level, and category. Localized by `language_code`.

**Query Parameters:**

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `language_code` | string (enum) | No (default `en`) | `en` or `zh-TW` |
| `query` | string | No | Full-text search query (title + description + keywords) |
| `grade_level` | int | No | Grade level id (see endpoint 3) |
| `category_ids` | string (comma-separated int) | No | Category ids (see endpoint 4) to filter by, e.g. `1,2,5` |

**Request Body:** None

**Response: 200 OK**

```json
{
  "data": [
    {
      "id": 275,
      "title": "Membrane Transport",
      "description": "Add different biological solutes to either side of a cell membrane and observe their behavior based on solute properties and concentrations. Add transport proteins and uncover some of the common mechanisms for transporting solutes across a cell membrane.",
      "created_at": 1759950977,
      "all_locales_url": "https://phet.colorado.edu//sims/html/membrane-transport/latest/membrane-transport_all.html",
      "preview_images": [
        { "url": "https://phet.colorado.edu/sims/html/membrane-transport/latest/membrane-transport-900.png", "hash": "kr7VaoSaHD66cOlBpksl8wxbmgpOKdf+szgSojDe3BQ=", "size": 244549, "width": 900, "format": "image/png", "height": 591 },
        { "url": "https://phet.colorado.edu/sims/html/membrane-transport/latest/membrane-transport-600-alt1.png", "hash": "QQ+Q4+6J+z80W38cPsc4Xey0+RqdNLm4wYZfsY1Tfe4=", "size": 126058, "width": 600, "format": "image/png", "height": 394 },
        { "url": "https://phet.colorado.edu/sims/html/membrane-transport/latest/membrane-transport-600-alt2.png", "hash": "hu4lfXOBAIzvJz+j4vaDK40I2jKOdIc+7e9fDuARMWA=", "size": 129688, "width": 600, "format": "image/png", "height": 394 },
        { "url": "https://phet.colorado.edu/sims/html/membrane-transport/latest/membrane-transport-420.png", "hash": "x3hWhnTg9PH3x/yU6xfWm/JueKMrE6MGJaxLduuMBZM=", "size": 77992, "width": 420, "format": "image/png", "height": 276 },
        { "url": "https://phet.colorado.edu/sims/html/membrane-transport/latest/membrane-transport-128.png", "hash": "rF9OeQmBkCS58/t8Pif1VvSTmTs5cZM1+KjOU8bBZD8=", "size": 13699, "width": 128, "format": "image/png", "height": 84 },
        { "url": "https://phet.colorado.edu/sims/html/membrane-transport/latest/membrane-transport-15.png", "hash": "5Zwfxd9E/Oeyt6wK+aEDPs/SHldj4gVNRa/cDY6YJ0s=", "size": 497, "width": 15, "format": "image/png", "height": 10 },
        { "url": "https://phet.colorado.edu/sims/html/membrane-transport/latest/membrane-transport-900-alt2.png", "hash": "hqbBwG3QdQ9d5GQsqkFmFf38FVqRygw7pmeWiIWBI/8=", "size": 240664, "width": 900, "format": "image/png", "height": 591 },
        { "url": "https://phet.colorado.edu/sims/html/membrane-transport/latest/membrane-transport-twitter-card.png", "hash": "ZAgErS+eKDzOKQMZI/XUq5cXZXGBN9Ny1qNqK4E24R8=", "size": 147199, "width": 800, "format": "image/png", "height": 400 },
        { "url": "https://phet.colorado.edu/sims/html/membrane-transport/latest/membrane-transport-900-alt1.png", "hash": "taxV1lhqZ1KnUUUDD/e2mZm3d4gCjdcQeFUTKXivmio=", "size": 233062, "width": 900, "format": "image/png", "height": 591 },
        { "url": "https://phet.colorado.edu/sims/html/membrane-transport/latest/membrane-transport-600.png", "hash": "a2JsfiF8lDgtPtd2TbRngmI67NRDPczVO+l9qKOtkIs=", "size": 133487, "width": 600, "format": "image/png", "height": 394 },
        { "url": "https://phet.colorado.edu/sims/html/membrane-transport/latest/membrane-transport-ios.png", "hash": "o/SzUdMu4OPcqDMKh/I9hXMrIcOUuqk9lmpjrfhnm9M=", "size": 58977, "width": 420, "format": "image/png", "height": 276 }
      ]
    }
  ]
}
```

**Response Fields:**

| Field | Type | Description |
| --- | --- | --- |
| `data[].id` | int | PhET simulation id (DB primary key) |
| `data[].title` | string | Localized title (from `phet_simulation_translation.title`) |
| `data[].description` | string \| null | Localized description |
| `data[].created_at` | int | Unix timestamp |
| `data[].all_locales_url` | string | PhET "all locales" URL (single URL that supports multiple languages at runtime). |
| `data[].preview_images` | list[object] \| null | List of preview image variants. Each entry: `{ url, hash, size, width, format, height }`. |
| `data[].preview_images[].url` | string | Absolute image URL |
| `data[].preview_images[].hash` | string | Content hash (base64) |
| `data[].preview_images[].size` | int | File size in bytes |
| `data[].preview_images[].width` | int | Image width in pixels |
| `data[].preview_images[].height` | int | Image height in pixels |
| `data[].preview_images[].format` | string | MIME type, e.g. `image/png` |

**Error Responses:**

| Code | Condition |
| --- | --- |
| 401 | Missing or invalid bearer token |
| 422 | `language_code` not in {`en`, `zh-TW`} or `category_ids` not comma-separated integers |

---

2. Get Simulation Detail
------------------------

**Endpoint:** `GET /api/v3/phet/simulations/{simulation_id}`

**Description:** Returns the full detail for one simulation — title, description, launch URL template, grade-level range, keywords, categories.

**Path Parameters:**

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `simulation_id` | int | Yes | PhET simulation id |

**Query Parameters:**

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `language_code` | string (enum) | No (default `en`) | `en` or `zh-TW` |

**Response: 200 OK**

```json
{
  "data": {
    "id": 4321,
    "title": "Build an Atom",
    "description": "Build an atom out of protons, neutrons, and electrons, and see how the element, charge, and mass change.",
    "all_locales_url": "https://phet.colorado.edu/sims/html/build-an-atom/latest/build-an-atom_{{language_code}}.html",
    "grade_levels": {
      "low_grade_level": { "id": 3, "name": "Middle School" },
      "high_grade_level": { "id": 4, "name": "High School" }
    },
    "keywords": ["atom", "proton", "neutron", "electron", "isotope"],
    "categories": [
      { "id": 1, "name": "Physics" },
      { "id": 5, "name": "Chemistry" }
    ]
  }
}
```

**Response Fields:**

| Field | Type | Description |
| --- | --- | --- |
| `data.id` | int | Simulation id |
| `data.title` | string | Localized title |
| `data.description` | string \| null | Localized description |
| `data.all_locales_url` | string | URL template with `{{language_code}}` placeholder — used as `html-activity.source` in content.json after substitution |
| `data.grade_levels` | object \| null | Range: `{ low_grade_level, high_grade_level }` |
| `data.grade_levels.low_grade_level` | object \| null | `{ id, name }` |
| `data.grade_levels.low_grade_level.id` | number | Grade level id |
| `data.grade_levels.low_grade_level.name` | string | Localized grade name |
| `data.grade_levels.high_grade_level` | object \| null | `{ id, name }` |
| `data.grade_levels.high_grade_level.id` | number | Grade level id |
| `data.grade_levels.high_grade_level.name` | string | Localized grade name |
| `data.keywords` | list[string] \| null | Localized keywords |
| `data.categories` | list[object] \| null | `[{ id, name }, ...]` — localized category names |
| `data.categories[].id` | number | Category id |
| `data.categories[].name` | string | Localized category name |

**Error Responses:**

| Code | Condition |
| --- | --- |
| 401 | Missing or invalid bearer token |
| 404 | Simulation id not found |
| 422 | `language_code` invalid |

---

3. Get Grade Levels
-------------------

**Endpoint:** `GET /api/v3/phet/grade-levels`

**Description:** Returns the full list of grade levels, localized. Used to build the filter UI for endpoint 1.

**Query Parameters:**

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `language_code` | string (enum) | No (default `en`) | `en` or `zh-TW` |

**Response: 200 OK**

```json
{
  "data": [
    { "id": 1, "name": "Elementary School" },
    { "id": 2, "name": "Middle School" },
    { "id": 3, "name": "High School" },
    { "id": 4, "name": "University" }
  ]
}
```

**Response Fields:**

| Field | Type | Description |
| --- | --- | --- |
| `data[].id` | int | Grade level id (pass as `grade_level` query param to endpoint 1) |
| `data[].name` | string | Localized display name |

**Error Responses:**

| Code | Condition |
| --- | --- |
| 401 | Missing or invalid bearer token |
| 422 | `language_code` invalid |

---

4. Get Category Tree
--------------------

**Endpoint:** `GET /api/v3/phet/categories`

**Description:** Returns the category hierarchy as a nested tree, localized. Used to build the filter UI for endpoint 1.

**Query Parameters:**

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `language_code` | string (enum) | No (default `en`) | `en` or `zh-TW` |

**Response: 200 OK**

```json
{
  "data": [
    {
      "id": 1,
      "name": "Physics",
      "children": [
        { "id": 11, "name": "Motion", "children": [] },
        { "id": 12, "name": "Sound & Waves", "children": [] }
      ]
    },
    {
      "id": 5,
      "name": "Chemistry",
      "children": []
    }
  ]
}
```

**Response Fields:**

| Field | Type | Description |
| --- | --- | --- |
| `data[].id` | int | Category id (pass as `category_ids` to endpoint 1) |
| `data[].name` | string | Localized category name |
| `data[].children` | list (recursive) | Nested subcategories with the same shape |

Notes
=====

* **No write endpoints:** PhET content is external; the editor only reads the catalog. Teacher state (which simulation picked, language, position) lives inside the OLF's `content.json`.

Source
======

`app/routes/phet/phet_router.py`, `app/services/phet/phet_service.py`, `app/validation/phet.py`, `app/models/phet_simulation.py`, `app/models/phet_category.py`, `app/models/phet_grade_level.py`, `app/models/phet_keyword.py`.
