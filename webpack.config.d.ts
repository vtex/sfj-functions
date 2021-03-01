import { BaseProvider } from './provider/BaseProvider'

declare const generateConfig: (dirName: string, distDir: string, provider: BaseProvider) => Record<string, any>

export { generateConfig }
