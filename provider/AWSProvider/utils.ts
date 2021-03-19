import jsSHA from 'jssha'
import { AWS_ROLE_RESOURCE, AWS_REGION } from '../../constants'

export const getLambdaRole = (accountId: string) => `arn:aws:iam::${accountId}:role/${AWS_ROLE_RESOURCE}`

export const hashFunction = (file: Buffer) => {
  const shaObj = new jsSHA('SHA-224', 'BYTES');
  shaObj.update(file.toString())
  return shaObj.getHash('HEX')
}

export const getLambdaName = (hash: string): string => `sfj-${hash}`

export const getLambdaPermissionSourceArn = (accountId: string, gatewayId: string) =>
  `arn:aws:execute-api:${AWS_REGION}:${accountId}:${gatewayId}/*/*/*`

export const getFunctionURL = (integrationId: string, region: string, functionName: string) =>
  `https://${integrationId}.execute-api.${region}.amazonaws.com/${functionName}`
