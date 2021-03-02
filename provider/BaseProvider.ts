export type Functions = Record<string, { url: string }>

export abstract class BaseProvider {
  public account: string

  constructor(account: string) {
    this.account = account
  }

  public abstract createOrUpdateFunction(functionName: string, content: Buffer): Promise<string | undefined>

  public abstract createOrUpdateFunctionList(functions: Record<string, Buffer>): Promise<Record<string, string> | void>

  public abstract listFunctions(): Promise<Functions>
}
