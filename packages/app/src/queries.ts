/** Types generated for queries found in "packages/app/sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type chain_job_status = 'CONFIRMED' | 'FAILED' | 'QUEUED' | 'SENT' | 'SIMULATED';

export type trade_side = 'BUY' | 'SELL';

export type NumberOrString = number | string;

/** 'ResolveViewerById' parameters type */
export interface IResolveViewerByIdParams {
  id: string;
}

/** 'ResolveViewerById' return type */
export interface IResolveViewerByIdResult {
  email: string;
  id: string;
  name: string;
  wallet_address: string | null;
}

/** 'ResolveViewerById' query type */
export interface IResolveViewerByIdQuery {
  params: IResolveViewerByIdParams;
  result: IResolveViewerByIdResult;
}

const resolveViewerByIdIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":242,"b":245}]}],"statement":"-- Loads the signed-in viewer for `resolveViewer` (auth.ts): the Better Auth\n-- user id resolved from the session cookie or bearer token.\nSELECT\n\tu.id,\n\tu.email,\n\tu.name,\n\tsmx.user_wallet(u.id) AS wallet_address\nFROM smx.users u\nWHERE u.id = :id!"};

/**
 * Query generated from SQL:
 * ```
 * -- Loads the signed-in viewer for `resolveViewer` (auth.ts): the Better Auth
 * -- user id resolved from the session cookie or bearer token.
 * SELECT
 * 	u.id,
 * 	u.email,
 * 	u.name,
 * 	smx.user_wallet(u.id) AS wallet_address
 * FROM smx.users u
 * WHERE u.id = :id!
 * ```
 */
export const resolveViewerById = new PreparedQuery<IResolveViewerByIdParams,IResolveViewerByIdResult>(resolveViewerByIdIR);


/** 'GetExchange' parameters type */
export interface IGetExchangeParams {
  limit: number;
}

/** 'GetExchange' return type */
export interface IGetExchangeResult {
  j: unknown | null;
}

/** 'GetExchange' query type */
export interface IGetExchangeQuery {
  params: IGetExchangeParams;
  result: IGetExchangeResult;
}

