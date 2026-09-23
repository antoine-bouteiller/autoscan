declare module 'onnxruntime-web/ort-wasm-simd-threaded.wasm' {
  const path: string
  export default path
}

declare module '*.onnx' {
  const path: string
  export default path
}
