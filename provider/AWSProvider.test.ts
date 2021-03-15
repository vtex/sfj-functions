import { AWSProvider } from './AWSProvider'

test('bucket', async () => {
  const provider = new AWSProvider('storecomponents')
  console.log(await provider.apiGatewayId)
})
