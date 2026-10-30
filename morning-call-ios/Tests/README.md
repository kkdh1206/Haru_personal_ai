# Weekday alarm regression checks

Run from the repository root on a Mac with Xcode installed:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc \
  -module-cache-path /tmp/haru-swift-module-cache \
  morning-call-ios/morningcall/Models/Alarm.swift \
  morning-call-ios/morningcall/Services/WeekdayAlarmService.swift \
  morning-call-ios/Tests/WeekdayAlarmTests.swift \
  -o /tmp/haru-weekday-tests
/tmp/haru-weekday-tests
```

The tests use an in-memory repository; no account, backend, or scheduled calls
are needed. They cover independent weekday creation, deleting one weekday,
legacy multi-day alarms, split rollback, partial-save retry, deselection,
dated-alarm preservation, and failed deletion.

Build the app through `morningcall.xcworkspace` after running `pod install` in
`morning-call-ios`. The Podfile aligns dependency deployment targets with iOS 18.5.

# Onboarding order and resume checks

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc \
  -module-cache-path /tmp/haru-swift-module-cache \
  morning-call-ios/morningcall/Models/OnboardingStep.swift \
  morning-call-ios/Tests/OnboardingFlowTests.swift \
  -o /tmp/haru-onboarding-tests
/tmp/haru-onboarding-tests
```

Checks the language-first sequence, optional name entry, the shorter Apple
onboarding sequence, resuming Apple accounts without a name, continuation after
the location step, completed-user handling, and legacy progress migration.

System location prompt/denial and actual Apple sign-in still require a device;
follow the recording and regression checklist in
[`APP_STORE_RESUBMISSION.md`](../../APP_STORE_RESUBMISSION.md).
