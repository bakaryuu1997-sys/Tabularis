use crate::config;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

/// Build an HTTP client for AI provider calls with a request timeout.
///
/// Without a timeout, a hung provider (a stalled network, an overloaded remote
/// API, or a slow local Ollama model) would leave the request pending forever —
/// the UI stays stuck on "Generating…" with no way to recover but a restart.
/// 120s is generous for remote APIs while still bounding a true hang. If the
/// client fails to build we fall back to the default client rather than panic.
fn ai_http_client() -> Client {
    Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .unwrap_or_else(|_| Client::new())
}

// --- Data Structures ---

#[derive(Serialize, Deserialize, Debug)]
pub struct AiGenerateRequest {
    pub provider: String,
    pub model: String,
    pub prompt: String,
    pub schema: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AiExplainRequest {
    pub provider: String,
    pub model: String,
    pub query: String,
    pub language: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AiCellNameRequest {
    pub provider: String,
    pub model: String,
    pub query: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AiTabRenameRequest {
    pub provider: String,
    pub model: String,
    pub query: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AiSuggestTableNameRequest {
    pub provider: String,
    pub model: String,
    pub headers: Vec<String>,
    pub sample_rows: Vec<Vec<String>>,
}

/// A single message in a multi-turn chat conversation.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatMessage {
    /// "user" or "assistant".
    pub role: String,
    pub content: String,
}

/// Request for the free-form chat assistant (the floating chat widget).
///
/// Unlike the SQL-generation commands, this carries the full conversation
/// history and does NOT strip Markdown/code fences from the reply.
#[derive(Serialize, Deserialize, Debug)]
pub struct AiChatRequest {
    pub provider: String,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    /// Optional database schema to give the assistant context. May be empty.
    #[serde(default)]
    pub schema: String,
}

#[derive(Deserialize, Debug)]
struct OllamaTagsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Deserialize, Debug)]
struct OllamaModel {
    name: String,
}

#[derive(Deserialize, Debug)]
struct OpenAiModelList {
    data: Vec<OpenAiModel>,
}

#[derive(Deserialize, Debug)]
struct OpenAiModel {
    id: String,
}

#[derive(Deserialize, Debug)]
struct AnthropicModelList {
    data: Vec<AnthropicModel>,
}

#[derive(Deserialize, Debug)]
struct AnthropicModel {
    id: String,
}

#[derive(Deserialize, Debug)]
struct OpenRouterModelList {
    data: Vec<OpenRouterModel>,
}

#[derive(Deserialize, Debug)]
struct OpenRouterModel {
    id: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct AiModelsCache {
    last_updated: u64,
    models: HashMap<String, Vec<String>>,
}

// --- Helper Functions ---

fn load_default_models() -> HashMap<String, Vec<String>> {
    let yaml_content = include_str!("ai_models.yaml");
    serde_yaml::from_str(yaml_content).unwrap_or_else(|e| {
        log::warn!("Failed to parse models.yaml: {}", e);
        HashMap::new() // Fallback to empty map on critical error (should be caught by tests)
    })
}

fn get_cache_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|p| p.join("ai_models_cache.json"))
}

fn load_cache(app: &AppHandle) -> Option<AiModelsCache> {
    let path = get_cache_path(app)?;
    if path.exists() {
        let content = fs::read_to_string(path).ok()?;
        serde_json::from_str(&content).ok()
    } else {
        None
    }
}

fn save_cache(app: &AppHandle, models: &HashMap<String, Vec<String>>) {
    if let Some(path) = get_cache_path(app) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let cache = AiModelsCache {
            last_updated: timestamp,
            models: models.clone(),
        };

        if let Ok(content) = serde_json::to_string(&cache) {
            let _ = fs::write(path, content);
        }
    }
}

// --- Fetchers ---

async fn fetch_ollama_models(port: u16) -> Vec<String> {
    let client = ai_http_client();
    let url = format!("http://localhost:{}/api/tags", port);
    match client.get(&url).send().await {
        Ok(res) => {
            if res.status().is_success() {
                if let Ok(json) = res.json::<OllamaTagsResponse>().await {
                    return json.models.into_iter().map(|m| m.name).collect();
                }
            }
            Vec::new()
        }
        Err(_) => Vec::new(),
    }
}

async fn fetch_openai_models(api_key: &str) -> Vec<String> {
    if api_key.is_empty() {
        return Vec::new();
    }
    let client = ai_http_client();
    match client
        .get("https://api.openai.com/v1/models")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
    {
        Ok(res) => {
            if res.status().is_success() {
                if let Ok(json) = res.json::<OpenAiModelList>().await {
                    return json
                        .data
                        .into_iter()
                        .map(|m| m.id)
                        .filter(|id| id.starts_with("gpt") || id.starts_with("o1"))
                        .collect();
                }
            }
            Vec::new()
        }
        Err(_) => Vec::new(),
    }
}

async fn fetch_anthropic_models(api_key: &str) -> Vec<String> {
    if api_key.is_empty() {
        return Vec::new();
    }
    let client = ai_http_client();
    match client
        .get("https://api.anthropic.com/v1/models")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .send()
        .await
    {
        Ok(res) => {
            if res.status().is_success() {
                if let Ok(json) = res.json::<AnthropicModelList>().await {
                    return json.data.into_iter().map(|m| m.id).collect();
                }
            }
            Vec::new()
        }
        Err(_) => Vec::new(),
    }
}

async fn fetch_minimax_models(api_key: &str) -> Vec<String> {
    if api_key.is_empty() {
        return Vec::new();
    }
    let client = ai_http_client();
    match client
        .get("https://api.minimax.io/v1/models")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
    {
        Ok(res) => {
            if res.status().is_success() {
                if let Ok(json) = res.json::<OpenAiModelList>().await {
                    return json.data.into_iter().map(|m| m.id).collect();
                }
            }
            Vec::new()
        }
        Err(_) => Vec::new(),
    }
}

