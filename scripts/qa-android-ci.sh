#!/usr/bin/env bash
set -euo pipefail

qa_output="${ANDROID_DEVICE_QA_OUT:-artifacts/android-qa/device}"
mkdir -p "$qa_output"
capture_android_log() {
  adb logcat -d > "$qa_output/native-logcat.txt" 2>&1 || true
}
trap capture_android_log EXIT

adb shell wm size 480x960
adb shell wm density 160
pnpm qa:android:device 2>&1 | tee "$qa_output/device-run.log"
