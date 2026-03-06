import Foundation

let defaultOtpPeriodSeconds = 30
let defaultOtpDigits: UInt32 = 6

struct OtpPreview {
  let code: String
  let normalizedSecret: String
  let validForSeconds: Int
}

struct IdentityPreview {
  let mnemonic: String
  let publicKeyHex: String
}

struct RustBridgeRuntime {
  let bridge: RustMobileBridge
  let loadError: String?
}

protocol RustMobileBridge {
  func normalizeSecret(_ secret: String) -> String
  func validateSecret(_ secret: String) throws -> String
  func previewCode(secret: String, unixTimeSeconds: Int) throws -> OtpPreview
  func deriveIdentity(secretInput: String) throws -> IdentityPreview
}

struct RustBridgeException: LocalizedError {
  let message: String

  var errorDescription: String? {
    message
  }
}

func loadRustMobileBridge() -> RustBridgeRuntime {
  uniffiEnsureGaubee2faMobileBridgeInitialized()
  return RustBridgeRuntime(bridge: UniFfiRustMobileBridge(), loadError: nil)
}

private struct UniFfiRustMobileBridge: RustMobileBridge {
  func normalizeSecret(_ secret: String) -> String {
    normalizeSecretText(secret: secret)
  }

  func validateSecret(_ secret: String) throws -> String {
    do {
      return try validateSecretText(secret: secret)
    } catch let error as MobileBridgeError {
      throw RustBridgeException(message: mapBridgeError(error))
    } catch {
      throw RustBridgeException(message: error.localizedDescription)
    }
  }

  func previewCode(secret: String, unixTimeSeconds: Int) throws -> OtpPreview {
    do {
      let preview = try previewTotp(
        secret: secret,
        unixTimeSeconds: UInt64(unixTimeSeconds),
        periodSeconds: UInt64(defaultOtpPeriodSeconds),
        digits: defaultOtpDigits
      )
      return OtpPreview(
        code: preview.code,
        normalizedSecret: preview.normalizedSecret,
        validForSeconds: Int(preview.validForSeconds)
      )
    } catch let error as MobileBridgeError {
      throw RustBridgeException(message: mapBridgeError(error))
    } catch {
      throw RustBridgeException(message: error.localizedDescription)
    }
  }

  func deriveIdentity(secretInput: String) throws -> IdentityPreview {
    do {
      let identity = try deriveMobileIdentity(secretInput: secretInput)
      return IdentityPreview(mnemonic: identity.mnemonic, publicKeyHex: identity.publicKeyHex)
    } catch let error as MobileBridgeError {
      throw RustBridgeException(message: mapBridgeError(error))
    } catch {
      throw RustBridgeException(message: error.localizedDescription)
    }
  }
}

private func mapBridgeError(_ error: MobileBridgeError) -> String {
  switch error {
  case .EmptySecret:
    return "密钥为空。"
  case .InvalidSecret:
    return "密钥不是有效的 Base32。"
  case .EmptyInput:
    return "输入不能为空。"
  case .MnemonicGeneration:
    return "助记词派生失败。"
  case .InvalidPublicKey:
    return "公钥无效。"
  case .InvalidSignature:
    return "签名无效。"
  case .EncryptFailed:
    return "加密失败。"
  case .DecryptFailed:
    return "解密失败。"
  case .RandomUnavailable:
    return "随机源不可用。"
  case .InvalidPeriod:
    return "周期必须大于 0。"
  case .InvalidDigits:
    return "验证码位数必须在 1 到 10 之间。"
  }
}
