use axum::{
    extract::{DefaultBodyLimit, State},
    http::{header, HeaderValue, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, FromRow, SqlitePool};
use std::{path::PathBuf, process::Stdio, sync::Arc, time::Duration};
use tokio::{io::AsyncWriteExt, process::Command, time::timeout};
use tower_http::{
    services::{ServeDir, ServeFile},
    set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
};

const MAX_CODE_BYTES: usize = 8_000;
const MAX_OUTPUT_BYTES: usize = 16_000;

#[derive(Clone)]
struct AppState {
    pool: SqlitePool,
    run_slots: Arc<tokio::sync::Semaphore>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
struct Exercise {
    id: String,
    number: i64,
    language: String,
    runtime: String,
    title: String,
    question: String,
    code: String,
    concept: String,
    explanation: String,
}

#[derive(Debug, Deserialize)]
struct RunRequest {
    language: String,
    code: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct RunResponse {
    ok: bool,
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    duration_ms: u128,
    runtime: String,
    limits: RunLimits,
    run_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct RunLimits {
    timeout_ms: u64,
    max_code_bytes: usize,
    max_output_bytes: usize,
    network: String,
    persistence: String,
}

#[derive(Debug, Serialize)]
struct ApiError {
    error: &'static str,
    message: String,
}

#[derive(Debug, Serialize)]
struct Health {
    status: &'static str,
    build: String,
    runtimes: [&'static str; 2],
}

fn exercises() -> Vec<Exercise> {
    serde_json::from_str(include_str!("exercises.json")).expect("valid bundled exercises")
}

async fn app(static_dir: Option<PathBuf>) -> Router {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("open in-memory exercise catalog");
    sqlx::query("CREATE TABLE exercises (id TEXT PRIMARY KEY, number INTEGER NOT NULL, language TEXT NOT NULL, runtime TEXT NOT NULL, title TEXT NOT NULL, question TEXT NOT NULL, code TEXT NOT NULL, concept TEXT NOT NULL, explanation TEXT NOT NULL)")
        .execute(&pool)
        .await
        .expect("create exercise catalog");
    for exercise in exercises() {
        sqlx::query("INSERT INTO exercises (id, number, language, runtime, title, question, code, concept, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(exercise.id)
            .bind(exercise.number)
            .bind(exercise.language)
            .bind(exercise.runtime)
            .bind(exercise.title)
            .bind(exercise.question)
            .bind(exercise.code)
            .bind(exercise.concept)
            .bind(exercise.explanation)
            .execute(&pool)
            .await
            .expect("seed exercise");
    }
    let state = AppState {
        pool,
        run_slots: Arc::new(tokio::sync::Semaphore::new(8)),
    };
    let api = Router::new()
        .route("/api/exercises", get(list_exercises))
        .route("/api/run", post(run_code))
        .route("/health", get(health))
        .with_state(state);

    let app = if let Some(dir) = static_dir {
        let index = ServeFile::new(dir.join("index.html"));
        api.route_service("/", index.clone())
            .route_service("/lab", index.clone())
            .route_service("/archive", index.clone())
            .route_service("/field-kit", index.clone())
            .route_service("/privacy", index.clone())
            .route_service("/terms", index)
            .route_service("/sw.js", ServeFile::new(dir.join("sw.js")))
            .nest_service("/assets", ServeDir::new(dir.join("assets")))
    } else {
        api
    };

    app.layer(DefaultBodyLimit::max(12 * 1024))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static("default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' https://api.sociobot.in https://pilot-api.sociobot.in; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://api.sociobot.in https://pilot-api.sociobot.in"),
        ))
        .layer(TraceLayer::new_for_http())
}

async fn list_exercises(
    State(state): State<AppState>,
) -> Result<Json<Vec<Exercise>>, (StatusCode, Json<ApiError>)> {
    sqlx::query_as::<_, Exercise>("SELECT id, number, language, runtime, title, question, code, concept, explanation FROM exercises ORDER BY number")
        .fetch_all(&state.pool)
        .await
        .map(Json)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "catalog_unavailable", "The specimen catalog is temporarily unavailable."))
}

async fn health() -> Json<Health> {
    Json(Health {
        status: "ok",
        build: option_env!("BUILD_SHA")
            .unwrap_or("development")
            .to_string(),
        runtimes: ["JavaScript / Node.js 22", "Python 3.12"],
    })
}

async fn run_code(
    State(state): State<AppState>,
    Json(input): Json<RunRequest>,
) -> Result<Json<RunResponse>, (StatusCode, Json<ApiError>)> {
    let _slot = state.run_slots.try_acquire_owned().map_err(|_| {
        api_error(
            StatusCode::TOO_MANY_REQUESTS,
            "runner_busy",
            "All runner slots are busy. Wait a moment and try again.",
        )
    })?;
    let code = input.code.trim();
    if code.is_empty() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "empty_code",
            "Add a code specimen before running it.",
        ));
    }
    if code.len() > MAX_CODE_BYTES {
        return Err(api_error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "code_too_large",
            format!("Keep experiments under {MAX_CODE_BYTES} bytes."),
        ));
    }
    if input.language != "javascript" && input.language != "python" {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "unsupported_language",
            "Choose JavaScript or Python.",
        ));
    }

    let started = std::time::Instant::now();
    let (program, args, payload, runtime) = if input.language == "javascript" {
        (
            "node",
            vec![
                "--no-warnings",
                "--max-old-space-size=64",
                "-e",
                include_str!("runners/javascript.cjs"),
            ],
            code.as_bytes().to_vec(),
            "Node.js 22 (isolated vm context)",
        )
    } else {
        (
            "python3",
            vec!["-I", "-S", "-c", include_str!("runners/python.py")],
            code.as_bytes().to_vec(),
            "Python 3.12 (isolated builtins)",
        )
    };

    let mut command = Command::new(program);
    command
        .args(args)
        .env_clear()
        .env("LANG", "C.UTF-8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    unsafe {
        command.pre_exec(|| {
            let memory = libc::rlimit {
                rlim_cur: 1024 * 1024 * 1024,
                rlim_max: 1024 * 1024 * 1024,
            };
            let cpu = libc::rlimit {
                rlim_cur: 2,
                rlim_max: 2,
            };
            let files = libc::rlimit {
                rlim_cur: 32,
                rlim_max: 32,
            };
            if libc::setrlimit(libc::RLIMIT_AS, &memory) != 0
                || libc::setrlimit(libc::RLIMIT_CPU, &cpu) != 0
                || libc::setrlimit(libc::RLIMIT_NOFILE, &files) != 0
                || libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0
            {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let mut child = command.spawn().map_err(|_| {
        api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "runtime_unavailable",
            "This runtime is temporarily unavailable. Try the other language or run locally.",
        )
    })?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(&payload).await.map_err(|_| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "runtime_write_failed",
                "The lab could not prepare this run.",
            )
        })?;
    }

    let output = match timeout(Duration::from_millis(2_000), child.wait_with_output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(_)) => {
            return Err(api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "runtime_failed",
                "The runtime stopped unexpectedly.",
            ))
        }
        Err(_) => {
            return Ok(Json(RunResponse {
                ok: false,
                stdout: String::new(),
                stderr: "Run stopped after the 2 second time limit.".into(),
                exit_code: None,
                duration_ms: started.elapsed().as_millis(),
                runtime: runtime.into(),
                limits: limits(),
                run_id: uuid::Uuid::new_v4().to_string(),
            }))
        }
    };

    let mut stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut stderr = String::from_utf8_lossy(&output.stderr).to_string();
    truncate(&mut stdout);
    truncate(&mut stderr);
    Ok(Json(RunResponse {
        ok: output.status.success(),
        stdout,
        stderr,
        exit_code: output.status.code(),
        duration_ms: started.elapsed().as_millis(),
        runtime: runtime.into(),
        limits: limits(),
        run_id: uuid::Uuid::new_v4().to_string(),
    }))
}

