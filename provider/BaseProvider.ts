import yazl from 'yazl'

export type Functions = Record<string, { url: string }>

export abstract class BaseProvider {
  public account: string

  constructor(account: string) {
    this.account = account
  }

  public abstract getOrCreateFunction(functionName: string, content: Buffer): Promise<string | undefined>

  public async zipFunction(content: Buffer): Promise<Buffer> {
    const zipfile = new yazl.ZipFile()
    zipfile.addBuffer(content, 'index.js')

    return new Promise((resolve, reject) => {
      const data = []

      zipfile.outputStream.on('data', (chunk) => data.push(chunk))
      zipfile.outputStream.on('end', () => resolve(Buffer.concat(data)))
      zipfile.outputStream.on('error', (error) => reject(error))
      zipfile.end()
    })
  }
}
