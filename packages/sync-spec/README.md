# Sync Spec

跨端同步协议的单一真源。

- `proto/` 保存 gRPC 与消息定义。
- Rust server 与 CLI 通过 `crates/server-core` 编译这些 proto。
- Web/移动端后续基于同一份 proto 生成客户端。
