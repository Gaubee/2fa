use data_encoding::BASE32_NOPAD;
use hmac::{Hmac, Mac};
use sha1::Sha1;
use thiserror::Error;

type HmacSha1 = Hmac<Sha1>;

pub const DEFAULT_PERIOD_SECONDS: u64 = 30;
pub const DEFAULT_DIGITS: u32 = 6;

#[derive(Debug, Error)]
pub enum OtpError {
    #[error("secret is empty")]
    EmptySecret,
    #[error("secret is not valid base32")]
    InvalidSecret,
}

pub fn normalize_secret(secret: &str) -> String {
    secret
        .chars()
        .filter(|ch| !matches!(ch, ' ' | '\t' | '\n' | '\r' | '-'))
        .flat_map(char::to_uppercase)
        .collect()
}

pub fn validate_secret(secret: &str) -> Result<(), OtpError> {
    decode_secret(secret).map(|_| ())
}

pub fn generate_totp(
    secret: &str,
    unix_time_seconds: u64,
    digits: u32,
) -> Result<String, OtpError> {
    generate_totp_with_period(secret, unix_time_seconds, DEFAULT_PERIOD_SECONDS, digits)
}

pub fn generate_totp_with_period(
    secret: &str,
    unix_time_seconds: u64,
    period_seconds: u64,
    digits: u32,
) -> Result<String, OtpError> {
    let secret_bytes = decode_secret(secret)?;
    let counter = unix_time_seconds / period_seconds;
    let counter_bytes = counter.to_be_bytes();

    let mut mac = HmacSha1::new_from_slice(&secret_bytes).map_err(|_| OtpError::InvalidSecret)?;
    mac.update(&counter_bytes);
    let digest = mac.finalize().into_bytes();

    let offset = (digest[19] & 0x0f) as usize;
    let binary = (u32::from(digest[offset] & 0x7f) << 24)
        | (u32::from(digest[offset + 1]) << 16)
        | (u32::from(digest[offset + 2]) << 8)
        | u32::from(digest[offset + 3]);

    let code = binary % 10u32.pow(digits);
    let width = digits as usize;
    Ok(format!("{code:0width$}"))
}

fn decode_secret(secret: &str) -> Result<Vec<u8>, OtpError> {
    let normalized = normalize_secret(secret).trim_end_matches('=').to_string();
    if normalized.is_empty() {
        return Err(OtpError::EmptySecret);
    }

    BASE32_NOPAD
        .decode(normalized.as_bytes())
        .map_err(|_| OtpError::InvalidSecret)
}

#[cfg(test)]
mod tests {
    use super::{generate_totp_with_period, normalize_secret, validate_secret};

    #[test]
    fn normalizes_base32_secret() {
        assert_eq!(normalize_secret("ab cd-23"), "ABCD23");
    }

    #[test]
    fn rejects_invalid_secret() {
        assert!(validate_secret("not-base32").is_err());
    }

    #[test]
    fn generates_rfc6238_vector() {
        let secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
        let code = generate_totp_with_period(secret, 59, 30, 8).unwrap();
        assert_eq!(code, "94287082");
    }
}