async fn fetch_openrouter_models() -> Vec<String> {
    let client = ai_http_client();
    match client
        .get("https://openrouter.ai/api/v1/models")
        .send()
        .await
    {
        Ok(res) => {
            if res.status().is_success() {
                if let Ok(json) = res.json::<OpenRouterModelList>().await {
                    return json.data.into_iter().map(|m| m.id).collect();
                }
            }
            Vec::new()
        }
        Err(_) => Vec::new(),
    }
}

/// Build an API endpoint URL from a user-provided base_url.
///
/// Handles various formats the user might input:
/// - Full path (e.g., `.../v1/chat/completions`) → used as-is
/// - Base with version (e.g., `.../v1` or `.../v4`) → appends only the endpoint
/// - Base with trailing slash → trimmed, then appends endpoint
/// - Plain base URL → appends endpoint directly
///
/// This avoids hardcoding `/v1` so that providers using different
/// version paths (e.g., Zhipu GLM's `/v4`) work correctly.
fn build_api_url(base_url: &str, endpoint: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');

    // User already provided the full path
    if trimmed.ends_with(endpoint) {
        return trimmed.to_string();
    }

    format!("{trimmed}{endpoint}")
}

async fn fetch_custom_openai_models(base_url: &str, api_key: &str) -> Vec<String> {
    if base_url.is_empty() || api_key.is_empty() {
        return Vec::new();
    }

    let client = ai_http_client();

    let url = build_api_url(base_url, "/models");

    match client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
    {
        Ok(res) => {
            if res.status().is_success() {
                if let Ok(json) = res.json::<OpenAiModelList>().await {
                    return json.data.into_iter().map(|m| m.id).collect();
                }
            }
            Vec::new()
        }
        Err(_) => Vec::new(),
    }
}

// --- Commands ---