const getExchangeIR: any = {"usedParamSet":{"limit":true},"params":[{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":92,"b":98}]}],"statement":"-- Trending creators and latest oracle events. Route: GetExchange.\nSELECT smx.exchange_json(:limit!::INTEGER) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- Trending creators and latest oracle events. Route: GetExchange.
 * SELECT smx.exchange_json(:limit!::INTEGER) AS j
 * ```
 */
export const getExchange = new PreparedQuery<IGetExchangeParams,IGetExchangeResult>(getExchangeIR);


/** 'GetCreatorPage' parameters type */
export interface IGetCreatorPageParams {
  ticker: string;
  wallet?: string | null | void;
}

/** 'GetCreatorPage' return type */
export interface IGetCreatorPageResult {
  j: unknown | null;
}

/** 'GetCreatorPage' query type */
export interface IGetCreatorPageQuery {
  params: IGetCreatorPageParams;
  result: IGetCreatorPageResult;
}

const getCreatorPageIR: any = {"usedParamSet":{"ticker":true,"wallet":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":154,"b":161}]},{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":164,"b":170}]}],"statement":"-- Token page document; no row when the ticker is unknown. `wallet` is the\n-- viewer's wallet (optional). Route: GetCreator.\nSELECT smx.creator_page_json(:ticker!, :wallet::TEXT) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- Token page document; no row when the ticker is unknown. `wallet` is the
 * -- viewer's wallet (optional). Route: GetCreator.
 * SELECT smx.creator_page_json(:ticker!, :wallet::TEXT) AS j
 * ```
 */
export const getCreatorPage = new PreparedQuery<IGetCreatorPageParams,IGetCreatorPageResult>(getCreatorPageIR);


/** 'GetCreatorHub' parameters type */
export interface IGetCreatorHubParams {
  viewer_id: string;
}

/** 'GetCreatorHub' return type */
export interface IGetCreatorHubResult {
  j: unknown | null;
}

/** 'GetCreatorHub' query type */
export interface IGetCreatorHubQuery {
  params: IGetCreatorHubParams;
  result: IGetCreatorHubResult;
}

const getCreatorHubIR: any = {"usedParamSet":{"viewer_id":true},"params":[{"name":"viewer_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":121,"b":131}]}],"statement":"-- The viewer's creator dashboard (empty object without a creator).\n-- Route: GetCreatorHub.\nSELECT smx.creator_hub_json(:viewer_id!) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- The viewer's creator dashboard (empty object without a creator).
 * -- Route: GetCreatorHub.
 * SELECT smx.creator_hub_json(:viewer_id!) AS j
 * ```
 */
export const getCreatorHub = new PreparedQuery<IGetCreatorHubParams,IGetCreatorHubResult>(getCreatorHubIR);


/** 'GetLaunchState' parameters type */
export interface IGetLaunchStateParams {
  viewer_id: string;
}

/** 'GetLaunchState' return type */
export interface IGetLaunchStateResult {
  ticker: string;
}

/** 'GetLaunchState' query type */
export interface IGetLaunchStateQuery {
  params: IGetLaunchStateParams;
  result: IGetLaunchStateResult;
}

const getLaunchStateIR: any = {"usedParamSet":{"viewer_id":true},"params":[{"name":"viewer_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":139,"b":149}]}],"statement":"-- Whether the viewer already launched, for the launch form. Route: GetLaunch.\nSELECT c.ticker\nFROM smx.creators c\nWHERE c.owner_user_id = :viewer_id!"};

/**
 * Query generated from SQL:
 * ```
 * -- Whether the viewer already launched, for the launch form. Route: GetLaunch.
 * SELECT c.ticker
 * FROM smx.creators c
 * WHERE c.owner_user_id = :viewer_id!
 * ```
 */
export const getLaunchState = new PreparedQuery<IGetLaunchStateParams,IGetLaunchStateResult>(getLaunchStateIR);


/** 'LaunchIpo' parameters type */
export interface ILaunchIpoParams {
  arkiv_entity_key?: string | null | void;
  chain_id?: number | null | void;
  display_name: string;
  headline: string;
  nullifier: string;
  owner: string;
  share_bps: number;
  stake_amount: string;
  target_raise: string;
  term_months: number;
  terms_hash?: string | null | void;
  ticker: string;
  wallet: string;
}

/** 'LaunchIpo' return type */
export interface ILaunchIpoResult {
  j: unknown | null;
}

/** 'LaunchIpo' query type */
export interface ILaunchIpoQuery {
  params: ILaunchIpoParams;
  result: ILaunchIpoResult;
}

const launchIpoIR: any = {"usedParamSet":{"owner":true,"wallet":true,"ticker":true,"display_name":true,"headline":true,"share_bps":true,"term_months":true,"target_raise":true,"stake_amount":true,"nullifier":true,"arkiv_entity_key":true,"terms_hash":true,"chain_id":true},"params":[{"name":"owner","required":true,"transform":{"type":"scalar"},"locs":[{"a":198,"b":204}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":208,"b":215}]},{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":219,"b":226}]},{"name":"display_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":230,"b":243}]},{"name":"headline","required":true,"transform":{"type":"scalar"},"locs":[{"a":247,"b":256}]},{"name":"share_bps","required":true,"transform":{"type":"scalar"},"locs":[{"a":260,"b":270}]},{"name":"term_months","required":true,"transform":{"type":"scalar"},"locs":[{"a":274,"b":286}]},{"name":"target_raise","required":true,"transform":{"type":"scalar"},"locs":[{"a":290,"b":303}]},{"name":"stake_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":307,"b":320}]},{"name":"nullifier","required":true,"transform":{"type":"scalar"},"locs":[{"a":324,"b":334}]},{"name":"arkiv_entity_key","required":false,"transform":{"type":"scalar"},"locs":[{"a":338,"b":354}]},{"name":"terms_hash","required":false,"transform":{"type":"scalar"},"locs":[{"a":358,"b":368}]},{"name":"chain_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":372,"b":380}]}],"statement":"-- Creates the L-ISA in one statement (creator, tranches, pool, tick, event,\n-- chain jobs) and returns the creator document. Route: LaunchIpo.\nSELECT smx.creator_json(c) AS j\nFROM smx.launch_ipo(\n\t:owner!,\n\t:wallet!,\n\t:ticker!,\n\t:display_name!,\n\t:headline!,\n\t:share_bps!,\n\t:term_months!,\n\t:target_raise!,\n\t:stake_amount!,\n\t:nullifier!,\n\t:arkiv_entity_key,\n\t:terms_hash,\n\t:chain_id\n) AS c"};

/**
 * Query generated from SQL:
 * ```
 * -- Creates the L-ISA in one statement (creator, tranches, pool, tick, event,
 * -- chain jobs) and returns the creator document. Route: LaunchIpo.
 * SELECT smx.creator_json(c) AS j
 * FROM smx.launch_ipo(
 * 	:owner!,
 * 	:wallet!,
 * 	:ticker!,
 * 	:display_name!,
 * 	:headline!,
 * 	:share_bps!,
 * 	:term_months!,
 * 	:target_raise!,
 * 	:stake_amount!,
 * 	:nullifier!,
 * 	:arkiv_entity_key,
 * 	:terms_hash,
 * 	:chain_id
 * ) AS c
 * ```
 */
export const launchIpo = new PreparedQuery<ILaunchIpoParams,ILaunchIpoResult>(launchIpoIR);


/** 'Invest' parameters type */
export interface IInvestParams {
  ticker: string;
  usdc_amount: NumberOrString;
  wallet: string;
}

/** 'Invest' return type */
export interface IInvestResult {
  j: unknown | null;
}

/** 'Invest' query type */
export interface IInvestQuery {
  params: IInvestParams;
  result: IInvestResult;
}

const investIR: any = {"usedParamSet":{"ticker":true,"wallet":true,"usdc_amount":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":132,"b":139}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":143,"b":150}]},{"name":"usdc_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":153,"b":165}]}],"statement":"-- Primary-market purchase. Route: Invest.\nSELECT smx.investment_json(i) AS j\nFROM smx.record_investment(\n\tsmx.creator_id_by_ticker(:ticker!), :wallet!, :usdc_amount!::NUMERIC\n) AS i"};

/**
 * Query generated from SQL:
 * ```
 * -- Primary-market purchase. Route: Invest.
 * SELECT smx.investment_json(i) AS j
 * FROM smx.record_investment(
 * 	smx.creator_id_by_ticker(:ticker!), :wallet!, :usdc_amount!::NUMERIC
 * ) AS i
 * ```
 */
export const invest = new PreparedQuery<IInvestParams,IInvestResult>(investIR);


/** 'Trade' parameters type */
export interface ITradeParams {
  amount_in: NumberOrString;
  min_out: NumberOrString;
  side: trade_side;
  ticker: string;
  wallet: string;
}

/** 'Trade' return type */
export interface ITradeResult {
  j: unknown | null;
}

/** 'Trade' query type */
export interface ITradeQuery {
  params: ITradeParams;
  result: ITradeResult;
}

const tradeIR: any = {"usedParamSet":{"ticker":true,"wallet":true,"side":true,"amount_in":true,"min_out":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":102,"b":109}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":114,"b":121}]},{"name":"side","required":true,"transform":{"type":"scalar"},"locs":[{"a":125,"b":130}]},{"name":"amount_in","required":true,"transform":{"type":"scalar"},"locs":[{"a":150,"b":160}]},{"name":"min_out","required":true,"transform":{"type":"scalar"},"locs":[{"a":173,"b":181}]}],"statement":"-- AMM swap. Route: Trade.\nSELECT smx.trade_json(t) AS j\nFROM smx.amm_swap(\n\tsmx.creator_id_by_ticker(:ticker!),\n\t:wallet!,\n\t:side!::smx.trade_side,\n\t:amount_in!::NUMERIC,\n\t:min_out!::NUMERIC\n) AS t"};

/**
 * Query generated from SQL:
 * ```
 * -- AMM swap. Route: Trade.
 * SELECT smx.trade_json(t) AS j
 * FROM smx.amm_swap(
 * 	smx.creator_id_by_ticker(:ticker!),
 * 	:wallet!,
 * 	:side!::smx.trade_side,
 * 	:amount_in!::NUMERIC,
 * 	:min_out!::NUMERIC
 * ) AS t
 * ```
 */
export const trade = new PreparedQuery<ITradeParams,ITradeResult>(tradeIR);


/** 'GetOwnedCreator' parameters type */
export interface IGetOwnedCreatorParams {
  ticker: string;
  viewer_id: string;
}

/** 'GetOwnedCreator' return type */
export interface IGetOwnedCreatorResult {
  id: string;
  ticker: string;
}

/** 'GetOwnedCreator' query type */
export interface IGetOwnedCreatorQuery {
  params: IGetOwnedCreatorParams;
  result: IGetOwnedCreatorResult;
}

const getOwnedCreatorIR: any = {"usedParamSet":{"ticker":true,"viewer_id":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":197,"b":204}]},{"name":"viewer_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":241,"b":251}]}],"statement":"-- Resolves a ticker to a creator the viewer owns (403 for someone else's,\n-- no row for an unknown ticker). Route: CreateReclaimSession.\nSELECT c.id, c.ticker\nFROM smx.creators c\nWHERE c.ticker = :ticker! AND smx.assert_creator_owner(c.id, :viewer_id!)"};

/**
 * Query generated from SQL:
 * ```
 * -- Resolves a ticker to a creator the viewer owns (403 for someone else's,
 * -- no row for an unknown ticker). Route: CreateReclaimSession.
 * SELECT c.id, c.ticker
 * FROM smx.creators c
 * WHERE c.ticker = :ticker! AND smx.assert_creator_owner(c.id, :viewer_id!)
 * ```
 */
export const getOwnedCreator = new PreparedQuery<IGetOwnedCreatorParams,IGetOwnedCreatorResult>(getOwnedCreatorIR);


/** 'SubmitIncomeProof' parameters type */
export interface ISubmitIncomeProofParams {
  amount: NumberOrString;
  creator_id: string;
  provider: string;
  raw?: unknown | null | void;
  reclaim_proof_id: string;
}

/** 'SubmitIncomeProof' return type */
export interface ISubmitIncomeProofResult {
  id: string;
  min_income: string;
  period: number;
  share_bps: number;
  terms_hash: string | null;
  ticker: string;
}

/** 'SubmitIncomeProof' query type */
export interface ISubmitIncomeProofQuery {
  params: ISubmitIncomeProofParams;
  result: ISubmitIncomeProofResult;
}

const submitIncomeProofIR: any = {"usedParamSet":{"creator_id":true,"provider":true,"reclaim_proof_id":true,"amount":true,"raw":true},"params":[{"name":"creator_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":310,"b":321}]},{"name":"provider","required":true,"transform":{"type":"scalar"},"locs":[{"a":331,"b":340}]},{"name":"reclaim_proof_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":344,"b":361}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":365,"b":372}]},{"name":"raw","required":false,"transform":{"type":"scalar"},"locs":[{"a":385,"b":388}]}],"statement":"-- Stores a verified Reclaim proof as PENDING and returns what the auditor\n-- needs. Routes: AuditMilestone, ReclaimCallback.\nSELECT\n\tp.id AS \"id!\",\n\tp.period AS \"period!\",\n\tc.ticker AS \"ticker!\",\n\tc.share_bps AS \"share_bps!\",\n\tc.min_income::TEXT AS \"min_income!\",\n\tc.terms_hash\nFROM smx.submit_income_proof(\n\t:creator_id!::UUID,\n\t:provider!,\n\t:reclaim_proof_id!,\n\t:amount!::NUMERIC,\n\t:raw::JSONB\n) AS p\nJOIN smx.creators c ON c.id = p.creator_id"};

/**
 * Query generated from SQL:
 * ```
 * -- Stores a verified Reclaim proof as PENDING and returns what the auditor
 * -- needs. Routes: AuditMilestone, ReclaimCallback.
 * SELECT
 * 	p.id AS "id!",
 * 	p.period AS "period!",
 * 	c.ticker AS "ticker!",
 * 	c.share_bps AS "share_bps!",
 * 	c.min_income::TEXT AS "min_income!",
 * 	c.terms_hash
 * FROM smx.submit_income_proof(
 * 	:creator_id!::UUID,
 * 	:provider!,
 * 	:reclaim_proof_id!,
 * 	:amount!::NUMERIC,
 * 	:raw::JSONB
 * ) AS p
 * JOIN smx.creators c ON c.id = p.creator_id
 * ```
 */
export const submitIncomeProof = new PreparedQuery<ISubmitIncomeProofParams,ISubmitIncomeProofResult>(submitIncomeProofIR);


/** 'AuditIncomeProof' parameters type */
export interface IAuditIncomeProofParams {
  audit: unknown;
  proof_id: string;
  verified_amount: NumberOrString;
}

/** 'AuditIncomeProof' return type */
export interface IAuditIncomeProofResult {
  j: unknown | null;
}

/** 'AuditIncomeProof' query type */
export interface IAuditIncomeProofQuery {
  params: IAuditIncomeProofParams;
  result: IAuditIncomeProofResult;
}

const auditIncomeProofIR: any = {"usedParamSet":{"proof_id":true,"verified_amount":true,"audit":true},"params":[{"name":"proof_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":159,"b":168}]},{"name":"verified_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":171,"b":187}]},{"name":"audit","required":true,"transform":{"type":"scalar"},"locs":[{"a":199,"b":205}]}],"statement":"-- Applies the rules engine to a pending proof. Routes: AuditMilestone,\n-- ReclaimCallback.\nSELECT smx.audit_result_json(p) AS j\nFROM smx.audit_income_proof(\n\t:proof_id!, :verified_amount!::NUMERIC, :audit!::JSONB\n) AS p"};

/**
 * Query generated from SQL:
 * ```
 * -- Applies the rules engine to a pending proof. Routes: AuditMilestone,
 * -- ReclaimCallback.
 * SELECT smx.audit_result_json(p) AS j
 * FROM smx.audit_income_proof(
 * 	:proof_id!, :verified_amount!::NUMERIC, :audit!::JSONB
 * ) AS p
 * ```
 */
export const auditIncomeProof = new PreparedQuery<IAuditIncomeProofParams,IAuditIncomeProofResult>(auditIncomeProofIR);


/** 'TriggerDefault' parameters type */
export interface ITriggerDefaultParams {
  ticker: string;
}

/** 'TriggerDefault' return type */
export interface ITriggerDefaultResult {
  j: unknown | null;
}

/** 'TriggerDefault' query type */
export interface ITriggerDefaultQuery {
  params: ITriggerDefaultParams;
  result: ITriggerDefaultResult;
}

const triggerDefaultIR: any = {"usedParamSet":{"ticker":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":122,"b":129}]}],"statement":"-- Demo: fast-forward and liquidate. Route: TriggerDefault.\nSELECT smx.creator_json(c) AS j\nFROM smx.demo_trigger_default(:ticker!) AS c"};

/**
 * Query generated from SQL:
 * ```
 * -- Demo: fast-forward and liquidate. Route: TriggerDefault.
 * SELECT smx.creator_json(c) AS j
 * FROM smx.demo_trigger_default(:ticker!) AS c
 * ```
 */
export const triggerDefault = new PreparedQuery<ITriggerDefaultParams,ITriggerDefaultResult>(triggerDefaultIR);


/** 'PayDividend' parameters type */
export interface IPayDividendParams {
  dividend_id: string;
  viewer_id: string;
}

/** 'PayDividend' return type */
export interface IPayDividendResult {
  j: unknown | null;
}

/** 'PayDividend' query type */
export interface IPayDividendQuery {
  params: IPayDividendParams;
  result: IPayDividendResult;
}

const payDividendIR: any = {"usedParamSet":{"dividend_id":true,"viewer_id":true},"params":[{"name":"dividend_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":107,"b":119}]},{"name":"viewer_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":128,"b":138}]}],"statement":"-- Creator pays a due dividend. Route: PayDividend.\nSELECT smx.dividend_json(d) AS j\nFROM smx.pay_dividend(:dividend_id!, NULL, :viewer_id!) AS d"};

/**
 * Query generated from SQL:
 * ```
 * -- Creator pays a due dividend. Route: PayDividend.
 * SELECT smx.dividend_json(d) AS j
 * FROM smx.pay_dividend(:dividend_id!, NULL, :viewer_id!) AS d
 * ```
 */
export const payDividend = new PreparedQuery<IPayDividendParams,IPayDividendResult>(payDividendIR);


/** 'GetCreatorIdByTicker' parameters type */
export interface IGetCreatorIdByTickerParams {
  ticker: string;
}

/** 'GetCreatorIdByTicker' return type */
export interface IGetCreatorIdByTickerResult {
  id: string;
}

/** 'GetCreatorIdByTicker' query type */
export interface IGetCreatorIdByTickerQuery {
  params: IGetCreatorIdByTickerParams;
  result: IGetCreatorIdByTickerResult;
}

const getCreatorIdByTickerIR: any = {"usedParamSet":{"ticker":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":120,"b":127}]}],"statement":"-- Resolves a ticker for the event stream filter. Route: StreamEvents.\nSELECT c.id FROM smx.creators c WHERE c.ticker = :ticker!"};

/**
 * Query generated from SQL:
 * ```
 * -- Resolves a ticker for the event stream filter. Route: StreamEvents.
 * SELECT c.id FROM smx.creators c WHERE c.ticker = :ticker!
 * ```
 */
export const getCreatorIdByTicker = new PreparedQuery<IGetCreatorIdByTickerParams,IGetCreatorIdByTickerResult>(getCreatorIdByTickerIR);


/** 'ListQueuedChainJobs' parameters type */
export interface IListQueuedChainJobsParams {
  batch: number;
}

/** 'ListQueuedChainJobs' return type */
export interface IListQueuedChainJobsResult {
  args: unknown;
  contract_address: string | null;
  fn: string;
  id: string;
}

/** 'ListQueuedChainJobs' query type */
export interface IListQueuedChainJobsQuery {
  params: IListQueuedChainJobsParams;
  result: IListQueuedChainJobsResult;
}

const listQueuedChainJobsIR: any = {"usedParamSet":{"batch":true},"params":[{"name":"batch","required":true,"transform":{"type":"scalar"},"locs":[{"a":258,"b":264}]}],"statement":"-- Oldest queued onchain calls with the contract they target. Worker.\nSELECT\n\tj.id,\n\tj.fn,\n\tj.args,\n\tc.contract_address::TEXT AS contract_address\nFROM smx.chain_jobs j\nJOIN smx.creators c ON c.id = j.creator_id\nWHERE j.status = 'QUEUED'\nORDER BY j.seq\nLIMIT :batch!::INTEGER"};

/**
 * Query generated from SQL:
 * ```
 * -- Oldest queued onchain calls with the contract they target. Worker.
 * SELECT
 * 	j.id,
 * 	j.fn,
 * 	j.args,
 * 	c.contract_address::TEXT AS contract_address
 * FROM smx.chain_jobs j
 * JOIN smx.creators c ON c.id = j.creator_id
 * WHERE j.status = 'QUEUED'
 * ORDER BY j.seq
 * LIMIT :batch!::INTEGER
 * ```
 */
export const listQueuedChainJobs = new PreparedQuery<IListQueuedChainJobsParams,IListQueuedChainJobsResult>(listQueuedChainJobsIR);


/** 'ClaimChainJob' parameters type */
export interface IClaimChainJobParams {
  id: string;
}

/** 'ClaimChainJob' return type */
export interface IClaimChainJobResult {
  args: unknown;
  contract_address: string | null;
  fn: string;
  id: string;
}

/** 'ClaimChainJob' query type */
export interface IClaimChainJobQuery {
  params: IClaimChainJobParams;
  result: IClaimChainJobResult;
}

const claimChainJobIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":152,"b":155}]}],"statement":"-- Moves a QUEUED job to SENT; no row when another worker took it. Worker.\nUPDATE smx.chain_jobs j\nSET status = 'SENT'\nFROM smx.creators c\nWHERE j.id = :id! AND j.status = 'QUEUED' AND c.id = j.creator_id\nRETURNING j.id, j.fn, j.args, c.contract_address::TEXT AS contract_address"};

/**
 * Query generated from SQL:
 * ```
 * -- Moves a QUEUED job to SENT; no row when another worker took it. Worker.
 * UPDATE smx.chain_jobs j
 * SET status = 'SENT'
 * FROM smx.creators c
 * WHERE j.id = :id! AND j.status = 'QUEUED' AND c.id = j.creator_id
 * RETURNING j.id, j.fn, j.args, c.contract_address::TEXT AS contract_address
 * ```
 */
export const claimChainJob = new PreparedQuery<IClaimChainJobParams,IClaimChainJobResult>(claimChainJobIR);


/** 'CompleteChainJob' parameters type */
export interface ICompleteChainJobParams {
  error?: string | null | void;
  id: string;
  isa?: string | null | void;
  status: chain_job_status;
  token?: string | null | void;
  tx_hash?: string | null | void;
}

/** 'CompleteChainJob' return type */
export interface ICompleteChainJobResult {
  id: string | null;
  status: chain_job_status | null;
}

/** 'CompleteChainJob' query type */
export interface ICompleteChainJobQuery {
  params: ICompleteChainJobParams;
  result: ICompleteChainJobResult;
}

const completeChainJobIR: any = {"usedParamSet":{"id":true,"status":true,"tx_hash":true,"error":true,"isa":true,"token":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":125,"b":128}]},{"name":"status","required":true,"transform":{"type":"scalar"},"locs":[{"a":131,"b":138}]},{"name":"tx_hash","required":false,"transform":{"type":"scalar"},"locs":[{"a":163,"b":170}]},{"name":"error","required":false,"transform":{"type":"scalar"},"locs":[{"a":173,"b":178}]},{"name":"isa","required":false,"transform":{"type":"scalar"},"locs":[{"a":181,"b":184}]},{"name":"token","required":false,"transform":{"type":"scalar"},"locs":[{"a":187,"b":192}]}],"statement":"-- Settles a sent job and copies the result onto the domain row. Worker.\nSELECT j.id, j.status\nFROM smx.complete_chain_job(\n\t:id!, :status!::smx.chain_job_status, :tx_hash, :error, :isa, :token\n) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- Settles a sent job and copies the result onto the domain row. Worker.
 * SELECT j.id, j.status
 * FROM smx.complete_chain_job(
 * 	:id!, :status!::smx.chain_job_status, :tx_hash, :error, :isa, :token
 * ) AS j
 * ```
 */
export const completeChainJob = new PreparedQuery<ICompleteChainJobParams,ICompleteChainJobResult>(completeChainJobIR);


/** 'SaveDividendReceipts' parameters type */
export interface ISaveDividendReceiptsParams {
  dividend_id: string;
  receipts: unknown;
}

/** 'SaveDividendReceipts' return type */
export interface ISaveDividendReceiptsResult {
  id: string;
}

/** 'SaveDividendReceipts' query type */
export interface ISaveDividendReceiptsQuery {
  params: ISaveDividendReceiptsParams;
  result: ISaveDividendReceiptsResult;
}

const saveDividendReceiptsIR: any = {"usedParamSet":{"receipts":true,"dividend_id":true},"params":[{"name":"receipts","required":true,"transform":{"type":"scalar"},"locs":[{"a":107,"b":116}]},{"name":"dividend_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":136,"b":148}]}],"statement":"-- Stores the per-holder stream receipts of a dividend. Worker.\nUPDATE smx.dividends\nSET stream_receipts = :receipts!::JSONB\nWHERE id = :dividend_id!\nRETURNING id"};

