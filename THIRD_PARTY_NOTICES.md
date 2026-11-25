# Third-Party Notices

This document records the direct runtime dependencies used by **Axonkey Mobile**
([timeStarry/axonkey-mobile](https://github.com/timeStarry/axonkey-mobile)), the mobile wireless controller
and virtual microphone companion for [leowzz/axonkey](https://github.com/leowzz/axonkey).

Axonkey Mobile's original source code is licensed under the **GNU General Public License v3.0 only (`GPL-3.0-only`)**
(see [LICENSE](LICENSE)), matching the upstream Axonkey desktop repository. Each third-party library below retains
its own permissive open-source license, all of which are compatible with `GPL-3.0-only`.

## Web UI Dependencies (`package.json`)

| Package | License | Purpose |
| --- | --- | --- |
| `react` / `react-dom` | MIT | Declarative UI rendering |
| `zustand` | MIT | Reactive session, layout, and local-feel state store |
| `lucide-react` | ISC | Clean vector iconography |
| `clsx` | MIT | Conditional class composition |
| `tailwindcss` | MIT | Design-token CSS utility compilation |

## Android Native Shell Dependencies (`android/app/build.gradle.kts`)

| Artifact | License | Purpose |
| --- | --- | --- |
| `androidx.core:core-ktx` | Apache-2.0 | Window insets, `FileProvider`, and Android platform compat |
| `androidx.activity:activity-ktx` | Apache-2.0 | Lightweight `ComponentActivity`, back-gesture & result contracts |
| `androidx.webkit:webkit` | Apache-2.0 | `WebViewAssetLoader` local HTTPS asset serving |
| `com.squareup.okhttp3:okhttp` | Apache-2.0 | Private-CA pinned `WSS` transport & GitHub Release updater |
| `com.google.zxing:core` | Apache-2.0 | QR code decoding |
| `com.journeyapps:zxing-android-embedded` | Apache-2.0 | Camera QR pairing scanner activity |
