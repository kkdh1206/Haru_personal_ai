package com.poapper.morningcall.billing

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.poapper.morningcall.data.APIClient
import com.poapper.morningcall.data.AuthRepository
import com.poapper.morningcall.model.BillingEntitlement
import java.security.MessageDigest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SubscriptionUiState(
    val entitlement: BillingEntitlement? = null,
    val localizedMonthlyPrice: String = "₩9,900",
    val isLoading: Boolean = false,
    val error: String? = null,
) {
    val isActive: Boolean get() = entitlement?.isActive == true
    val isTrial: Boolean get() = entitlement?.status == "trial"
}

class SubscriptionManager(
    context: Context,
    private val api: APIClient,
    private val auth: AuthRepository,
) : PurchasesUpdatedListener {
    private val productId = "haru_plus_monthly"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val _state = MutableStateFlow(SubscriptionUiState())
    val state: StateFlow<SubscriptionUiState> = _state.asStateFlow()

    private val billingClient = BillingClient.newBuilder(context.applicationContext)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .build(),
        )
        .enableAutoServiceReconnection()
        .build()

    private var productDetails: ProductDetails? = null
    private var selectedOffer: ProductDetails.SubscriptionOfferDetails? = null
    private var connecting = false
    private var backendGeneration = 0L

    fun configure() {
        if (auth.currentUserId() == null) return
        refreshBackend()
        connectAndRefresh()
    }

    fun refresh() {
        refreshBackend()
        connectAndRefresh()
    }

    fun resetForBackendChange() {
        backendGeneration += 1
        _state.value = SubscriptionUiState(
            localizedMonthlyPrice = _state.value.localizedMonthlyPrice,
        )
    }

    fun purchaseMonthly(activity: Activity) {
        val details = productDetails
        val offer = selectedOffer
        val accountId = auth.currentUserId()?.let(::obfuscatedAccountId)
        if (details == null || offer == null || accountId == null) {
            setError("월간 구독 상품을 불러오지 못했어요.")
            connectAndRefresh()
            return
        }

        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)
            .setOfferToken(offer.offerToken)
            .build()
        val flowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParams))
            .setObfuscatedAccountId(accountId)
            .build()
        _state.value = _state.value.copy(isLoading = true, error = null)
        val result = billingClient.launchBillingFlow(activity, flowParams)
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            setError(result.debugMessage.ifBlank { "결제를 시작하지 못했어요." })
        }
    }

    fun restorePurchases() {
        _state.value = _state.value.copy(isLoading = true, error = null)
        queryOwnedPurchases(showMissingError = true)
    }

    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }

    override fun onPurchasesUpdated(
        billingResult: BillingResult,
        purchases: MutableList<Purchase>?,
    ) {
        when (billingResult.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                val purchase = purchases?.firstOrNull { productId in it.products }
                if (purchase == null) {
                    setError("구매 정보를 확인하지 못했어요.")
                } else {
                    syncPurchase(purchase)
                }
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> {
                _state.value = _state.value.copy(isLoading = false)
            }
            else -> setError(billingResult.debugMessage.ifBlank { "결제에 실패했어요." })
        }
    }

    private fun connectAndRefresh() {
        if (billingClient.isReady) {
            loadProductDetails()
            queryOwnedPurchases(showMissingError = false)
            return
        }
        if (connecting) return
        connecting = true
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                connecting = false
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    loadProductDetails()
                    queryOwnedPurchases(showMissingError = false)
                } else {
                    setError(billingResult.debugMessage.ifBlank { "Google Play에 연결하지 못했어요." })
                }
            }

            override fun onBillingServiceDisconnected() {
                connecting = false
            }
        })
    }

    private fun loadProductDetails() {
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(productId)
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(listOf(product))
            .build()
        billingClient.queryProductDetailsAsync(params) { billingResult, result ->
            if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                setError(billingResult.debugMessage.ifBlank { "구독 상품을 불러오지 못했어요." })
                return@queryProductDetailsAsync
            }
            val details = result.productDetailsList.firstOrNull()
            productDetails = details
            selectedOffer = details?.subscriptionOfferDetails
                ?.minByOrNull { offer ->
                    if (offer.pricingPhases.pricingPhaseList.any { it.priceAmountMicros == 0L }) 0 else 1
                }
            val displayPrice = selectedOffer
                ?.pricingPhases
                ?.pricingPhaseList
                ?.lastOrNull()
                ?.formattedPrice
            if (displayPrice != null) {
                _state.value = _state.value.copy(localizedMonthlyPrice = displayPrice)
            }
        }
    }

    private fun queryOwnedPurchases(showMissingError: Boolean) {
        if (!billingClient.isReady) {
            connectAndRefresh()
            return
        }
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        billingClient.queryPurchasesAsync(params) { billingResult, purchases ->
            val purchase = purchases.firstOrNull {
                productId in it.products && it.purchaseState == Purchase.PurchaseState.PURCHASED
            }
            when {
                billingResult.responseCode != BillingClient.BillingResponseCode.OK -> {
                    setError(billingResult.debugMessage.ifBlank { "구매 내역을 확인하지 못했어요." })
                }
                purchase != null -> syncPurchase(purchase)
                showMissingError -> setError("복원할 활성 구독이 없어요.")
                else -> _state.value = _state.value.copy(isLoading = false)
            }
        }
    }

    private fun syncPurchase(purchase: Purchase) {
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) {
            _state.value = _state.value.copy(isLoading = false)
            return
        }
        val generation = backendGeneration
        scope.launch {
            runCatching { api.syncGoogleBilling(purchase.purchaseToken, productId) }
                .onSuccess { entitlement ->
                    if (generation != backendGeneration) return@onSuccess
                    _state.value = _state.value.copy(
                        entitlement = entitlement,
                        isLoading = false,
                        error = null,
                    )
                }
                .onFailure {
                    if (generation == backendGeneration) {
                        setError(it.message ?: "구독 상태 동기화에 실패했어요.")
                    }
                }
        }
    }

    private fun refreshBackend() {
        val generation = backendGeneration
        scope.launch {
            runCatching { api.billingEntitlement() }
                .onSuccess { entitlement ->
                    if (generation != backendGeneration) return@onSuccess
                    _state.value = _state.value.copy(entitlement = entitlement)
                }
        }
    }

    private fun obfuscatedAccountId(userId: String): String {
        return MessageDigest.getInstance("SHA-256")
            .digest(userId.toByteArray())
            .joinToString("") { "%02x".format(it) }
    }

    private fun setError(message: String) {
        _state.value = _state.value.copy(isLoading = false, error = message)
    }
}