/**
 * Query generated from SQL:
 * ```
 * -- Stores the per-holder stream receipts of a dividend. Worker.
 * UPDATE smx.dividends
 * SET stream_receipts = :receipts!::JSONB
 * WHERE id = :dividend_id!
 * RETURNING id
 * ```
 */
export const saveDividendReceipts = new PreparedQuery<ISaveDividendReceiptsParams,ISaveDividendReceiptsResult>(saveDividendReceiptsIR);


/** 'SweepDeadlines' parameters type */
export type ISweepDeadlinesParams = void;

/** 'SweepDeadlines' return type */
export interface ISweepDeadlinesResult {
  creator_id: string | null;
  transition: string | null;
}

/** 'SweepDeadlines' query type */
export interface ISweepDeadlinesQuery {
  params: ISweepDeadlinesParams;
  result: ISweepDeadlinesResult;
}

const sweepDeadlinesIR: any = {"usedParamSet":{},"params":[],"statement":"-- LIVE to GRACE to DEFAULTED transitions. Worker (periodic).\nSELECT s.creator_id, s.transition FROM smx.sweep_deadlines(now()) AS s"};

/**
 * Query generated from SQL:
 * ```
 * -- LIVE to GRACE to DEFAULTED transitions. Worker (periodic).
 * SELECT s.creator_id, s.transition FROM smx.sweep_deadlines(now()) AS s
 * ```
 */
