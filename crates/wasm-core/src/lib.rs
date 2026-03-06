use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use gaubee_2fa_crypto_core::{
    EncryptedPayload, SignatureChallenge, decrypt_payload, derive_identity, encrypt_payload,
    sign_challenge,
};
use gaubee_2fa_otp_core::{DEFAULT_DIGITS, generate_totp, normalize_secret, validate_secret};
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WasmIdentityMaterial {
    mnemonic: String,
    public_key_hex: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WasmSignedChallenge {
    public_key_hex: String,
    signature_hex: String,
    timestamp_ms: i64,
    device_id: String,
    nonce: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WasmEncryptedPayload {
    nonce_hex: String,
    ciphertext_base64: String,
}

#[wasm_bindgen]
pub fn wasm_normalize_secret(secret: &str) -> String {
    normalize_secret(secret)
}

#[wasm_bindgen]
pub fn wasm_validate_secret(secret: &str) -> Result<(), JsValue> {
    validate_secret(secret).map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen]
pub fn wasm_generate_totp(secret: &str, unix_time_seconds: u64) -> Result<String, JsValue> {
    generate_totp(secret, unix_time_seconds, DEFAULT_DIGITS)
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen]
pub fn wasm_derive_identity(secret_input: &str) -> Result<JsValue, JsValue> {
    let identity =
        derive_identity(secret_input).map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&WasmIdentityMaterial {
        mnemonic: identity.mnemonic,
        public_key_hex: identity.public_key_hex,
    })
    .map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen]
pub fn wasm_sign_challenge(
    secret_input: &str,
    nonce: &str,
    timestamp_ms: i64,
    device_id: &str,
) -> Result<JsValue, JsValue> {
    let challenge = SignatureChallenge {
        nonce: nonce.to_string(),
        timestamp_ms,
        device_id: device_id.to_string(),
    };
    let signed = sign_challenge(secret_input, &challenge)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;

    serde_wasm_bindgen::to_value(&WasmSignedChallenge {
        public_key_hex: signed.public_key_hex,
        signature_hex: signed.signature_hex,
        timestamp_ms: signed.timestamp_ms,
        device_id: signed.device_id,
        nonce: signed.nonce,
    })
    .map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen]
pub fn wasm_encrypt_text(
    secret_input: &str,
    plaintext: &str,
    aad_text: &str,
) -> Result<JsValue, JsValue> {
    let envelope = encrypt_payload(secret_input, plaintext.as_bytes(), aad_text.as_bytes())
        .map_err(|error| JsValue::from_str(&error.to_string()))?;

    serde_wasm_bindgen::to_value(&WasmEncryptedPayload {
        nonce_hex: envelope.nonce_hex,
        ciphertext_base64: BASE64.encode(envelope.ciphertext),
    })
    .map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen]
pub fn wasm_decrypt_text(
    secret_input: &str,
    nonce_hex: &str,
    ciphertext_base64: &str,
    aad_text: &str,
) -> Result<String, JsValue> {
    let ciphertext = BASE64
        .decode(ciphertext_base64.as_bytes())
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let envelope = EncryptedPayload {
        nonce_hex: nonce_hex.to_string(),
        ciphertext,
    };
    let plaintext = decrypt_payload(secret_input, &envelope, aad_text.as_bytes())
        .map_err(|error| JsValue::from_str(&error.to_string()))?;

    String::from_utf8(plaintext).map_err(|error| JsValue::from_str(&error.to_string()))
}
