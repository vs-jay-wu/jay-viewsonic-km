---
name: jk-install-cs
description: "Build and install the ClassSwift APK (edlaStagDebug) onto an Android device via adb. Use this skill whenever the user wants to install, deploy, or push the app to a device — e.g. '/jk-install-cs', 'install on device', 'deploy APK', 'push to sm-x520', 'build and install', '裝到設備上', '安裝 APK'."
user_invocable: true
arguments:
  - name: device
    description: "Target adb device serial (e.g. sm-x520). Defaults to sm-x520 if omitted."
    required: false
    default: "sm-x520"
---

# Install ClassSwift APK

Build the `edlaStagDebug` variant and install it on the target device.

## Steps

1. **Parse the device argument.** If the user provided a device name after `/jk-install-cs`, use it. Otherwise default to `sm-x520`.

2. **Verify the device is connected:**
   ```bash
   adb devices
   ```
   Confirm the target device serial appears in the list. If not, warn the user and stop.

3. **Build the APK:**
   ```bash
   ./gradlew assembleEdlaStagDebug
   ```
   This is a Gradle build — it can take a few minutes. Run it and let the user know when it finishes.

4. **Locate the APK.** The output lives in:
   ```
   app/build/outputs/apk/edlaStag/debug/
   ```
   The filename follows the pattern `ClassSwift_EDLA_*_Stag_Debug.apk` (version-dependent). Find the `.apk` file in that directory — there should be exactly one.

5. **Install onto the device:**
   ```bash
   adb -s <device> install -r <path-to-apk>
   ```
   The `-r` flag allows reinstall over an existing installation.

6. **Report the result.** Tell the user whether the install succeeded or failed, and which device it was installed on.
