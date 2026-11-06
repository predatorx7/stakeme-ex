/** Types generated for queries found in "packages/app/sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type chain_job_status = 'CONFIRMED' | 'FAILED' | 'QUEUED' | 'SENT' | 'SIMULATED';

export type creator_status = 'COMPLETED' | 'DEFAULTED' | 'DRAFT' | 'GRACE' | 'LIVE';

export type proof_cadence = 'MONTHLY' | 'QUARTERLY';

export type reclaim_session_status = 'CANCELLED' | 'ERROR' | 'EXPIRED' | 'PENDING' | 'REJECTED' | 'SUCCESS';

export type storage_upload_kind = 'AUDIT_LOG' | 'LISA_TERMS';

export type storage_upload_status = 'FAILED' | 'QUEUED' | 'SKIPPED' | 'UPLOADED';

export type trade_side = 'BUY' | 'SELL';

export type NumberOrString = number | string;

export type numberArray = (number)[];

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


/** 'ListCreators' parameters type */
export interface IListCreatorsParams {
  after_id?: string | null | void;
  after_key?: string | null | void;
  limit: number;
  q?: string | null | void;
  sort: string;
  status?: string | null | void;
}

/** 'ListCreators' return type */
export interface IListCreatorsResult {
  j: unknown | null;
}

/** 'ListCreators' query type */
export interface IListCreatorsQuery {
  params: IListCreatorsParams;
  result: IListCreatorsResult;
}

const listCreatorsIR: any = {"usedParamSet":{"sort":true,"status":true,"q":true,"after_key":true,"after_id":true,"limit":true},"params":[{"name":"sort","required":true,"transform":{"type":"scalar"},"locs":[{"a":158,"b":163}]},{"name":"status","required":false,"transform":{"type":"scalar"},"locs":[{"a":166,"b":172}]},{"name":"q","required":false,"transform":{"type":"scalar"},"locs":[{"a":175,"b":176}]},{"name":"after_key","required":false,"transform":{"type":"scalar"},"locs":[{"a":179,"b":188}]},{"name":"after_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":191,"b":199}]},{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":202,"b":208}]}],"statement":"-- One page of the full creators list (`next` is the keyset of the last item,\n-- null on the last page). Route: ListCreators.\nSELECT smx.creators_page_json(\n\t:sort!, :status, :q, :after_key, :after_id, :limit!::INTEGER\n) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- One page of the full creators list (`next` is the keyset of the last item,
 * -- null on the last page). Route: ListCreators.
 * SELECT smx.creators_page_json(
 * 	:sort!, :status, :q, :after_key, :after_id, :limit!::INTEGER
 * ) AS j
 * ```
 */
export const listCreators = new PreparedQuery<IListCreatorsParams,IListCreatorsResult>(listCreatorsIR);


/** 'ListActivity' parameters type */
export interface IListActivityParams {
  after_id?: string | null | void;
  after_key?: string | null | void;
  kind?: string | null | void;
  limit: number;
  ticker?: string | null | void;
}

/** 'ListActivity' return type */
export interface IListActivityResult {
  j: unknown | null;
}

/** 'ListActivity' query type */
export interface IListActivityQuery {
  params: IListActivityParams;
  result: IListActivityResult;
}

const listActivityIR: any = {"usedParamSet":{"kind":true,"ticker":true,"after_key":true,"after_id":true,"limit":true},"params":[{"name":"kind","required":false,"transform":{"type":"scalar"},"locs":[{"a":97,"b":101}]},{"name":"ticker","required":false,"transform":{"type":"scalar"},"locs":[{"a":104,"b":110}]},{"name":"after_key","required":false,"transform":{"type":"scalar"},"locs":[{"a":113,"b":122}]},{"name":"after_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":125,"b":133}]},{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":136,"b":142}]}],"statement":"-- One page of oracle events, newest first. Route: ListActivity.\nSELECT smx.activity_page_json(\n\t:kind, :ticker, :after_key, :after_id, :limit!::INTEGER\n) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- One page of oracle events, newest first. Route: ListActivity.
 * SELECT smx.activity_page_json(
 * 	:kind, :ticker, :after_key, :after_id, :limit!::INTEGER
 * ) AS j
 * ```
 */
export const listActivity = new PreparedQuery<IListActivityParams,IListActivityResult>(listActivityIR);


/** 'ListCreatorHolders' parameters type */
export interface IListCreatorHoldersParams {
  after_id?: string | null | void;
  after_key?: string | null | void;
  limit: number;
  ticker: string;
}

/** 'ListCreatorHolders' return type */
export interface IListCreatorHoldersResult {
  j: unknown | null;
}

/** 'ListCreatorHolders' query type */
export interface IListCreatorHoldersQuery {
  params: IListCreatorHoldersParams;
  result: IListCreatorHoldersResult;
}

const listCreatorHoldersIR: any = {"usedParamSet":{"ticker":true,"after_key":true,"after_id":true,"limit":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":133,"b":140}]},{"name":"after_key","required":false,"transform":{"type":"scalar"},"locs":[{"a":143,"b":152}]},{"name":"after_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":155,"b":163}]},{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":166,"b":172}]}],"statement":"-- One page of a creator's holders (404 for an unknown ticker).\n-- Route: ListCreatorHolders.\nSELECT smx.creator_holders_page_json(\n\t:ticker!, :after_key, :after_id, :limit!::INTEGER\n) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- One page of a creator's holders (404 for an unknown ticker).
 * -- Route: ListCreatorHolders.
 * SELECT smx.creator_holders_page_json(
 * 	:ticker!, :after_key, :after_id, :limit!::INTEGER
 * ) AS j
 * ```
 */
export const listCreatorHolders = new PreparedQuery<IListCreatorHoldersParams,IListCreatorHoldersResult>(listCreatorHoldersIR);


/** 'ListCreatorTrades' parameters type */
export interface IListCreatorTradesParams {
  after_id?: string | null | void;
  after_key?: string | null | void;
  limit: number;
  ticker: string;
}

/** 'ListCreatorTrades' return type */
export interface IListCreatorTradesResult {
  j: unknown | null;
}

/** 'ListCreatorTrades' query type */
export interface IListCreatorTradesQuery {
  params: IListCreatorTradesParams;
  result: IListCreatorTradesResult;
}

const listCreatorTradesIR: any = {"usedParamSet":{"ticker":true,"after_key":true,"after_id":true,"limit":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":130,"b":137}]},{"name":"after_key","required":false,"transform":{"type":"scalar"},"locs":[{"a":140,"b":149}]},{"name":"after_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":152,"b":160}]},{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":163,"b":169}]}],"statement":"-- One page of a creator's trades (404 for an unknown ticker).\n-- Route: ListCreatorTrades.\nSELECT smx.creator_trades_page_json(\n\t:ticker!, :after_key, :after_id, :limit!::INTEGER\n) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- One page of a creator's trades (404 for an unknown ticker).
 * -- Route: ListCreatorTrades.
 * SELECT smx.creator_trades_page_json(
 * 	:ticker!, :after_key, :after_id, :limit!::INTEGER
 * ) AS j
 * ```
 */
export const listCreatorTrades = new PreparedQuery<IListCreatorTradesParams,IListCreatorTradesResult>(listCreatorTradesIR);


/** 'ListCreatorProofs' parameters type */
export interface IListCreatorProofsParams {
  after_id?: string | null | void;
  after_key?: string | null | void;
  limit: number;
  ticker: string;
}

/** 'ListCreatorProofs' return type */
export interface IListCreatorProofsResult {
  j: unknown | null;
}

/** 'ListCreatorProofs' query type */
export interface IListCreatorProofsQuery {
  params: IListCreatorProofsParams;
  result: IListCreatorProofsResult;
}

const listCreatorProofsIR: any = {"usedParamSet":{"ticker":true,"after_key":true,"after_id":true,"limit":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":137,"b":144}]},{"name":"after_key","required":false,"transform":{"type":"scalar"},"locs":[{"a":147,"b":156}]},{"name":"after_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":159,"b":167}]},{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":170,"b":176}]}],"statement":"-- One page of a creator's income proofs (404 for an unknown ticker).\n-- Route: ListCreatorProofs.\nSELECT smx.creator_proofs_page_json(\n\t:ticker!, :after_key, :after_id, :limit!::INTEGER\n) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- One page of a creator's income proofs (404 for an unknown ticker).
 * -- Route: ListCreatorProofs.
 * SELECT smx.creator_proofs_page_json(
 * 	:ticker!, :after_key, :after_id, :limit!::INTEGER
 * ) AS j
 * ```
 */
export const listCreatorProofs = new PreparedQuery<IListCreatorProofsParams,IListCreatorProofsResult>(listCreatorProofsIR);


/** 'ListCreatorUpdates' parameters type */
export interface IListCreatorUpdatesParams {
  after_id?: string | null | void;
  after_key?: string | null | void;
  limit: number;
  ticker: string;
}

/** 'ListCreatorUpdates' return type */
export interface IListCreatorUpdatesResult {
  j: unknown | null;
}

/** 'ListCreatorUpdates' query type */
export interface IListCreatorUpdatesQuery {
  params: IListCreatorUpdatesParams;
  result: IListCreatorUpdatesResult;
}

const listCreatorUpdatesIR: any = {"usedParamSet":{"ticker":true,"after_key":true,"after_id":true,"limit":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":133,"b":140}]},{"name":"after_key","required":false,"transform":{"type":"scalar"},"locs":[{"a":143,"b":152}]},{"name":"after_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":155,"b":163}]},{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":166,"b":172}]}],"statement":"-- One page of a creator's updates (404 for an unknown ticker).\n-- Route: ListCreatorUpdates.\nSELECT smx.creator_updates_page_json(\n\t:ticker!, :after_key, :after_id, :limit!::INTEGER\n) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- One page of a creator's updates (404 for an unknown ticker).
 * -- Route: ListCreatorUpdates.
 * SELECT smx.creator_updates_page_json(
 * 	:ticker!, :after_key, :after_id, :limit!::INTEGER
 * ) AS j
 * ```
 */
