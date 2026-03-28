use tauri::{
    menu::{Menu, PredefinedMenuItem, Submenu},
    Manager,
};

/// Write binary data to a path chosen by the user via a native save dialog.
#[tauri::command]
async fn save_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &data).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialise the SQLite database file in the app-data directory.
            let db_dir = app.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&db_dir).expect("could not create app data dir");

            // Build a full macOS menu. Using PredefinedMenuItems is required
            // so that WKWebView's responder chain is properly wired and ALL
            // Cmd shortcuts (Cmd+Z, Cmd+Q, Cmd+C, etc.) are recognised.
            let sep  = PredefinedMenuItem::separator(app)?;
            let quit = PredefinedMenuItem::quit(app, Some("Quit Pixatron Plus"))?;
            let hide = PredefinedMenuItem::hide(app, None)?;
            let hide_others = PredefinedMenuItem::hide_others(app, None)?;
            let show_all    = PredefinedMenuItem::show_all(app, None)?;

            let app_menu = Submenu::with_items(
                app, "Pixatron Plus", true,
                &[&hide, &hide_others, &show_all, &sep, &quit],
            )?;

            let undo   = PredefinedMenuItem::undo(app, None)?;
            let redo   = PredefinedMenuItem::redo(app, None)?;
            let cut    = PredefinedMenuItem::cut(app, None)?;
            let copy   = PredefinedMenuItem::copy(app, None)?;
            let paste  = PredefinedMenuItem::paste(app, None)?;
            let sel_all = PredefinedMenuItem::select_all(app, None)?;
            let sep2   = PredefinedMenuItem::separator(app)?;

            let edit_menu = Submenu::with_items(
                app, "Edit", true,
                &[&undo, &redo, &sep2, &cut, &copy, &paste, &sel_all],
            )?;

            let minimize = PredefinedMenuItem::minimize(app, None)?;
            let fullscreen = PredefinedMenuItem::fullscreen(app, None)?;
            let sep3 = PredefinedMenuItem::separator(app)?;

            let window_menu = Submenu::with_items(
                app, "Window", true,
                &[&minimize, &sep3, &fullscreen],
            )?;

            let menu = Menu::with_items(app, &[&app_menu, &edit_menu, &window_menu])?;
            app.set_menu(menu)?;

            Ok(())
        })
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![save_binary_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
