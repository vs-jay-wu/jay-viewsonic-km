---
name: jk-build-aab
description: "Build ClassSwift AAB (Android App Bundle) file for EDLA production release and copy to ~/Downloads or a custom output directory. Supports optional version override. Use when the user wants to build AAB — e.g. '/jk-build-aab', '/jk-build-aab 1.13.0', 'build AAB', '包 AAB', '編譯 AAB', '版本號改成 1.13.0'."
user_invocable: true
arguments:
  - name: version
    description: "Version override in X.Y.Z format (e.g. 1.13.0). If omitted, uses the current version in build.gradle.kts."
    required: false
  - name: outputDir
    description: "Custom output directory for AAB file. Defaults to ~/Downloads if omitted."
    required: false
---

# Build ClassSwift AAB

Build the EDLA Production Release AAB file and copy it to the output directory.

## Details

- **Gradle Task:** `bundleEdlaProdReleaseAab`
- **Output:** `ClassSwift_EDLA_{version}_Prod_Release.aab`
- AAB is only available for EDLA Production Release (no stage/rc variants).

## Steps

1. **Parse arguments.** Determine the version (optional) and output directory (default: `~/Downloads`).

2. **If a version is provided, temporarily update `app/build.gradle.kts`:**

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

3. **Run the Gradle build:**
   ```bash
   ./gradlew bundleEdlaProdReleaseAab
   ```
   If an `outputDir` argument was provided, append `-PoutputDir=<outputDir>` to the command.

   This build can take several minutes. Let the user know it's running.

4. **If the version was changed in step 2, revert `app/build.gradle.kts` back to the original values** using the Edit tool. This ensures the working tree stays clean.

5. **Report the result.** On success, show the AAB file path in the output directory and the version used. On failure, show the relevant error output (and still revert the version if it was changed).