export const sweepDeadlines = new PreparedQuery<ISweepDeadlinesParams,ISweepDeadlinesResult>(sweepDeadlinesIR);


/** 'GetContractForCreator' parameters type */
export interface IGetContractForCreatorParams {
  creator_id: string;
}

/** 'GetContractForCreator' return type */
export interface IGetContractForCreatorResult {
  contract_address: string | null;
}

/** 'GetContractForCreator' query type */
export interface IGetContractForCreatorQuery {
  params: IGetContractForCreatorParams;
  result: IGetContractForCreatorResult;
}

const getContractForCreatorIR: any = {"usedParamSet":{"creator_id":true},"params":[{"name":"creator_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":151,"b":162}]}],"statement":"-- Contract address of a creator, for dividend streaming. Worker.\nSELECT c.contract_address::TEXT AS contract_address\nFROM smx.creators c\nWHERE c.id = :creator_id!"};

/**
 * Query generated from SQL:
 * ```
 * -- Contract address of a creator, for dividend streaming. Worker.
 * SELECT c.contract_address::TEXT AS contract_address
 * FROM smx.creators c
 * WHERE c.id = :creator_id!
 * ```
 */
export const getContractForCreator = new PreparedQuery<IGetContractForCreatorParams,IGetContractForCreatorResult>(getContractForCreatorIR);


