# Series Slug Conventions

## What is a slug?

Every `Series` in the DC Decade GraphQL API has a `slug` field: a stable, human-readable string
that uniquely identifies the series across database re-imports.

## Derivation

```
slugify(name) + "-" + yearBegan [+ "-" + id]
```

Steps applied to `name`:
1. Decompose Unicode (NFD) and strip combining diacritics
2. Lowercase
3. Replace any non-alphanumeric character with a space
4. Trim and collapse whitespace runs to single hyphens

The result is concatenated with `yearBegan`:

| Series name | Year | Slug |
|---|---|---|
| Crisis on Infinite Earths | 1985 | `crisis-on-infinite-earths-1985` |
| Batman | 1940 | `batman-1940` |
| Batman | 2011 | `batman-2011` |
| V for Vendetta | 1988 | `v-for-vendetta-1988` |

If two series produce the same `slugify(name)-yearBegan` (same title, same start year), the
row's database `id` is appended as a tiebreaker:

```
batman-the-dark-knight-returns-1986-3141
```

The id suffix is rare and only added when needed. The implementation lives in `src/lib/slug.ts`.

## Stability guarantee

Slugs are derived entirely from `(name, yearBegan, id)`. All three of these come from the GCD
dump and are stable across re-imports — GCD preserves explicit integer PKs in its INSERT
statements, and series names/years don't change. A slug computed today will resolve to the same
series after any future GCD dump reload.

Use slugs instead of integer IDs in any long-lived consumer (query strings, config files, YAML).
Integer IDs from the Postgres schema are stable in practice but are not a contractual guarantee.

## Querying by slug

```graphql
query {
  seriesBySlug(slug: "crisis-on-infinite-earths-1985") {
    id
    name
    slug
    yearBegan
    issues(limit: 5) {
      title
      coverImageUrl
    }
  }
}
```

The field is `String!` on the `Series` type (non-null, present on every row).