export const listCreatorUpdates = new PreparedQuery<IListCreatorUpdatesParams,IListCreatorUpdatesResult>(listCreatorUpdatesIR);


/** 'CreateCreatorUpdate' parameters type */
export interface ICreateCreatorUpdateParams {
  body: string;
  link?: string | null | void;
  ticker: string;
  viewer_id: string;
}

/** 'CreateCreatorUpdate' return type */
export interface ICreateCreatorUpdateResult {
  j: unknown | null;
}

/** 'CreateCreatorUpdate' query type */
export interface ICreateCreatorUpdateQuery {
  params: ICreateCreatorUpdateParams;
  result: ICreateCreatorUpdateResult;
}

const createCreatorUpdateIR: any = {"usedParamSet":{"viewer_id":true,"ticker":true,"body":true,"link":true},"params":[{"name":"viewer_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":165,"b":175}]},{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":178,"b":185}]},{"name":"body","required":true,"transform":{"type":"scalar"},"locs":[{"a":188,"b":193}]},{"name":"link","required":false,"transform":{"type":"scalar"},"locs":[{"a":196,"b":200}]}],"statement":"-- Owner-only post, 5 per rolling 24 hours; emits CREATOR_UPDATE.\n-- Route: CreateCreatorUpdate.\nSELECT smx.creator_update_json(u) AS j\nFROM smx.post_creator_update(:viewer_id!, :ticker!, :body!, :link) AS u"};

/**
 * Query generated from SQL:
 * ```
 * -- Owner-only post, 5 per rolling 24 hours; emits CREATOR_UPDATE.
 * -- Route: CreateCreatorUpdate.
 * SELECT smx.creator_update_json(u) AS j
 * FROM smx.post_creator_update(:viewer_id!, :ticker!, :body!, :link) AS u
 * ```
 */
export const createCreatorUpdate = new PreparedQuery<ICreateCreatorUpdateParams,ICreateCreatorUpdateResult>(createCreatorUpdateIR);


/** 'ListCreatorDividends' parameters type */
export interface IListCreatorDividendsParams {
  after_id?: string | null | void;
  after_key?: string | null | void;
  limit: number;
  ticker: string;
}

/** 'ListCreatorDividends' return type */
export interface IListCreatorDividendsResult {
  j: unknown | null;
}

/** 'ListCreatorDividends' query type */
export interface IListCreatorDividendsQuery {
  params: IListCreatorDividendsParams;
  result: IListCreatorDividendsResult;
}

const listCreatorDividendsIR: any = {"usedParamSet":{"ticker":true,"after_key":true,"after_id":true,"limit":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":139,"b":146}]},{"name":"after_key","required":false,"transform":{"type":"scalar"},"locs":[{"a":149,"b":158}]},{"name":"after_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":161,"b":169}]},{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":172,"b":178}]}],"statement":"-- One page of a creator's dividends (404 for an unknown ticker).\n-- Route: ListCreatorDividends.\nSELECT smx.creator_dividends_page_json(\n\t:ticker!, :after_key, :after_id, :limit!::INTEGER\n) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- One page of a creator's dividends (404 for an unknown ticker).
 * -- Route: ListCreatorDividends.
 * SELECT smx.creator_dividends_page_json(
 * 	:ticker!, :after_key, :after_id, :limit!::INTEGER
 * ) AS j
 * ```
 */
export const listCreatorDividends = new PreparedQuery<IListCreatorDividendsParams,IListCreatorDividendsResult>(listCreatorDividendsIR);


/** 'GetOracleEventsSince' parameters type */
export interface IGetOracleEventsSinceParams {
  creatorId?: string | null | void;
  limit: number;
  since: NumberOrString;
}

/** 'GetOracleEventsSince' return type */
export interface IGetOracleEventsSinceResult {
  j: unknown | null;
}

/** 'GetOracleEventsSince' query type */
export interface IGetOracleEventsSinceQuery {
  params: IGetOracleEventsSinceParams;
  result: IGetOracleEventsSinceResult;
}

const getOracleEventsSinceIR: any = {"usedParamSet":{"since":true,"creatorId":true,"limit":true},"params":[{"name":"since","required":true,"transform":{"type":"scalar"},"locs":[{"a":192,"b":198}]},{"name":"creatorId","required":false,"transform":{"type":"scalar"},"locs":[{"a":209,"b":218}]},{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":227,"b":233}]}],"statement":"-- SSE replay: events after cursor `since`, oldest first, at most `limit`.\n-- `creatorId` is optional. Route: StreamEvents.\nSELECT smx.oracle_event_json(e) AS j\nFROM smx.oracle_events_since(\n\t:since!::BIGINT, :creatorId::UUID, :limit!::INTEGER\n) e"};

/**
 * Query generated from SQL:
 * ```
 * -- SSE replay: events after cursor `since`, oldest first, at most `limit`.
 * -- `creatorId` is optional. Route: StreamEvents.
 * SELECT smx.oracle_event_json(e) AS j
 * FROM smx.oracle_events_since(
 * 	:since!::BIGINT, :creatorId::UUID, :limit!::INTEGER
 * ) e
 * ```
 */
export const getOracleEventsSince = new PreparedQuery<IGetOracleEventsSinceParams,IGetOracleEventsSinceResult>(getOracleEventsSinceIR);


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


/** 'GetCreatorCandles' parameters type */
export interface IGetCreatorCandlesParams {
  interval: string;
  ticker: string;
}

/** 'GetCreatorCandles' return type */
export interface IGetCreatorCandlesResult {
  j: unknown | null;
}

/** 'GetCreatorCandles' query type */
export interface IGetCreatorCandlesQuery {
  params: IGetCreatorCandlesParams;
  result: IGetCreatorCandlesResult;
}

const getCreatorCandlesIR: any = {"usedParamSet":{"ticker":true,"interval":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":193,"b":200}]},{"name":"interval","required":true,"transform":{"type":"scalar"},"locs":[{"a":204,"b":213}]}],"statement":"-- OHLCV candles for one creator and chart interval (1H, 1D, 1W, ALL); raises\n-- 404 for an unknown ticker. Route: GetCreatorCandles.\nSELECT smx.creator_candles_json(\n\tsmx.creator_id_by_ticker(:ticker!), :interval!\n) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- OHLCV candles for one creator and chart interval (1H, 1D, 1W, ALL); raises
 * -- 404 for an unknown ticker. Route: GetCreatorCandles.
 * SELECT smx.creator_candles_json(
 * 	smx.creator_id_by_ticker(:ticker!), :interval!
 * ) AS j
 * ```
 */
export const getCreatorCandles = new PreparedQuery<IGetCreatorCandlesParams,IGetCreatorCandlesResult>(getCreatorCandlesIR);


/** 'GetWatchlist' parameters type */
export interface IGetWatchlistParams {
  viewer_id: string;
}

/** 'GetWatchlist' return type */
export interface IGetWatchlistResult {
  j: unknown | null;
}

/** 'GetWatchlist' query type */
export interface IGetWatchlistQuery {
  params: IGetWatchlistParams;
  result: IGetWatchlistResult;
}

const getWatchlistIR: any = {"usedParamSet":{"viewer_id":true},"params":[{"name":"viewer_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":102,"b":112}]}],"statement":"-- The viewer's watchlist with each creator's summary. Route: GetWatchlist.\nSELECT smx.watchlist_json(:viewer_id!) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- The viewer's watchlist with each creator's summary. Route: GetWatchlist.
 * SELECT smx.watchlist_json(:viewer_id!) AS j
 * ```
 */
export const getWatchlist = new PreparedQuery<IGetWatchlistParams,IGetWatchlistResult>(getWatchlistIR);


/** 'PutWatchlistItem' parameters type */
export interface IPutWatchlistItemParams {
  ticker: string;
  viewer_id: string;
}

/** 'PutWatchlistItem' return type */
export interface IPutWatchlistItemResult {
  j: unknown | null;
}

/** 'PutWatchlistItem' query type */
export interface IPutWatchlistItemQuery {
  params: IPutWatchlistItemParams;
  result: IPutWatchlistItemResult;
}

const putWatchlistItemIR: any = {"usedParamSet":{"viewer_id":true,"ticker":true},"params":[{"name":"viewer_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":111,"b":121}]},{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":124,"b":131}]}],"statement":"-- Adds a creator to the viewer's watchlist (idempotent). Route:\n-- PutWatchlistItem.\nSELECT smx.watchlist_add(:viewer_id!, :ticker!) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- Adds a creator to the viewer's watchlist (idempotent). Route:
 * -- PutWatchlistItem.
 * SELECT smx.watchlist_add(:viewer_id!, :ticker!) AS j
 * ```
 */
export const putWatchlistItem = new PreparedQuery<IPutWatchlistItemParams,IPutWatchlistItemResult>(putWatchlistItemIR);


/** 'DeleteWatchlistItem' parameters type */
export interface IDeleteWatchlistItemParams {
  ticker: string;
  viewer_id: string;
}

/** 'DeleteWatchlistItem' return type */
export interface IDeleteWatchlistItemResult {
  removed: boolean | null;
}

/** 'DeleteWatchlistItem' query type */
export interface IDeleteWatchlistItemQuery {
  params: IDeleteWatchlistItemParams;
  result: IDeleteWatchlistItemResult;
}

