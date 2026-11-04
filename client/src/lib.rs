// Classworks 讲台客户端 —— 薄壳，只负责开一个窗口加载线上看板。
//
// 有意不做的事：不内嵌前端产物、不做版本号同步、不实现业务逻辑。
// 看板每次发版网页端更新完即生效，客户端不需要重新分发 —— 版本分叉是这类
// 教学工具最容易烂掉的地方。
//
// 注意两件平台差异（踩过）：
// 1. Tauri 移动端要求 crate 暴露 library target（staticlib/cdylib/rlib）+ mobile_entry_point，
//    桌面只要 bin 能跑；所以逻辑在 lib.rs，main.rs 只做入口转发。
// 2. updater 插件**只支持桌面端**，必须 #[cfg(desktop)] 包起来，否则安卓交叉编译失败。
#[cfg(desktop)]
use tauri_plugin_updater::UpdaterExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 自动更新只在桌面端有意义（移动端由应用商店/手动安装负责）
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    check_update(handle).await;
                });
            }
            // 移动端没有桌面块，显式消费掉避免未使用变量告警
            #[cfg(mobile)]
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Classworks 客户端启动失败");
}

/// 静默检查更新：网络不通、没有新版本都直接返回，不能打扰看板使用。
#[cfg(desktop)]
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
