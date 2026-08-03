mod adapters;
mod catalog;
mod engine;
mod handoff;
mod types;

use engine::{ExecutionManager, PlanStore, INSTALL_PROGRESS_EVENT};
use handoff::ProfileHandoffState;
use tauri::{AppHandle, Emitter, Manager, State};
use types::{EnvironmentReport, InstallPlan, InstallPolicy, InstallResult};

#[tauri::command]
fn detect_environment() -> EnvironmentReport {
    adapters::detect_environment()
}

#[tauri::command]
async fn build_install_plan(
    app_ids: Vec<String>,
    policy: InstallPolicy,
    state: State<'_, PlanStore>,
) -> Result<InstallPlan, String> {
    let store = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        store.create(app_ids, policy, &adapters::detect_environment())
    })
    .await
    .map_err(|error| format!("install planner failed: {error}"))?
}

#[tauri::command]
async fn execute_install_plan(
    plan_id: String,
    confirmation_token: String,
    plans: State<'_, PlanStore>,
    executions: State<'_, ExecutionManager>,
    app: AppHandle,
) -> Result<InstallResult, String> {
    let plan = plans.take_confirmed(&plan_id, &confirmation_token)?;
    let registration = executions.register(&plan.plan_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        engine::execute_plan(plan, registration, |event| {
            let _ = app.emit(INSTALL_PROGRESS_EVENT, event);
        })
    })
    .await
    .map_err(|error| format!("install worker failed: {error}"))
}

#[tauri::command]
fn cancel_install_plan(
    plan_id: String,
    executions: State<'_, ExecutionManager>,
) -> Result<bool, String> {
    executions.cancel(&plan_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            #[cfg(any(windows, target_os = "linux"))]
            handoff::reject_unsafe_normalized_cli_profile(app, &_argv);

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
        builder = builder.plugin(tauri_plugin_deep_link::init());
    }

    builder
        .manage(PlanStore::default())
        .manage(ExecutionManager::default())
        .manage(ProfileHandoffState::default())
        .invoke_handler(tauri::generate_handler![
            detect_environment,
            build_install_plan,
            execute_install_plan,
            cancel_install_plan,
            handoff::take_pending_profile
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;

                if let Some(urls) = app.deep_link().get_current()? {
                    #[cfg(any(windows, target_os = "linux"))]
                    handoff::accept_initial_profile_urls(
                        app.handle(),
                        urls.iter().map(|url| url.as_str()),
                        &std::env::args().collect::<Vec<_>>(),
                    );

                    #[cfg(not(any(windows, target_os = "linux")))]
                    handoff::accept_profile_urls(
                        app.handle(),
                        urls.iter().map(|url| url.as_str()),
                        false,
                    );
                }

                let app_handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    handoff::accept_profile_urls(
                        &app_handle,
                        event.urls().iter().map(|url| url.as_str()),
                        true,
                    );
                });

                #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
                app.deep_link().register_all()?;
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
