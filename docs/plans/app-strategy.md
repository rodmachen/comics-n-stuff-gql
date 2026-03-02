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
- **Placeholder image** → `shared/assets/dc-placeholder.png` — Fallback displayed when `coverImageUrl` is null on an issue. Used by all four apps.
- **Favicon** → `web/public/favicon.ico` (web only) — Browser tab icon for the Next.js app. Generate multiple sizes (16x16, 32x32, 180x180 apple-touch-icon) and add to `web/app/layout.tsx` metadata
- **App tile** → Used as the app icon for mobile apps:
  - **iOS Native**: Export as 1024x1024 PNG, add to `ios/Assets.xcassets/AppIcon.appiconset/` (Xcode generates all required sizes)
  - **iOS React Native**: Export as 1024x1024 PNG, configure via Expo's `app.json` → `expo.icon` and `expo.ios.icon`
  - **Android**: Export as 1024x1024 PNG, use Android Studio's Image Asset Studio to generate adaptive icon in `android/app/src/main/res/mipmap-*/`
  - **Web**: Also use as `apple-touch-icon.png` and `og:image` for social sharing in Next.js metadata

All source asset files live in `shared/assets/` so every app can reference the originals. Platform-specific derived versions (resized, formatted) go in each app's own asset directory.

---

## Repo Structure

A new monorepo `dc-decade` (separate from the API repo) using **npm workspaces** to manage shared dependencies between `web/` and `react-native/` (e.g., `@graphql-codegen/cli`). The root `package.json` declares workspaces so the two JS apps don't duplicate or conflict on shared tooling. The four apps share content and design tokens but have no build-time dependencies on each other.

