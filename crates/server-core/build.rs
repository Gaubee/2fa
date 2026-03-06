fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto_file = "../../packages/sync-spec/proto/gaubee/twofa/v1/sync.proto";
    let proto_root = "../../packages/sync-spec/proto";

    let mut config = tonic_prost_build::Config::new();
    config.protoc_executable(protoc_bin_vendored::protoc_bin_path()?);

    tonic_prost_build::configure().compile_with_config(config, &[proto_file], &[proto_root])?;

    println!("cargo:rerun-if-changed={proto_file}");
    Ok(())
}
