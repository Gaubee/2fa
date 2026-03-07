use gaubee_2fa_crypto_core::{CryptoError, derive_identity};
use gaubee_2fa_otp_core::{
    DEFAULT_DIGITS, DEFAULT_PERIOD_SECONDS, OtpError, generate_totp_with_period, normalize_secret,
    validate_secret,
};
use thiserror::Error;

#[derive(Debug, Error, uniffi::Error)]
pub enum MobileBridgeError {
    #[error("secret is empty")]
    EmptySecret,
    #[error("secret is not valid base32")]
    InvalidSecret,
    #[error("secret input is empty")]
    EmptyInput,
    #[error("mnemonic generation failed")]
    MnemonicGeneration,
    #[error("public key is invalid")]
    InvalidPublicKey,
    #[error("signature is invalid")]
    InvalidSignature,
    #[error("encryption failed")]
    EncryptFailed,
    #[error("decryption failed")]
    DecryptFailed,
    #[error("random source unavailable")]
    RandomUnavailable,
    #[error("period must be greater than 0")]
    InvalidPeriod,
    #[error("digits must be between 1 and 10")]
    InvalidDigits,
}

impl From<OtpError> for MobileBridgeError {
    fn from(value: OtpError) -> Self {
        match value {
            OtpError::EmptySecret => Self::EmptySecret,
            OtpError::InvalidSecret => Self::InvalidSecret,
        }
    }
}

impl From<CryptoError> for MobileBridgeError {
    fn from(value: CryptoError) -> Self {
        match value {
            CryptoError::EmptyInput => Self::EmptyInput,
            CryptoError::MnemonicGeneration => Self::MnemonicGeneration,
            CryptoError::InvalidPublicKey => Self::InvalidPublicKey,
            CryptoError::InvalidSignature => Self::InvalidSignature,
            CryptoError::EncryptFailed => Self::EncryptFailed,
            CryptoError::DecryptFailed => Self::DecryptFailed,
            CryptoError::RandomUnavailable => Self::RandomUnavailable,
        }
    }
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct MobileOtpPreview {
    pub code: String,
    pub normalized_secret: String,
    pub period_seconds: u64,
    pub digits: u32,
    pub issued_at_unix_seconds: u64,
    pub valid_for_seconds: u64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct MobileIdentityPreview {
    pub mnemonic: String,
    pub public_key_hex: String,
}

#[uniffi::export]
pub fn normalize_secret_text(secret: String) -> String {
    normalize_secret(&secret)
}

#[uniffi::export]
pub fn validate_secret_text(secret: String) -> Result<String, MobileBridgeError> {
    let normalized = normalize_secret(&secret);
    validate_secret(&normalized)?;
    Ok(normalized)
}

#[uniffi::export]
pub fn preview_totp(
    secret: String,
    unix_time_seconds: u64,
    period_seconds: Option<u64>,
    digits: Option<u32>,
) -> Result<MobileOtpPreview, MobileBridgeError> {
    let period_seconds = period_seconds.unwrap_or(DEFAULT_PERIOD_SECONDS);
    if period_seconds == 0 {
        return Err(MobileBridgeError::InvalidPeriod);
    }

    let digits = digits.unwrap_or(DEFAULT_DIGITS);
    if !(1..=10).contains(&digits) {
        return Err(MobileBridgeError::InvalidDigits);
    }

    let code = generate_totp_with_period(&secret, unix_time_seconds, period_seconds, digits)?;
    let normalized_secret = normalize_secret(&secret);
    let valid_for_seconds = period_seconds - (unix_time_seconds % period_seconds);

    Ok(MobileOtpPreview {
        code,
        normalized_secret,
        period_seconds,
        digits,
        issued_at_unix_seconds: unix_time_seconds,
        valid_for_seconds,
    })
}

#[uniffi::export]
pub fn derive_mobile_identity(
    secret_input: String,
) -> Result<MobileIdentityPreview, MobileBridgeError> {
    let identity = derive_identity(&secret_input)?;
    Ok(MobileIdentityPreview {
        mnemonic: identity.mnemonic,
        public_key_hex: identity.public_key_hex,
    })
}

uniffi::setup_scaffolding!();

#[cfg(test)]
mod tests {
    use super::{
        derive_mobile_identity, normalize_secret_text, preview_totp, validate_secret_text,
    };

    #[test]
    fn normalize_secret_text_removes_separators() {
        assert_eq!(normalize_secret_text("ab cd-23".into()), "ABCD23");
    }

    #[test]
    fn validate_secret_text_returns_normalized_secret() {
        let normalized =
            validate_secret_text("gezd gnbv gy3t qojq gezd gnbv gy3t qojq".into()).unwrap();
        assert_eq!(normalized, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    }

    #[test]
    fn preview_totp_reports_remaining_window() {
        let preview = preview_totp(
            "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ".into(),
            59,
            Some(30),
            Some(8),
        )
        .unwrap();
        assert_eq!(preview.code, "94287082");
        assert_eq!(preview.valid_for_seconds, 1);
    }

    #[test]
    fn derive_mobile_identity_is_stable() {
        let a = derive_mobile_identity("test secret".into()).unwrap();
        let b = derive_mobile_identity("test secret".into()).unwrap();
        assert_eq!(a.public_key_hex, b.public_key_hex);
        assert_eq!(a.mnemonic, b.mnemonic);
    }
}