fn limits() -> RunLimits {
    RunLimits {
        timeout_ms: 2_000,
        max_code_bytes: MAX_CODE_BYTES,
        max_output_bytes: MAX_OUTPUT_BYTES,
        network: "not exposed to the language context".into(),
        persistence: "none; process discarded after each run".into(),
    }
}

fn truncate(value: &mut String) {
    if value.len() > MAX_OUTPUT_BYTES {
        value.truncate(MAX_OUTPUT_BYTES);
        value.push_str("\n[output truncated]");
    }
}

fn api_error(
    status: StatusCode,
    error: &'static str,
    message: impl Into<String>,
) -> (StatusCode, Json<ApiError>) {
    (
        status,
        Json(ApiError {
            error,
            message: message.into(),
        }),
    )
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(8080);
    let static_dir = PathBuf::from(std::env::var("STATIC_DIR").unwrap_or_else(|_| "dist".into()));
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .expect("bind port");
    tracing::info!(port, "Code Prediction Lab listening");
    axum::serve(listener, app(Some(static_dir)).await)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("serve application");
}

async fn shutdown_signal() {
    let ctrl_c = async { tokio::signal::ctrl_c().await.expect("ctrl-c handler") };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("signal handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = terminate => {} }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::Request,
    };
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    #[tokio::test]
    async fn health_route_reports_runtimes() {
        let response = app(None)
            .await
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        assert!(String::from_utf8_lossy(&bytes).contains("Node.js 22"));
    }

    #[tokio::test]
    async fn exercises_are_available() {
        let response = app(None)
            .await
            .oneshot(
                Request::builder()
                    .uri("/api/exercises")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), 100_000).await.unwrap();
        let parsed: Vec<Exercise> = serde_json::from_slice(&bytes).unwrap();
        assert!(parsed.len() >= 6);
    }

    #[tokio::test]
    async fn rejects_empty_code() {
        let response = app(None)
            .await
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/run")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"language":"javascript","code":""}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
}
