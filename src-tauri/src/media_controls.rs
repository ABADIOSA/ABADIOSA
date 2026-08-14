#[cfg(windows)]
mod win {
    use std::sync::OnceLock;
    use tauri::{AppHandle, Emitter, Manager};
    use windows::core::HSTRING;
    use windows::Foundation::TypedEventHandler;
    use windows::Media::{
        MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls,
        SystemMediaTransportControlsButton, SystemMediaTransportControlsButtonPressedEventArgs,
    };
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;

    struct Holder(SystemMediaTransportControls);
    unsafe impl Send for Holder {}
    unsafe impl Sync for Holder {}

    static SMTC: OnceLock<Option<Holder>> = OnceLock::new();

    fn controls() -> Option<&'static SystemMediaTransportControls> {
        SMTC.get().and_then(|h| h.as_ref()).map(|h| &h.0)
    }

    pub fn init(app: &AppHandle) {
        let created = SMTC.get_or_init(|| match build(app) {
            Ok(smtc) => Some(Holder(smtc)),
            Err(e) => {
                eprintln!("[harbor::media] SMTC init failed: {e:?}");
                None
            }
        });
        if created.is_some() {
            eprintln!("[harbor::media] SMTC session registered");
        }
    }

    fn build(app: &AppHandle) -> windows::core::Result<SystemMediaTransportControls> {
        let window = app
            .get_webview_window("main")
            .ok_or_else(windows::core::Error::empty)?;
        let raw = window.hwnd().map_err(|_| windows::core::Error::empty())?;
        let hwnd = HWND(raw.0 as *mut _);
        let interop = windows::core::factory::<
            SystemMediaTransportControls,
            ISystemMediaTransportControlsInterop,
        >()?;
        let smtc: SystemMediaTransportControls = unsafe { interop.GetForWindow(hwnd)? };
        smtc.SetIsPlayEnabled(true)?;
        smtc.SetIsPauseEnabled(true)?;
        smtc.SetIsNextEnabled(true)?;
        smtc.SetIsPreviousEnabled(true)?;
        smtc.SetIsStopEnabled(true)?;
        smtc.SetIsEnabled(false)?;
        let handle = app.clone();
        smtc.ButtonPressed(&TypedEventHandler::new(
            move |_,
                  args: windows::core::Ref<
                '_,
                SystemMediaTransportControlsButtonPressedEventArgs,
            >| {
                if let Some(a) = args.as_ref() {
                    let name = match a.Button()? {
                        SystemMediaTransportControlsButton::Play => "play",
                        SystemMediaTransportControlsButton::Pause => "pause",
                        SystemMediaTransportControlsButton::Next => "next",
                        SystemMediaTransportControlsButton::Previous => "previous",
                        SystemMediaTransportControlsButton::Stop => "stop",
                        _ => return Ok(()),
                    };
                    let _ = handle.emit("harbor://media-key", name);
                }
                Ok(())
            },
        ))?;
        Ok(smtc)
    }

    pub fn update(playing: bool, title: &str, subtitle: &str) {
        let Some(smtc) = controls() else { return };
        let _ = smtc.SetIsEnabled(true);
        let _ = smtc.SetPlaybackStatus(if playing {
            MediaPlaybackStatus::Playing
        } else {
            MediaPlaybackStatus::Paused
        });
        if let Ok(du) = smtc.DisplayUpdater() {
            let _ = du.SetType(MediaPlaybackType::Video);
            if let Ok(vp) = du.VideoProperties() {
                let _ = vp.SetTitle(&HSTRING::from(title));
                let _ = vp.SetSubtitle(&HSTRING::from(subtitle));
            }
            let _ = du.Update();
        }
    }

    pub fn clear() {
        let Some(smtc) = controls() else { return };
        let _ = smtc.SetPlaybackStatus(MediaPlaybackStatus::Closed);
        if let Ok(du) = smtc.DisplayUpdater() {
            let _ = du.ClearAll();
            let _ = du.Update();
        }
        let _ = smtc.SetIsEnabled(false);
    }
}

pub fn ensure_started_on_setup(app: &tauri::AppHandle) {
    #[cfg(windows)]
    win::init(app);
    #[cfg(not(windows))]
    let _ = app;
}

#[tauri::command]
pub fn media_controls_update(playing: bool, title: String, subtitle: String) {
    #[cfg(windows)]
    win::update(playing, &title, &subtitle);
    #[cfg(not(windows))]
    let _ = (playing, title, subtitle);
}

#[tauri::command]
pub fn media_controls_clear() {
    #[cfg(windows)]
    win::clear();
}
