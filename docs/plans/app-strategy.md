# Plan: The DC Decade — Four-Platform App (Web, iOS Native, iOS React Native, Android)

## Context

The `comics-n-stuff-gql` GraphQL API serves DC Comics data (4,843 primary issues, series, creators, stories). The API will be deployed to production before this plan is executed. Cover images will already be in Cloudinary (via the image-gathering plan) and available via the `coverImageUrl` field on Issue.

Four client apps collectively called **The DC Decade** (`dc-decade`) will consume the deployed API:
1. **Web** — Next.js, mobile-first, deployed to Vercel
2. **iOS (Native)** — Native Swift/SwiftUI, Xcode, may be deployed
3. **iOS (React Native)** — React Native with Expo, runs on iOS simulator
4. **Android** — Native Kotlin/Jetpack Compose, Android Studio, local emulator only

The apps share two features: a curated homepage of important DC comics from the 1980s (sections by era/event) and a search page (series, creators, issues). The UI should be structurally and visually consistent across all four.

---

## Branding Assets

Local image files to be placed in the monorepo and used across all apps:

- **Banner image** → `shared/assets/banner.png` — Used on the homepage as the hero/header image across all apps
- **Favicon** → `web/public/favicon.ico` (web only) — Browser tab icon for the Next.js app. Generate multiple sizes (16x16, 32x32, 180x180 apple-touch-icon) and add to `web/app/layout.tsx` metadata
- **App tile** → Used as the app icon for mobile apps:
  - **iOS Native**: Export as 1024x1024 PNG, add to `ios/Assets.xcassets/AppIcon.appiconset/` (Xcode generates all required sizes)
  - **iOS React Native**: Export as 1024x1024 PNG, configure via Expo's `app.json` → `expo.icon` and `expo.ios.icon`
  - **Android**: Export as 1024x1024 PNG, use Android Studio's Image Asset Studio to generate adaptive icon in `android/app/src/main/res/mipmap-*/`
  - **Web**: Also use as `apple-touch-icon.png` and `og:image` for social sharing in Next.js metadata

All source asset files live in `shared/assets/` so every app can reference the originals. Platform-specific derived versions (resized, formatted) go in each app's own asset directory.

---

## Repo Structure

A new monorepo `dc-decade` (separate from the API repo). No build orchestrator — just directories. The four apps share content and design tokens but have no build-time dependencies on each other.

```
dc-decade/
  package.json                    # root scripts only
  shared/
    schema.graphql                # copied from API repo
    operations/*.graphql          # shared GraphQL queries
    content/homepage.yaml         # curated homepage sections (by era/event)
    assets/
      banner.png                  # homepage hero/header image
      app-tile.png                # 1024x1024 app icon source
      favicon.ico                 # favicon source
    design-tokens/
      tokens.yaml                 # single source: colors, typography, spacing
      tokens.ts                   # generated for web + React Native
      tokens.swift                # generated for iOS native
      tokens.kt                   # generated for Android
    scripts/generate-tokens.ts    # reads tokens.yaml → writes .ts/.swift/.kt
  web/                            # Next.js
  ios/                            # Xcode project (native SwiftUI)
  react-native/                   # React Native + Expo (iOS)
  android/                        # Android Studio project
```

---

## Tech Stacks

| | Web | iOS (Native) | iOS (React Native) | Android |
|---|---|---|---|---|
| **Framework** | Next.js 15 (App Router) | SwiftUI (iOS 16+) | React Native + Expo (SDK 52+) | Jetpack Compose (min SDK 26) |
| **GraphQL client** | Apollo Client | Apollo iOS | Apollo Client (React Native) | Apollo Kotlin |
| **Codegen** | @graphql-codegen/cli | apollo-ios-cli | @graphql-codegen/cli | Apollo Gradle plugin |
| **CSS/Styling** | Tailwind CSS 4 | Design tokens → SwiftUI modifiers | NativeWind (Tailwind for RN) or StyleSheet + tokens | Design tokens → Compose theme |
| **YAML parsing** | `yaml` npm package | `Yams` (SPM) | `yaml` npm package | `kaml` |
| **Navigation** | Next.js file routing | NavigationStack | Expo Router (file-based) | Compose Navigation |
| **Testing** | Vitest + RTL + Playwright | XCTest + XCUITest | Jest + React Native Testing Library | JUnit + Compose testing |

---

## Screens (all four apps)

1. **Homepage** — "The DC Decade" title, vertical scroll of `HomepageSection` components. Each section: title + subtitle + horizontal scrolling row of `SeriesCard` items with cover images from Cloudinary. Bottom tab bar (Home / Search).
2. **Search** — Search bar + segmented tabs (Series / Creators / Issues) + vertical results list.
3. **Series Detail** — Series name, publisher, year range, format, issue count. Vertical list of issues.
4. **Issue Detail** — Cover image (from Cloudinary `coverImageUrl`), series + issue number, publication date, price, page count. Stories list with credits.
5. **Creator Detail** — Official name, bio, name variants.

