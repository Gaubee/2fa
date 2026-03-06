use bip39::{Language, Mnemonic};
use chacha20poly1305::{
    XChaCha20Poly1305, XNonce,
    aead::{Aead, KeyInit, Payload},
};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use getrandom::getrandom;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use zeroize::Zeroizing;

#[derive(Debug, Error)]
pub enum CryptoError {
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityMaterial {
    pub mnemonic: String,
    pub public_key_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignatureChallenge {
    pub nonce: String,
    pub timestamp_ms: i64,
    pub device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedChallenge {
    pub public_key_hex: String,
    pub signature_hex: String,
    pub timestamp_ms: i64,
    pub device_id: String,
    pub nonce: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedPayload {
    pub nonce_hex: String,
    pub ciphertext: Vec<u8>,
}

pub fn derive_identity(secret_input: &str) -> Result<IdentityMaterial, CryptoError> {
    let mnemonic = parse_or_derive_mnemonic(secret_input)?;
    let signing_key = signing_key_from_mnemonic(&mnemonic);
    let verifying_key = signing_key.verifying_key();

    Ok(IdentityMaterial {
        mnemonic: mnemonic.to_string(),
        public_key_hex: hex::encode(verifying_key.to_bytes()),
    })
}

pub fn sign_challenge(
    secret_input: &str,
    challenge: &SignatureChallenge,
) -> Result<SignedChallenge, CryptoError> {
    let mnemonic = parse_or_derive_mnemonic(secret_input)?;
    let signing_key = signing_key_from_mnemonic(&mnemonic);
    let public_key_hex = hex::encode(signing_key.verifying_key().to_bytes());
    let message = signature_message(&public_key_hex, challenge);
    let signature = signing_key.sign(message.as_bytes());

    Ok(SignedChallenge {
        public_key_hex,
        signature_hex: hex::encode(signature.to_bytes()),
        timestamp_ms: challenge.timestamp_ms,
        device_id: challenge.device_id.clone(),
        nonce: challenge.nonce.clone(),
    })
}

pub fn verify_signed_challenge(challenge: &SignedChallenge) -> Result<(), CryptoError> {
    let public_key_bytes: [u8; 32] = hex::decode(&challenge.public_key_hex)
        .map_err(|_| CryptoError::InvalidPublicKey)?
        .try_into()
        .map_err(|_| CryptoError::InvalidPublicKey)?;
    let signature_bytes: [u8; 64] = hex::decode(&challenge.signature_hex)
        .map_err(|_| CryptoError::InvalidSignature)?
        .try_into()
        .map_err(|_| CryptoError::InvalidSignature)?;

    let verifying_key =
        VerifyingKey::from_bytes(&public_key_bytes).map_err(|_| CryptoError::InvalidPublicKey)?;
    let signature = Signature::from_bytes(&signature_bytes);
    let message = signature_message(
        &challenge.public_key_hex,
        &SignatureChallenge {
            nonce: challenge.nonce.clone(),
            timestamp_ms: challenge.timestamp_ms,
            device_id: challenge.device_id.clone(),
        },
    );

    verifying_key
        .verify(message.as_bytes(), &signature)
        .map_err(|_| CryptoError::InvalidSignature)
}

pub fn encrypt_payload(
    secret_input: &str,
    plaintext: &[u8],
    aad: &[u8],
) -> Result<EncryptedPayload, CryptoError> {
    let key_bytes = encryption_key(secret_input)?;
    let cipher = XChaCha20Poly1305::new((&key_bytes).into());
    let mut nonce = [0u8; 24];
    getrandom(&mut nonce).map_err(|_| CryptoError::RandomUnavailable)?;

    let ciphertext = cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| CryptoError::EncryptFailed)?;

    Ok(EncryptedPayload {
        nonce_hex: hex::encode(nonce),
        ciphertext,
    })
}

pub fn decrypt_payload(
    secret_input: &str,
    envelope: &EncryptedPayload,
    aad: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    let key_bytes = encryption_key(secret_input)?;
    let cipher = XChaCha20Poly1305::new((&key_bytes).into());
    let nonce_bytes: [u8; 24] = hex::decode(&envelope.nonce_hex)
        .map_err(|_| CryptoError::DecryptFailed)?
        .try_into()
        .map_err(|_| CryptoError::DecryptFailed)?;

    cipher
        .decrypt(
            XNonce::from_slice(&nonce_bytes),
            Payload {
                msg: &envelope.ciphertext,
                aad,
            },
        )
        .map_err(|_| CryptoError::DecryptFailed)
}

pub fn signature_message(public_key_hex: &str, challenge: &SignatureChallenge) -> String {
    format!(
        "gaubee-2fa:{}:{}:{}:{}",
        challenge.nonce, challenge.timestamp_ms, challenge.device_id, public_key_hex
    )
}

fn parse_or_derive_mnemonic(secret_input: &str) -> Result<Mnemonic, CryptoError> {
    let normalized = secret_input.trim();
    if normalized.is_empty() {
        return Err(CryptoError::EmptyInput);
    }

    if let Ok(mnemonic) = Mnemonic::parse_in(Language::English, normalized) {
        return Ok(mnemonic);
    }

    let digest = Sha256::digest(normalized.as_bytes());
    Mnemonic::from_entropy(&digest).map_err(|_| CryptoError::MnemonicGeneration)
}

fn signing_key_from_mnemonic(mnemonic: &Mnemonic) -> SigningKey {
    let seed = Zeroizing::new(mnemonic.to_seed_normalized(""));
    let mut signing_key_bytes = [0u8; 32];
    signing_key_bytes.copy_from_slice(&seed[..32]);
    SigningKey::from_bytes(&signing_key_bytes)
}

fn encryption_key(secret_input: &str) -> Result<[u8; 32], CryptoError> {
    let mnemonic = parse_or_derive_mnemonic(secret_input)?;
    let seed = Zeroizing::new(mnemonic.to_seed_normalized(""));
    let mut hasher = Sha256::new();
    hasher.update(&seed[..]);
    let digest = hasher.finalize();
    let mut key_bytes = [0u8; 32];
    key_bytes.copy_from_slice(&digest[..32]);
    Ok(key_bytes)
}

#[cfg(test)]
mod tests {
    use super::{
        SignatureChallenge, decrypt_payload, derive_identity, encrypt_payload, sign_challenge,
        verify_signed_challenge,
    };

    #[test]
    fn derives_stable_public_key() {
        let identity_a = derive_identity("test secret").unwrap();
        let identity_b = derive_identity("test secret").unwrap();
        assert_eq!(identity_a.public_key_hex, identity_b.public_key_hex);
        assert_eq!(identity_a.mnemonic, identity_b.mnemonic);
    }

    #[test]
    fn signs_and_verifies_challenge() {
        let challenge = SignatureChallenge {
            nonce: "nonce-1".into(),
            timestamp_ms: 1_700_000_000_000,
            device_id: "device-1".into(),
        };
        let signed = sign_challenge("test secret", &challenge).unwrap();
        verify_signed_challenge(&signed).unwrap();
    }

    #[test]
    fn encrypts_and_decrypts_payload() {
        let envelope = encrypt_payload("test secret", b"hello", b"aad").unwrap();
        let plaintext = decrypt_payload("test secret", &envelope, b"aad").unwrap();
        assert_eq!(plaintext, b"hello");
    }
}
