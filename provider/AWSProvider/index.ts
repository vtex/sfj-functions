import AWS from 'aws-sdk'

import { BaseProvider } from '../BaseProvider'
import { AWS_REGION } from '../../constants'
import { getOrCreateLambda } from  './lambda'
import { setupApiGateway } from './apiGateway'
import { hashFunction, getFunctionURL } from './utils'

/** Implements the AWS provider for serverless functions */
class AWSProvider extends BaseProvider {
  private _accountId: Promise<string>
  private storeAccount: string

  /**
   * Create an AWS provider
   * @param {string} storeAccount The store's account
   */
  public constructor(storeAccount: string) {
    super(storeAccount)
    this.storeAccount = storeAccount
    this._accountId = new Promise(resolve => resolve('558830342743'))
    AWS.config.update({ region: AWS_REGION })
  }

  /**
   * Creates or update a function, based on its contents hash
   * @param {string} functionName Name used on the API Gateway URL route
   * @param {Buffer} content Function code
   * @returns The final URL used to invoke the function
   */
  public async getOrCreateFunction(functionName: string, content: Buffer) {
    const hash = hashFunction(content)
    console.log(`Function ${functionName} hash: ${hash}`)

    console.log('Getting or creating lambda');

    const lambdaArn = await getOrCreateLambda({
      accountId: await this.accountId,
      content: await this.zipFunction(content),
      functionName,
      hash,
    })

    console.log('Setting up api gateway');

    const { gatewayId } = await setupApiGateway({
      accountId: await this.accountId,
      functionName,
      hash,
      lambdaArn,
      storeAccount: this.storeAccount,
    })

    return getFunctionURL(gatewayId, AWS_REGION, hash)
  }

  /**
   * Retrieves the AWS Account ID based on caller's identity
   * @returns {Promise<string>}
   */
  private get accountId(): Promise<string> {
    if (this._accountId === undefined)
      this._accountId = ((new AWS.STS()).getCallerIdentity().promise()).then(x => x.Account)

    return this._accountId
  }
}

export { AWSProvider }