#[tauri::command]
pub fn clear_ai_models_cache(app: AppHandle) -> Result<(), String> {
    if let Some(path) = get_cache_path(&app) {
        if path.exists() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn get_ai_models(
    app: AppHandle,
    force_refresh: bool,
) -> Result<HashMap<String, Vec<String>>, String> {
    // Load config to get Ollama port
    let app_config = config::load_config_internal(&app);
    let ollama_port = app_config.ai_ollama_port.unwrap_or(11434);

    // 1. Check Cache (if not forced)
    if !force_refresh {
        if let Some(cache) = load_cache(&app) {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            // 24 hours = 86400 seconds
            if now - cache.last_updated < 86400 {
                let mut cached_models = cache.models;

                // Always refresh Ollama as it is local and fast
                let ollama_models = fetch_ollama_models(ollama_port).await;
                // Replace or insert ollama entry
                if !ollama_models.is_empty() {
                    cached_models.insert("ollama".to_string(), ollama_models);
                } else {
                    cached_models.insert("ollama".to_string(), vec![]);
                }

                // Always refresh custom-openai as it depends on user configuration
                if let (Some(base_url), Ok(api_key)) = (
                    app_config.ai_custom_openai_url.clone(),
                    config::get_ai_api_key(&app, "custom-openai"),
                ) {
                    if !base_url.is_empty() && !api_key.is_empty() {
                        let custom_models = fetch_custom_openai_models(&base_url, &api_key).await;
                        if !custom_models.is_empty() {
                            cached_models.insert("custom-openai".to_string(), custom_models);
                        } else {
                            cached_models.insert("custom-openai".to_string(), vec![]);
                        }
                    }
                }

                // Always refresh nine-router as it depends on user configuration
                if let (Some(base_url), Ok(api_key)) = (
                    app_config.ai_nine_router_url.clone(),
                    config::get_ai_api_key(&app, "nine-router"),
                ) {
                    if !base_url.is_empty() && !api_key.is_empty() {
                        let custom_models = fetch_custom_openai_models(&base_url, &api_key).await;
                        if !custom_models.is_empty() {
                            cached_models.insert("nine-router".to_string(), custom_models);
                        } else {
                            cached_models.insert("nine-router".to_string(), vec![]);
                        }
                    }
                }

                // Always refresh Anthropic if API key is present
                if let Ok(key) = config::get_ai_api_key(&app, "anthropic") {
                    let anthropic_models = fetch_anthropic_models(&key).await;
                    if !anthropic_models.is_empty() {
                        cached_models.insert("anthropic".to_string(), anthropic_models);
                    }
                }

                // Always refresh MiniMax if API key is present
                if let Ok(key) = config::get_ai_api_key(&app, "minimax") {
                    let minimax_models = fetch_minimax_models(&key).await;
                    if !minimax_models.is_empty() {
                        cached_models.insert("minimax".to_string(), minimax_models);
                    }
                }

                return Ok(cached_models);
            }
        }
    }

    let mut models = load_default_models();

    // 1. Ollama (Dynamic)
    let ollama_models = fetch_ollama_models(ollama_port).await;
    if !ollama_models.is_empty() {
        models.insert("ollama".to_string(), ollama_models);
    }

    // 2. OpenAI (Dynamic if key exists)
    if let Ok(key) = config::get_ai_api_key(&app, "openai") {
        let remote_models = fetch_openai_models(&key).await;
        if !remote_models.is_empty() {
            if let Some(static_list) = models.get_mut("openai") {
                let mut set: HashSet<String> = static_list.iter().cloned().collect();
                set.extend(remote_models);
                *static_list = set.into_iter().collect();
                static_list.sort();
            }
        }
    }

    // 3. Anthropic (Dynamic if key exists)
    if let Ok(key) = config::get_ai_api_key(&app, "anthropic") {
        let remote_models = fetch_anthropic_models(&key).await;
        if !remote_models.is_empty() {
            if let Some(static_list) = models.get_mut("anthropic") {
                let mut set: HashSet<String> = static_list.iter().cloned().collect();
                set.extend(remote_models);
                *static_list = set.into_iter().collect();
                static_list.sort();
            }
        }
    }

    // 4. MiniMax (Dynamic if key exists)
    if let Ok(key) = config::get_ai_api_key(&app, "minimax") {
        let remote_models = fetch_minimax_models(&key).await;
        if !remote_models.is_empty() {
            if let Some(static_list) = models.get_mut("minimax") {
                let mut set: HashSet<String> = static_list.iter().cloned().collect();
                set.extend(remote_models);
                *static_list = set.into_iter().collect();
                static_list.sort();
            }
        }
    }

    // 5. OpenRouter (Dynamic public)
    let openrouter_models = fetch_openrouter_models().await;
    if !openrouter_models.is_empty() {
        if let Some(static_list) = models.get_mut("openrouter") {
            let favorites: HashSet<String> = static_list.iter().cloned().collect();
            let mut new_list = static_list.clone();

            for m in openrouter_models {
                if !favorites.contains(&m) {
                    new_list.push(m);
                }
            }
            *static_list = new_list;
        }
    }

    // 6. Custom OpenAI (Dynamic if configured)
    if let (Some(base_url), Ok(api_key)) = (
        app_config.ai_custom_openai_url,
        config::get_ai_api_key(&app, "custom-openai"),
    ) {
        if !base_url.is_empty() && !api_key.is_empty() {
            let custom_models = fetch_custom_openai_models(&base_url, &api_key).await;
            if !custom_models.is_empty() {
                models.insert("custom-openai".to_string(), custom_models);
            } else {
                models.insert("custom-openai".to_string(), vec![]);
            }
        } else {
            models.insert("custom-openai".to_string(), vec![]);
        }
    } else {
        models.insert("custom-openai".to_string(), vec![]);
    }

    // 7. Nine Router (Dynamic if configured)
    if let (Some(base_url), Ok(api_key)) = (
        app_config.ai_nine_router_url,
        config::get_ai_api_key(&app, "nine-router"),
    ) {
        if !base_url.is_empty() && !api_key.is_empty() {
            let custom_models = fetch_custom_openai_models(&base_url, &api_key).await;
            if !custom_models.is_empty() {
                models.insert("nine-router".to_string(), custom_models);
            } else {
                models.insert("nine-router".to_string(), vec![]);
            }
        } else {
            models.insert("nine-router".to_string(), vec![]);
        }
    } else {
        models.insert("nine-router".to_string(), vec![]);
    }

    // Save to Cache
    save_cache(&app, &models);

    Ok(models)
}

#[tauri::command]
pub async fn generate_ai_query(app: AppHandle, req: AiGenerateRequest) -> Result<String, String> {
    generate_query(app, req).await
}

#[tauri::command]
pub async fn explain_ai_query(app: AppHandle, req: AiExplainRequest) -> Result<String, String> {
    explain_query(app, req).await
}

#[tauri::command]
pub async fn analyze_ai_explain_plan(
    app: AppHandle,
    req: AiExplainRequest,
) -> Result<String, String> {
    analyze_explain_plan(app, req).await
}

#[tauri::command]
pub async fn generate_cell_name(app: AppHandle, req: AiCellNameRequest) -> Result<String, String> {
    generate_cellname(app, req).await
}

#[tauri::command]
pub async fn chat_ai(app: AppHandle, req: AiChatRequest) -> Result<String, String> {
    generate_chat(app, req).await
}

/// Streaming variant of [`chat_ai`]. Text deltas are pushed through `on_event`
/// as they arrive; the full assembled reply is also returned so callers can
/// verify/store it. Falls back to a single non-streamed reply if the provider
/// does not actually stream.
#[tauri::command]
pub async fn chat_ai_stream(
    app: AppHandle,
    req: AiChatRequest,
    on_event: tauri::ipc::Channel<String>,
) -> Result<String, String> {
    generate_chat_stream(app, req, on_event).await
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AiModelTestResult {
    pub success: bool,
    pub latency_ms: u64,
    pub message: String,
}

#[tauri::command]
pub async fn test_ai_model(
    app: AppHandle,
    provider: String,
    model: String,
) -> Result<AiModelTestResult, String> {
    let t0 = std::time::Instant::now();
    let app_config = config::load_config_internal(&app);
    let ollama_port = app_config.ai_ollama_port.unwrap_or(11434);

    let req = AiGenerateRequest {
        provider,
        model,
        prompt: "SELECT 1;".to_string(),
        schema: "".to_string(),
    };

    match dispatch_provider(
        &app,
        &app_config,
        &req,
        "You are a test ping bot. Respond concisely with 1.",
        ollama_port,
    )
    .await
    {
        Ok(res) => {
            let latency_ms = t0.elapsed().as_millis() as u64;
            Ok(AiModelTestResult {
                success: true,
                latency_ms,
                message: if res.is_empty() { "OK".to_string() } else { res },
            })
        }
        Err(err) => {
            let latency_ms = t0.elapsed().as_millis() as u64;
            Ok(AiModelTestResult {
                success: false,
                latency_ms,
                message: err,
            })
        }
    }
}

// --- Shared helpers ---

async fn resolve_model(
    provider: &str,
    model: &str,
    app_config: &config::AppConfig,
    ollama_port: u16,
) -> Result<String, String> {
    if !model.is_empty() {
        return Ok(model.to_string());
    }
    match provider {
        "ollama" => {
            let models = fetch_ollama_models(ollama_port).await;
            models
                .first()
                .cloned()
                .ok_or_else(|| "No Ollama models found. Is Ollama running?".to_string())
        }
        "custom-openai" => app_config
            .ai_custom_openai_model
            .as_ref()
            .filter(|m| !m.is_empty())
            .cloned()
            .ok_or_else(|| "No model specified for custom OpenAI provider.".to_string()),
        "nine-router" => app_config
            .ai_nine_router_model
            .as_ref()
            .filter(|m| !m.is_empty())
            .cloned()
            .ok_or_else(|| "No model specified for 9Router provider.".to_string()),
        _ => {
            let models = load_default_models();
            models
                .get(provider)
                .and_then(|m| m.first())
                .cloned()
                .ok_or_else(|| format!("No models found for provider {}", provider))
        }
    }
}

async fn dispatch_provider(
    app: &AppHandle,
    app_config: &config::AppConfig,
    gen_req: &AiGenerateRequest,
    system_prompt: &str,
    ollama_port: u16,
) -> Result<String, String> {
    let api_key = if gen_req.provider != "ollama" {
        config::get_ai_api_key(app, &gen_req.provider)?
    } else {
        String::new()
    };

    let client = ai_http_client();
    match gen_req.provider.as_str() {
        "openai" => generate_openai(&client, &api_key, gen_req, system_prompt).await,
        "anthropic" => generate_anthropic(&client, &api_key, gen_req, system_prompt).await,
        "openrouter" => generate_openrouter(&client, &api_key, gen_req, system_prompt).await,
        "ollama" => generate_ollama(&client, gen_req, system_prompt, ollama_port).await,
        "custom-openai" => {
            let base_url = app_config
                .ai_custom_openai_url
                .as_ref()
                .filter(|u| !u.is_empty())
                .ok_or("Custom OpenAI URL not configured.")?;
            generate_custom_openai(&client, &api_key, gen_req, system_prompt, base_url).await
        }
        "nine-router" => {
            let base_url = app_config
                .ai_nine_router_url
                .as_ref()
                .filter(|u| !u.is_empty())
                .ok_or("9Router URL not configured.")?;
            generate_custom_openai(&client, &api_key, gen_req, system_prompt, base_url).await
        }
        "minimax" => generate_minimax(&client, &api_key, gen_req, system_prompt).await,
        _ => Err(format!("Unsupported provider: {}", gen_req.provider)),
    }
}

// --- Logic Implementation ---

pub async fn generate_query(app: AppHandle, mut req: AiGenerateRequest) -> Result<String, String> {
    log::info!("Generating AI query using provider: {}", req.provider);

    let app_config = config::load_config_internal(&app);
    let ollama_port = app_config.ai_ollama_port.unwrap_or(11434);
    req.model = resolve_model(&req.provider, &req.model, &app_config, ollama_port).await?;

    let raw_prompt = config::get_system_prompt(app.clone());
    let system_prompt = raw_prompt.replace("{{SCHEMA}}", &req.schema);

    let result = dispatch_provider(&app, &app_config, &req, &system_prompt, ollama_port).await;

    match &result {
        Ok(_) => log::info!("AI query generated successfully using {}", req.model),
        Err(e) => log::error!("AI query generation failed: {}", e),
    }

    result
}

pub async fn explain_query(app: AppHandle, mut req: AiExplainRequest) -> Result<String, String> {
    log::info!("Explaining query using AI provider: {}", req.provider);

    let app_config = config::load_config_internal(&app);
    let ollama_port = app_config.ai_ollama_port.unwrap_or(11434);
    req.model = resolve_model(&req.provider, &req.model, &app_config, ollama_port).await?;

    let raw_prompt = config::get_explain_prompt(app.clone());
    let system_prompt = raw_prompt.replace("{{LANGUAGE}}", &req.language);

    let gen_req = AiGenerateRequest {
        provider: req.provider.clone(),
        model: req.model.clone(),
        prompt: format!("Query:\n{}\n", req.query),
        schema: String::new(),
    };

    let result = dispatch_provider(&app, &app_config, &gen_req, &system_prompt, ollama_port).await;

    match &result {
        Ok(_) => log::info!(
            "Query explanation generated successfully using {}",
            req.model
        ),
        Err(e) => log::error!("Query explanation generation failed: {}", e),
    }

    result
}

pub async fn analyze_explain_plan(
    app: AppHandle,
    mut req: AiExplainRequest,
) -> Result<String, String> {
    log::info!("Analyzing explain plan using AI provider: {}", req.provider);

    let app_config = config::load_config_internal(&app);
    let ollama_port = app_config.ai_ollama_port.unwrap_or(11434);
    req.model = resolve_model(&req.provider, &req.model, &app_config, ollama_port).await?;

    let raw_prompt = config::get_explainplan_prompt(app.clone());
    let system_prompt = raw_prompt.replace("{{LANGUAGE}}", &req.language);

    let gen_req = AiGenerateRequest {
        provider: req.provider.clone(),
        model: req.model.clone(),
        prompt: req.query.clone(),
        schema: String::new(),
    };

    let result = dispatch_provider(&app, &app_config, &gen_req, &system_prompt, ollama_port).await;

    match &result {
        Ok(_) => log::info!(
            "Explain plan analysis generated successfully using {}",
            req.model
        ),
        Err(e) => log::error!("Explain plan analysis failed: {}", e),
    }

    result
}

async fn generate_with_simple_prompt(
    app: AppHandle,
    provider: String,
    model: String,
    query: String,
    get_prompt: fn(AppHandle) -> String,
    label: &str,
) -> Result<String, String> {
    log::info!("Generating {} using AI provider: {}", label, provider);

    let app_config = config::load_config_internal(&app);
    let ollama_port = app_config.ai_ollama_port.unwrap_or(11434);
    let resolved_model = resolve_model(&provider, &model, &app_config, ollama_port).await?;

    let system_prompt = get_prompt(app.clone());

    let gen_req = AiGenerateRequest {
        provider: provider.clone(),
        model: resolved_model.clone(),
        prompt: query,
        schema: String::new(),
    };

    let result = dispatch_provider(&app, &app_config, &gen_req, &system_prompt, ollama_port).await;

    match &result {
        // The generated text can echo table names, literals or data from the prompt, so only a preview is logged.
        Ok(v) => log::info!("{} generated: {}", label, crate::commands::log_preview(v)),
        Err(e) => log::error!("{} generation failed: {}", label, e),
    }

    result
}

pub async fn generate_cellname(app: AppHandle, req: AiCellNameRequest) -> Result<String, String> {
    generate_with_simple_prompt(
        app,
        req.provider,
        req.model,
        req.query,
        config::get_cellname_prompt,
        "Cell name",
    )
    .await
}

#[tauri::command]
pub async fn suggest_table_name(
    app: AppHandle,
    req: AiSuggestTableNameRequest,
) -> Result<String, String> {
    log::info!("Suggesting table name using AI provider: {}", req.provider);

    let app_config = config::load_config_internal(&app);
    let ollama_port = app_config.ai_ollama_port.unwrap_or(11434);
    let resolved_model = resolve_model(&req.provider, &req.model, &app_config, ollama_port).await?;

    let sample_preview = req
        .sample_rows
        .iter()
        .take(3)
        .map(|r| r.join(", "))
        .collect::<Vec<_>>()
        .join(" | ");

    let prompt = format!(
        "Given these column names: [{}] and sample data: [{}], suggest a concise snake_case table name that describes this data. Reply with only the table name, nothing else.",
        req.headers.join(", "),
        sample_preview
    );

    let gen_req = AiGenerateRequest {
        provider: req.provider.clone(),
        model: resolved_model,
        prompt,
        schema: String::new(),
    };

    let system_prompt = "You are a database naming expert. Reply with only a snake_case table name, no explanation.";
    let result = dispatch_provider(&app, &app_config, &gen_req, system_prompt, ollama_port).await;

    match &result {
        Ok(name) => {
            let cleaned = name
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_lowercase()
                .replace(|c: char| !c.is_alphanumeric() && c != '_', "_")
                .trim_matches('_')
                .to_string();
            log::info!("Table name suggested: {}", cleaned);
            Ok(cleaned)
        }
        Err(e) => {
            log::error!("Table name suggestion failed: {}", e);
            Err(e.clone())
        }
    }
}

#[tauri::command]
pub async fn generate_tab_rename(
    app: AppHandle,
    req: AiTabRenameRequest,
) -> Result<String, String> {
    generate_with_simple_prompt(
        app,
        req.provider,
        req.model,
        req.query,
        config::get_tabrename_prompt,
        "Tab name",
    )
    .await
}

// --- Provider Implementations ---

async fn generate_openai(
    client: &Client,
    api_key: &str,
    req: &AiGenerateRequest,
    system_prompt: &str,
) -> Result<String, String> {
    let body = json!({
        "model": req.model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.prompt}
        ],
        "temperature": 0.0
    });

    let res = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("OpenAI Error: {}", error_text));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("Invalid response format from OpenAI")?;

    Ok(clean_response(content))
}

