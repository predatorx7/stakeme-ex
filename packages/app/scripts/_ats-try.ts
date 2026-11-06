import { mintCreatorEquityToken } from '../src/integrations/hedera-ats.ts'
const r = await mintCreatorEquityToken({ ticker: process.env.T || 'MUSH', name: 'Mushaheed Creator Share', supply: '20000', decimals: 18, holder: '0x96B380895ea976cbEc267b959A1D116C457705aF' })
console.log(JSON.stringify({ status: r.status, evm: r.evmAddress, url: (r as any).hashscanUrl }))