/** 'SeedUpsertUser' parameters type */
export interface ISeedUpsertUserParams {
  email: string;
  name: string;
  wallet: string;
}

/** 'SeedUpsertUser' return type */
export interface ISeedUpsertUserResult {
  id: string;
}

/** 'SeedUpsertUser' query type */
export interface ISeedUpsertUserQuery {
  params: ISeedUpsertUserParams;
  result: ISeedUpsertUserResult;
}

const seedUpsertUserIR: any = {"usedParamSet":{"email":true,"name":true,"wallet":true},"params":[{"name":"email","required":true,"transform":{"type":"scalar"},"locs":[{"a":143,"b":149}]},{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":152,"b":157}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":334,"b":341}]}],"statement":"-- Demo seed only: a user with a primary wallet, idempotent by email.\nWITH u AS (\n\tINSERT INTO smx.users(email, name, email_verified)\n\tVALUES (:email!, :name!, TRUE)\n\tON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name\n\tRETURNING id\n),\nw AS (\n\tINSERT INTO smx.wallet_addresses(user_id, address, chain_id, is_primary)\n\tSELECT u.id, :wallet!, 296, TRUE FROM u\n\tON CONFLICT (address, chain_id) DO NOTHING\n)\nSELECT u.id FROM u"};

/**
 * Query generated from SQL:
 * ```
 * -- Demo seed only: a user with a primary wallet, idempotent by email.
 * WITH u AS (
 * 	INSERT INTO smx.users(email, name, email_verified)
 * 	VALUES (:email!, :name!, TRUE)
 * 	ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
 * 	RETURNING id
 * ),
 * w AS (
 * 	INSERT INTO smx.wallet_addresses(user_id, address, chain_id, is_primary)
 * 	SELECT u.id, :wallet!, 296, TRUE FROM u
 * 	ON CONFLICT (address, chain_id) DO NOTHING
 * )
 * SELECT u.id FROM u
 * ```
 */