async fn generate_custom_openai(
    client: &Client,
    api_key: &str,
    req: &AiGenerateRequest,
    system_prompt: &str,
    base_url: &str,
) -> Result<String, String> {
    let body = json!({
        "model": req.model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.prompt}
        ],
        "temperature": 0.0
    });

    // Build the chat completions endpoint URL
    let url = build_api_url(base_url, "/chat/completions");

    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("Custom OpenAI Error: {}", error_text));
    }

    let text = res.text().await.map_err(|e| e.to_string())?;
    let json = parse_openai_compatible_response(&text)?;
    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("Invalid response format from custom OpenAI-compatible provider")?;

    Ok(clean_response(content))
}

/// Parse an OpenAI-compatible JSON response body.
/// Some gateways (e.g. 9Router) append trailing SSE `data:` markers (like `data: [DONE]`)
/// even for non-streamed requests. We first try to parse the entire response as JSON.
/// If that fails, we defensively trim off any trailing `data:` marker starting from the
/// last occurrence (`rfind`) rather than cutting in the middle where "data:" could be valid content.
fn parse_openai_compatible_response(text: &str) -> Result<serde_json::Value, String> {
    let trimmed = text.trim();
    serde_json::from_str::<serde_json::Value>(trimmed)
        .or_else(|_| {
            let cut = trimmed
                .rfind("data:")
                .map(|idx| trimmed[..idx].trim())
                .unwrap_or(trimmed);
            serde_json::from_str::<serde_json::Value>(cut)
        })
        .map_err(|e| format!("Failed to parse response JSON: {}. Original response: {}", e, text))
}

