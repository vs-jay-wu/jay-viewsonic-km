# File Placement Conventions

This rule documents where specific categories of files must be placed.

## Constants

- **Primary location:** `com.viewsonic.classswift.constant` (`constant/`)
- App-wide constants → `AppConstants.kt`
- API constants → `ApiConstant.kt`
- Analytics constants → `AmplitudeConstant.kt`, `FirebaseAnalyticsConstant.kt`, etc.
- Domain-specific config keys (e.g., Remote Config) → `data/constant/`
- Do NOT scatter constants across feature packages; centralize them by concern.

## API Layer (`api/`)

| Category | Location | Naming |
|----------|----------|--------|
| Request bodies | `api/body/` | `{Action}Body.kt` (e.g., `LoginPostNoTokenBody.kt`) |
| Response models | `api/response/` | `{Resource}Response.kt` (e.g., `LoginResponse.kt`) |
| Shared response data | `api/response/data/` | Plain data class name |
| Response → domain mappers | Inside the response file | `fun ResponseType.toDomainModel()` |
| Service interfaces | `api/` | `{Feature}ApiService.kt` |
| Interceptors | `api/interceptor/` | — |
| Moshi adapters | `api/moshi/` | — |
| Retrofit wrappers | `api/retrofit/` | — |

## Domain Models (`data/`)

- Generic / shared models → `data/info/` (e.g., `UserInfo.kt`, `ClassroomInfo.kt`)
- Feature-specific models → feature subdirectory under `data/` (e.g., `data/quiz/`, `data/task/`)
- Enumerations → `data/enum/`
- Database entities → `data/database/`
- DataStore classes → `data/datastore/`

## DI Modules

- All Koin module registrations go in `di/KoinModules.kt` (single centralized file).
- Use correct lifecycle scope: `single` / `factory` / `viewModel`.

## UI Layer (`ui/`)

| Category | Location |
|----------|----------|
| Activities | `ui/activity/` |
| Fragments | `ui/fragment/` |
| ViewModels (**only**) | `ui/viewmodel/` |
| Windows | `ui/window/` |
| Window models | `ui/windowmodel/` |
| Widgets (custom compound views) | `ui/widget/{feature}/` |
| Widget models | `ui/widgetmodel/{feature}/` |
| Custom views (standalone) | `ui/customview/` |

Widgets are organized **by feature** in subdirectories (e.g., `widget/quiz/`, `widget/toolbar/`),
not in a flat structure.

### UiHelper (`ui/helper/`)

For extractable Context / UI / SDK logic (e.g., initialization routines) that can be managed centrally.

- File path: `app/src/main/java/com/viewsonic/classswift/ui/helper/`
- Use as Kotlin `object` with **no mutable state** (stateless utility).

### `ui/viewmodel/` Purity

`ui/viewmodel/` is **exclusively** for ViewModel classes. Do not place helper classes, resolvers,
standalone functions, or data classes as separate files in this directory.

- If a helper is only used by one ViewModel: inline it as a private/internal function + inner data class inside that ViewModel.
- If shared across ViewModels but depends on UI-layer types: keep it inside one of the ViewModels or consider a `ui/` sub-package.
- If it has no UI-layer dependency: place in `manager/` or `data/`.

## Architecture Components

| Component | Scope | Lifecycle (Koin) | Description |
|-----------|-------|-----------------|-------------|
| **WindowModel** | Per-window | `factory` | 1:1 with its Window; created and destroyed together. All business logic lives here — only `CSWindowManager` / Android SDK / View operations stay in the Window. |
| **Coordinator** | Per-feature | `factory` | Feature-scoped component **with** flow initiation control. |
| **Handler** | Per-feature | `factory` | Feature-scoped component **without** flow initiation control. |
| **Manager** | Cross-feature | `single` | Shared across many features; no flow initiation control. |
| **UiManager** | Cross-window | `single` | Contains Context / UI / SDK operations that need to be shared across Windows. Used inside Window classes. |

### DI Convention

- **Manager** and **UiManager** use Koin **lazy injection** (`by inject()`).
