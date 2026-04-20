# Series ID Mapping — DC Decade API

## Overview

After the DigitalOcean migration (2026-04-17), the DC Decade GraphQL API now exposes a stable, human-readable identifier on every `Series`: the `slug` field. This allows downstream consumers (like dc-decade) to pin series by name + year rather than by database ID, which survives future re-imports of the GCD dump.

**Recommendation:** Migrate homepage pinned series from integer IDs to slugs in your queries. The mapping below shows both for transition purposes.

---

## Pinned Series Mapping

### Crisis on Infinite Earths (1985–1986)

| ID  | Name | Slug | Year |
|-----|------|------|------|
| 2973 | Crisis on Infinite Earths | `crisis-on-infinite-earths-1985` | 1985 |
| 97 | Action Comics | `action-comics-1938` | 1938 |
| 141 | Batman | `batman-1940` | 1940 |
| 87 | Detective Comics | `detective-comics-1937` | 1937 |
| 116 | Superman | `superman-1939` | 1939 |
| 277 | Wonder Woman | `wonder-woman-1942` | 1942 |
| 1428 | The Flash | `the-flash-1959` | 1959 |
| 1448 | Green Lantern | `green-lantern-1960` | 1960 |
| 2835 | Legion of Super-Heroes | `legion-of-super-heroes-1984` | 1984 |
| 2833 | Infinity, Inc. | `infinity-inc-1984` | 1984 |
| 2583 | All-Star Squadron | `all-star-squadron-1981` | 1981 |

### The Dark Knight Era (1986–1989)

| ID | Name | Slug | Year |
|-----|------|------|------|
| 3141 | Batman: The Dark Knight Returns | `batman-the-dark-knight-returns-1986-3141` | 1986 |
| 3172 | Watchmen | `watchmen-1986` | 1986 |
| 14212 | Batman: Year One | `batman-year-one-1988-14212` | 1988 |
| 3571 | Batman: The Killing Joke | `batman-the-killing-joke-1988` | 1988 |
| 3581 | Cosmic Odyssey | `cosmic-odyssey-1988` | 1988 |
| 3627 | V for Vendetta | `v-for-vendetta-1988` | 1988 |
| 3361 | Green Arrow: The Longbow Hunters | `green-arrow-the-longbow-hunters-1987` | 1987 |
| 3594 | Green Arrow | `green-arrow-1988` | 1988 |

### New Teen Titans

| ID | Name | Slug | Year |
|-----|------|------|------|
| 2543 | The New Teen Titans | `the-new-teen-titans-1980` | 1980 |
| 2842 | The New Teen Titans | `the-new-teen-titans-1984` | 1984 |
| 2851 | Tales of the Teen Titans | `tales-of-the-teen-titans-1984` | 1984 |

### Justice League International

| ID | Name | Slug | Year |
|-----|------|------|------|
| 3364 | Justice League | `justice-league-1987` | 1987 |
| 3366 | Justice League International | `justice-league-international-1987` | 1987 |
| 3143 | Booster Gold | `booster-gold-1986` | 1986 |
| 3142 | Blue Beetle | `blue-beetle-1986` | 1986 |
| 3812 | Mister Miracle | `mister-miracle-1989` | 1989 |
| 3156 | Legends | `legends-1986` | 1986 |

### Superman Reborn

| ID | Name | Slug | Year |
|-----|------|------|------|
| 3160 | The Man of Steel | `the-man-of-steel-1986` | 1986 |
| 3386 | Superman | `superman-1987` | 1987 |
| 97 | Action Comics | `action-comics-1938` | 1938 |
| 3166 | Secret Origins | `secret-origins-1986` | 1986 |

### Vertigo Precursors

| ID | Name | Slug | Year |
|-----|------|------|------|
| 2999 | Swamp Thing | `swamp-thing-1985` | 1985 |
| 3817 | Sandman | `sandman-1989` | 1989 |
| 3599 | Hellblazer | `hellblazer-1988` | 1988 |
| 3567 | Animal Man | `animal-man-1988` | 1988 |
| 3353 | Doom Patrol | `doom-patrol-1987` | 1987 |
| 3385 | Suicide Squad | `suicide-squad-1987` | 1987 |

---

## Migration Example

### Old approach (hardcoded integer ID)
```graphql
query {
  series(id: 2973) {
    name
    issues(limit: 5) {
      title
      coverImageUrl
    }
  }
}
```

### New approach (stable slug)
```graphql
query {
  seriesBySlug(slug: "crisis-on-infinite-earths-1985") {
    id
    name
    slug
    issues(limit: 5) {
      title
      coverImageUrl
    }
  }
}
```

---

## Notes

- **Slug format:** `{kebab-case-name}-{year}[-{id-tiebreaker}]` — the optional ID suffix is only added if multiple series share the same name and year (rare in this dataset).
- **ID stability:** These mappings assume GCD dump IDs remain stable across re-imports. If a future re-import shifts IDs, the slugs will remain constant and queryable; integer pins will break. Slugs are the future-proof approach.
- **Dynamism:** If you add or remove pinned series in the future, update this table. The API will automatically surface new series with their slugs via introspection.
- **Cover images:** Every issue now carries its original Cloudinary `coverImageUrl` from the pre-migration Supabase backfill.
