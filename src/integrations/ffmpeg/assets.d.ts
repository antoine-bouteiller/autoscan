declare module '*.onnx' {
  const path: string
  export default path
}

declare module '*.wasm' {
  const path: string
  export default path
}

declare module '*ort-wasm-simd-threaded.mjs' {
  const path: string
  export default path
}
