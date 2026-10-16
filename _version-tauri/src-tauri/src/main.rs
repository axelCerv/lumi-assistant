// Evita que se abra una consola extra en Windows al usar la versión instalada
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lumi_lib::run()
}
