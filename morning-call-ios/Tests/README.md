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
