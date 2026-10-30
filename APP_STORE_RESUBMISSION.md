# App Store 재심사 준비 — 2026-10-25

## 적용한 수정

- **Guideline 4:** Apple 기본 로그인 버튼 사용. Apple 이름은 Firebase에 저장하고 서버 프로필의 빈 이름에만 반영한다. Apple 로그인 사용자는 이름 입력 화면을 건너뛰며, 재로그인 시 이름이 전달되지 않아도 진행한다. 이메일 재입력 화면은 없다. 사용자가 지정한 기존 이름과 Apple 비공개 릴레이 이메일을 유지한다.
- **Guideline 5.1.1(iv):** 위치 사전 안내에는 `다음 / Next` 버튼 하나만 표시하며 iOS 권한 요청으로 연결한다. 사전 안내의 `나중에 설정하기`, 권한 허용을 유도하는 버튼, 설정 이동 안내를 제거했다. `허용 안 함` 또는 기기 제한 상태에서는 다음 온보딩 단계로 진행한다. 위치·역지오코딩 실패도 가입을 막지 않는다.
- **Guideline 3.1.2(c):** 구독 화면에 상품명, 1개월 자동 갱신 기간, StoreKit 현지 가격, 결제·취소 안내, Apple 표준 EULA 및 개인정보 처리방침 링크를 표시한다. 설정에서도 약관을 열 수 있다. 가격 로딩 실패 시 임의의 한국 가격을 표시하지 않으며, 실제 3일 무료 체험 상품과 이용 자격이 확인된 경우에만 체험 문구를 표시한다.
- 이름 입력을 생략해도 언어 선택 단계에서 모닝콜 언어가 저장된다. 이름이 없는 사용자의 설정 변경도 허용한다.

## App Store Connect에 반영할 항목

이 파일은 **등록용 문구와 절차**다. App Store Connect 수정, 운영 API 배포, 빌드 업로드, 실제 기기 녹화 및 재심사 제출은 아직 완료하지 않았다.

앱에서는 Apple 표준 EULA를 사용하도록 연결했다. App Store Connect에 기존 Custom EULA가 설정되어 있다면 실제 계약 설정과 앱 링크를 일치시킨 뒤 제출한다. 자체 서비스 이용약관 `/terms`와 앱 라이선스 계약인 EULA는 별도 링크다.

### 앱 설명 (Description)

지원하는 각 언어의 기존 앱 설명 끝에 아래 문구를 추가한다. Review Notes에만 넣으면 Description의 EULA 링크 요구사항을 충족하지 않는다.

한국어:

```text
[하루 플러스 구독 안내]
하루 플러스 월간은 1개월 단위로 자동 갱신되는 구독입니다. 구독 가격과 무료 체험 이용 가능 여부는 앱의 구매 화면에서 확인할 수 있습니다. 구독은 App Store의 구독 관리에서 취소할 수 있습니다.

이용약관 (Apple 표준 EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
개인정보 처리방침: https://morningcall.poapper.com/privacy
```

영어:

```text
[Haru Plus Subscription]
Haru Plus Monthly is an auto-renewable subscription with a one-month period. Subscription pricing and trial eligibility are shown on the purchase screen. You can cancel through App Store subscription settings.

Terms of Use (Apple Standard EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://morningcall.poapper.com/privacy
```

일본어:

```text
[ハルプラスのサブスクリプション]
ハルプラス月額は、1か月ごとに自動更新されるサブスクリプションです。料金と無料体験の対象条件は、アプリの購入画面で確認できます。App Storeのサブスクリプション管理から解約できます。

利用規約（Apple標準EULA）: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
プライバシーポリシー: https://morningcall.poapper.com/privacy
```

### Privacy Policy URL

App Store Connect의 개인정보 처리방침 URL 필드에 아래 주소를 넣는다.

```text
https://morningcall.poapper.com/privacy
```

### App Review Information → Notes

