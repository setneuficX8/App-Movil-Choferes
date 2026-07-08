const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Le decimos a Metro que reconozca los archivos WebAssembly (.wasm)
config.resolver.assetExts.push('wasm');

module.exports = config;