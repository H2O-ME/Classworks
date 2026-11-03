// Classworks 讲台客户端 —— 薄壳，只负责开一个窗口加载线上看板。
//
// 有意不做的事：不内嵌前端产物、不做版本号同步、不实现业务逻辑。
// 看板每次发版网页端更新完即生效，客户端不需要重新分发 —— 版本分叉是这类
// 教学工具最容易烂掉的地方。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Classworks 客户端启动失败");
}