---

## Shared Design Tokens (`tokens.yaml`)

Single source for colors, typography, spacing, border radius. A TypeScript script generates platform-specific files:
- `tokens.ts` — exported object for Tailwind config (used by both web and React Native)
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

### Phase 1: Four agents in parallel

| Agent | Branch | Directory | What it builds |
|---|---|---|---|
| Agent 1 | `feature/web-app` | `web/` | Next.js app, all pages, components, tests |
| Agent 2 | `feature/ios-app` | `ios/` | Xcode project, all views, networking, tests |
| Agent 3 | `feature/react-native-app` | `react-native/` | Expo/React Native app, all screens, tests |
| Agent 4 | `feature/android-app` | `android/` | Android Studio project, all screens, tests |

Each agent only modifies files in its own directory. Reads `shared/` but never writes to it. Merges are conflict-free.

Each agent receives the same screen specs, design tokens, and homepage content. Platform-specific instructions cover the tech stack and idioms.

### Phase 2: Integration (single agent or manual)

Merge all four branches. Cross-platform visual review. Fix inconsistencies.

---

## GraphQL Codegen

All three platforms generate typed code from the same inputs:
- `shared/schema.graphql` (API contract)
- `shared/operations/*.graphql` (named queries)

| Platform | Tool | Command | Output |
|---|---|---|---|
| Web | @graphql-codegen/cli + typescript plugins | `npm run codegen` | `web/src/generated/graphql.ts` |
| iOS (Native) | apollo-ios-cli | `apollo-ios-cli generate` | `ios/.../Generated/` |
| iOS (React Native) | @graphql-codegen/cli + typescript plugins | `npm run codegen` | `react-native/src/generated/graphql.ts` |
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

### iOS (React Native)
| Layer | Tool | Scope |
|---|---|---|
| Unit | Jest | YAML parsing, utilities, data transforms |
| Component | Jest + React Native Testing Library | Each component with mock data, loading/error states |
| Integration | Jest + MSW | Search flow with mocked GraphQL, homepage load |
| E2E | Detox or Maestro | Full flows on iOS simulator |

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

### Step 4: iOS React Native app (Agent 3)
1. `npx create-expo-app` with TypeScript template
2. Install `@apollo/client`, `@graphql-codegen/cli`, `yaml`, `expo-router`
3. Configure and run codegen (shares same approach as web)
4. Set up Apollo Client
5. Configure Expo Router for file-based navigation
6. Build HomeScreen → SearchScreen → detail screens
7. Apply design tokens via shared `tokens.ts` (NativeWind or StyleSheet)
8. Configure app icon via `app.json` using the shared app tile asset
9. Write all tests

### Step 5: Android app (Agent 4)
1. Create Android Studio project (Compose, min SDK 26)
2. Add Apollo Kotlin + kaml dependencies
3. Configure Apollo Gradle plugin, run codegen
4. Set up Apollo client
5. Build HomeScreen → SearchScreen → detail screens
6. Apply design tokens via Compose theme
7. Write all tests

### Step 6: Integration
- Merge branches, cross-platform review, CI setup

---

## Prerequisites (completed before agents start)

1. **API deployed** to production at `https://comics-n-stuff-gql-production.up.railway.app`
2. **Cover images** uploaded to Cloudinary via `plans/image-gathering.md`; `coverImageUrl` populated on issues
3. **Branding assets** ready: banner image, favicon, and app tile in `shared/assets/`
4. **Xcode** installed (for both iOS native and React Native agents)
5. **Android Studio** installed with emulator configured (for Android agent)
6. **Node.js** installed (for React Native / Expo CLI)
7. **Series IDs** identified for homepage.yaml (query the production API)
8. **CORS_ORIGINS** updated on deployed API to include `dcdecade.com`, Vercel preview URLs, and localhost:3000

---

## Notes

- Cover images are served from Cloudinary via the `coverImageUrl` field on Issue. Use Cloudinary URL transforms for responsive sizing (e.g., `w_300,h_450,c_fill` for thumbnails).
- The `searchIssues` query handles the series+issue number search. For creators, use the existing `creators(search:)` query. For series browsing, use `allSeries(search:)`.
- All four apps are read-only consumers of the deployed API. No mutations needed.
- All four apps connect to the production API at `https://comics-n-stuff-gql-production.up.railway.app` (not localhost).
- The web app domain is `dcdecade.com`.
- The React Native app shares the same codegen toolchain as the web app (`@graphql-codegen/cli`) and the same `tokens.ts` design tokens, making it the most code-similar to the web app while targeting iOS natively.