```
dc-decade/
  package.json                    # npm workspaces root (web/, react-native/)
  shared/
    schema.graphql                # copied from API repo
    operations/*.graphql          # shared GraphQL queries
    content/
      homepage.yaml               # curated homepage sections (source of truth)
      homepage.json               # pre-compiled from YAML (used by all apps at runtime)
      homepage.swift              # generated Swift struct for iOS native
      homepage.kt                 # generated Kotlin data class for Android
    assets/
      banner.png                  # homepage hero/header image
      app-tile.png                # 1024x1024 app icon source
      favicon.ico                 # favicon source
      dc-placeholder.png          # fallback for issues with no cover image
    design-tokens/
      tokens.yaml                 # single source: colors, typography, spacing
      tokens.ts                   # generated for web + React Native
      tokens.swift                # generated for iOS native
      tokens.kt                   # generated for Android
    scripts/
      generate-tokens.ts          # reads tokens.yaml → writes .ts/.swift/.kt
      compile-homepage.ts         # reads homepage.yaml → writes .json/.swift/.kt
    codegen/
      codegen-web.ts              # pre-configured codegen config for web
      codegen-rn.ts               # pre-configured codegen config for React Native
      apollo-codegen-config.json  # pre-configured Apollo iOS codegen config
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
| **Homepage data** | Pre-compiled `homepage.json` | Pre-compiled `homepage.swift` | Pre-compiled `homepage.json` | Pre-compiled `homepage.kt` |
| **Navigation** | Next.js file routing | NavigationStack | Expo Router (file-based) | Compose Navigation |
| **Testing** | Vitest + RTL | XCTest | Jest + RNTL | JUnit + Compose testing |

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
Cloudinary transforms: Centralized URL transform strings (e.g., `thumbnail: "w_300,h_450,c_fill"`, `detail: "w_600,h_900,c_fill"`) so all apps format cover image URLs consistently.

---

## Homepage Content (`homepage.yaml`)

Sections by era/event with real series IDs (looked up from the API before writing):
- Crisis on Infinite Earths (1985–1986)
- The Dark Knight Era (1986–1989)
- New Teen Titans (Wolfman & Perez)
- Justice League International (Giffen/DeMatteis)
- Superman Reborn (Byrne's Man of Steel)
- Vertigo Precursors (Swamp Thing, Sandman, Hellblazer)

Each section has a `title`, `subtitle`, and list of `series` IDs. The source of truth is `homepage.yaml`, but apps consume the pre-compiled outputs (`homepage.json` for JS apps, `homepage.swift` for iOS native, `homepage.kt` for Android) generated by `compile-homepage.ts` in Phase 0. Apps then query `series(id:)` for display data.

---

## Parallel Build Strategy

### Phase 0: Foundation (on `main`, before agents)

1. Create `dc-decade` repo with npm workspaces configured in root `package.json`
2. Set up `shared/` — copy schema, operations, write homepage.yaml with real IDs, write tokens.yaml
3. Write and run `generate-tokens.ts`
4. Write and run `compile-homepage.ts` to generate `homepage.json`, `homepage.swift`, `homepage.kt` from `homepage.yaml`
5. Create pre-configured codegen configs in `shared/codegen/` (codegen-web.ts, codegen-rn.ts, apollo-codegen-config.json, Apollo Gradle config) so agents only run generation commands, not configure plugins from scratch
6. Ensure `dc-placeholder.png` is present in `shared/assets/`
7. Scaffold each app directory minimally (project config files only)
8. Commit to `main`

### Phase 1: Four agents in parallel

| Agent | Branch | Directory | What it builds |
|---|---|---|---|
| Agent 1 | `feature/web-app` | `web/` | Next.js app, all pages, components, tests |
| Agent 2 | `feature/ios-app` | `ios/` | Xcode project, all views, networking, tests |
| Agent 3 | `feature/react-native-app` | `react-native/` | Expo/React Native app, all screens, tests |
| Agent 4 | `feature/android-app` | `android/` | Android Studio project, all screens, tests |

**Agent constraint (critical):** Each agent must be explicitly prompted: "Do not modify any files outside of your designated directory (`web/`, `ios/`, `react-native/`, or `android/`). Treat the API schema, design tokens, codegen configs, and homepage content in `shared/` as immutable. If you encounter an error that seems related to a shared file, report the issue rather than modifying root or shared files."

Each agent receives the same screen specs, design tokens, and homepage content. Platform-specific instructions cover the tech stack and idioms.

### Phase 2: Integration (single agent or manual)

Merge all four branches. Cross-platform visual review. Fix inconsistencies.

---

## GraphQL Codegen

All four platforms generate typed code from the same inputs:
- `shared/schema.graphql` (API contract)
- `shared/operations/*.graphql` (named queries)

**Codegen configs are pre-built in Phase 0** under `shared/codegen/` so agents only run generation commands rather than configuring plugins from scratch. This avoids configuration errors in agent-driven builds.

| Platform | Tool | Config (pre-built) | Command | Output |
|---|---|---|---|---|
| Web | @graphql-codegen/cli + typescript plugins | `shared/codegen/codegen-web.ts` | `npm run codegen` | `web/src/generated/graphql.ts` |
| iOS (Native) | apollo-ios-cli | `shared/codegen/apollo-codegen-config.json` | `apollo-ios-cli generate` | `ios/.../Generated/` |
| iOS (React Native) | @graphql-codegen/cli + typescript plugins | `shared/codegen/codegen-rn.ts` | `npm run codegen` | `react-native/src/generated/graphql.ts` |
| Android | Apollo Gradle plugin | Pre-configured in `build.gradle.kts` | `./gradlew generateApolloSources` | `build/generated/source/apollo/` |

When the API schema changes: run `sync-schema` to copy it, then `codegen:all`. Breaking changes surface as codegen errors.

---

## Testing Strategy

AI agents handle unit, component, and integration tests. E2E/UI automation tests (Playwright, XCUITest, Detox/Maestro, Espresso) require simulator/emulator interaction that Claude Code cannot perform from the CLI. These are left for manual setup or a dedicated CI phase after the agent work is complete.

### Web (Agent-built)
| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Utilities, token generation |
| Component | Vitest + React Testing Library | Each component with mock data, loading/error states |
| Integration | Vitest + MSW | Search flow with mocked GraphQL, homepage load |

### Web (Manual/CI — post-agent)
| Layer | Tool | Scope |
|---|---|---|
| E2E | Playwright | Full flows: homepage, search, navigation, mobile viewport |

### iOS (Agent-built)
| Layer | Tool | Scope |
|---|---|---|
| Unit | XCTest | View model logic, data transforms |
| Integration | XCTest + URLProtocol mock | Apollo client responses, error handling |

### iOS (Manual/CI — post-agent)
| Layer | Tool | Scope |
|---|---|---|
| UI Automation | XCUITest | Homepage loads, search works, navigation |

### iOS React Native (Agent-built)
| Layer | Tool | Scope |
|---|---|---|
| Unit | Jest | Utilities, data transforms |
| Component | Jest + React Native Testing Library | Each component with mock data, loading/error states |
| Integration | Jest + MSW | Search flow with mocked GraphQL, homepage load |

### iOS React Native (Manual/CI — post-agent)
| Layer | Tool | Scope |
|---|---|---|
| E2E | Detox or Maestro | Full flows on iOS simulator |

### Android (Agent-built)
| Layer | Tool | Scope |
|---|---|---|
| Unit | JUnit 5 + MockK | View model logic |
| Compose UI | compose-ui-test | Components render, click handlers |
| Integration | JUnit + MockWebServer | Apollo client responses |

### Android (Manual/CI — post-agent)
| Layer | Tool | Scope |
|---|---|---|
| Instrumented | Espresso + Compose testing | Full flows on emulator |

### Cross-platform
- **API contract**: Codegen validates operations against schema on every build
- **Content consistency**: CI verifies all series IDs in homepage.yaml are valid
- **Visual**: Design token consistency + manual review (no pixel-comparison across platforms)

---

## Implementation Sequence

### Step 1: Repo setup (Phase 0)
- Create repo with npm workspaces, shared/ directory
- Query the API to find real series IDs for homepage sections
- Write homepage.yaml, tokens.yaml, generate-tokens.ts, compile-homepage.ts
- Generate token files and pre-compiled homepage content (.json/.swift/.kt)
- Create pre-configured codegen configs in shared/codegen/
- Ensure dc-placeholder.png is in shared/assets/
- Commit

### Step 2: Web app (Agent 1)
1. `create-next-app` with TypeScript + Tailwind + App Router
2. Install `@apollo/client`, `@apollo/experimental-nextjs-app-support`, `@graphql-codegen/cli`
3. Run codegen using pre-configured `shared/codegen/codegen-web.ts`
4. Set up Apollo Client with Next.js SSR support
5. Import pre-compiled `homepage.json` for homepage content
6. Use shared Cloudinary URL helper for cover image transforms
7. Build homepage → search → detail pages
8. Apply design tokens via Tailwind config
9. Write unit, component, and integration tests (no E2E)

### Step 3: iOS app (Agent 2)
1. Create Xcode project (SwiftUI, iOS 16+)
2. Add Apollo iOS via SPM (no Yams needed — homepage content is pre-compiled)
3. Run Apollo codegen using pre-configured `shared/codegen/apollo-codegen-config.json`
4. Set up Apollo client singleton
5. Import pre-compiled `homepage.swift` for homepage content
6. Use shared Cloudinary URL template for cover image transforms
7. Build HomeView → SearchView → detail views
8. Apply design tokens
9. Write unit and integration tests (no XCUITest)

### Step 4: iOS React Native app (Agent 3)
1. `npx create-expo-app` with TypeScript template
2. Install `@apollo/client`, `@graphql-codegen/cli`, `expo-router`
3. Run codegen using pre-configured `shared/codegen/codegen-rn.ts`
4. Set up Apollo Client
5. Configure Expo Router for file-based navigation
6. Import pre-compiled `homepage.json` for homepage content
7. Use shared Cloudinary URL helper for cover image transforms
8. Build HomeScreen → SearchScreen → detail screens
9. Apply design tokens via shared `tokens.ts` (NativeWind or StyleSheet)
10. Configure app icon via `app.json` using the shared app tile asset
11. Write unit, component, and integration tests (no E2E)

### Step 5: Android app (Agent 4)
1. Create Android Studio project (Compose, min SDK 26)
2. Add Apollo Kotlin dependency (no kaml needed — homepage content is pre-compiled)
3. Run codegen using pre-configured Apollo Gradle plugin settings
4. Set up Apollo client
5. Import pre-compiled `homepage.kt` for homepage content
6. Use shared Cloudinary URL template for cover image transforms
7. Build HomeScreen → SearchScreen → detail screens
8. Apply design tokens via Compose theme
9. Write unit, Compose UI, and integration tests (no Espresso/instrumented)

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

- Cover images are served from Cloudinary via the `coverImageUrl` field on Issue. When `coverImageUrl` is null, display the placeholder image (`shared/assets/dc-placeholder.png`) instead. This fallback is handled in the frontend, not the API.
- **Cloudinary URL transforms are centralized.** To prevent four different agents from implementing slightly different URL manipulation, the standard transform templates are defined in `shared/design-tokens/tokens.yaml` under a `cloudinary` key (e.g., `thumbnail: "w_300,h_450,c_fill"`, `detail: "w_600,h_900,c_fill"`). The generated token files (`tokens.ts`, `tokens.swift`, `tokens.kt`) include these as string constants. All apps must use these constants rather than hardcoding transform strings.
- The `searchIssues` query handles the series+issue number search. For creators, use the existing `creators(search:)` query. For series browsing, use `allSeries(search:)`.
- All four apps are read-only consumers of the deployed API. No mutations needed.
- All four apps connect to the production API at `https://comics-n-stuff-gql-production.up.railway.app` (not localhost).
- The web app domain is `dcdecade.com`.
- The React Native app shares the same codegen toolchain as the web app (`@graphql-codegen/cli`) and the same `tokens.ts` design tokens, making it the most code-similar to the web app while targeting iOS natively.

---

## Credits

All apps should display the following in a footer or credits section:

Copyright @ 2026 Rod Machen | Comics data: [GCD](https://www.comics.org/) | Image data: [Comic Vine](https://comicvine.gamespot.com/)
