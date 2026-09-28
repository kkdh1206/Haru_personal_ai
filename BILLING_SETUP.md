# 하루 플러스 네이티브 구독 출시 체크리스트

## 확정 상품

- 상품명: 하루 플러스 월간
- 한국 가격: 월 9,900원
- 무료 체험: 신규 구독자 3일, 이후 자동 갱신
- 제공 범위: 하루 1회 모닝콜과 필요할 때 최대 2회 재통화
- 내부 비용 보호: 연결된 각 통화는 4분 30초부터 자연스럽게 마무리하고 5분에 종료
- 무료 테스트 전화: 계정당 1회

사용자 화면에는 현지화된 갱신 가격, 체험 종료 후 자동 결제, 취소 방법, 이용약관, 개인정보 처리방침과 제공 범위를 표시한다. 내부 통화 시간 보호값은 결제 화면이나 통화 멘트에 노출하지 않는다.

결제 중계 서비스는 사용하지 않는다. iOS는 StoreKit 2와 App Store Server Notifications V2, Android는 Google Play Billing과 Real-time Developer Notifications를 직접 사용한다.

## App Store Connect

1. 자동 갱신 구독 그룹 `하루 플러스`를 만든다.
2. 상품 ID를 코드와 동일한 `haru.plus.monthly`로 만든다.
3. 기간은 1개월, 대한민국 가격은 9,900원으로 지정한다. App Store Connect에서 표시되는 지원 가격 포인트 중 9,900원을 선택하면 된다.
4. 신규 구독자용 introductory offer를 `Free Trial / 3 Days`로 만든다.
5. App Store Server Notifications V2의 Production URL을 `https://<API_HOST>/billing/apple/notifications`로 지정한다. Sandbox URL은 `APPLE_ENVIRONMENT=Sandbox`인 staging 서버로 분리한다.
6. 심사 메모에 결제 화면 진입 경로, Sandbox 테스트 계정, 구매 복원과 구독 관리 경로를 적는다.

앱에는 Apple API 키나 공유 비밀을 넣지 않는다. 구매 시 Firebase UID에서 만든 고정 `appAccountToken`을 StoreKit에 전달하고, 서버가 Apple 서명과 이 토큰을 함께 검증한다.

## Google Play Console

1. 구독 상품 ID를 코드와 동일한 `haru_plus_monthly`로 만든다.
2. 월간 자동 갱신 base plan을 만들고 한국 가격을 9,900원으로 지정한다.
3. 신규 고객 대상 3일 무료 체험 offer를 만들고 offer tag에 `free-trial`을 추가한다.
4. Google Play Android Developer API를 활성화하고, Play Console에서 서버 서비스 계정에 주문·구독 조회 및 관리 권한을 부여한다.
5. Real-time Developer Notifications용 Pub/Sub topic과 push subscription을 만들고 URL을 `https://<API_HOST>/billing/google/notifications`로 지정한다.
6. push subscription에 OIDC 서비스 계정을 설정하고 아래 `GOOGLE_PLAY_NOTIFICATION_AUDIENCE`를 실제 push URL과 같은 audience로 설정한다.

## 서버 환경변수

```dotenv
BILLING_ENFORCEMENT_ENABLED=false
BILLING_ENTITLEMENT_ID=haru_plus

APPLE_BUNDLE_ID=com.poapper.morningcall
APPLE_APP_ID=1234567890
APPLE_ENVIRONMENT=Sandbox
APPLE_ROOT_CA_BASE64=<DER 인증서의 base64 값,여러 개면 쉼표로 연결>
APPLE_ENABLE_ONLINE_CHECKS=true
APPLE_SUBSCRIPTION_PRODUCT_ID=haru.plus.monthly

GOOGLE_PLAY_PACKAGE_NAME=com.poapper.morningcall
GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID=haru_plus_monthly
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON={...}
GOOGLE_PLAY_NOTIFICATION_AUDIENCE=https://<API_HOST>/billing/google/notifications

FIREBASE_SERVICE_ACCOUNT_JSON={...}
```

Apple 루트 인증서는 Apple PKI에서 공식 DER `.cer` 파일을 받아 base64로 인코딩한다. Production에서는 `APPLE_ENVIRONMENT=Production`과 숫자형 Apple App ID가 필수다. Sandbox 검증 중에는 `Sandbox`를 사용한다. 환경이 다른 거래를 한 서버에서 동시에 받으려면 배포 환경을 분리하거나, 출시 전에 환경별 verifier를 선택하는 로직을 추가한다.

Google 서비스 계정 JSON과 Apple 루트 인증서는 서버에만 저장한다. 모바일 앱 바이너리나 저장소에 운영 비밀을 넣지 않는다.

## 동작 흐름

1. 앱이 스토어에서 현지화 가격과 무료 체험 가능 여부를 직접 조회한다.
2. 사용자가 결제하면 스토어 결제창이 뜬다.
3. iOS는 Apple 서명 JWS를, Android는 Play purchase token을 인증된 서버 API로 보낸다.
4. 서버가 Apple/Google 원본 API로 검증한 뒤에만 MongoDB 구독 상태를 활성화한다.
5. 스토어 알림이 갱신, 결제 유예, 취소, 만료, 환불을 서버 상태에 반영한다.
6. 서버가 검증을 완료한 뒤 Apple transaction을 finish하고 Google 구독을 acknowledge한다.

## 안전한 출시 순서

1. `BILLING_ENFORCEMENT_ENABLED=false`로 서버와 앱을 먼저 배포한다.
2. Apple Sandbox와 Google license tester에서 신규 체험, 일반 결제, 갱신, 취소, 만료, 결제 실패, 구매 복원을 확인한다.
3. 앱 동기화와 스토어 알림이 같은 Firebase 사용자 구독 상태를 갱신하는지 확인한다.
4. App Store Connect/Play Console에서 9,900원과 3일 무료 체험 문구가 실제 결제창에 정확히 표시되는지 확인한다.
5. 기존 사용자에게 전환을 공지한 뒤 `BILLING_ENFORCEMENT_ENABLED=true`를 켠다.
6. 첫 2주 동안 연결 시간, 응답률, 재통화율, 사용자당 AI 원가와 스토어 수수료를 매일 확인한다.

## 가격과 추가 사용량 정책

9,900원은 하루 한 번 3~5분 정도 이용하는 초기 월 구독 가격으로 유지한다. 처음부터 자동 초과 과금은 붙이지 않는다. 최소 한 달의 실제 사용량을 수집한 뒤 상위 사용자의 연결 시간과 기여이익을 보고 별도 통화팩을 검토한다.

추가 상품은 동의 없는 자동 청구가 아니라 사용자가 직접 구매하는 스토어 consumable `추가 통화팩`으로 만든다. 구매 전에 제공 분량과 가격을 보여주고, 소진할 때마다 다시 명시적으로 결제하게 한다.

## 출시 전 필수 확인

- 이용약관과 개인정보 처리방침 URL이 실제로 열리는지 확인
- iOS와 Android 가격이 하드코딩 값이 아니라 스토어 현지화 가격을 표시하는지 확인
- 무료 체험 자격이 없는 기존 구독자에게 결제창이 정상 가격을 표시하는지 확인
- 앱 삭제·재설치와 다른 기기 로그인 후 구매 복원이 동작하는지 확인
- 취소 후 만료일까지 이용 가능하고 환불·만료 뒤에는 새 AI 모닝콜이 시작되지 않는지 확인
- 스토어 알림 재전송이 이벤트 ID로 중복 처리되지 않는지 확인
- 전화를 받지 않으면 Gemini realtime session이 시작되지 않는지 운영 로그로 확인