export const seedUpsertUser = new PreparedQuery<ISeedUpsertUserParams,ISeedUpsertUserResult>(seedUpsertUserIR);


/** 'SeedSpreadHistory' parameters type */
export interface ISeedSpreadHistoryParams {
  days: number;
  ticker: string;
}

/** 'SeedSpreadHistory' return type */
export interface ISeedSpreadHistoryResult {
  demo_spread_history: undefined | null;
}

/** 'SeedSpreadHistory' query type */
export interface ISeedSpreadHistoryQuery {
  params: ISeedSpreadHistoryParams;
  result: ISeedSpreadHistoryResult;
}

const seedSpreadHistoryIR: any = {"usedParamSet":{"ticker":true,"days":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":127,"b":134}]},{"name":"days","required":true,"transform":{"type":"scalar"},"locs":[{"a":161,"b":166}]}],"statement":"-- Demo seed only: spreads a creator's history over the last N days.\nSELECT smx.demo_spread_history(\n\tsmx.creator_id_by_ticker(:ticker!),\n\tmake_interval(days => :days!::INTEGER)\n)"};

/**
 * Query generated from SQL:
 * ```
 * -- Demo seed only: spreads a creator's history over the last N days.
 * SELECT smx.demo_spread_history(
 * 	smx.creator_id_by_ticker(:ticker!),
 * 	make_interval(days => :days!::INTEGER)
 * )
 * ```
 */
export const seedSpreadHistory = new PreparedQuery<ISeedSpreadHistoryParams,ISeedSpreadHistoryResult>(seedSpreadHistoryIR);


/** 'SeedSetOverdue' parameters type */
export interface ISeedSetOverdueParams {
  hours: number;
  ticker: string;
}

/** 'SeedSetOverdue' return type */
export interface ISeedSetOverdueResult {
  id: string;
}

/** 'SeedSetOverdue' query type */
export interface ISeedSetOverdueQuery {
  params: ISeedSetOverdueParams;
  result: ISeedSetOverdueResult;
}

const seedSetOverdueIR: any = {"usedParamSet":{"hours":true,"ticker":true},"params":[{"name":"hours","required":true,"transform":{"type":"scalar"},"locs":[{"a":144,"b":150}]},{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":177,"b":184}]}],"statement":"-- Demo seed only: puts a LIVE creator's proof deadline in the past.\nUPDATE smx.creators\nSET next_proof_due_at = now() - make_interval(hours => :hours!::INTEGER)\nWHERE ticker = :ticker!\nRETURNING id"};

/**
 * Query generated from SQL:
 * ```
 * -- Demo seed only: puts a LIVE creator's proof deadline in the past.
 * UPDATE smx.creators
 * SET next_proof_due_at = now() - make_interval(hours => :hours!::INTEGER)
 * WHERE ticker = :ticker!
 * RETURNING id
 * ```
 */
export const seedSetOverdue = new PreparedQuery<ISeedSetOverdueParams,ISeedSetOverdueResult>(seedSetOverdueIR);


/** 'CheckLaunchable' parameters type */
export interface ICheckLaunchableParams {
  nullifier: string;
}

/** 'CheckLaunchable' return type */
export interface ICheckLaunchableResult {
  ok: boolean | null;
}

/** 'CheckLaunchable' query type */
export interface ICheckLaunchableQuery {
  params: ICheckLaunchableParams;
  result: ICheckLaunchableResult;
}

const checkLaunchableIR: any = {"usedParamSet":{"nullifier":true},"params":[{"name":"nullifier","required":true,"transform":{"type":"scalar"},"locs":[{"a":136,"b":146}]}],"statement":"-- Fails fast (403 banned, 409 used) before the route spends an Arkiv write.\n-- Route: LaunchIpo.\nSELECT smx.assert_nullifier_available(:nullifier!) AS ok"};

/**
 * Query generated from SQL:
 * ```
 * -- Fails fast (403 banned, 409 used) before the route spends an Arkiv write.
 * -- Route: LaunchIpo.
 * SELECT smx.assert_nullifier_available(:nullifier!) AS ok
 * ```
 */
export const checkLaunchable = new PreparedQuery<ICheckLaunchableParams,ICheckLaunchableResult>(checkLaunchableIR);


