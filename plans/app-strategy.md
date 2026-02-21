# Plan: The DC Decade — Three-Platform App (Web, iOS, Android)

## Context

The `comics-n-stuff-gql` GraphQL API serves DC Comics data (4,843 primary issues, series, creators, stories). The API will be deployed to production before this plan is executed. Cover images will already be in Cloudinary (via the image-gathering plan) and available via the `coverImageUrl` field on Issue.

Three client apps collectively called **The DC Decade** (`dc-decade`) will consume the deployed API:
1. **Web** — Next.js, mobile-first, deployed to Vercel
2. **iOS** — Native Swift/SwiftUI, Xcode, may be deployed
3. **Android** — Native Kotlin/Jetpack Compose, Android Studio, local emulator only

The apps share two features: a curated homepage of important DC comics from the 1980s (sections by era/event) and a search page (series, creators, issues). The UI should be structurally and visually consistent across all three.

---

## Repo Structure

A new monorepo `dc-decade` (separate from the API repo). No build orchestrator — just directories. The three apps share content and design tokens but have no build-time dependencies on each other.

```
dc-decade/
  package.json                    # root scripts only
  shared/
    schema.graphql                # copied from API repo
    operations/*.graphql          # shared GraphQL queries
    content/homepage.yaml         # curated homepage sections (by era/event)
    design-tokens/
      tokens.yaml                 # single source: colors, typography, spacing
      tokens.ts                   # generated for web
      tokens.swift                # generated for iOS
      tokens.kt                   # generated for Android
    scripts/generate-tokens.ts    # reads tokens.yaml → writes .ts/.swift/.kt
  web/                            # Next.js
  ios/                            # Xcode project
  android/                        # Android Studio project
```

---

## Tech Stacks

| | Web | iOS | Android |
|---|---|---|---|
| **Framework** | Next.js 15 (App Router) | SwiftUI (iOS 16+) | Jetpack Compose (min SDK 26) |
| **GraphQL client** | Apollo Client | Apollo iOS | Apollo Kotlin |
| **Codegen** | @graphql-codegen/cli | apollo-ios-cli | Apollo Gradle plugin |
| **CSS/Styling** | Tailwind CSS 4 | Design tokens → SwiftUI modifiers | Design tokens → Compose theme |
| **YAML parsing** | `yaml` npm package | `Yams` (SPM) | `kaml` |
| **Navigation** | Next.js file routing | NavigationStack | Compose Navigation |
| **Testing** | Vitest + RTL + Playwright | XCTest + XCUITest | JUnit + Compose testing |

---

## Screens (all three platforms)

1. **Homepage** — "The DC Decade" title, vertical scroll of `HomepageSection` components. Each section: title + subtitle + horizontal scrolling row of `SeriesCard` items with cover images from Cloudinary. Bottom tab bar (Home / Search).
2. **Search** — Search bar + segmented tabs (Series / Creators / Issues) + vertical results list.
3. **Series Detail** — Series name, publisher, year range, format, issue count. Vertical list of issues.
4. **Issue Detail** — Cover image (from Cloudinary `coverImageUrl`), series + issue number, publication date, price, page count. Stories list with credits.
5. **Creator Detail** — Official name, bio, name variants.

---

## Shared Design Tokens (`tokens.yaml`)

Single source for colors, typography, spacing, border radius. A TypeScript script generates platform-specific files:
- `tokens.ts` — exported object for Tailwind config
- `tokens.swift` — `enum DesignTokens` with nested enums
- `tokens.kt` — `object DesignTokens` with nested objects

Colors: DC blue-dark primary, gold accent, warm off-white background.
Typography: System fonts on all platforms, consistent size scale (12–32px).
Spacing: 4/8/12/16/24/32/48px scale.

---

## Homepage Content (`homepage.yaml`)