async fn generate_openrouter(
    client: &Client,
    api_key: &str,
    req: &AiGenerateRequest,
    system_prompt: &str,
) -> Result<String, String> {
    let body = json!({
        "model": req.model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.prompt}
        ],
        "temperature": 0.0
    });

    let res = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("HTTP-Referer", "https://github.com/TabularisDB/tabularis")
        .header("X-Title", "Tabularis")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("OpenRouter Error: {}", error_text));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("Invalid response format from OpenRouter")?;

    Ok(clean_response(content))
}

async fn generate_anthropic(
    client: &Client,
    api_key: &str,
    req: &AiGenerateRequest,
    system_prompt: &str,
) -> Result<String, String> {
    let body = json!({
        "model": req.model,
        "system": system_prompt,
        "messages": [
            {"role": "user", "content": req.prompt}
        ],
        "max_tokens": 1024,
        "temperature": 0.0
    });

    let res = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("Anthropic Error: {}", error_text));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let content = json["content"][0]["text"]
        .as_str()
        .ok_or("Invalid response format from Anthropic")?;

    Ok(clean_response(content))
}

async fn generate_ollama(
    client: &Client,
    req: &AiGenerateRequest,
    system_prompt: &str,
    port: u16,
) -> Result<String, String> {
    let body = json!({
        "model": req.model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.prompt}
        ],
        "stream": false,
        "options": {
            "temperature": 0.0
        }
    });

    let url = format!("http://localhost:{}/api/chat", port);
    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama on port {}: {}", port, e))?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("Ollama Error: {}", error_text));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let content = json["message"]["content"]
        .as_str()
        .ok_or("Invalid response format from Ollama")?;

    Ok(clean_response(content))
}

