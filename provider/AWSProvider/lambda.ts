import AWS from 'aws-sdk'
import { AWS_TAG_PRODUCT, AWS_TAG_TEAM, AWS_ROLE_RESOURCE } from '../../constants'
import { getLambdaRole, getLambdaPermissionSourceArn, getLambdaName } from './utils'

export interface LambdaParams {
  accountId: string
  content: Buffer
  functionName: string
  hash: string
}

/**
 * Get or create a Lambda function, adding the correct permissions
 * @param {string} name Name used on API Gateway URL route
 * @param {string} hash Code's hash, unique per Lambda function
 * @param {Buffer} content Function code
 */
export const getOrCreateLambda = async (params: LambdaParams) => {
  console.log(`Trying to create function ${params.functionName}...`)
  let functionArn: string

  try {
    const functionResp = await createLambda(params)
    console.log(`Function ${params.functionName} created`)
    functionArn = functionResp.FunctionArn
  }
  catch (error) {
    if (error.code !== 'ResourceConflictException') {
      throw error;
    }
    console.log(`Function ${params.functionName} already existed`)

    const lambda = new AWS.Lambda()
    const functionResp = await lambda.getFunction({
      FunctionName: getLambdaName(params.hash),
    }).promise()

    functionArn = functionResp.Configuration.FunctionArn
  }

  return functionArn
}

/**
 * Create a new Lambda function
 * @param {string} name Name used on API Gateway URL route
 * @param {string} functionHash Code's hash, unique per Lambda function
 * @param {Buffer} content Function code
 */
export const createLambda = async (params: LambdaParams) => {
  const lambda = new AWS.Lambda()

  const awsLambdaParams = {
    Code: {
      ZipFile: params.content,
    },
    Description: `SF Function - ${params.functionName}`,
    FunctionName: getLambdaName(params.hash),
    Handler: 'index.handler',
    Publish: true,
    Role: getLambdaRole(AWS_ROLE_RESOURCE),
    Runtime: 'nodejs12.x',
    Timeout: 15,
    TracingConfig: {
      Mode: 'Active',
    },
    Tags: {
      Product: AWS_TAG_PRODUCT,
      Team: AWS_TAG_TEAM,
    }
  }

  return lambda.createFunction(awsLambdaParams).promise()
}

export const addLambdaPermissions = async (hash: string, accountId: string, gatewayId: string) => {
  const lambda = new AWS.Lambda()
  return lambda
    .addPermission({
      FunctionName: getLambdaName(hash),
      StatementId: hash,
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
      SourceArn: getLambdaPermissionSourceArn(accountId, gatewayId),
    })
    .promise()
}
