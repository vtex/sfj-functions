import { BaseProvider } from './BaseProvider'
import AWS, { AWSError } from 'aws-sdk'
import jsSHA from 'jssha'

/** Implements the AWS provider for serverless functions */
class AWSProvider extends BaseProvider {
  private _accountId: Promise<string>
  private _apiGatewayId: Promise<string>
  private region: string
  private storeAccount: string
  private awsResource: string

  /**
   * Create an AWS provider
   * @param {string} storeAccount The store's account
   */
  public constructor(storeAccount: string) {
    super(storeAccount)
    this.storeAccount = storeAccount
    this.region = 'us-east-2'
    // this.awsResource = 'service-role/any'
    this.awsResource = 'lambda-ex'
    AWS.config.update({ region: this.region })
  }

  /**
   * Retrieves the AWS Account ID based on caller's identity
   * @returns {Promise<string>} The account id
   */
  get accountId(): Promise<string> {
    if (this._accountId === undefined)
      this._accountId = ((new AWS.STS()).getCallerIdentity().promise()).then(x => x.Account)

    return this._accountId
  }

  /** Creates an API Gateway V2 for the store */
  private async createApiGateway() {
    const apiGateway = new AWS.ApiGatewayV2()

    const gateway = await apiGateway.createApi({
      Name: `sfj-${this.storeAccount}`,
      ProtocolType: "HTTP",
    }).promise()

    return gateway.ApiId
  }

  /**
   * Retrieves from S3 the API Gateway ID for the store, creating it if needed.
   * @returns {Promise<string>} The API Gateway ID
   * @throws {Promise<AWSError>}
   */
  public get apiGatewayId(): Promise<string | AWSError> {
    if (this._apiGatewayId !== undefined) {
      this._apiGatewayId
    }

    return (async () => {
      const s3 = new AWS.S3()

      return await s3.getObject({
        Bucket: 'sfj-functions',
        Key: this.storeAccount,
      }).promise()
        .then(obj => JSON.parse(obj.Body?.toString()).apiGateway)
        .catch(async (error) => {
          if (error.statusCode === 404) {
            const apiGateway = await this.createApiGateway()

            await s3.putObject({
              Bucket: 'sfj-functions',
              Key: this.storeAccount,
              Body: JSON.stringify({ apiGateway }),
            }).promise()

            return apiGateway
          }
        })
    })()
  }

  /**
   * Hashes the function code
   * @param {Buffer} file
   */
  private functionHash(file: Buffer) {
    const shaObj = new jsSHA('SHA-224', 'BYTES');
    shaObj.update(file.toString())
    return shaObj.getHash('HEX')
  }

  /** List functions deployed to this store */
  public async listFunctions() {
    const lambda = new AWS.Lambda()
    const functions = await lambda.listFunctions().promise()
    const functionsObj: Record<string, { url: string }> = {}

    functions?.Functions?.forEach((item) => {
      if (item.FunctionName && item.Handler) {
        if (item.FunctionName.startsWith('sfj-'))
          functionsObj[item.FunctionName.substring(4)] = { ...item, url: item.Handler }
      }
    })

    return functionsObj
  }

  /** Updates the function code */
  private async updateFunction(functionHash: string, content: Buffer) {
    const params = {
      FunctionName: `sfj-${functionHash}`,
      ZipFile: content,
      Publish: true,
    }

    const lambda = new AWS.Lambda()

    await lambda.updateFunctionCode(params).promise()
  }

  /**
   * Create a new Lambda function and setup a route on API Gateway
   * @param {string} functionName Name used on the API Gateway URL route
   * @param {string} functionHash Code's hash, unique per Lambda function
   * @param {Buffer} content Function code
   */
  private async createFunction(functionName: string, functionHash: string, content: Buffer) {
    const lambda = new AWS.Lambda()

    const params = {
      Code: {
        ZipFile: content,
      },
      Description: `StoreFramework Function - ${functionName}`,
      FunctionName: `sfj-${functionHash}`,
      Handler: 'index.handler',
      Publish: true,
      Role: `arn:aws:iam::${await this.accountId}:role/${this.awsResource}`,
      Runtime: 'nodejs12.x',
      Timeout: 15,
      TracingConfig: {
        Mode: 'Active',
      },
      Tags: {
        Product: 'storeframework-function',
        Team: 'StoreFramework',
      }
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

  /**
   * Creates or update a function, based on its contents hash
   * @param {string} functionName Name used on the API Gateway URL route
   * @param {Buffer} content Function code
   */
  public async createOrUpdateFunction(functionName: string, content: Buffer) {
    const existingFunctions = await this.listFunctions()

    const hash = this.functionHash(content)

    if (hash in existingFunctions) {
      console.log(`Updating function ${functionName}`)
      console.log('Function hash', hash)
      await this.updateFunction(hash, content)
      console.log(`Function ${functionName} updated`)
    } else {
      console.log(`Creating function ${functionName}... `)
      const url = await this.createFunction(functionName, hash, content)
      console.log('Function hash', hash)
      console.log(`Function ${functionName} created`)
      return url
    }
  }

  /**
   * Creates or update multiple functions more efficiently
   * @param {string} functionName Name used on the API Gateway URL route
   * @param {Buffer} content Function code
   */
  public async createOrUpdateFunctionList(functions: Record<string, Buffer>) {
    const existingFunctions = await this.listFunctions()

    const urls: Record<string, string> = {}

    await Promise.all(
      Object.entries(functions).map(async ([functionName, content]) => {
        const functionHash = this.functionHash(content)

        if (functionName in existingFunctions) {
          this.updateFunction(functionHash, content)
        }

        urls[functionName] = await this.createFunction(functionName, functionHash, content)
      })
    )

    return urls
  }
}

export { AWSProvider }