async fn generate_minimax(
    client: &Client,
    api_key: &str,
    req: &AiGenerateRequest,
    system_prompt: &str,
) -> Result<String, String> {
    let body = json!({
        "model": req.model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.prompt}
        ],
        "temperature": 0.1
    });

    let res = client
        .post("https://api.minimax.io/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("MiniMax Error: {}", error_text));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("Invalid response format from MiniMax")?;

    Ok(clean_response(content))
}

// --- Chat assistant (floating widget) ---

/// Default persona for the chat widget. Kept general so the assistant is useful
/// for any question, while still being aware it lives inside a database tool.
const CHAT_SYSTEM_PROMPT: &str = "You are Tabularis AI, a helpful assistant built into the Tabularis database GUI client. \
Be concise, accurate and friendly. Format answers in Markdown; put SQL and code inside fenced ```sql (or appropriate language) blocks. \
Always reply in the same language the user writes in.";

async fn generate_chat(app: AppHandle, mut req: AiChatRequest) -> Result<String, String> {
    log::info!("AI chat using provider: {}", req.provider);

    if req.messages.is_empty() {
        return Err("No messages provided.".to_string());
    }

    let app_config = config::load_config_internal(&app);
    let ollama_port = app_config.ai_ollama_port.unwrap_or(11434);
    req.model = resolve_model(&req.provider, &req.model, &app_config, ollama_port).await?;

    // Build the system prompt, optionally enriched with the current DB schema.
    let mut system_prompt = String::from(CHAT_SYSTEM_PROMPT);
    if !req.schema.trim().is_empty() {
        system_prompt.push_str(
            "\n\nThe user is currently connected to a database. Use this schema when relevant:\n",
        );
        system_prompt.push_str(req.schema.trim());
    }

    let api_key = if req.provider != "ollama" {
        config::get_ai_api_key(&app, &req.provider)?
    } else {
        String::new()
    };

    let client = ai_http_client();

    let result = match req.provider.as_str() {
        "anthropic" => {
            chat_anthropic(&client, &api_key, &req.model, &system_prompt, &req.messages).await
        }
        "ollama" => {
            chat_ollama(&client, &req.model, &system_prompt, &req.messages, ollama_port).await
        }
        "custom-openai" => {
            let base_url = app_config
                .ai_custom_openai_url
                .as_ref()
                .filter(|u| !u.is_empty())
                .ok_or("Custom OpenAI URL not configured.")?;
            let url = build_api_url(base_url, "/chat/completions");
            chat_openai_compatible(&client, &api_key, &url, &req.model, &system_prompt, &req.messages)
                .await
        }
        "nine-router" => {
            let base_url = app_config
                .ai_nine_router_url
                .as_ref()
                .filter(|u| !u.is_empty())
                .ok_or("9Router URL not configured.")?;
            let url = build_api_url(base_url, "/chat/completions");
            chat_openai_compatible(&client, &api_key, &url, &req.model, &system_prompt, &req.messages)
                .await
        }
        "openai" => {
            chat_openai_compatible(
                &client,
                &api_key,
                "https://api.openai.com/v1/chat/completions",
                &req.model,
                &system_prompt,
                &req.messages,
            )
            .await
        }
        "openrouter" => {
            chat_openai_compatible(
                &client,
                &api_key,
                "https://openrouter.ai/api/v1/chat/completions",
                &req.model,
                &system_prompt,
                &req.messages,
            )
            .await
        }
        "minimax" => {
            chat_openai_compatible(
                &client,
                &api_key,
                "https://api.minimax.io/v1/chat/completions",
                &req.model,
                &system_prompt,
                &req.messages,
            )
            .await
        }
        other => Err(format!("Unsupported provider: {}", other)),
    };

    match &result {
        Ok(_) => log::info!("AI chat reply generated using {}", req.model),
        Err(e) => log::error!("AI chat failed: {}", e),
    }

    result
}

/// Build the OpenAI-style messages array: a leading system prompt followed by
/// the conversation history.
fn build_chat_messages(system_prompt: &str, messages: &[ChatMessage]) -> Vec<serde_json::Value> {
    let mut arr = Vec::with_capacity(messages.len() + 1);
    arr.push(json!({"role": "system", "content": system_prompt}));
    for m in messages {
        let role = if m.role == "assistant" {
            "assistant"
        } else {
            "user"
        };
        arr.push(json!({"role": role, "content": m.content}));
    }
    arr
}

/// Parse the assistant text out of an OpenAI-compatible chat response body.
/// Some gateways (e.g. 9Router) append trailing SSE `data:` markers even for
/// non-streamed requests, so we defensively cut at the first one if the raw
/// body does not parse as JSON.
fn parse_openai_chat_content(text: &str) -> Result<String, String> {
    let json = parse_openai_compatible_response(text)?;
    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("Invalid response format from provider")?;
    Ok(content.trim().to_string())
}

async fn chat_openai_compatible(
    client: &Client,
    api_key: &str,
    url: &str,
    model: &str,
    system_prompt: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    let body = json!({
        "model": model,
        "messages": build_chat_messages(system_prompt, messages),
        "temperature": 0.7
    });

    let mut request = client
        .post(url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json");

    // OpenRouter appreciates attribution headers.
    if url.contains("openrouter.ai") {
        request = request
            .header("HTTP-Referer", "https://github.com/TabularisDB/tabularis")
            .header("X-Title", "Tabularis");
    }

    let res = request
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("AI provider error: {}", error_text));
    }

    let text = res.text().await.map_err(|e| e.to_string())?;
    parse_openai_chat_content(&text)
}

