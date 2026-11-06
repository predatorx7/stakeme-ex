import type {
	IJsonRequestBody,
	IOperationId,
	IQuery,
	operations,
} from '@stakeme/client/openapi'
import type { Request } from 'express'
export * from '@stakeme/client/openapi'

export type TypedRequest<T extends IOperationId> = {
	body: IJsonRequestBody<T>
	query: IQuery<T>
	params: operations[T]['parameters']['path']
}

export type ITypedExpressRequest<T extends IOperationId> = Omit<
	Request,
	keyof TypedRequest<T>
> &
	TypedRequest<T>
