import { AWSProvider } from './AWSProvider'
import fs from 'fs'

const FILE = '/Users/rodrigoorem/Documents/vtex/storecomponents.store/dist/hello/hello.zip'

describe('AWS Provider', () => {
  test('use S3 to manage one api gateway per store', async () => {
    const t1 = await (new AWSProvider('storecomponents')).getOrCreateApiGateway()
    const t2 = await (new AWSProvider('storecomponents2')).getOrCreateApiGateway()
    const t3 = await (new AWSProvider('storecomponents')).getOrCreateApiGateway()

    expect(t1).toEqual(t3)
    expect(t1).not.toEqual(t2)
  })

  test('create a working function', async () => {
    const provider = new AWSProvider('storecomponents')
    const api = await provider.getOrCreateApiGateway()

    const lambda = await provider.createOrUpdateFunction('hello', fs.readFileSync(FILE))
    console.log(lambda);
  })
})
