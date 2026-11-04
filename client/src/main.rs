// 桌面端入口：逻辑都在 lib.rs（移动端复用同一份）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    classworks_board::run();
}
