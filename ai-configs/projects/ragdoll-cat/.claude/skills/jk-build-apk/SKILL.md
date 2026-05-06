---
name: jk-build-apk
description: "Build ClassSwift APK files for a given variant (stage, rc, or prod) and copy to ~/Downloads or a custom output directory. Supports optional version override. Use when the user wants to build APK — e.g. '/jk-build-apk stage', '/jk-build-apk prod', '/jk-build-apk stage 1.13.0', 'build staging APK', '包 APK', '編譯 APK', '版本號改成 1.13.0'."
user_invocable: true
arguments:
  - name: variant
    description: "Build variant: stage, rc, or prod. Defaults to stage if omitted."
    required: false
    default: "stage"
  - name: version
    description: "Version override in X.Y.Z format (e.g. 1.13.0). If omitted, uses the current version in build.gradle.kts."
    required: false
  - name: outputDir
    description: "Custom output directory for APK files. Defaults to ~/Downloads if omitted."
    required: false
---

# Build ClassSwift APK

Build APK files for the specified variant and copy them to the output directory.

## Variant Mapping

| Argument | Gradle Task | Output APKs |
|----------|-------------|-------------|
| `stage` | `assembleStageApks` | AOSP Stag + EDLA Stag (Debug & Release) |
| `rc` | `assembleReleaseCandidateApks` | AOSP RC + EDLA RC (Debug & Release) |
| `prod` | `assembleProductionApks` | AOSP Prod + EDLA Prod (Debug & Release) |

## Steps

1. **Parse arguments.** Determine the variant (default: `stage`), version (optional), and output directory (default: `~/Downloads`).

2. **Validate the variant.** Must be one of `stage`, `rc`, or `prod`. If invalid, list the valid options and stop.

3. **If a version is provided, temporarily update `app/build.gradle.kts`:**

   The version code format is `MMNNHRRII` where MM=major, NN=minor, H=hotfix, RR=rc, II=internal.
   The version codes live near the top of `app/build.gradle.kts`:
   ```
   val aospVersionCode = 11200003 // 1.12.0.00.03
   val edlaVersionCode = 11200003 // 1.12.0.00.03
   ```

   To convert a version like `1.13.0` to a version code, keep the existing RC and INTERNAL digits:
   - Read the current `aospVersionCode` and `edlaVersionCode` values
   - Extract the last 4 digits (RRII) from each to preserve them
   - Compute new code: `major * 10000000 + minor * 100000 + hotfix * 10000 + existingRRII`
   - Update both lines using the Edit tool, including the comment

   **Remember the original values so you can revert after the build.**

4. **Run the Gradle build:**
   - `stage` → `./gradlew assembleStageApks`
   - `rc` → `./gradlew assembleReleaseCandidateApks`
   - `prod` → `./gradlew assembleProductionApks`
   - If an `outputDir` argument was provided, append `-PoutputDir=<outputDir>` to the command.

   This build can take several minutes. Let the user know it's running.

5. **If the version was changed in step 3, revert `app/build.gradle.kts` back to the original values** using the Edit tool. This ensures the working tree stays clean.

6. **Report the result.** On success, list the APK files copied to the output directory and the version used. On failure, show the relevant error output (and still revert the version if it was changed).
