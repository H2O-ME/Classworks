// Classworks 讲台客户端 —— 薄壳，只负责开一个窗口加载线上看板。
//
// 有意不做的事：不内嵌前端产物、不做版本号同步、不实现业务逻辑。
// 看板每次发版网页端更新完即生效，客户端不需要重新分发 —— 版本分叉是这类
// 教学工具最容易烂掉的地方。
//
// 唯一的例外是「外壳自身」：改了口令/窗口参数/图标才需要更新 exe，
// 所以启动后静默查一次更新，有新版本就下载安装并重启（教室大屏没人会手动装）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_updater::UpdaterExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                check_update(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Classworks 客户端启动失败");
}

/// 静默检查更新：网络不通、没有新版本都直接返回，不能打扰看板使用。
async fn check_update(app: tauri::AppHandle) {
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(_) => return,
    };
    let update = match updater.check().await {
        Ok(Some(update)) => update,
        _ => return,
    };
    // 下载 + 校验签名 + 安装；成功后重启到新版本
    if update
        .download_and_install(|_, _| {}, || {})
        .await
        .is_ok()
    {
        app.restart();
    }
}
