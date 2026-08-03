use std::{collections::VecDeque, sync::Mutex};

use tauri::{AppHandle, Emitter, Manager, State};

pub const PROFILE_OPEN_EVENT: &str = "profile-open-requested";
const MAX_PROFILE_SLUG_LEN: usize = 64;
const MAX_PENDING_PROFILES: usize = 16;

#[derive(Default)]
pub struct ProfileHandoffState {
    pending_slugs: Mutex<VecDeque<String>>,
}

impl ProfileHandoffState {
    fn remember(&self, slug: String) -> Result<(), String> {
        let mut pending = self
            .pending_slugs
            .lock()
            .map_err(|_| "profile handoff state is unavailable".to_string())?;
        if pending.len() >= MAX_PENDING_PROFILES {
            return Err("profile handoff queue is full".to_string());
        }
        pending.push_back(slug);
        Ok(())
    }

    fn take(&self) -> Result<Option<String>, String> {
        Ok(self
            .pending_slugs
            .lock()
            .map_err(|_| "profile handoff state is unavailable".to_string())?
            .pop_front())
    }

    #[cfg(any(windows, target_os = "linux", test))]
    fn reject_latest(&self, slug: &str) -> Result<bool, String> {
        let mut pending = self
            .pending_slugs
            .lock()
            .map_err(|_| "profile handoff state is unavailable".to_string())?;
        if pending
            .back()
            .is_some_and(|pending_slug| pending_slug == slug)
        {
            pending.pop_back();
            return Ok(true);
        }
        Ok(false)
    }
}

pub fn parse_profile_url(raw_url: &str) -> Result<String, &'static str> {
    let url = tauri::Url::parse(raw_url).map_err(|_| "profile URL is invalid")?;
    if url.scheme() != "pakitup" {
        return Err("profile URL scheme is invalid");
    }
    if !url.username().is_empty() || url.password().is_some() || url.port().is_some() {
        return Err("profile URL credentials and ports are forbidden");
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("profile URL query and fragment are forbidden");
    }
    if !matches!(url.path(), "" | "/") {
        return Err("profile URL path is forbidden");
    }

    let slug = url.host_str().ok_or("profile URL host is missing")?;

    if slug.is_empty() || slug.len() > MAX_PROFILE_SLUG_LEN {
        return Err("profile slug length is invalid");
    }

    let Some((base, suffix)) = slug.rsplit_once('-') else {
        return Err("profile slug is missing its generated suffix");
    };

    if suffix.len() != 10
        || !suffix
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
    {
        return Err("profile slug suffix is invalid");
    }

    if !base.split('-').all(|part| {
        !part.is_empty()
            && part
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
    }) {
        return Err("profile slug format is invalid");
    }

    Ok(slug.to_owned())
}

fn profile_slug_from_urls<'a>(
    urls: impl IntoIterator<Item = &'a str>,
) -> Result<String, &'static str> {
    let mut urls = urls.into_iter();
    let url = urls.next().ok_or("deep link did not contain a URL")?;
    if urls.next().is_some() {
        return Err("deep link contained multiple URLs");
    }
    parse_profile_url(url)
}

#[cfg(any(windows, target_os = "linux", test))]
fn profile_slug_from_cli_args(args: &[String]) -> Result<String, &'static str> {
    if args.len() != 2 {
        return Err("deep link command line must contain exactly one URL");
    }
    parse_profile_url(&args[1])
}

fn retain_profile(app: &AppHandle, slug: String, emit_event: bool) {
    let state = app.state::<ProfileHandoffState>();
    if let Err(error) = state.remember(slug.clone()) {
        log::error!("could not retain profile deep link: {error}");
        return;
    }

    if emit_event {
        let _ = app.emit(PROFILE_OPEN_EVENT, slug);
    }
}

pub fn accept_profile_urls<'a>(
    app: &AppHandle,
    urls: impl IntoIterator<Item = &'a str>,
    emit_event: bool,
) {
    let slug = match profile_slug_from_urls(urls) {
        Ok(slug) => slug,
        Err(error) => {
            log::warn!("ignored invalid profile deep link: {error}");
            return;
        }
    };

    retain_profile(app, slug, emit_event);
}

#[cfg(any(windows, target_os = "linux"))]
pub fn accept_initial_profile_urls<'a>(
    app: &AppHandle,
    urls: impl IntoIterator<Item = &'a str>,
    raw_args: &[String],
) {
    let normalized_slug = match profile_slug_from_urls(urls) {
        Ok(slug) => slug,
        Err(error) => {
            log::warn!("ignored invalid initial profile deep link: {error}");
            return;
        }
    };
    let raw_slug = match profile_slug_from_cli_args(raw_args) {
        Ok(slug) => slug,
        Err(error) => {
            log::warn!("ignored unsafe raw profile deep link: {error}");
            return;
        }
    };
    if raw_slug != normalized_slug {
        log::warn!("ignored profile deep link changed by URL normalization");
        return;
    }
    retain_profile(app, normalized_slug, false);
}

