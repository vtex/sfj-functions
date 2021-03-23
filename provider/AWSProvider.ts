import { BaseProvider } from './BaseProvider'
import AWS from 'aws-sdk'
import jsSHA from 'jssha'

/** Implements the AWS provider for serverless functions */
class AWSProvider extends BaseProvider {
  private _accountId: Promise<string>
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
    this.awsResource = 'lambda-ex'
    AWS.config.update({ region: this.region })
  }

  /**
   * Creates or update a function, based on its contents hash
   * @param {string} functionName Name used on the API Gateway URL route
   * @param {Buffer} content Function code
   */
  public async getOrCreateFunction(functionName: string, content: Buffer) {
    const hash = this.functionHash(content)
    console.log(`Function ${functionName} hash: ${hash}`)

    const lambdaArn = await this.getOrCreateLambda(functionName, hash, content)
    const integrationId = await this.getOrCreateIntegration(functionName, lambdaArn)

    return `https://${integrationId}.execute-api.${this.region}.amazonaws.com/${functionName}`
  }

  /**
   * Retrieves from S3 the API Gateway ID for the store, creating it if needed.
   * @returns {Promise<string>} The API Gateway ID
   */
  public async getOrCreateApiGateway(): Promise<string> {
    if (this._apiGatewayId !== undefined) {
      return this._apiGatewayId
    }

    const s3 = new AWS.S3()

    try {
      const store = await s3.getObject({
        Bucket: 'sfj-functions',
        Key: this.storeAccount,
      }).promise()

      return JSON.parse(store.Body?.toString()).apiGateway
    }
    catch (error) {
        if (error.statusCode !== 404) {
          throw error
        }
        const apiGateway = await this.createApiGateway()

        await s3.putObject({
          Bucket: 'sfj-functions',
          Key: this.storeAccount,
          Body: JSON.stringify({ apiGateway }),
        }).promise()

        return apiGateway
    }
  }

  /**
   * Retrieves the AWS Account ID based on caller's identity
   * @returns {Promise<string>} The account id
   */
  private get accountId(): Promise<string> {
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

    console.log(gateway.ApiId)

    return gateway.ApiId
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

  private getFunctionName(hash: string): string {
    return `sfj-${hash}`
  }

  /**
   * Create a new Lambda function and setup a route on API Gateway
   * @param {string} name Name used on the API Gateway URL route
   * @param {string} functionHash Code's hash, unique per Lambda function
   * @param {Buffer} content Function code
   */
  private async createFunction(name: string, hash: string, content: Buffer) {
    const lambda = new AWS.Lambda()

    const params = {
      Code: {
        ZipFile: content,
      },
      Description: `StoreFramework Function - ${name}`,
      FunctionName: this.getFunctionName(hash),
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

    return lambda.createFunction(params).promise()
  }

  private async getOrCreateLambda(name: string, hash: string, content: Buffer) {
    console.log(`Trying to create function ${name}...`)
    let functionArn: string

    try {
      const functionResp = await this.createFunction(name, hash, content)
      console.log(`Function ${name} created`)
      functionArn = functionResp.FunctionArn
    }
    catch (error) {
      if (error.code !== 'ResourceConflictException') {
        throw error;
      }
      console.log(`Function ${name} already existed`)

      const lambda = new AWS.Lambda()
      const functionResp = await lambda.getFunction({
        FunctionName: this.getFunctionName(hash),
      }).promise()

      functionArn = functionResp.Configuration.FunctionArn
    }

    return functionArn
  }

  private async getOrCreateIntegration(functionName: string, lambdaArn: string) {
    const gatewayId = await this.getOrCreateApiGateway()

    const apiGateway = new AWS.ApiGatewayV2()
    const integrations = await apiGateway.getIntegrations({
      ApiId: gatewayId,
    }).promise()

    const oldIntegration = integrations.Items.filter(integration => integration.IntegrationUri === lambdaArn)

    if (oldIntegration.length > 0) {
      console.log('Integration for API exists', oldIntegration[0].IntegrationId)
      return oldIntegration[0].IntegrationId
    }

    console.log('Adding Integration for API')
    const newIntegration = await apiGateway.createIntegration({
      ApiId: gatewayId,
      IntegrationType: 'AWS_PROXY',
      IntegrationUri: lambdaArn,
      PayloadFormatVersion: '2.0',
    }).promise()
    console.log(newIntegration)

    await this.addRouteToApi(functionName, newIntegration.IntegrationId)

    await this.addLambdaPermissions(lambdaArn, newIntegration.IntegrationId)

    return newIntegration.IntegrationId
  }

  private async addRouteToApi(name: string, integrationId: string) {
    const gatewayId = await this.getOrCreateApiGateway()

    const apiGateway = new AWS.ApiGatewayV2()

    console.log('Adding route to API')
    const route = await apiGateway.createRoute({
      ApiId: gatewayId,
      RouteKey: `ANY /${name}`,
      Target: `integrations/${integrationId}`,
    }).promise()
    console.log(route)
  }

  private async addLambdaPermissions(lambdaArn: string, gatewayId: string) {
    const lambda = new AWS.Lambda()
    return lambda
      .addPermission({
        FunctionName: lambdaArn,
        StatementId: `${lambdaArn}`,
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: `arn:aws:execute-api:${this.region}:${await this.accountId}:${gatewayId}/*/*/*`,
      })
      .promise()
  }
}

export { AWSProvider }