아래 메모는 수정 빌드와 서버 배포 후 사용한다. 녹화 첨부 파일명이나 접근 가능한 URL도 실제 값으로 추가한다.

```text
Review paths for Haru:

1. Sign in with Apple
Use the native Continue with Apple button. We request fullName and email through AuthenticationServices and use Firebase to persist the supplied profile. Apple users are never required to re-enter a name or email, including returning users for whom Apple no longer supplies a name. After language selection, onboarding proceeds to alarm setup without a name-entry screen. Hide My Email is supported. Profile names can be edited voluntarily in Settings.

2. Optional location access
The location explanation has a single Next button that opens the iOS system permission prompt when authorization is undetermined. Selecting Don't Allow continues to calendar setup inside the app. There is no Settings redirect or Settings prompt after denial. Previously denied or restricted access also allows onboarding to continue. Morning calls do not require location access; location is used for weather briefings.

3. Auto-renewable subscription
Open Settings > Subscription > Start subscription to view the paywall for an account without an active subscription. The screen shows the subscription title, one-month renewal period, localized StoreKit price, renewal/cancellation information, Restore Purchases, Terms of Use (Apple Standard EULA), and Privacy Policy. Legal links are also available in Settings > Terms and Privacy. Active subscribers can open subscription management from Settings > Subscription.

Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://morningcall.poapper.com/privacy

The Terms of Use link is included in the App Description, and the Privacy Policy URL is set in App Store Connect.
```

### Resolution Center 답변 초안

**새 빌드·메타데이터 반영과 녹화 첨부를 실제로 완료한 뒤** 아래 답변을 보낸다. 이 문서는 답변을 전송하지 않는다.

```text
Hello App Review,

Thank you for the detailed feedback. We have addressed the reported issues in the resubmitted build:

Guideline 4: The app uses the native Sign in with Apple button and the profile information supplied through AuthenticationServices. Apple users are no longer asked to enter their name or email after signing in. This also applies to returning users when Apple does not provide the name again, and Hide My Email remains supported.

Guideline 5.1.1(iv): The location explanation now has a single Next button that proceeds to the system permission request. We removed the pre-permission skip button and the permission-granting wording. Selecting Don't Allow continues onboarding inside the app without opening Settings or displaying a Settings prompt. Location access is optional for morning calls.

Guideline 3.1.2(c): We added the Apple Standard EULA link to the App Description and confirmed the Privacy Policy URL in App Store Connect. The in-app subscription screen displays the subscription title, duration, localized price, renewal information, and functional Terms of Use and Privacy Policy links.

We have attached a screen recording demonstrating the updated flows and added the review paths and legal links to App Review Information > Notes for future submissions.

Thank you for reviewing our resubmission.
```

## 실제 기기 테스트 및 녹화 순서

제출할 빌드와 배포한 API를 이용한다. 시뮬레이터나 모의 로그인 영상으로 Apple 실계정 동작을 대체하지 않는다.

1. 새 테스트 계정으로 Apple 로그인한다. `이메일 가리기`도 확인하고, 언어 선택 후 바로 알람 설정으로 넘어가는 장면을 녹화한다. 첫 승인에서 받은 이름이 설정의 프로필에 반영되는지도 확인한다.
2. 위치 권한이 아직 결정되지 않은 설치에서 위치 안내의 `다음` → iOS 권한 창 → `허용 안 함`을 녹화한다. 설정 앱으로 이동하거나 설정 안내가 뜨지 않고 캘린더 단계로 이동해야 한다. 나머지 온보딩을 끝내고 알람 기능에 진입한다.
3. 로그아웃·Apple 재로그인, 앱 재실행을 확인한다. 이름 재입력을 요구하면 안 된다. 과거 빌드에서 이름 없이 생성된 Apple 계정과 이름 입력 단계에 멈췄던 계정도 확인한다.
4. 별도 테스트 설치에서 위치를 허용한다. 위치 저장 후 정상 진행하고, GPS/주소 조회 실패 시에도 다음으로 진행할 수 있는지 확인한다. 이미 거절한 상태로 온보딩을 재개해도 설정으로 보내지 않아야 한다.
5. 구독이 없는 테스트 계정에서 `설정 → 구독 → 구독 시작하기`로 들어간다. 상품명, 1개월, 실제 현지 가격, 갱신 문구를 녹화한다. EULA와 개인정보 링크를 각각 눌러 실제 페이지가 열리는 모습까지 포함한다.
6. Apple Sandbox에서 체험 가능/불가능 계정과 구매 복원을 확인한다. 언어는 한국어·영어·일본어를 점검한다. 이름 없는 계정에서도 통화 언어 변경이 저장되어야 한다.
7. 녹화에 Apple 계정 비밀번호나 인증 코드가 포함되지 않게 한다. Resolution Center 답변에 녹화 파일을 첨부하고 Review Notes에도 파일명 또는 심사자가 접근 가능한 링크를 기재한다.