const deleteWatchlistItemIR: any = {"usedParamSet":{"viewer_id":true,"ticker":true},"params":[{"name":"viewer_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":122,"b":132}]},{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":135,"b":142}]}],"statement":"-- Removes a creator from the viewer's watchlist (idempotent). Route:\n-- DeleteWatchlistItem.\nSELECT smx.watchlist_remove(:viewer_id!, :ticker!) AS removed"};

/**
 * Query generated from SQL:
 * ```
 * -- Removes a creator from the viewer's watchlist (idempotent). Route:
 * -- DeleteWatchlistItem.
 * SELECT smx.watchlist_remove(:viewer_id!, :ticker!) AS removed
 * ```
 */
export const deleteWatchlistItem = new PreparedQuery<IDeleteWatchlistItemParams,IDeleteWatchlistItemResult>(deleteWatchlistItemIR);


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
  chain_id?: number | null | void;
  display_name: string;
  headline: string;
  nullifier: string;
  owner: string;
  proof_cadence: proof_cadence;
  share_bps: number;
  social_links: unknown;
  stake_amount: string;
  target_raise: string;
  term_months: number;
  terms_document?: unknown | null | void;
  terms_hash?: string | null | void;
  terms_ref?: string | null | void;
  ticker: string;
  tranche_bps: numberArray;
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

const launchIpoIR: any = {"usedParamSet":{"owner":true,"wallet":true,"ticker":true,"display_name":true,"headline":true,"share_bps":true,"term_months":true,"target_raise":true,"stake_amount":true,"nullifier":true,"terms_ref":true,"terms_hash":true,"chain_id":true,"terms_document":true,"tranche_bps":true,"proof_cadence":true,"social_links":true},"params":[{"name":"owner","required":true,"transform":{"type":"scalar"},"locs":[{"a":280,"b":286}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":290,"b":297}]},{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":301,"b":308}]},{"name":"display_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":312,"b":325}]},{"name":"headline","required":true,"transform":{"type":"scalar"},"locs":[{"a":329,"b":338}]},{"name":"share_bps","required":true,"transform":{"type":"scalar"},"locs":[{"a":342,"b":352}]},{"name":"term_months","required":true,"transform":{"type":"scalar"},"locs":[{"a":356,"b":368}]},{"name":"target_raise","required":true,"transform":{"type":"scalar"},"locs":[{"a":372,"b":385}]},{"name":"stake_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":389,"b":402}]},{"name":"nullifier","required":true,"transform":{"type":"scalar"},"locs":[{"a":406,"b":416}]},{"name":"terms_ref","required":false,"transform":{"type":"scalar"},"locs":[{"a":420,"b":429}]},{"name":"terms_hash","required":false,"transform":{"type":"scalar"},"locs":[{"a":433,"b":443}]},{"name":"chain_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":447,"b":455}]},{"name":"terms_document","required":false,"transform":{"type":"scalar"},"locs":[{"a":459,"b":473}]},{"name":"tranche_bps","required":true,"transform":{"type":"scalar"},"locs":[{"a":484,"b":496}]},{"name":"proof_cadence","required":true,"transform":{"type":"scalar"},"locs":[{"a":511,"b":525}]},{"name":"social_links","required":true,"transform":{"type":"scalar"},"locs":[{"a":548,"b":561}]}],"statement":"-- Creates the L-ISA in one statement (creator, tranches, pool, tick, event,\n-- chain jobs, 0G Storage upload) and returns the creator document. The terms\n-- ref is `local:<sha256>` until the worker uploads. Route: LaunchIpo.\nSELECT smx.creator_json(c) AS j\nFROM smx.launch_ipo(\n\t:owner!,\n\t:wallet!,\n\t:ticker!,\n\t:display_name!,\n\t:headline!,\n\t:share_bps!,\n\t:term_months!,\n\t:target_raise!,\n\t:stake_amount!,\n\t:nullifier!,\n\t:terms_ref,\n\t:terms_hash,\n\t:chain_id,\n\t:terms_document::JSONB,\n\t:tranche_bps!::INTEGER[],\n\t:proof_cadence!::smx.proof_cadence,\n\t:social_links!::JSONB\n) AS c"};

/**
 * Query generated from SQL:
 * ```
 * -- Creates the L-ISA in one statement (creator, tranches, pool, tick, event,
 * -- chain jobs, 0G Storage upload) and returns the creator document. The terms
 * -- ref is `local:<sha256>` until the worker uploads. Route: LaunchIpo.
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
 * 	:terms_ref,
 * 	:terms_hash,
 * 	:chain_id,
 * 	:terms_document::JSONB,
 * 	:tranche_bps!::INTEGER[],
 * 	:proof_cadence!::smx.proof_cadence,
 * 	:social_links!::JSONB
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


/** 'CloseRaise' parameters type */
export interface ICloseRaiseParams {
  ticker: string;
  viewer_id?: string | null | void;
}

/** 'CloseRaise' return type */
export interface ICloseRaiseResult {
  id: string | null;
}

/** 'CloseRaise' query type */
export interface ICloseRaiseQuery {
  params: ICloseRaiseParams;
  result: ICloseRaiseResult;
}

