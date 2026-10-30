import CryptoKit
import Foundation
import StoreKit
import UIKit

struct BillingEntitlement: Decodable {
    let entitlementId: String
    let status: String
    let productId: String?
    let store: String?
    let expiresAt: Date?
    let willRenew: Bool
    let isActive: Bool
    let enforcementEnabled: Bool

    private enum CodingKeys: String, CodingKey {
        case entitlementId, status, productId, store, expiresAt
        case willRenew, isActive, enforcementEnabled
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        entitlementId = try container.decode(String.self, forKey: .entitlementId)
        status = try container.decode(String.self, forKey: .status)
        productId = try container.decodeIfPresent(String.self, forKey: .productId)
        store = try container.decodeIfPresent(String.self, forKey: .store)
        willRenew = try container.decode(Bool.self, forKey: .willRenew)
        isActive = try container.decode(Bool.self, forKey: .isActive)
        enforcementEnabled = try container.decode(Bool.self, forKey: .enforcementEnabled)

        if let rawDate = try container.decodeIfPresent(String.self, forKey: .expiresAt) {
            let fractionalFormatter = ISO8601DateFormatter()
            fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            expiresAt = fractionalFormatter.date(from: rawDate) ?? ISO8601DateFormatter().date(from: rawDate)
        } else {
            expiresAt = nil
        }
    }
}

@MainActor
final class SubscriptionManager: ObservableObject {
    @Published private(set) var entitlement: BillingEntitlement?
    @Published private(set) var monthlyProduct: Product?
    @Published private(set) var isEligibleForTrial = false
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingProduct = false
    @Published var errorMessage: String?
    @Published var showPaywall = false

    private let productID = "haru.plus.monthly"
    private var configuredUserID: String?
    private var transactionListener: Task<Void, Never>?

    var isActive: Bool { entitlement?.isActive == true }
    var isTrial: Bool { entitlement?.status == "trial" }
    var localizedMonthlyPrice: String { monthlyProduct?.displayPrice ?? "—" }

    deinit {
        transactionListener?.cancel()
    }

    func configure(appUserID: String) {
        guard !appUserID.isEmpty else { return }
        configuredUserID = appUserID
        if transactionListener == nil {
            transactionListener = observeTransactions()
        }
        refresh()
    }

    func refresh() {
        refreshBackendEntitlement()
        Task {
            await loadProduct()
            await syncCurrentStoreEntitlement()
        }
    }

    func purchaseMonthly() {
        guard let monthlyProduct, let appAccountToken else {
            errorMessage = "월간 구독 상품을 불러오지 못했어요."
            return
        }
        isLoading = true
        errorMessage = nil

        Task {
            do {
                let result = try await monthlyProduct.purchase(
                    options: [.appAccountToken(appAccountToken)]
                )
                switch result {
                case .success(let verification):
                    let transaction = try verified(verification)
                    try await syncBackend(signedTransactionInfo: verification.jwsRepresentation)
                    await transaction.finish()
                    showPaywall = false
                case .userCancelled, .pending:
                    break
                @unknown default:
                    break
                }
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    func restorePurchases() {
        isLoading = true
        errorMessage = nil
        Task {
            do {
                try await AppStore.sync()
                let restored = await latestCurrentTransaction()
                guard let restored else {
                    errorMessage = "복원할 활성 구독이 없어요."
                    isLoading = false
                    return
                }
                try await syncBackend(signedTransactionInfo: restored.signedJWS)
                showPaywall = false
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    func openSubscriptionManagement() {
        guard let url = URL(string: "https://apps.apple.com/account/subscriptions") else { return }
        UIApplication.shared.open(url)
    }

    private var appAccountToken: UUID? {
        guard let configuredUserID else { return nil }
        let digest = SHA256.hash(data: Data(configuredUserID.utf8))
        let hex = digest.map { String(format: "%02x", $0) }.joined()
        return UUID(uuidString: "\(hex.prefix(8))-\(hex.dropFirst(8).prefix(4))-\(hex.dropFirst(12).prefix(4))-\(hex.dropFirst(16).prefix(4))-\(hex.dropFirst(20).prefix(12))")
    }

    private func loadProduct() async {
        guard !isLoadingProduct else { return }
        isLoadingProduct = true
        errorMessage = nil
        defer { isLoadingProduct = false }
        do {
            monthlyProduct = try await Product.products(for: [productID]).first
            guard let monthlyProduct else {
                isEligibleForTrial = false
                errorMessage = "월간 구독 상품을 불러오지 못했어요."
                return
            }
            if let subscription = monthlyProduct.subscription,
               let offer = subscription.introductoryOffer,
               offer.paymentMode == .freeTrial,
               offer.period.unit == .day,
               offer.period.value * offer.periodCount == 3 {
                isEligibleForTrial = await subscription.isEligibleForIntroOffer
            } else {
                isEligibleForTrial = false
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func verified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let value):
            return value
        case .unverified(_, let error):
            throw error
        }
    }

    private func observeTransactions() -> Task<Void, Never> {
        Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                do {
                    let transaction = try self.verified(result)
                    guard transaction.productID == self.productID else { continue }
                    try await self.syncBackend(
                        signedTransactionInfo: result.jwsRepresentation
                    )
                    await transaction.finish()
                } catch {
                    self.errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func latestCurrentTransaction() async -> (transaction: Transaction, signedJWS: String)? {
        var latest: (transaction: Transaction, signedJWS: String)?
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  transaction.productID == productID else { continue }
            let candidateExpiry = transaction.expirationDate ?? .distantPast
            let latestExpiry = latest?.transaction.expirationDate ?? .distantPast
            if latest == nil || candidateExpiry > latestExpiry {
                latest = (transaction, result.jwsRepresentation)
            }
        }
        return latest
    }

    private func syncCurrentStoreEntitlement() async {
        let transaction = await latestCurrentTransaction()
        do {
            try await syncBackend(signedTransactionInfo: transaction?.signedJWS)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func refreshBackendEntitlement() {
        APIClient.request(path: "/billing/entitlement") { [weak self] (result: Result<BillingEntitlement, Error>) in
            DispatchQueue.main.async {
                if case .success(let entitlement) = result {
                    self?.entitlement = entitlement
                }
            }
        }
    }

    private func syncBackend(signedTransactionInfo: String?) async throws {
        let body: [String: Any?] = signedTransactionInfo.map {
            ["signedTransactionInfo": $0]
        } ?? [:]
        let entitlement: BillingEntitlement = try await withCheckedThrowingContinuation { continuation in
            APIClient.request(path: "/billing/apple/sync", method: .POST, body: body) {
                (result: Result<BillingEntitlement, Error>) in
                continuation.resume(with: result)
            }
        }
        self.entitlement = entitlement
    }
}
