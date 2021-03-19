export type Functions = Record<string, { url: string }>

export abstract class BaseProvider {
  public account: string

  constructor(account: string) {
    this.account = account
  }

  public abstract getOrCreateFunction(functionName: string, content: Buffer): Promise<string | undefined>
}