#[cfg(any(windows, target_os = "linux"))]
pub fn reject_unsafe_normalized_cli_profile(app: &AppHandle, raw_args: &[String]) {
    if profile_slug_from_cli_args(raw_args).is_ok() || raw_args.len() != 2 {
        return;
    }
    let Some(normalized_slug) = tauri::Url::parse(&raw_args[1])
        .ok()
        .and_then(|url| parse_profile_url(url.as_str()).ok())
    else {
        return;
    };

    let state = app.state::<ProfileHandoffState>();
    if state.reject_latest(&normalized_slug).unwrap_or(false) {
        log::warn!("rejected profile deep link changed by URL normalization");
    }
}

#[tauri::command]
pub fn take_pending_profile(
    state: State<'_, ProfileHandoffState>,
) -> Result<Option<String>, String> {
    state.take()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_exact_profile_url() {
        assert_eq!(
            parse_profile_url("pakitup://workstation-7655307cce").unwrap(),
            "workstation-7655307cce"
        );
        assert_eq!(
            parse_profile_url("pakitup://workstation-7655307cce/").unwrap(),
            "workstation-7655307cce"
        );
        assert!(parse_profile_url(&format!(
            "pakitup://{}-7655307cce",
            "a".repeat(MAX_PROFILE_SLUG_LEN - 11)
        ))
        .is_ok());
    }

    #[test]
    fn rejects_malformed_and_extra_url_parts() {
        for url in [
            "pakitup://",
            "https://workstation-7655307cce",
            "pakitup://workstation-7655307cce/extra",
            "pakitup://workstation-7655307cce?provider=winget",
            "pakitup://workstation-7655307cce#confirm",
            "pakitup://work%73tation-7655307cce",
            "pakitup://-workstation-7655307cce",
            "pakitup://workstation-",
            "pakitup://work--station-7655307cce",
            "pakitup://workstation-not-a-uuid",
            "pakitup://workstation-7655307CCe",
            "pakitup://user@workstation-7655307cce",
            "pakitup://workstation-7655307cce:8080",
        ] {
            assert!(parse_profile_url(url).is_err(), "accepted {url}");
        }
    }

    #[test]
    fn normalized_traversal_cannot_change_the_profile_host() {
        for raw_url in [
            "pakitup://a/../target-7655307cce",
            "pakitup://a/%2e%2e/target-7655307cce",
        ] {
            let normalized = tauri::Url::parse(raw_url).unwrap();
            assert_eq!(normalized.host_str(), Some("a"));
            assert!(parse_profile_url(normalized.as_str()).is_err());
        }
    }

    #[test]
    fn raw_cli_validation_rejects_traversal_paths() {
        for raw_url in [
            "pakitup://a/../target-7655307cce",
            "pakitup://a/%2e%2e/target-7655307cce",
        ] {
            let args = vec!["pakitup".to_string(), raw_url.to_string()];
            assert!(profile_slug_from_cli_args(&args).is_err());

            let normalized = tauri::Url::parse(raw_url).unwrap();
            assert!(parse_profile_url(normalized.as_str()).is_err());
        }
    }

    #[test]
    fn rejects_command_injection_shapes() {
        for url in [
            "pakitup://workstation;rm-rf-7655307cce",
            "pakitup://workstation%20--provider%20evil-7655307cce",
            "pakitup://workstation&calc.exe-7655307cce",
            "pakitup://workstation|sh-7655307cce",
            "pakitup://workstation$(whoami)-7655307cce",
            "pakitup://user@workstation-7655307cce",
            "pakitup://workstation-7655307cce:8080",
        ] {
            assert!(parse_profile_url(url).is_err(), "accepted {url}");
        }
    }

    #[test]
    fn pending_profiles_are_consumed_in_fifo_order() {
        let state = ProfileHandoffState::default();
        state.remember("alpha-7655307cce".to_string()).unwrap();
        state.remember("beta-a1b2c3d4e5".to_string()).unwrap();
        assert_eq!(state.take().unwrap().as_deref(), Some("alpha-7655307cce"));
        assert_eq!(state.take().unwrap().as_deref(), Some("beta-a1b2c3d4e5"));
        assert_eq!(state.take().unwrap(), None);
    }

    #[test]
    fn pending_profile_queue_is_bounded_without_overwriting() {
        let state = ProfileHandoffState::default();
        for index in 0..MAX_PENDING_PROFILES {
            state.remember(format!("profile-{index:010x}")).unwrap();
        }
        assert!(state.remember("overflow-0000000000".to_string()).is_err());
        for index in 0..MAX_PENDING_PROFILES {
            assert_eq!(state.take().unwrap(), Some(format!("profile-{index:010x}")));
        }
        assert_eq!(state.take().unwrap(), None);
    }

    #[test]
    fn unsafe_normalized_target_can_only_revoke_the_latest_match() {
        let state = ProfileHandoffState::default();
        state.remember("first-7655307cce".to_string()).unwrap();
        state.remember("target-a1b2c3d4e5".to_string()).unwrap();
        assert!(state.reject_latest("target-a1b2c3d4e5").unwrap());
        assert!(!state.reject_latest("other-0000000000").unwrap());
        assert_eq!(state.take().unwrap().as_deref(), Some("first-7655307cce"));
        assert_eq!(state.take().unwrap(), None);
    }
}