async fn chat_anthropic(
    client: &Client,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    let msgs: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| {
            let role = if m.role == "assistant" {
                "assistant"
            } else {
                "user"
            };
            json!({"role": role, "content": m.content})
        })
        .collect();

    let body = json!({
        "model": model,
        "system": system_prompt,
        "messages": msgs,
        "max_tokens": 2048,
        "temperature": 0.7
    });

    let res = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("Anthropic Error: {}", error_text));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let content = json["content"][0]["text"]
        .as_str()
        .ok_or("Invalid response format from Anthropic")?;
    Ok(content.trim().to_string())
}

async fn chat_ollama(
    client: &Client,
    model: &str,
    system_prompt: &str,
    messages: &[ChatMessage],
    port: u16,
) -> Result<String, String> {
    let body = json!({
        "model": model,
        "messages": build_chat_messages(system_prompt, messages),
        "stream": false,
        "options": { "temperature": 0.7 }
    });

    let url = format!("http://localhost:{}/api/chat", port);
    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama on port {}: {}", port, e))?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("Ollama Error: {}", error_text));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let content = json["message"]["content"]
        .as_str()
        .ok_or("Invalid response format from Ollama")?;
    Ok(content.trim().to_string())
}

// --- Streaming chat ---

/// Which transport a provider uses for streaming.
enum ChatBackend {
    /// OpenAI-compatible SSE at the given full chat-completions URL.
    OpenAi(String),
    Anthropic,
    Ollama,
}

async fn generate_chat_stream(
    app: AppHandle,
    mut req: AiChatRequest,
    on_event: tauri::ipc::Channel<String>,
) -> Result<String, String> {
    log::info!("AI chat (stream) using provider: {}", req.provider);

    if req.messages.is_empty() {
        return Err("No messages provided.".to_string());
    }

    let app_config = config::load_config_internal(&app);
    let ollama_port = app_config.ai_ollama_port.unwrap_or(11434);
    req.model = resolve_model(&req.provider, &req.model, &app_config, ollama_port).await?;

    let mut system_prompt = String::from(CHAT_SYSTEM_PROMPT);
    if !req.schema.trim().is_empty() {
        system_prompt.push_str(
            "\n\nThe user is currently connected to a database. Use this schema when relevant:\n",
        );
        system_prompt.push_str(req.schema.trim());
    }

    let api_key = if req.provider != "ollama" {
        config::get_ai_api_key(&app, &req.provider)?
    } else {
        String::new()
    };

    let backend = match req.provider.as_str() {
        "anthropic" => ChatBackend::Anthropic,
        "ollama" => ChatBackend::Ollama,
        "custom-openai" => {
            let base_url = app_config
                .ai_custom_openai_url
                .as_ref()
                .filter(|u| !u.is_empty())
                .ok_or("Custom OpenAI URL not configured.")?;
            ChatBackend::OpenAi(build_api_url(base_url, "/chat/completions"))
        }
        "nine-router" => {
            let base_url = app_config
                .ai_nine_router_url
                .as_ref()
                .filter(|u| !u.is_empty())
                .ok_or("9Router URL not configured.")?;
            ChatBackend::OpenAi(build_api_url(base_url, "/chat/completions"))
        }
        "openai" => ChatBackend::OpenAi("https://api.openai.com/v1/chat/completions".to_string()),
        "openrouter" => {
            ChatBackend::OpenAi("https://openrouter.ai/api/v1/chat/completions".to_string())
        }
        "minimax" => ChatBackend::OpenAi("https://api.minimax.io/v1/chat/completions".to_string()),
        other => return Err(format!("Unsupported provider: {}", other)),
    };

    let client = ai_http_client();

    // Try streaming first.
    let streamed = match &backend {
        ChatBackend::OpenAi(url) => {
            chat_openai_compatible_stream(
                &client,
                &api_key,
                url,
                &req.model,
                &system_prompt,
                &req.messages,
                &on_event,
            )
            .await
        }
        ChatBackend::Anthropic => {
            chat_anthropic_stream(
                &client,
                &api_key,
                &req.model,
                &system_prompt,
                &req.messages,
                &on_event,
            )
            .await
        }
        ChatBackend::Ollama => {
            chat_ollama_stream(
                &client,
                &req.model,
                &system_prompt,
                &req.messages,
                &on_event,
                ollama_port,
            )
            .await
        }
    }?;

    // Some gateways ignore `stream: true` and reply once. If nothing streamed,
    // fall back to a single non-streamed request and emit it as one chunk.
    if streamed.trim().is_empty() {
        log::info!(
            "AI chat stream returned empty text; falling back to non-streamed request for model {}",
            req.model
        );
        let full = match &backend {
            ChatBackend::OpenAi(url) => {
                chat_openai_compatible(
                    &client,
                    &api_key,
                    url,
                    &req.model,
                    &system_prompt,
                    &req.messages,
                )
                .await
            }
            ChatBackend::Anthropic => {
                chat_anthropic(&client, &api_key, &req.model, &system_prompt, &req.messages).await
            }
            ChatBackend::Ollama => {
                chat_ollama(&client, &req.model, &system_prompt, &req.messages, ollama_port).await
            }
        }
        .map_err(|e| format!("AI stream was empty and fallback failed: {}", e))?;
        let _ = on_event.send(full.clone());
        return Ok(full);
    }

    Ok(streamed)
}

