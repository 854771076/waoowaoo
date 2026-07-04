// ponytail: worker 里 @twick/render-server 会拉起内嵌 Vite, 它的旧 PostCSS loader
// 不能识别 Tailwind v4 的字符串插件 ("@tailwindcss/postcss"), 会直接抛
// "Invalid PostCSS Plugin found at: plugins[0]"。
// 仅在 Next.js 的 PostCSS pipeline (next dev/build/start) 里返回 tailwind 插件;
// 其他调用者(twick 子 Vite)拿到空 plugins,它们编译的只是 twick 自己的 worker
// 运行时资源,不需要 Tailwind。
const isNext = process.argv.some((arg) => /next(\.js|$)/.test(arg))
  || process.env.NEXT_RUNTIME !== undefined
  || process.env.NODE_ENV === 'production' && !process.cwd().includes('twick')

export default isNext
  ? { plugins: ['@tailwindcss/postcss'] }
  : { plugins: [] }
