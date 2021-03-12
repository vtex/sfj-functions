import { BaseProvider } from './BaseProvider'
import AWS from 'aws-sdk'

class AWSProvider extends BaseProvider {
  private _accountId: Promise<string>
  private region: string
  private storeAccount: string
  private awsResource: string

  public constructor(storeAccount: string) {
    super(storeAccount)
    this.storeAccount = storeAccount
    this.region = 'us-east-2'
    this.awsResource = 'service-role/any'
    AWS.config.update({ region: this.region })
  }

  get accountId(): Promise<string> {
    if (this._accountId === undefined)
      this._accountId = ((new AWS.STS()).getCallerIdentity().promise()).then(x => x.Account)

    return this._accountId
  }

  public async listFunctions() {
    const lambda = new AWS.Lambda()
    const functions = await lambda.listFunctions().promise()
    const functionsObj: Record<string, { url: string }> = {}

    functions?.Functions?.forEach((item) => {
      if (item.FunctionName && item.Handler) {
        functionsObj[item.FunctionName] = { ...item, url: item.Handler }
      }
    })

    return functionsObj
  }

  private async updateFunction(functionName: string, content: Buffer) {
    const params = {
      FunctionName: functionName,
      ZipFile: content,
      Publish: true,
    }

    const lambda = new AWS.Lambda()

    await lambda.updateFunctionCode(params).promise()
  }

  private async createFunction(functionName: string, content: Buffer) {
    const lambda = new AWS.Lambda()

    const params = {
      Code: {
        ZipFile: content,
      },
      Description: `StoreFramework Function - ${functionName}`,
      FunctionName: functionName,
      Handler: 'index.handler',
      Publish: true,
      Role: `arn:aws:iam::${await this.accountId}:role/${this.awsResource}`,
      Runtime: 'nodejs12.x',
      Timeout: 15,
      TracingConfig: {
        Mode: 'Active',
      },
    }


    console.log('creating function with role:', params.Role)

    const functionResp = await lambda.createFunction(params).promise()

    const apigateway = new AWS.ApiGatewayV2()

    const respApi = await apigateway
      .createApi({
        Name: `${this.storeAccount}-api-gateway-v2-${functionName}`,
        ProtocolType: 'HTTP',
        Target: functionResp.FunctionArn,
        RouteKey: '$default',
      })
      .promise()

    console.log('creating API Gateway V2: ', `${this.storeAccount}-api-gateway-v2-${functionName}`)
    console.log('function ARN', functionResp.FunctionArn)
    console.log('functions endpoint', respApi.ApiEndpoint)

    await lambda
      .addPermission({
        FunctionName: params.FunctionName,
        StatementId: 'random-string',
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: `arn:aws:execute-api:${this.region}:${await this.accountId}:${respApi.ApiId}/*/$default`,
      })
      .promise()

    return respApi.ApiEndpoint
  }

  public async createOrUpdateFunction(functionName: string, content: Buffer) {
    const existingFunctions = await this.listFunctions()

    if (functionName in existingFunctions) {
      console.log(`Updating function ${functionName}`)
      await this.updateFunction(functionName, content)
      console.log(`Function ${functionName} updated`)
    } else {
      console.log(`Creating function ${functionName}... `)
      const url = await this.createFunction(functionName, content)
      console.log(`Function ${functionName} created`)
      return url
    }
  }

  public async createOrUpdateFunctionList(functions: Record<string, Buffer>) {
    const existingFunctions = await this.listFunctions()

    const urls: Record<string, string> = {}

    await Promise.all(
      Object.entries(functions).map(async ([functionName, content]) => {
        if (functionName in existingFunctions) {
          this.updateFunction(functionName, content)
        }

        urls[functionName] = await this.createFunction(functionName, content)
      })
    )

    return urls
  }
}

export { AWSProvider }
