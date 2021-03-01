import { BaseProvider } from './BaseProvider'
import AWS from 'aws-sdk'

class AWSProvider extends BaseProvider {
  public constructor(account: string) {
    AWS.config.update({ region: 'us-east-2' })
    super(account)
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
      Role: 'arn:aws:iam::688157472274:role/lambda-ex',
      Runtime: 'nodejs12.x',
      Timeout: 15,
      TracingConfig: {
        Mode: 'Active',
      },
    }

    const apigateway = new AWS.ApiGatewayV2()

    const functionResp = await lambda.createFunction(params).promise()

    const respApi = await apigateway
      .createApi({
        Name: `${this.account}-api-gateway-v2-${functionName}`,
        ProtocolType: 'HTTP',
        Target: functionResp.FunctionArn,
        RouteKey: '$default',
      })
      .promise()

    console.log(respApi.ApiEndpoint)

    await lambda
      .addPermission({
        FunctionName: params.FunctionName,
        StatementId: 'random-string',
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: `arn:aws:execute-api:us-east-2:688157472274:${respApi.ApiId}/*/$default`,
      })
      .promise()
  }

  public async createOrUpdateFunction(functionName: string, content: Buffer) {
    const existingFunctions = await this.listFunctions()

    if (functionName in existingFunctions) {
      console.log(`Updating function ${functionName}`)
      await this.updateFunction(functionName, content)
      console.log(`Function ${functionName} updated`)
    } else {
      console.log(`Creating function ${functionName}... `)
      await this.createFunction(functionName, content)
      console.log(`Function ${functionName} created`)
    }
  }

  public async createOrUpdateFunctionList(functions: Record<string, Buffer>) {
    const existingFunctions = await this.listFunctions()

    Promise.all(
      Object.entries(functions).map(([functionName, content]) => {
        if (functionName in existingFunctions) {
          return this.updateFunction(functionName, content)
        }

        return this.createFunction(functionName, content)
      })
    )
  }
}

export { AWSProvider }