## 배포 순서와 검증 범위

2026-10-27에 재통화·무음 수정이 추가되었다. 현재 작업 내용에는 Python 통화 에이전트도 포함되므로 [통화 안정성 수정 및 배포 순서](CALL_RELIABILITY_FIXES.md)를 함께 적용한다. 에이전트 → API → iOS 순서로 반영한다.

1. `morning-call-api` 변경사항을 운영 서버에 배포한다. 검증된 Firebase 이름을 저장·보완하고, 이름 없이 프로필을 수정할 수 있게 하는 변경이다.
2. Xcode에서 `morningcall.xcworkspace`를 열고 기존 제출보다 큰 build number로 서명된 Archive를 생성해 업로드한다. 로컬 서명 없는 Release 빌드는 업로드용 Archive가 아니다.
3. App Store Connect의 각 언어 Description, Privacy Policy URL, Review Notes를 반영한다.
4. 위 실기기 검증과 녹화를 완료하고 새 빌드를 선택해 재심사를 요청한다.

### 로컬 검증 결과

- iOS `Release`, `generic/platform=iOS`, `CODE_SIGNING_ALLOWED=NO` 전체 빌드: **성공**. 로그: `/private/tmp/haru-app-review-build.log`. 실제 배포용 서명·업로드 검증은 포함하지 않는다.
- API `pnpm build`: **성공**.
- API `pnpm exec jest --runInBand user.service.spec.ts`: **25개 테스트 통과**. Firebase 이름 저장, 비공개 릴레이 이메일, 기존 이름 보존, 이름 누락, 동시 수정·탈퇴, 이름 없는 언어 저장을 포함한다.
- Swift `OnboardingFlowTests`: **통과**. Apple 최초/재로그인·기존 이름 입력 단계 재개·이름 없는 완료 계정·위치 단계 이후 진행 경로를 검사한다. 실제 시스템 권한 창 선택을 자동화한 테스트는 아니다.
- 한국어·영어·일본어 `Localizable.strings`의 `plutil -lint`: **통과**.
- 변경한 TypeScript 파일의 Prettier 검사 및 `git diff --check`: **통과**.
- 운영 `/privacy`, `/terms` 링크: HTTP **200** 확인. Apple 표준 EULA 페이지도 접근 가능함을 확인했다.

실제 기기에서의 Apple 로그인, 시스템 권한 선택, StoreKit 구매, App Store Connect 저장은 별도 확인 대상이다.

## 참고

- [Apple App Review Guidelines — 3.1.2(c), 5.1.1(iv)](https://developer.apple.com/app-store/review/guidelines/)
- [Sign in with Apple HIG](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)
- [Permission requests HIG](https://developer.apple.com/design/human-interface-guidelines/privacy#Requesting-permission)
- [Firebase Apple 로그인: 최초 이름 저장과 재로그인 처리](https://firebase.google.com/docs/auth/ios/apple)
- [Apple 표준 EULA](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/)
