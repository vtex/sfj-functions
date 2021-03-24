import AWS from 'aws-sdk'
import { addLambdaPermissions } from './lambda'

export interface ApiGatewaySetupParams {
  accountId: string
  functionName: string
  hash: string
  lambdaArn: string
  storeAccount: string
}

/**
 * Get or create API Gateway V2 Integration and setup Integration for
 * Lambda provided, creating a route.
 * @param {string} functionName
 * @param {string} lambdaArn
 * @param {string} storeAccount
 */
export const setupApiGateway = async (params: ApiGatewaySetupParams) => {
  const gatewayId = await getOrCreateApiGateway(params.storeAccount)

  const apiGateway = new AWS.ApiGatewayV2()
  const integrations = await apiGateway.getIntegrations({
    ApiId: gatewayId,
  }).promise()

  const oldIntegration = integrations.Items.filter(integration => integration.IntegrationUri === params.lambdaArn)

  if (oldIntegration.length > 0) {
    console.log('Integration for API exists', oldIntegration[0].IntegrationId)
    return {
      gatewayId,
      integrationId: oldIntegration[0].IntegrationId
    }
  }

  console.log('creating integration');
  const newIntegration = await createIntegration(gatewayId, params.lambdaArn)
  console.log('creating route');

  await addRouteToApi(params.hash, gatewayId, newIntegration.IntegrationId)

  await createStage(gatewayId)

  console.log('adding permissions');
  addLambdaPermissions(params.hash, params.accountId, gatewayId)

  return {
    gatewayId,
    integrationId: newIntegration.IntegrationId,
  }
}

/**
 * Retrieves from S3 the API Gateway ID for the store, creating it if needed.
 * @returns {Promise<string>} The API Gateway ID
 */
const getOrCreateApiGateway = async (storeAccount: string): Promise<string> => {
  const s3 = new AWS.S3()

  try {
    const store = await s3.getObject({
      Bucket: 'sfj-functions',
      Key: storeAccount,
    }).promise()

    return JSON.parse(store.Body?.toString()).apiGateway
  }
  catch (error) {
      if (error.statusCode !== 404) {
        throw error
      }
      const apiGateway = await createApiGateway(storeAccount)

      await s3.putObject({
        Bucket: 'sfj-functions',
        Key: storeAccount,
        Body: JSON.stringify({ apiGateway }),
      }).promise()

      return apiGateway
  }
}

export const addRouteToApi = async (path: string, gatewayId: string, integrationId: string) => {
  const apiGateway = new AWS.ApiGatewayV2()

  console.log('Adding route to API')
  const route = await apiGateway.createRoute({
    ApiId: gatewayId,
    RouteKey: `ANY /${path}`,
    Target: `integrations/${integrationId}`,
  }).promise()
  console.log(route)
}

/** Creates an API Gateway V2 for the store */
const createApiGateway = async (storeAccount: string) => {
  const apiGateway = new AWS.ApiGatewayV2()

  const gateway = await apiGateway.createApi({
    Name: `sfj-${storeAccount}`,
    ProtocolType: "HTTP",
  }).promise()

  console.log(gateway.ApiId)

  return gateway.ApiId
}

const createIntegration = (gatewayId: string, lambdaArn: string) => {
  const apiGateway = new AWS.ApiGatewayV2()

  return apiGateway.createIntegration({
    ApiId: gatewayId,
    IntegrationType: 'AWS_PROXY',
    IntegrationUri: lambdaArn,
    PayloadFormatVersion: '2.0',
  }).promise()
}

const createStage = (gatewayId: string) => {
  const apiGateway = new AWS.ApiGatewayV2()

  return apiGateway.createStage({
    ApiId: gatewayId,
    StageName: '$default',
    AutoDeploy: true,
  }).promise()
}