/// Consume an SSE `data:`-framed response, emitting each extracted text delta
/// through `on_event`. Lines are decoded only once complete (newline reached),
/// so multibyte UTF-8 (e.g. Vietnamese) is never split mid-character.
async fn stream_sse<F>(
    res: reqwest::Response,
    on_event: &tauri::ipc::Channel<String>,
    extract: F,
) -> Result<String, String>
where
    F: Fn(&serde_json::Value) -> Option<String>,
{
    let mut stream = res.bytes_stream();
    let mut full = String::new();
    let mut buf: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buf.extend_from_slice(&chunk);

        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = buf.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line_bytes);
            let line = line.trim();
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(delta) = extract(&json) {
                    if !delta.is_empty() {
                        full.push_str(&delta);
                        let _ = on_event.send(delta);
                    }
                }
            }
        }
    }

    Ok(full)
}

/// Consume a newline-delimited JSON (ndjson) stream, e.g. Ollama.
async fn stream_ndjson<F>(
    res: reqwest::Response,
    on_event: &tauri::ipc::Channel<String>,
    extract: F,
) -> Result<String, String>
where
    F: Fn(&serde_json::Value) -> Option<String>,
{
    let mut stream = res.bytes_stream();
    let mut full = String::new();
    let mut buf: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buf.extend_from_slice(&chunk);

        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = buf.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line_bytes);
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some(delta) = extract(&json) {
                    if !delta.is_empty() {
                        full.push_str(&delta);
                        let _ = on_event.send(delta);
                    }
                }
            }
        }
    }

    Ok(full)
}

async fn chat_openai_compatible_stream(
    client: &Client,
    api_key: &str,
    url: &str,
    model: &str,
    system_prompt: &str,
    messages: &[ChatMessage],
    on_event: &tauri::ipc::Channel<String>,
) -> Result<String, String> {
    let body = json!({
        "model": model,
        "messages": build_chat_messages(system_prompt, messages),
        "temperature": 0.7,
        "stream": true
    });

    let mut request = client
        .post(url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json");

    if url.contains("openrouter.ai") {
        request = request
            .header("HTTP-Referer", "https://github.com/TabularisDB/tabularis")
            .header("X-Title", "Tabularis");
    }

    let res = request
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("AI provider error: {}", error_text));
    }

    stream_sse(res, on_event, |j| {
        j["choices"][0]["delta"]["content"]
            .as_str()
            .map(|s| s.to_string())
    })
    .await
}

async fn chat_anthropic_stream(
    client: &Client,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    messages: &[ChatMessage],
    on_event: &tauri::ipc::Channel<String>,
) -> Result<String, String> {
    let msgs: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| {
            let role = if m.role == "assistant" {
                "assistant"
            } else {
                "user"
            };
            json!({"role": role, "content": m.content})
        })
        .collect();

    let body = json!({
        "model": model,
        "system": system_prompt,
        "messages": msgs,
        "max_tokens": 2048,
        "temperature": 0.7,
        "stream": true
    });

    let res = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("Anthropic Error: {}", error_text));
    }

    stream_sse(res, on_event, |j| {
        j["delta"]["text"].as_str().map(|s| s.to_string())
    })
    .await
}

async fn chat_ollama_stream(
    client: &Client,
    model: &str,
    system_prompt: &str,
    messages: &[ChatMessage],
    on_event: &tauri::ipc::Channel<String>,
    port: u16,
) -> Result<String, String> {
    let body = json!({
        "model": model,
        "messages": build_chat_messages(system_prompt, messages),
        "stream": true,
        "options": { "temperature": 0.7 }
    });

    let url = format!("http://localhost:{}/api/chat", port);
    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama on port {}: {}", port, e))?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("Ollama Error: {}", error_text));
    }

    stream_ndjson(res, on_event, |j| {
        j["message"]["content"].as_str().map(|s| s.to_string())
    })
    .await
}

fn clean_response(text: &str) -> String {
    let text = text.trim();
    if text.starts_with("```") {
        let mut lines = text.lines();
        lines.next(); // Skip first line
        let mut result = Vec::new();
        for line in lines {
            if line.trim() == "```" {
                break;
            }
            result.push(line);
        }
        return result.join("\n").trim().to_string();
    }
    text.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_default_models() {
        let models = load_default_models();
        assert!(models.contains_key("openai"));
        assert!(models.contains_key("anthropic"));
        assert!(models.contains_key("openrouter"));
        assert!(models.contains_key("minimax"));

        // Check for new futuristic models from yaml
        let openai = models.get("openai").unwrap();
        assert!(openai.contains(&"gpt-5.5".to_string()));

        // Anthropic should include the flagship Fable 5 and current Opus/Sonnet/Haiku
        let anthropic = models.get("anthropic").unwrap();
        assert!(anthropic.contains(&"claude-fable-5".to_string()));
        assert!(anthropic.contains(&"claude-opus-4-8".to_string()));
        assert!(anthropic.contains(&"claude-sonnet-4-6".to_string()));
        assert!(anthropic.contains(&"claude-haiku-4-5".to_string()));

        // Check MiniMax models
        let minimax = models.get("minimax").unwrap();
        assert!(minimax.contains(&"MiniMax-M3".to_string()));
        assert!(minimax.contains(&"MiniMax-M2.7".to_string()));
        assert!(minimax.contains(&"MiniMax-M2.7-highspeed".to_string()));
        // M3 should be listed first so it is selected as the default model
        assert_eq!(minimax.first().map(String::as_str), Some("MiniMax-M3"));

        // Ollama is not in yaml, so it shouldn't be here yet
        assert!(!models.contains_key("ollama"));
    }

    #[test]
    fn test_clean_response() {
        let input = "```sql\nSELECT * FROM users;\n```";
        let output = clean_response(input);
        assert_eq!(output, "SELECT * FROM users;");

        let input_no_code = "SELECT * FROM users;";
        let output_no_code = clean_response(input_no_code);
        assert_eq!(output_no_code, "SELECT * FROM users;");

        let input_whitespace = "   ```sql\nSELECT 1;\n```   ";
        let output_whitespace = clean_response(input_whitespace);
        assert_eq!(output_whitespace, "SELECT 1;");
    }
}