const closeRaiseIR: any = {"usedParamSet":{"ticker":true,"viewer_id":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":129,"b":136}]},{"name":"viewer_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":140,"b":149}]}],"statement":"-- Creator ends the raise early; releases tranche 0 and opens trading.\nSELECT c.id\nFROM smx.close_raise(smx.creator_id_by_ticker(:ticker!), :viewer_id) AS c"};

/**
 * Query generated from SQL:
 * ```
 * -- Creator ends the raise early; releases tranche 0 and opens trading.
 * SELECT c.id
 * FROM smx.close_raise(smx.creator_id_by_ticker(:ticker!), :viewer_id) AS c
 * ```
 */
export const closeRaise = new PreparedQuery<ICloseRaiseParams,ICloseRaiseResult>(closeRaiseIR);


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
  reclaim_session_id?: string | null | void;
}

/** 'SubmitIncomeProof' return type */
export interface ISubmitIncomeProofResult {
  id: string;
  min_income: string;
  period: number;
  proof_cadence: proof_cadence;
  share_bps: number;
  terms_hash: string | null;
  terms_ref: string | null;
  ticker: string;
}

/** 'SubmitIncomeProof' query type */
export interface ISubmitIncomeProofQuery {
  params: ISubmitIncomeProofParams;
  result: ISubmitIncomeProofResult;
}

const submitIncomeProofIR: any = {"usedParamSet":{"creator_id":true,"provider":true,"reclaim_proof_id":true,"amount":true,"raw":true,"reclaim_session_id":true},"params":[{"name":"creator_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":362,"b":373}]},{"name":"provider","required":true,"transform":{"type":"scalar"},"locs":[{"a":383,"b":392}]},{"name":"reclaim_proof_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":396,"b":413}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":417,"b":424}]},{"name":"raw","required":false,"transform":{"type":"scalar"},"locs":[{"a":437,"b":440}]},{"name":"reclaim_session_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":458,"b":476}]}],"statement":"-- Stores a verified Reclaim proof as PENDING and returns what the auditor\n-- needs. Routes: AuditMilestone, ReclaimCallback.\nSELECT\n\tp.id AS \"id!\",\n\tp.period AS \"period!\",\n\tc.ticker AS \"ticker!\",\n\tc.share_bps AS \"share_bps!\",\n\tc.min_income::TEXT AS \"min_income!\",\n\tc.terms_hash,\n\tc.terms_ref,\n\tc.proof_cadence AS \"proof_cadence!\"\nFROM smx.submit_income_proof(\n\t:creator_id!::UUID,\n\t:provider!,\n\t:reclaim_proof_id!,\n\t:amount!::NUMERIC,\n\t:raw::JSONB,\n\tNULL,\n\t:reclaim_session_id\n) AS p\nJOIN smx.creators c ON c.id = p.creator_id"};

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
 * 	c.terms_hash,
 * 	c.terms_ref,
 * 	c.proof_cadence AS "proof_cadence!"
 * FROM smx.submit_income_proof(
 * 	:creator_id!::UUID,
 * 	:provider!,
 * 	:reclaim_proof_id!,
 * 	:amount!::NUMERIC,
 * 	:raw::JSONB,
 * 	NULL,
 * 	:reclaim_session_id
 * ) AS p
 * JOIN smx.creators c ON c.id = p.creator_id
 * ```
 */
export const submitIncomeProof = new PreparedQuery<ISubmitIncomeProofParams,ISubmitIncomeProofResult>(submitIncomeProofIR);


/** 'CreateReclaimSessionRow' parameters type */
export interface ICreateReclaimSessionRowParams {
  creator_id: string;
  id: string;
  org_id?: string | null | void;
}

/** 'CreateReclaimSessionRow' return type */
export interface ICreateReclaimSessionRowResult {
  id: string;
}

/** 'CreateReclaimSessionRow' query type */
export interface ICreateReclaimSessionRowQuery {
  params: ICreateReclaimSessionRowParams;
  result: ICreateReclaimSessionRowResult;
}

const createReclaimSessionRowIR: any = {"usedParamSet":{"id":true,"creator_id":true,"org_id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":140,"b":143}]},{"name":"creator_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":146,"b":157}]},{"name":"org_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":166,"b":172}]}],"statement":"-- Records a verification session we created. Route: CreateReclaimSession.\nINSERT INTO smx.reclaim_sessions(id, creator_id, org_id)\nVALUES (:id!, :creator_id!::UUID, :org_id)\nRETURNING id"};

/**
 * Query generated from SQL:
 * ```
 * -- Records a verification session we created. Route: CreateReclaimSession.
 * INSERT INTO smx.reclaim_sessions(id, creator_id, org_id)
 * VALUES (:id!, :creator_id!::UUID, :org_id)
 * RETURNING id
 * ```
 */
export const createReclaimSessionRow = new PreparedQuery<ICreateReclaimSessionRowParams,ICreateReclaimSessionRowResult>(createReclaimSessionRowIR);


/** 'GetReclaimSession' parameters type */
export interface IGetReclaimSessionParams {
  id: string;
}

/** 'GetReclaimSession' return type */
export interface IGetReclaimSessionResult {
  creator_id: string;
  id: string;
  org_id: string | null;
  status: string;
}

/** 'GetReclaimSession' query type */
export interface IGetReclaimSessionQuery {
  params: IGetReclaimSessionParams;
  result: IGetReclaimSessionResult;
}

const getReclaimSessionIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":232,"b":235}]}],"statement":"-- Session by id (callback lookup, no ownership check). Routes:\n-- ReclaimCallback, AuditMilestone.\nSELECT r.id AS \"id!\", r.creator_id AS \"creator_id!\", r.org_id, r.status::TEXT AS \"status!\"\nFROM smx.reclaim_sessions r\nWHERE r.id = :id!"};

/**
 * Query generated from SQL:
 * ```
 * -- Session by id (callback lookup, no ownership check). Routes:
 * -- ReclaimCallback, AuditMilestone.
 * SELECT r.id AS "id!", r.creator_id AS "creator_id!", r.org_id, r.status::TEXT AS "status!"
 * FROM smx.reclaim_sessions r
 * WHERE r.id = :id!
 * ```
 */
export const getReclaimSession = new PreparedQuery<IGetReclaimSessionParams,IGetReclaimSessionResult>(getReclaimSessionIR);


/** 'GetDemoProofQuota' parameters type */
export interface IGetDemoProofQuotaParams {
  creator_id: string;
  viewer_id: string;
}

/** 'GetDemoProofQuota' return type */
export interface IGetDemoProofQuotaResult {
  is_owner: boolean;
  recent: number;
}

/** 'GetDemoProofQuota' query type */
export interface IGetDemoProofQuotaQuery {
  params: IGetDemoProofQuotaParams;
  result: IGetDemoProofQuotaResult;
}

const getDemoProofQuotaIR: any = {"usedParamSet":{"creator_id":true,"viewer_id":true},"params":[{"name":"creator_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":223,"b":234},{"a":363,"b":374}]},{"name":"viewer_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":258,"b":268}]}],"statement":"-- Whether the viewer owns the creator, and how many demo proofs it got in the\n-- last hour (the per-creator cap protects the 0G credit). Route: AuditMilestone.\nSELECT\n\tEXISTS(\n\t\tSELECT 1 FROM smx.creators c\n\t\tWHERE c.id = :creator_id! AND c.owner_user_id = :viewer_id!\n\t) AS \"is_owner!\",\n\t(\n\t\tSELECT count(*)::INT FROM smx.income_proofs p\n\t\tWHERE p.creator_id = :creator_id!\n\t\t\tAND p.provider = 'demo'\n\t\t\tAND p.created_at > now() - interval '1 hour'\n\t) AS \"recent!\""};

/**
 * Query generated from SQL:
 * ```
 * -- Whether the viewer owns the creator, and how many demo proofs it got in the
 * -- last hour (the per-creator cap protects the 0G credit). Route: AuditMilestone.
 * SELECT
 * 	EXISTS(
 * 		SELECT 1 FROM smx.creators c
 * 		WHERE c.id = :creator_id! AND c.owner_user_id = :viewer_id!
 * 	) AS "is_owner!",
 * 	(
 * 		SELECT count(*)::INT FROM smx.income_proofs p
 * 		WHERE p.creator_id = :creator_id!
 * 			AND p.provider = 'demo'
 * 			AND p.created_at > now() - interval '1 hour'
 * 	) AS "recent!"
 * ```
 */
export const getDemoProofQuota = new PreparedQuery<IGetDemoProofQuotaParams,IGetDemoProofQuotaResult>(getDemoProofQuotaIR);


/** 'GetOwnedReclaimSession' parameters type */
export interface IGetOwnedReclaimSessionParams {
  id: string;
  viewer_id: string;
}

/** 'GetOwnedReclaimSession' return type */
export interface IGetOwnedReclaimSessionResult {
  j: unknown | null;
}

/** 'GetOwnedReclaimSession' query type */
export interface IGetOwnedReclaimSessionQuery {
  params: IGetOwnedReclaimSessionParams;
  result: IGetOwnedReclaimSessionResult;
}

const getOwnedReclaimSessionIR: any = {"usedParamSet":{"id":true,"viewer_id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":203,"b":206}]},{"name":"viewer_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":251,"b":261}]}],"statement":"-- Session JSON for its creator's owner (403 for someone else's, no row when\n-- unknown). Route: GetReclaimSessionStatus.\nSELECT smx.reclaim_session_json(r) AS j\nFROM smx.reclaim_sessions r\nWHERE r.id = :id! AND smx.assert_creator_owner(r.creator_id, :viewer_id!)"};

/**
 * Query generated from SQL:
 * ```
 * -- Session JSON for its creator's owner (403 for someone else's, no row when
 * -- unknown). Route: GetReclaimSessionStatus.
 * SELECT smx.reclaim_session_json(r) AS j
 * FROM smx.reclaim_sessions r
 * WHERE r.id = :id! AND smx.assert_creator_owner(r.creator_id, :viewer_id!)
 * ```
 */
export const getOwnedReclaimSession = new PreparedQuery<IGetOwnedReclaimSessionParams,IGetOwnedReclaimSessionResult>(getOwnedReclaimSessionIR);


/** 'FinishReclaimSession' parameters type */
export interface IFinishReclaimSessionParams {
  id: string;
  reason?: string | null | void;
  status: reclaim_session_status;
}

/** 'FinishReclaimSession' return type */
export interface IFinishReclaimSessionResult {
  j: unknown | null;
}

/** 'FinishReclaimSession' query type */
export interface IFinishReclaimSessionQuery {
  params: IFinishReclaimSessionParams;
  result: IFinishReclaimSessionResult;
}

const finishReclaimSessionIR: any = {"usedParamSet":{"id":true,"status":true,"reason":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":178,"b":181}]},{"name":"status","required":true,"transform":{"type":"scalar"},"locs":[{"a":184,"b":191}]},{"name":"reason","required":false,"transform":{"type":"scalar"},"locs":[{"a":222,"b":228}]}],"statement":"-- Terminal failure (or poll result) of a session. Routes: ReclaimCallback,\n-- GetReclaimSessionStatus.\nSELECT smx.reclaim_session_json(r) AS j\nFROM smx.finish_reclaim_session(\n\t:id!, :status!::smx.reclaim_session_status, :reason\n) AS r"};

/**
 * Query generated from SQL:
 * ```
 * -- Terminal failure (or poll result) of a session. Routes: ReclaimCallback,
 * -- GetReclaimSessionStatus.
 * SELECT smx.reclaim_session_json(r) AS j
 * FROM smx.finish_reclaim_session(
 * 	:id!, :status!::smx.reclaim_session_status, :reason
 * ) AS r
 * ```
 */
export const finishReclaimSession = new PreparedQuery<IFinishReclaimSessionParams,IFinishReclaimSessionResult>(finishReclaimSessionIR);


/** 'GetDividendForPayment' parameters type */
export interface IGetDividendForPaymentParams {
  dividend_id: string;
  viewer_id: string;
}

/** 'GetDividendForPayment' return type */
export interface IGetDividendForPaymentResult {
  amount_due: string;
  creator_id: string;
  id: string;
  splits: unknown;
  status: string;
  ticker: string;
}

/** 'GetDividendForPayment' query type */
export interface IGetDividendForPaymentQuery {
  params: IGetDividendForPaymentParams;
  result: IGetDividendForPaymentResult;
}

const getDividendForPaymentIR: any = {"usedParamSet":{"dividend_id":true,"viewer_id":true},"params":[{"name":"dividend_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":385,"b":397}]},{"name":"viewer_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":442,"b":452}]}],"statement":"-- A due dividend the viewer may pay, with its holder splits. Routes:\n-- CreateDividendPaymentRequest, PayDividend.\nSELECT\n\td.id AS \"id!\",\n\td.creator_id AS \"creator_id!\",\n\td.amount_due::TEXT AS \"amount_due!\",\n\td.status::TEXT AS \"status!\",\n\tc.ticker AS \"ticker!\",\n\tsmx.dividend_splits_json(d.id) AS \"splits!\"\nFROM smx.dividends d\nJOIN smx.creators c ON c.id = d.creator_id\nWHERE d.id = :dividend_id! AND smx.assert_creator_owner(d.creator_id, :viewer_id!)"};

/**
 * Query generated from SQL:
 * ```
 * -- A due dividend the viewer may pay, with its holder splits. Routes:
 * -- CreateDividendPaymentRequest, PayDividend.
 * SELECT
 * 	d.id AS "id!",
 * 	d.creator_id AS "creator_id!",
 * 	d.amount_due::TEXT AS "amount_due!",
 * 	d.status::TEXT AS "status!",
 * 	c.ticker AS "ticker!",
 * 	smx.dividend_splits_json(d.id) AS "splits!"
 * FROM smx.dividends d
 * JOIN smx.creators c ON c.id = d.creator_id
 * WHERE d.id = :dividend_id! AND smx.assert_creator_owner(d.creator_id, :viewer_id!)
 * ```
 */
export const getDividendForPayment = new PreparedQuery<IGetDividendForPaymentParams,IGetDividendForPaymentResult>(getDividendForPaymentIR);


/** 'AuditIncomeProof' parameters type */
export interface IAuditIncomeProofParams {
  audit: unknown;
  log_document?: unknown | null | void;
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

const auditIncomeProofIR: any = {"usedParamSet":{"proof_id":true,"verified_amount":true,"audit":true,"log_document":true},"params":[{"name":"proof_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":159,"b":168}]},{"name":"verified_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":171,"b":187}]},{"name":"audit","required":true,"transform":{"type":"scalar"},"locs":[{"a":199,"b":205}]},{"name":"log_document","required":false,"transform":{"type":"scalar"},"locs":[{"a":216,"b":228}]}],"statement":"-- Applies the rules engine to a pending proof. Routes: AuditMilestone,\n-- ReclaimCallback.\nSELECT smx.audit_result_json(p) AS j\nFROM smx.audit_income_proof(\n\t:proof_id!, :verified_amount!::NUMERIC, :audit!::JSONB,\n\t:log_document::JSONB\n) AS p"};

/**
 * Query generated from SQL:
 * ```
 * -- Applies the rules engine to a pending proof. Routes: AuditMilestone,
 * -- ReclaimCallback.
 * SELECT smx.audit_result_json(p) AS j
 * FROM smx.audit_income_proof(
 * 	:proof_id!, :verified_amount!::NUMERIC, :audit!::JSONB,
 * 	:log_document::JSONB
 * ) AS p
 * ```
 */
export const auditIncomeProof = new PreparedQuery<IAuditIncomeProofParams,IAuditIncomeProofResult>(auditIncomeProofIR);


/** 'MarkAuditUnavailable' parameters type */
export interface IMarkAuditUnavailableParams {
  message: string;
  proof_id: string;
}

/** 'MarkAuditUnavailable' return type */
export interface IMarkAuditUnavailableResult {
  j: unknown | null;
}

/** 'MarkAuditUnavailable' query type */
export interface IMarkAuditUnavailableQuery {
  params: IMarkAuditUnavailableParams;
  result: IMarkAuditUnavailableResult;
}

const markAuditUnavailableIR: any = {"usedParamSet":{"proof_id":true,"message":true},"params":[{"name":"proof_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":180,"b":189}]},{"name":"message","required":true,"transform":{"type":"scalar"},"locs":[{"a":198,"b":206}]}],"statement":"-- 0G could not audit: keep the proof PENDING with a retry status. Routes:\n-- AuditMilestone, ReclaimCallback.\nSELECT smx.audit_result_json(p) AS j\nFROM smx.mark_audit_unavailable(:proof_id!::UUID, :message!) AS p"};

/**
 * Query generated from SQL:
 * ```
 * -- 0G could not audit: keep the proof PENDING with a retry status. Routes:
 * -- AuditMilestone, ReclaimCallback.
 * SELECT smx.audit_result_json(p) AS j
 * FROM smx.mark_audit_unavailable(:proof_id!::UUID, :message!) AS p
 * ```
 */
export const markAuditUnavailable = new PreparedQuery<IMarkAuditUnavailableParams,IMarkAuditUnavailableResult>(markAuditUnavailableIR);


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
  tx_hash?: string | null | void;
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

const payDividendIR: any = {"usedParamSet":{"dividend_id":true,"tx_hash":true,"viewer_id":true},"params":[{"name":"dividend_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":202,"b":214}]},{"name":"tx_hash","required":false,"transform":{"type":"scalar"},"locs":[{"a":217,"b":224}]},{"name":"viewer_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":227,"b":237}]}],"statement":"-- Creator pays a due dividend; `tx_hash` is the settled Hedera transaction\n-- id when the browser paid through the x402 loop. Route: PayDividend.\nSELECT smx.dividend_json(d) AS j\nFROM smx.pay_dividend(:dividend_id!, :tx_hash, :viewer_id!) AS d"};

/**
 * Query generated from SQL:
 * ```
 * -- Creator pays a due dividend; `tx_hash` is the settled Hedera transaction
 * -- id when the browser paid through the x402 loop. Route: PayDividend.
 * SELECT smx.dividend_json(d) AS j
 * FROM smx.pay_dividend(:dividend_id!, :tx_hash, :viewer_id!) AS d
 * ```
 */
export const payDividend = new PreparedQuery<IPayDividendParams,IPayDividendResult>(payDividendIR);


/** 'GetPaidDividendReceipts' parameters type */
export interface IGetPaidDividendReceiptsParams {
  dividend_id: string;
}

/** 'GetPaidDividendReceipts' return type */
export interface IGetPaidDividendReceiptsResult {
  id: string;
  settled: boolean;
}

/** 'GetPaidDividendReceipts' query type */
export interface IGetPaidDividendReceiptsQuery {
  params: IGetPaidDividendReceiptsParams;
  result: IGetPaidDividendReceiptsResult;
}

const getPaidDividendReceiptsIR: any = {"usedParamSet":{"dividend_id":true},"params":[{"name":"dividend_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":178,"b":190}]}],"statement":"-- Whether a dividend already has stream receipts (settled in the request).\n-- Worker.\nSELECT d.id, d.stream_receipts IS NOT NULL AS \"settled!\"\nFROM smx.dividends d\nWHERE d.id = :dividend_id!"};

/**
 * Query generated from SQL:
 * ```
 * -- Whether a dividend already has stream receipts (settled in the request).
 * -- Worker.
 * SELECT d.id, d.stream_receipts IS NOT NULL AS "settled!"
 * FROM smx.dividends d
 * WHERE d.id = :dividend_id!
 * ```
 */
export const getPaidDividendReceipts = new PreparedQuery<IGetPaidDividendReceiptsParams,IGetPaidDividendReceiptsResult>(getPaidDividendReceiptsIR);


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

const listQueuedChainJobsIR: any = {"usedParamSet":{"batch":true},"params":[{"name":"batch","required":true,"transform":{"type":"scalar"},"locs":[{"a":677,"b":683}]}],"statement":"-- The next onchain call per creator, oldest first. A creator's jobs run\n-- strictly in order: only its earliest unsettled job is listed, and none while\n-- an earlier one is SENT or FAILED, so a failed initializeIPO can't let its\n-- invest calls revert. The worker re-lists after each pass. Worker.\nSELECT n.id, n.fn, n.args, n.contract_address\nFROM (\n\tSELECT DISTINCT ON (j.creator_id)\n\t\tj.id,\n\t\tj.seq,\n\t\tj.fn,\n\t\tj.args,\n\t\tj.status,\n\t\tc.contract_address::TEXT AS contract_address\n\tFROM smx.chain_jobs j\n\tJOIN smx.creators c ON c.id = j.creator_id\n\tWHERE j.status IN ('QUEUED', 'SENT', 'FAILED')\n\tORDER BY j.creator_id, j.seq\n) n\nWHERE n.status = 'QUEUED'\nORDER BY n.seq\nLIMIT :batch!::INTEGER"};

/**
 * Query generated from SQL:
 * ```
 * -- The next onchain call per creator, oldest first. A creator's jobs run
 * -- strictly in order: only its earliest unsettled job is listed, and none while
 * -- an earlier one is SENT or FAILED, so a failed initializeIPO can't let its
 * -- invest calls revert. The worker re-lists after each pass. Worker.
 * SELECT n.id, n.fn, n.args, n.contract_address
 * FROM (
 * 	SELECT DISTINCT ON (j.creator_id)
 * 		j.id,
 * 		j.seq,
 * 		j.fn,
 * 		j.args,
 * 		j.status,
 * 		c.contract_address::TEXT AS contract_address
 * 	FROM smx.chain_jobs j
 * 	JOIN smx.creators c ON c.id = j.creator_id
 * 	WHERE j.status IN ('QUEUED', 'SENT', 'FAILED')
 * 	ORDER BY j.creator_id, j.seq
 * ) n
 * WHERE n.status = 'QUEUED'
 * ORDER BY n.seq
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
  ats_token?: string | null | void;
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

