//! Mythic Forge desktop shell.
//!
//! The shell only hosts the editor web build in the system WebView (WebView2 on Windows).
//! It exposes no custom commands: projects are stored in the WebView's private storage,
//! exactly like the Android and browser builds. Native project folders and a native
//! "Save as" dialog are planned (see docs/windows.md).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Mythic Forge");
}
