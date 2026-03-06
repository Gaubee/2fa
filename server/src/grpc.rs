use std::sync::Arc;

use gaubee_2fa_server_core::{AppState, proto};
use tonic::{Request, Response, Status};

use crate::service;

#[derive(Clone)]
pub struct AuthGrpcService {
    pub state: Arc<AppState>,
}

#[derive(Clone)]
pub struct SyncGrpcService {
    pub state: Arc<AppState>,
}

#[derive(Clone)]
pub struct BillingGrpcService {
    pub state: Arc<AppState>,
}

#[tonic::async_trait]
impl proto::auth_service_server::AuthService for AuthGrpcService {
    async fn get_challenge(
        &self,
        request: Request<proto::GetChallengeRequest>,
    ) -> Result<Response<proto::GetChallengeResponse>, Status> {
        let response = service::get_challenge(&self.state, request.into_inner()).await?;
        Ok(Response::new(response))
    }

    async fn exchange_session(
        &self,
        request: Request<proto::ExchangeSessionRequest>,
    ) -> Result<Response<proto::ExchangeSessionResponse>, Status> {
        let response = service::exchange_session(&self.state, request.into_inner()).await?;
        Ok(Response::new(response))
    }
}

#[tonic::async_trait]
impl proto::sync_service_server::SyncService for SyncGrpcService {
    async fn pull_ops(
        &self,
        request: Request<proto::PullOpsRequest>,
    ) -> Result<Response<proto::PullOpsResponse>, Status> {
        let response = service::pull_ops(&self.state, request.into_inner()).await?;
        Ok(Response::new(response))
    }

    async fn push_ops(
        &self,
        request: Request<proto::PushOpsRequest>,
    ) -> Result<Response<proto::PushOpsResponse>, Status> {
        let response = service::push_ops(&self.state, request.into_inner()).await?;
        Ok(Response::new(response))
    }

    async fn get_revision(
        &self,
        request: Request<proto::GetRevisionRequest>,
    ) -> Result<Response<proto::GetRevisionResponse>, Status> {
        let response = service::get_revision(&self.state, request.into_inner()).await?;
        Ok(Response::new(response))
    }
}

#[tonic::async_trait]
impl proto::billing_service_server::BillingService for BillingGrpcService {
    async fn get_entitlement(
        &self,
        request: Request<proto::GetEntitlementRequest>,
    ) -> Result<Response<proto::GetEntitlementResponse>, Status> {
        let response = service::get_entitlement(&self.state, request.into_inner()).await?;
        Ok(Response::new(response))
    }
}