const completeChainJobIR: any = {"usedParamSet":{"id":true,"status":true,"tx_hash":true,"error":true,"isa":true,"token":true,"ats_token":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":125,"b":128}]},{"name":"status","required":true,"transform":{"type":"scalar"},"locs":[{"a":131,"b":138}]},{"name":"tx_hash","required":false,"transform":{"type":"scalar"},"locs":[{"a":163,"b":170}]},{"name":"error","required":false,"transform":{"type":"scalar"},"locs":[{"a":173,"b":178}]},{"name":"isa","required":false,"transform":{"type":"scalar"},"locs":[{"a":181,"b":184}]},{"name":"token","required":false,"transform":{"type":"scalar"},"locs":[{"a":187,"b":192}]},{"name":"ats_token","required":false,"transform":{"type":"scalar"},"locs":[{"a":196,"b":205}]}],"statement":"-- Settles a sent job and copies the result onto the domain row. Worker.\nSELECT j.id, j.status\nFROM smx.complete_chain_job(\n\t:id!, :status!::smx.chain_job_status, :tx_hash, :error, :isa, :token,\n\t:ats_token\n) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- Settles a sent job and copies the result onto the domain row. Worker.
 * SELECT j.id, j.status
 * FROM smx.complete_chain_job(
 * 	:id!, :status!::smx.chain_job_status, :tx_hash, :error, :isa, :token,
 * 	:ats_token
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

const checkLaunchableIR: any = {"usedParamSet":{"nullifier":true},"params":[{"name":"nullifier","required":true,"transform":{"type":"scalar"},"locs":[{"a":140,"b":150}]}],"statement":"-- Fails fast (403 banned, 409 used) before the route spends a 0G Storage write.\n-- Route: LaunchIpo.\nSELECT smx.assert_nullifier_available(:nullifier!) AS ok"};

/**
 * Query generated from SQL:
 * ```
 * -- Fails fast (403 banned, 409 used) before the route spends a 0G Storage write.
 * -- Route: LaunchIpo.
 * SELECT smx.assert_nullifier_available(:nullifier!) AS ok
 * ```
 */
export const checkLaunchable = new PreparedQuery<ICheckLaunchableParams,ICheckLaunchableResult>(checkLaunchableIR);


/** 'RequeueFailedChainJobs' parameters type */
export interface IRequeueFailedChainJobsParams {
  ticker?: string | null | void;
  transient_only: boolean;
}

/** 'RequeueFailedChainJobs' return type */
export interface IRequeueFailedChainJobsResult {
  fn: string;
  id: string;
  ticker: string;
}

/** 'RequeueFailedChainJobs' query type */
export interface IRequeueFailedChainJobsQuery {
  params: IRequeueFailedChainJobsParams;
  result: IRequeueFailedChainJobsResult;
}

const requeueFailedChainJobsIR: any = {"usedParamSet":{"ticker":true,"transient_only":true},"params":[{"name":"ticker","required":false,"transform":{"type":"scalar"},"locs":[{"a":439,"b":445},{"a":475,"b":481}]},{"name":"transient_only","required":true,"transform":{"type":"scalar"},"locs":[{"a":503,"b":518}]}],"statement":"-- Puts FAILED onchain calls back in the queue (optionally one creator's).\n-- With :transient_only, only relay errors (HTTP failures, timeouts, 5xx) that\n-- never reached the chain; reverts stay FAILED. A FAILED job blocks later\n-- jobs of its creator until requeued. Worker sweep.\nUPDATE smx.chain_jobs j\nSET status = 'QUEUED', error = NULL, updated_at = now()\nFROM smx.creators c\nWHERE j.status = 'FAILED'\n\tAND c.id = j.creator_id\n\tAND (:ticker::TEXT IS NULL OR c.ticker = :ticker::TEXT)\n\tAND (\n\t\tNOT :transient_only!::BOOLEAN\n\t\tOR (\n\t\t\tj.error ~* '(HTTP request failed|took too long|timed? ?out|Status: 5[0-9][0-9]|ECONNRESET|fetch failed|FAIL_INVALID)'\n\t\t\t-- Back off so a struggling relay isn't hammered every poll.\n\t\t\tAND j.updated_at < now() - interval '30 seconds'\n\t\t)\n\t)\nRETURNING j.id, j.fn, c.ticker"};

/**
 * Query generated from SQL:
 * ```
 * -- Puts FAILED onchain calls back in the queue (optionally one creator's).
 * -- With :transient_only, only relay errors (HTTP failures, timeouts, 5xx) that
 * -- never reached the chain; reverts stay FAILED. A FAILED job blocks later
 * -- jobs of its creator until requeued. Worker sweep.
 * UPDATE smx.chain_jobs j
 * SET status = 'QUEUED', error = NULL, updated_at = now()
 * FROM smx.creators c
 * WHERE j.status = 'FAILED'
 * 	AND c.id = j.creator_id
 * 	AND (:ticker::TEXT IS NULL OR c.ticker = :ticker::TEXT)
 * 	AND (
 * 		NOT :transient_only!::BOOLEAN
 * 		OR (
 * 			j.error ~* '(HTTP request failed|took too long|timed? ?out|Status: 5[0-9][0-9]|ECONNRESET|fetch failed|FAIL_INVALID)'
 * 			-- Back off so a struggling relay isn't hammered every poll.
 * 			AND j.updated_at < now() - interval '30 seconds'
 * 		)
 * 	)
 * RETURNING j.id, j.fn, c.ticker
 * ```
 */
export const requeueFailedChainJobs = new PreparedQuery<IRequeueFailedChainJobsParams,IRequeueFailedChainJobsResult>(requeueFailedChainJobsIR);


/** 'ListDueStorageUploads' parameters type */
export interface IListDueStorageUploadsParams {
  batch: number;
}

/** 'ListDueStorageUploads' return type */
export interface IListDueStorageUploadsResult {
  id: string;
}

/** 'ListDueStorageUploads' query type */
export interface IListDueStorageUploadsQuery {
  params: IListDueStorageUploadsParams;
  result: IListDueStorageUploadsResult;
}

const listDueStorageUploadsIR: any = {"usedParamSet":{"batch":true},"params":[{"name":"batch","required":true,"transform":{"type":"scalar"},"locs":[{"a":184,"b":190}]}],"statement":"-- Queued 0G Storage uploads whose backoff has passed, oldest first. Worker.\nSELECT id FROM smx.storage_uploads\nWHERE status = 'QUEUED' AND next_attempt_at <= now()\nORDER BY seq\nLIMIT :batch!::INTEGER"};

/**
 * Query generated from SQL:
 * ```
 * -- Queued 0G Storage uploads whose backoff has passed, oldest first. Worker.
 * SELECT id FROM smx.storage_uploads
 * WHERE status = 'QUEUED' AND next_attempt_at <= now()
 * ORDER BY seq
 * LIMIT :batch!::INTEGER
 * ```
 */
export const listDueStorageUploads = new PreparedQuery<IListDueStorageUploadsParams,IListDueStorageUploadsResult>(listDueStorageUploadsIR);


/** 'ClaimStorageUpload' parameters type */
export interface IClaimStorageUploadParams {
  id: string;
}

/** 'ClaimStorageUpload' return type */
export interface IClaimStorageUploadResult {
  attempts: number | null;
  content_hash: string | null;
  creator_id: string | null;
  document: unknown | null;
  id: string | null;
  kind: storage_upload_kind | null;
  status: storage_upload_status | null;
}

/** 'ClaimStorageUpload' query type */
export interface IClaimStorageUploadQuery {
  params: IClaimStorageUploadParams;
  result: IClaimStorageUploadResult;
}

const claimStorageUploadIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":272,"b":275}]}],"statement":"-- Leases one upload (counts the attempt). Returns no row when it isn't due;\n-- an already-UPLOADED content hash comes back UPLOADED (don't upload). Worker.\nSELECT s.id, s.creator_id, s.kind, s.document, s.content_hash, s.status,\n\ts.attempts\nFROM smx.claim_storage_upload(:id!) AS s\nWHERE s.id IS NOT NULL"};

/**
 * Query generated from SQL:
 * ```
 * -- Leases one upload (counts the attempt). Returns no row when it isn't due;
 * -- an already-UPLOADED content hash comes back UPLOADED (don't upload). Worker.
 * SELECT s.id, s.creator_id, s.kind, s.document, s.content_hash, s.status,
 * 	s.attempts
 * FROM smx.claim_storage_upload(:id!) AS s
 * WHERE s.id IS NOT NULL
 * ```
 */
export const claimStorageUpload = new PreparedQuery<IClaimStorageUploadParams,IClaimStorageUploadResult>(claimStorageUploadIR);


/** 'CompleteStorageUpload' parameters type */
export interface ICompleteStorageUploadParams {
  error?: string | null | void;
  id: string;
  ref?: string | null | void;
  status: storage_upload_status;
  transient: boolean;
}

/** 'CompleteStorageUpload' return type */
export interface ICompleteStorageUploadResult {
  id: string | null;
  status: storage_upload_status | null;
}

/** 'CompleteStorageUpload' query type */
export interface ICompleteStorageUploadQuery {
  params: ICompleteStorageUploadParams;
  result: ICompleteStorageUploadResult;
}

const completeStorageUploadIR: any = {"usedParamSet":{"id":true,"status":true,"ref":true,"error":true,"transient":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":190,"b":193}]},{"name":"status","required":true,"transform":{"type":"scalar"},"locs":[{"a":196,"b":203}]},{"name":"ref","required":false,"transform":{"type":"scalar"},"locs":[{"a":233,"b":236}]},{"name":"error","required":false,"transform":{"type":"scalar"},"locs":[{"a":239,"b":244}]},{"name":"transient","required":true,"transform":{"type":"scalar"},"locs":[{"a":247,"b":257}]}],"statement":"-- Settles an upload: UPLOADED swaps the ref in and emits STORAGE_CONFIRMED;\n-- FAILED with :transient retries with backoff. Worker.\nSELECT s.id, s.status\nFROM smx.complete_storage_upload(\n\t:id!, :status!::smx.storage_upload_status, :ref, :error, :transient!::BOOLEAN\n) AS s"};

/**
 * Query generated from SQL:
 * ```
 * -- Settles an upload: UPLOADED swaps the ref in and emits STORAGE_CONFIRMED;
 * -- FAILED with :transient retries with backoff. Worker.
 * SELECT s.id, s.status
 * FROM smx.complete_storage_upload(
 * 	:id!, :status!::smx.storage_upload_status, :ref, :error, :transient!::BOOLEAN
 * ) AS s
 * ```
 */
export const completeStorageUpload = new PreparedQuery<ICompleteStorageUploadParams,ICompleteStorageUploadResult>(completeStorageUploadIR);


/** 'GetPortfolio' parameters type */
export interface IGetPortfolioParams {
  user_id: string;
  wallet?: string | null | void;
}

/** 'GetPortfolio' return type */
export interface IGetPortfolioResult {
  j: unknown | null;
}

/** 'GetPortfolio' query type */
export interface IGetPortfolioQuery {
  params: IGetPortfolioParams;
  result: IGetPortfolioResult;
}

const getPortfolioIR: any = {"usedParamSet":{"wallet":true,"user_id":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":149,"b":155}]},{"name":"user_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":158,"b":166}]}],"statement":"-- A wallet's holdings, totals and dividends received, plus the user's own IPO.\n-- Route: GetPortfolio.\nSELECT smx.wallet_portfolio_with_claims_json(:wallet, :user_id!) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- A wallet's holdings, totals and dividends received, plus the user's own IPO.
 * -- Route: GetPortfolio.
 * SELECT smx.wallet_portfolio_with_claims_json(:wallet, :user_id!) AS j
 * ```
 */
export const getPortfolio = new PreparedQuery<IGetPortfolioParams,IGetPortfolioResult>(getPortfolioIR);


/** 'ListWalletTransactions' parameters type */
export interface IListWalletTransactionsParams {
  after_id?: string | null | void;
  after_key?: string | null | void;
  limit: number;
  wallet: string;
}

/** 'ListWalletTransactions' return type */
export interface IListWalletTransactionsResult {
  j: unknown | null;
}

/** 'ListWalletTransactions' query type */
export interface IListWalletTransactionsQuery {
  params: IListWalletTransactionsParams;
  result: IListWalletTransactionsResult;
}

const listWalletTransactionsIR: any = {"usedParamSet":{"wallet":true,"after_key":true,"after_id":true,"limit":true},"params":[{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":126,"b":133}]},{"name":"after_key","required":false,"transform":{"type":"scalar"},"locs":[{"a":136,"b":145}]},{"name":"after_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":148,"b":156}]},{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":159,"b":165}]}],"statement":"-- One page of a wallet's investments and trades, newest first.\n-- Route: GetPortfolio.\nSELECT smx.wallet_transactions_json(\n\t:wallet!, :after_key, :after_id, :limit!::INTEGER\n) AS j"};

/**
 * Query generated from SQL:
 * ```
 * -- One page of a wallet's investments and trades, newest first.
 * -- Route: GetPortfolio.
 * SELECT smx.wallet_transactions_json(
 * 	:wallet!, :after_key, :after_id, :limit!::INTEGER
 * ) AS j
 * ```
 */
export const listWalletTransactions = new PreparedQuery<IListWalletTransactionsParams,IListWalletTransactionsResult>(listWalletTransactionsIR);


/** 'GetCreatorChain' parameters type */
export interface IGetCreatorChainParams {
  ticker: string;
}

/** 'GetCreatorChain' return type */
export interface IGetCreatorChainResult {
  contract_address: string | null;
  id: string;
  pool_address: string | null;
  status: creator_status;
  token_address: string | null;
}

/** 'GetCreatorChain' query type */
export interface IGetCreatorChainQuery {
  params: IGetCreatorChainParams;
  result: IGetCreatorChainResult;
}

const getCreatorChainIR: any = {"usedParamSet":{"ticker":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":221,"b":228}]}],"statement":"-- Onchain addresses of a creator (no row for an unknown ticker).\n-- Routes: Trade, Invest, GetCreatorChain.\nSELECT c.id, c.status, c.contract_address, c.token_address, c.pool_address\nFROM smx.creators c\nWHERE c.ticker = :ticker!"};

/**
 * Query generated from SQL:
 * ```
 * -- Onchain addresses of a creator (no row for an unknown ticker).
 * -- Routes: Trade, Invest, GetCreatorChain.
 * SELECT c.id, c.status, c.contract_address, c.token_address, c.pool_address
 * FROM smx.creators c
 * WHERE c.ticker = :ticker!
 * ```
 */
export const getCreatorChain = new PreparedQuery<IGetCreatorChainParams,IGetCreatorChainResult>(getCreatorChainIR);


/** 'SetChainJobPool' parameters type */
export interface ISetChainJobPoolParams {
  job_id: string;
  pool: string;
}

/** 'SetChainJobPool' return type */
export interface ISetChainJobPoolResult {
  id: string | null;
}

/** 'SetChainJobPool' query type */
export interface ISetChainJobPoolQuery {
  params: ISetChainJobPoolParams;
  result: ISetChainJobPoolResult;
}

const setChainJobPoolIR: any = {"usedParamSet":{"job_id":true,"pool":true},"params":[{"name":"job_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":91,"b":98}]},{"name":"pool","required":true,"transform":{"type":"scalar"},"locs":[{"a":101,"b":106}]}],"statement":"-- Stores the pool a settled createISA job deployed. Worker.\nSELECT smx.set_chain_job_pool(:job_id!, :pool!) AS id"};

/**
 * Query generated from SQL:
 * ```
 * -- Stores the pool a settled createISA job deployed. Worker.
 * SELECT smx.set_chain_job_pool(:job_id!, :pool!) AS id
 * ```
 */
export const setChainJobPool = new PreparedQuery<ISetChainJobPoolParams,ISetChainJobPoolResult>(setChainJobPoolIR);


/** 'IngestOnchainSwap' parameters type */
export interface IIngestOnchainSwapParams {
  creator_id: string;
  token_in: NumberOrString;
  token_out: NumberOrString;
  token_reserve: NumberOrString;
  trader: string;
  tx_hash: string;
  usdc_in: NumberOrString;
  usdc_out: NumberOrString;
  usdc_reserve: NumberOrString;
}

/** 'IngestOnchainSwap' return type */
export interface IIngestOnchainSwapResult {
  j: unknown | null;
}

/** 'IngestOnchainSwap' query type */
export interface IIngestOnchainSwapQuery {
  params: IIngestOnchainSwapParams;
  result: IIngestOnchainSwapResult;
}

const ingestOnchainSwapIR: any = {"usedParamSet":{"creator_id":true,"trader":true,"tx_hash":true,"usdc_in":true,"token_in":true,"usdc_out":true,"token_out":true,"usdc_reserve":true,"token_reserve":true},"params":[{"name":"creator_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":134,"b":145}]},{"name":"trader","required":true,"transform":{"type":"scalar"},"locs":[{"a":148,"b":155}]},{"name":"tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":158,"b":166}]},{"name":"usdc_in","required":true,"transform":{"type":"scalar"},"locs":[{"a":169,"b":177}]},{"name":"token_in","required":true,"transform":{"type":"scalar"},"locs":[{"a":189,"b":198}]},{"name":"usdc_out","required":true,"transform":{"type":"scalar"},"locs":[{"a":211,"b":220}]},{"name":"token_out","required":true,"transform":{"type":"scalar"},"locs":[{"a":232,"b":242}]},{"name":"usdc_reserve","required":true,"transform":{"type":"scalar"},"locs":[{"a":254,"b":267}]},{"name":"token_reserve","required":true,"transform":{"type":"scalar"},"locs":[{"a":280,"b":294}]}],"statement":"-- Records a verified CreatorPool Swap event (base units). Route: Trade.\nSELECT smx.trade_json(t) AS j\nFROM smx.ingest_onchain_swap(\n\t:creator_id!, :trader!, :tx_hash!, :usdc_in!::NUMERIC, :token_in!::NUMERIC,\n\t:usdc_out!::NUMERIC, :token_out!::NUMERIC, :usdc_reserve!::NUMERIC,\n\t:token_reserve!::NUMERIC\n) AS t"};

/**
 * Query generated from SQL:
 * ```
 * -- Records a verified CreatorPool Swap event (base units). Route: Trade.
 * SELECT smx.trade_json(t) AS j
 * FROM smx.ingest_onchain_swap(
 * 	:creator_id!, :trader!, :tx_hash!, :usdc_in!::NUMERIC, :token_in!::NUMERIC,
 * 	:usdc_out!::NUMERIC, :token_out!::NUMERIC, :usdc_reserve!::NUMERIC,
 * 	:token_reserve!::NUMERIC
 * ) AS t
 * ```
 */
export const ingestOnchainSwap = new PreparedQuery<IIngestOnchainSwapParams,IIngestOnchainSwapResult>(ingestOnchainSwapIR);


/** 'IngestOnchainInvest' parameters type */
export interface IIngestOnchainInvestParams {
  creator_id: string;
  investor: string;
  pool_tokens?: NumberOrString | null | void;
  pool_usdc?: NumberOrString | null | void;
  raise_closed: boolean;
  shares: NumberOrString;
  tx_hash: string;
  usdc: NumberOrString;
}

/** 'IngestOnchainInvest' return type */
export interface IIngestOnchainInvestResult {
  j: unknown | null;
}

/** 'IngestOnchainInvest' query type */
export interface IIngestOnchainInvestQuery {
  params: IIngestOnchainInvestParams;
  result: IIngestOnchainInvestResult;
}

const ingestOnchainInvestIR: any = {"usedParamSet":{"creator_id":true,"investor":true,"tx_hash":true,"usdc":true,"shares":true,"raise_closed":true,"pool_usdc":true,"pool_tokens":true},"params":[{"name":"creator_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":144,"b":155}]},{"name":"investor","required":true,"transform":{"type":"scalar"},"locs":[{"a":158,"b":167}]},{"name":"tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":170,"b":178}]},{"name":"usdc","required":true,"transform":{"type":"scalar"},"locs":[{"a":181,"b":186}]},{"name":"shares","required":true,"transform":{"type":"scalar"},"locs":[{"a":198,"b":205}]},{"name":"raise_closed","required":true,"transform":{"type":"scalar"},"locs":[{"a":218,"b":231}]},{"name":"pool_usdc","required":false,"transform":{"type":"scalar"},"locs":[{"a":243,"b":252}]},{"name":"pool_tokens","required":false,"transform":{"type":"scalar"},"locs":[{"a":264,"b":275}]}],"statement":"-- Records a verified LiquidISA Invested event (base units). Route: Invest.\nSELECT smx.investment_json(i) AS j\nFROM smx.ingest_onchain_invest(\n\t:creator_id!, :investor!, :tx_hash!, :usdc!::NUMERIC, :shares!::NUMERIC,\n\t:raise_closed!::BOOLEAN, :pool_usdc::NUMERIC, :pool_tokens::NUMERIC\n) AS i"};

/**
 * Query generated from SQL:
 * ```
 * -- Records a verified LiquidISA Invested event (base units). Route: Invest.
 * SELECT smx.investment_json(i) AS j
 * FROM smx.ingest_onchain_invest(
 * 	:creator_id!, :investor!, :tx_hash!, :usdc!::NUMERIC, :shares!::NUMERIC,
 * 	:raise_closed!::BOOLEAN, :pool_usdc::NUMERIC, :pool_tokens::NUMERIC
 * ) AS i
 * ```
 */
export const ingestOnchainInvest = new PreparedQuery<IIngestOnchainInvestParams,IIngestOnchainInvestResult>(ingestOnchainInvestIR);


/** 'PayDividendOnchain' parameters type */
export interface IPayDividendOnchainParams {
  dividend_id: string;
  holders: number;
  tx_hash: string;
  viewer_id: string;
}

/** 'PayDividendOnchain' return type */
export interface IPayDividendOnchainResult {
  holders: number | null;
  j: unknown | null;
}

/** 'PayDividendOnchain' query type */
export interface IPayDividendOnchainQuery {
  params: IPayDividendOnchainParams;
  result: IPayDividendOnchainResult;
}

const payDividendOnchainIR: any = {"usedParamSet":{"dividend_id":true,"tx_hash":true,"holders":true,"viewer_id":true},"params":[{"name":"dividend_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":242,"b":254}]},{"name":"tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":257,"b":265}]},{"name":"holders","required":true,"transform":{"type":"scalar"},"locs":[{"a":268,"b":276}]},{"name":"viewer_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":288,"b":298}]}],"statement":"-- Creator paid a due dividend with their own `distributeDividend` call; the\n-- receipt was verified. Route: PayDividend.\nSELECT smx.dividend_json(d) AS j, (d.stream_receipts ->> 'holders')::INTEGER AS holders\nFROM smx.pay_dividend_onchain(\n\t:dividend_id!, :tx_hash!, :holders!::INTEGER, :viewer_id!\n) AS d"};

/**
 * Query generated from SQL:
 * ```
 * -- Creator paid a due dividend with their own `distributeDividend` call; the
 * -- receipt was verified. Route: PayDividend.
 * SELECT smx.dividend_json(d) AS j, (d.stream_receipts ->> 'holders')::INTEGER AS holders
 * FROM smx.pay_dividend_onchain(
 * 	:dividend_id!, :tx_hash!, :holders!::INTEGER, :viewer_id!
 * ) AS d
 * ```
 */
export const payDividendOnchain = new PreparedQuery<IPayDividendOnchainParams,IPayDividendOnchainResult>(payDividendOnchainIR);


/** 'IngestDividendClaim' parameters type */
export interface IIngestDividendClaimParams {
  amount: NumberOrString;
  creator_id: string;
  tx_hash: string;
  wallet: string;
}

/** 'IngestDividendClaim' return type */
export interface IIngestDividendClaimResult {
  amount: string;
  id: string;
  tx_hash: string;
}

/** 'IngestDividendClaim' query type */
export interface IIngestDividendClaimQuery {
  params: IIngestDividendClaimParams;
  result: IIngestDividendClaimResult;
}

const ingestDividendClaimIR: any = {"usedParamSet":{"creator_id":true,"wallet":true,"tx_hash":true,"amount":true},"params":[{"name":"creator_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":235,"b":246}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":249,"b":256}]},{"name":"tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":259,"b":267}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":270,"b":277}]}],"statement":"-- Records a verified ISA `Claimed` event (USDC base units). Idempotent by\n-- transaction hash. Route: CreateDividendClaim.\nSELECT dc.id AS \"id!\", dc.amount::TEXT AS \"amount!\", dc.tx_hash AS \"tx_hash!\"\nFROM smx.ingest_dividend_claim(\n\t:creator_id!, :wallet!, :tx_hash!, :amount!::NUMERIC\n) AS dc"};

/**
 * Query generated from SQL:
 * ```
 * -- Records a verified ISA `Claimed` event (USDC base units). Idempotent by
 * -- transaction hash. Route: CreateDividendClaim.
 * SELECT dc.id AS "id!", dc.amount::TEXT AS "amount!", dc.tx_hash AS "tx_hash!"
 * FROM smx.ingest_dividend_claim(
 * 	:creator_id!, :wallet!, :tx_hash!, :amount!::NUMERIC
 * ) AS dc
 * ```
 */
export const ingestDividendClaim = new PreparedQuery<IIngestDividendClaimParams,IIngestDividendClaimResult>(ingestDividendClaimIR);


/** 'ListClaimableCreators' parameters type */
export interface IListClaimableCreatorsParams {
  wallet: string;
}

/** 'ListClaimableCreators' return type */
export interface IListClaimableCreatorsResult {
  contract_address: string;
  creator_id: string;
  display_name: string;
  ticker: string;
}

/** 'ListClaimableCreators' query type */
export interface IListClaimableCreatorsQuery {
  params: IListClaimableCreatorsParams;
  result: IListClaimableCreatorsResult;
}

const listClaimableCreatorsIR: any = {"usedParamSet":{"wallet":true},"params":[{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":327,"b":334}]}],"statement":"-- Onchain creators the wallet holds (or held) tokens of: their dividends may\n-- be claimable. Route: GetPortfolio.\nSELECT c.id AS \"creator_id!\", c.ticker AS \"ticker!\",\n\tc.display_name AS \"display_name!\", c.contract_address AS \"contract_address!\"\nFROM smx.holdings h\nJOIN smx.creators c ON c.id = h.creator_id\nWHERE h.wallet = :wallet!::smx.evm_address AND c.contract_address IS NOT NULL\nORDER BY c.ticker\nLIMIT 50"};

/**
 * Query generated from SQL:
 * ```
 * -- Onchain creators the wallet holds (or held) tokens of: their dividends may
 * -- be claimable. Route: GetPortfolio.
 * SELECT c.id AS "creator_id!", c.ticker AS "ticker!",
 * 	c.display_name AS "display_name!", c.contract_address AS "contract_address!"
 * FROM smx.holdings h
 * JOIN smx.creators c ON c.id = h.creator_id
 * WHERE h.wallet = :wallet!::smx.evm_address AND c.contract_address IS NOT NULL
 * ORDER BY c.ticker
 * LIMIT 50
 * ```
 */
export const listClaimableCreators = new PreparedQuery<IListClaimableCreatorsParams,IListClaimableCreatorsResult>(listClaimableCreatorsIR);


/** 'GetDemoEpoch' parameters type */
export type IGetDemoEpochParams = void;

/** 'GetDemoEpoch' return type */
export interface IGetDemoEpochResult {
  epoch: number;
}

/** 'GetDemoEpoch' query type */
export interface IGetDemoEpochQuery {
  params: IGetDemoEpochParams;
  result: IGetDemoEpochResult;
}

const getDemoEpochIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT smx.demo_epoch() AS \"epoch!\""};

/**
 * Query generated from SQL:
 * ```
 * SELECT smx.demo_epoch() AS "epoch!"
 * ```
 */
export const getDemoEpoch = new PreparedQuery<IGetDemoEpochParams,IGetDemoEpochResult>(getDemoEpochIR);


/** 'DemoResetCreator' parameters type */
export interface IDemoResetCreatorParams {
  ticker: string;
}

/** 'DemoResetCreator' return type */
export interface IDemoResetCreatorResult {
  epoch: number;
}

/** 'DemoResetCreator' query type */
export interface IDemoResetCreatorQuery {
  params: IDemoResetCreatorParams;
  result: IDemoResetCreatorResult;
}

const demoResetCreatorIR: any = {"usedParamSet":{"ticker":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":62,"b":69}]}],"statement":"-- Demo only. Route: DemoReset.\nSELECT smx.demo_reset_creator(:ticker!) AS \"epoch!\""};

/**
 * Query generated from SQL:
 * ```
 * -- Demo only. Route: DemoReset.
 * SELECT smx.demo_reset_creator(:ticker!) AS "epoch!"
 * ```
 */
export const demoResetCreator = new PreparedQuery<IDemoResetCreatorParams,IDemoResetCreatorResult>(demoResetCreatorIR);


/** 'DemoFillRaise' parameters type */
export interface IDemoFillRaiseParams {
  ticker: string;
  wallet: string;
}

/** 'DemoFillRaise' return type */
export interface IDemoFillRaiseResult {
  closed: boolean;
  contract_address: string | null;
  id: string;
  raised: string;
}

/** 'DemoFillRaise' query type */
export interface IDemoFillRaiseQuery {
  params: IDemoFillRaiseParams;
  result: IDemoFillRaiseResult;
}

const demoFillRaiseIR: any = {"usedParamSet":{"ticker":true,"wallet":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":185,"b":192}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":195,"b":202}]}],"statement":"-- Demo only. Route: DemoFillRaise.\nSELECT c.id AS \"id!\", c.contract_address, c.raised_amount::TEXT AS \"raised!\",\n\t(c.raise_closed_at IS NOT NULL) AS \"closed!\"\nFROM smx.demo_fill_raise(:ticker!, :wallet!::smx.evm_address) AS c"};

/**
 * Query generated from SQL:
 * ```
 * -- Demo only. Route: DemoFillRaise.
 * SELECT c.id AS "id!", c.contract_address, c.raised_amount::TEXT AS "raised!",
 * 	(c.raise_closed_at IS NOT NULL) AS "closed!"
 * FROM smx.demo_fill_raise(:ticker!, :wallet!::smx.evm_address) AS c
 * ```
 */
export const demoFillRaise = new PreparedQuery<IDemoFillRaiseParams,IDemoFillRaiseResult>(demoFillRaiseIR);


/** 'DemoAdvanceDeadline' parameters type */
export interface IDemoAdvanceDeadlineParams {
  ticker: string;
}

/** 'DemoAdvanceDeadline' return type */
export interface IDemoAdvanceDeadlineResult {
  id: string;
}

/** 'DemoAdvanceDeadline' query type */
export interface IDemoAdvanceDeadlineQuery {
  params: IDemoAdvanceDeadlineParams;
  result: IDemoAdvanceDeadlineResult;
}

const demoAdvanceDeadlineIR: any = {"usedParamSet":{"ticker":true},"params":[{"name":"ticker","required":true,"transform":{"type":"scalar"},"locs":[{"a":94,"b":101}]}],"statement":"-- Demo only. Route: DemoAdvanceDeadline.\nSELECT c.id AS \"id!\" FROM smx.demo_advance_deadline(:ticker!) AS c"};

/**
 * Query generated from SQL:
 * ```
 * -- Demo only. Route: DemoAdvanceDeadline.
 * SELECT c.id AS "id!" FROM smx.demo_advance_deadline(:ticker!) AS c
 * ```
 */
export const demoAdvanceDeadline = new PreparedQuery<IDemoAdvanceDeadlineParams,IDemoAdvanceDeadlineResult>(demoAdvanceDeadlineIR);


