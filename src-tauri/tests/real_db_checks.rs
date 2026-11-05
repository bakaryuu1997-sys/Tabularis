//! End-to-end checks against real databases. Ignored by default; run with
//!   TAB_E2E_PG_PORT=54321 TAB_E2E_PG_PASSWORD=... cargo test --test real_db_checks -- --ignored --nocapture
use tabularis_lib::drivers::postgres;
use tabularis_lib::models::{ConnectionParams, DatabaseSelection, HypotheticalIndex, WhatIfExplainOutcome};

fn pg_params() -> ConnectionParams {
    ConnectionParams {
        driver: "postgres".to_string(),
        host: Some("127.0.0.1".to_string()),
        port: Some(
            std::env::var("TAB_E2E_PG_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .expect("TAB_E2E_PG_PORT"),
        ),
        username: Some("postgres".to_string()),
        password: Some(std::env::var("TAB_E2E_PG_PASSWORD").expect("TAB_E2E_PG_PASSWORD")),
        database: DatabaseSelection::Single("e2e".to_string()),
        ..Default::default()
    }
}

#[tokio::test]
#[ignore]
async fn explain_returns_a_real_plan_and_what_if_reports_the_missing_extension() {
    let params = pg_params();
    // Plain EXPLAIN against real PostgreSQL.
    let plan = postgres::explain_query(&params, "SELECT 1", false, None)
        .await
        .expect("EXPLAIN should work");
    assert!(plan.root.total_cost.is_some());

    // The container has no hypopg, so the backend must say so instead of inventing numbers.
    let outcome = postgres::explain_with_hypothetical_indexes(
        &params,
        "SELECT 1",
        &[HypotheticalIndex { table: "t".into(), columns: vec!["c".into()] }],
        None,
    )
    .await
    .expect("what-if should not error when the extension is absent");
    match outcome {
        WhatIfExplainOutcome::ExtensionMissing { extension } => assert_eq!(extension, "hypopg"),
        other => panic!("expected ExtensionMissing, got {other:?}"),
    }
}

#[tokio::test]
#[ignore]
async fn what_if_validates_input_before_touching_the_server() {
    let params = pg_params();
    let none = postgres::explain_with_hypothetical_indexes(&params, "SELECT 1", &[], None).await;
    assert!(none.is_err());
    let bad = postgres::explain_with_hypothetical_indexes(
        &params,
        "SELECT 1",
        &[HypotheticalIndex { table: "".into(), columns: vec!["c".into()] }],
        None,
    )
    .await;
    assert!(bad.is_err());
}
