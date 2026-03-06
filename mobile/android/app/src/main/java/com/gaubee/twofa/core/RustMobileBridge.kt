package com.gaubee.twofa.core

import uniffi.gaubee_2fa_mobile_bridge.MobileBridgeException
import uniffi.gaubee_2fa_mobile_bridge.deriveMobileIdentity as ffiDeriveMobileIdentity
import uniffi.gaubee_2fa_mobile_bridge.normalizeSecretText as ffiNormalizeSecretText
import uniffi.gaubee_2fa_mobile_bridge.previewTotp as ffiPreviewTotp
import uniffi.gaubee_2fa_mobile_bridge.uniffiEnsureInitialized
import uniffi.gaubee_2fa_mobile_bridge.validateSecretText as ffiValidateSecretText

const val defaultOtpPeriodSeconds = 30L
const val defaultOtpDigits = 6

data class OtpPreview(
  val code: String,
  val normalizedSecret: String,
  val validForSeconds: Long,
)

data class IdentityPreview(
  val mnemonic: String,
  val publicKeyHex: String,
)

class RustBridgeException(message: String, cause: Throwable? = null) : Exception(message, cause)

interface RustMobileBridge {
  fun normalizeSecret(secret: String): String
  @Throws(RustBridgeException::class)
  fun validateSecret(secret: String): String
  @Throws(RustBridgeException::class)
  fun previewTotp(secret: String, unixTimeSeconds: Long): OtpPreview
  @Throws(RustBridgeException::class)
  fun deriveMobileIdentity(secretInput: String): IdentityPreview
}

data class RustBridgeRuntime(
  val bridge: RustMobileBridge?,
  val loadError: String?,
)

fun loadRustMobileBridge(): RustBridgeRuntime {
  return try {
    uniffiEnsureInitialized()
    RustBridgeRuntime(bridge = UniFfiRustMobileBridge(), loadError = null)
  } catch (error: Throwable) {
    RustBridgeRuntime(
      bridge = null,
      loadError = buildUnavailableMessage(error),
    )
  }
}

private class UniFfiRustMobileBridge : RustMobileBridge {
  override fun normalizeSecret(secret: String): String {
    return ffiNormalizeSecretText(secret)
  }

  override fun validateSecret(secret: String): String {
    return try {
      ffiValidateSecretText(secret)
    } catch (error: MobileBridgeException) {
      throw RustBridgeException(mapBridgeError(error), error)
    }
  }

  override fun previewTotp(secret: String, unixTimeSeconds: Long): OtpPreview {
    return try {
      val preview = ffiPreviewTotp(
        secret = secret,
        unixTimeSeconds = unixTimeSeconds.toULong(),
        periodSeconds = defaultOtpPeriodSeconds.toULong(),
        digits = defaultOtpDigits.toUInt(),
      )
      OtpPreview(
        code = preview.code,
        normalizedSecret = preview.normalizedSecret,
        validForSeconds = preview.validForSeconds.toLong(),
      )
    } catch (error: MobileBridgeException) {
      throw RustBridgeException(mapBridgeError(error), error)
    }
  }

  override fun deriveMobileIdentity(secretInput: String): IdentityPreview {
    return try {
      val identity = ffiDeriveMobileIdentity(secretInput)
      IdentityPreview(
        mnemonic = identity.mnemonic,
        publicKeyHex = identity.publicKeyHex,
      )
    } catch (error: MobileBridgeException) {
      throw RustBridgeException(mapBridgeError(error), error)
    }
  }
}

private fun buildUnavailableMessage(error: Throwable): String {
  val detail = error.message?.takeIf { it.isNotBlank() } ?: error::class.simpleName.orEmpty()
  return buildString {
    append("Rust mobile bridge 未加载。先运行 pnpm mobile:bindings，并把 Android .so 构建到 app/src/main/jniLibs。")
    if (detail.isNotBlank()) {
      append("\n")
      append(detail)
    }
  }
}

private fun mapBridgeError(error: MobileBridgeException): String {
  return when (error) {
    is MobileBridgeException.EmptySecret -> "密钥为空。"
    is MobileBridgeException.InvalidSecret -> "密钥不是有效的 Base32。"
    is MobileBridgeException.EmptyInput -> "输入不能为空。"
    is MobileBridgeException.MnemonicGeneration -> "助记词派生失败。"
    is MobileBridgeException.InvalidPublicKey -> "公钥无效。"
    is MobileBridgeException.InvalidSignature -> "签名无效。"
    is MobileBridgeException.EncryptFailed -> "加密失败。"
    is MobileBridgeException.DecryptFailed -> "解密失败。"
    is MobileBridgeException.RandomUnavailable -> "随机源不可用。"
    is MobileBridgeException.InvalidPeriod -> "周期必须大于 0。"
    is MobileBridgeException.InvalidDigits -> "验证码位数必须在 1 到 10 之间。"
    else -> "Rust mobile bridge 调用失败。"
  }
}