Sections by era/event with real series IDs (looked up from the API before writing):
- Crisis on Infinite Earths (1985–1986)
- The Dark Knight Era (1986–1989)
- New Teen Titans (Wolfman & Perez)
- Justice League International (Giffen/DeMatteis)
- Superman Reborn (Byrne's Man of Steel)
- Vertigo Precursors (Swamp Thing, Sandman, Hellblazer)

Each section has a `title`, `subtitle`, and list of `series` IDs. All three apps load the same YAML and query `series(id:)` for display data.

---

## Parallel Build Strategy

### Phase 0: Foundation (on `main`, before agents)

1. Create `dc-decade` repo
2. Set up `shared/` — copy schema, operations, write homepage.yaml with real IDs, write tokens.yaml
3. Write and run `generate-tokens.ts`
4. Scaffold each app directory minimally (project config files only)
5. Commit to `main`

### Phase 1: Three agents in parallel

| Agent | Branch | Directory | What it builds |
|---|---|---|---|
| Agent 1 | `feature/web-app` | `web/` | Next.js app, all pages, components, tests |
| Agent 2 | `feature/ios-app` | `ios/` | Xcode project, all views, networking, tests |
| Agent 3 | `feature/android-app` | `android/` | Android Studio project, all screens, tests |

Each agent only modifies files in its own directory. Reads `shared/` but never writes to it. Merges are conflict-free.

Each agent receives the same screen specs, design tokens, and homepage content. Platform-specific instructions cover the tech stack and idioms.

### Phase 2: Integration (single agent or manual)

Merge all three branches. Cross-platform visual review. Fix inconsistencies.

---

## GraphQL Codegen

All three platforms generate typed code from the same inputs:
- `shared/schema.graphql` (API contract)
- `shared/operations/*.graphql` (named queries)

| Platform | Tool | Command | Output |
|---|---|---|---|
| Web | @graphql-codegen/cli + typescript plugins | `npm run codegen` | `web/src/generated/graphql.ts` |
| iOS | apollo-ios-cli | `apollo-ios-cli generate` | `ios/.../Generated/` |
| Android | Apollo Gradle plugin | `./gradlew generateApolloSources` | `build/generated/source/apollo/` |

When the API schema changes: run `sync-schema` to copy it, then `codegen:all`. Breaking changes surface as codegen errors.

---

## Testing Strategy

### Web
| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | YAML parser, utilities, token generation |
| Component | Vitest + React Testing Library | Each component with mock data, loading/error states |
| Integration | Vitest + MSW | Search flow with mocked GraphQL, homepage load |
| E2E | Playwright | Full flows: homepage, search, navigation, mobile viewport |

### iOS
| Layer | Tool | Scope |
|---|---|---|
| Unit | XCTest | YAML parsing, view model logic, data transforms |
| UI | XCTest + SwiftUI previews | Components render correctly |
| Integration | XCTest + URLProtocol mock | Apollo client responses, error handling |
| UI Automation | XCUITest | Homepage loads, search works, navigation |

### Android
| Layer | Tool | Scope |
|---|---|---|
| Unit | JUnit 5 + MockK | YAML parsing, view model logic |
| Compose UI | compose-ui-test | Components render, click handlers |
| Integration | JUnit + MockWebServer | Apollo client responses |
| Instrumented | Espresso + Compose testing | Full flows on emulator |

### Cross-platform
- **API contract**: Codegen validates operations against schema on every build
- **Content consistency**: CI verifies all series IDs in homepage.yaml are valid
- **Visual**: Design token consistency + manual review (no pixel-comparison across platforms)

---

## Implementation Sequence

### Step 1: Repo setup
- Create repo, shared/ directory
- Query the API to find real series IDs for homepage sections
- Write homepage.yaml, tokens.yaml, generate-tokens.ts
- Generate token files, commit

### Step 2: Web app (Agent 1)
1. `create-next-app` with TypeScript + Tailwind + App Router
2. Install `@apollo/client`, `@apollo/experimental-nextjs-app-support`, `@graphql-codegen/cli`, `yaml`
3. Configure and run codegen
4. Set up Apollo Client with Next.js SSR support
5. Build homepage → search → detail pages
6. Apply design tokens via Tailwind config
7. Write all tests

### Step 3: iOS app (Agent 2)
1. Create Xcode project (SwiftUI, iOS 16+)
2. Add Apollo iOS + Yams via SPM
3. Configure and run Apollo codegen
4. Set up Apollo client singleton
5. Build HomeView → SearchView → detail views
6. Apply design tokens
7. Write all tests

### Step 4: Android app (Agent 3)
1. Create Android Studio project (Compose, min SDK 26)
2. Add Apollo Kotlin + kaml dependencies
3. Configure Apollo Gradle plugin, run codegen
4. Set up Apollo client
5. Build HomeScreen → SearchScreen → detail screens
6. Apply design tokens via Compose theme
7. Write all tests

### Step 5: Integration
- Merge branches, cross-platform review, CI setup

---

## Prerequisites (completed before agents start)

1. **API deployed** to production with a public URL
2. **Cover images** uploaded to Cloudinary via `plans/image-gathering.md`; `coverImageUrl` populated on issues
3. **Xcode** installed (for iOS agent)
4. **Android Studio** installed with emulator configured (for Android agent)
5. **Series IDs** identified for homepage.yaml (query the production API)
6. **CORS_ORIGINS** updated on deployed API to include Vercel preview URLs and localhost:3000

---

## Notes

- Cover images are served from Cloudinary via the `coverImageUrl` field on Issue. Use Cloudinary URL transforms for responsive sizing (e.g., `w_300,h_450,c_fill` for thumbnails).
- The `searchIssues` query handles the series+issue number search. For creators, use the existing `creators(search:)` query. For series browsing, use `allSeries(search:)`.
- All three apps are read-only consumers of the deployed API. No mutations needed.
- All three apps connect to the production API URL (not localhost).
