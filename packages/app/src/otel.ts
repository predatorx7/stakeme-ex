import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api'
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import {
	RuntimeNodeInstrumentation
} from '@opentelemetry/instrumentation-runtime-node'
import { AggregationType } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import type { Request } from 'express'

if(process.env.OTEL_DEBUG_LOG === '1') {
	diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.VERBOSE)
}

const prometheusExporter = new PrometheusExporter({
	port: 9464,
	// don't start the server in test environment
	preventServerStart: process.env.NODE_ENV === 'test'
})

export const otelSdk = new NodeSDK({
	serviceName: 'smx-app',
	traceExporter: new OTLPTraceExporter({
		httpAgentOptions: { rejectUnauthorized: false }
	}),
	views: [
		{ instrumentName: 'http.*', aggregation: { type: AggregationType.DROP } },
	],
	metricReaders: [prometheusExporter],
	instrumentations: [
		new RuntimeNodeInstrumentation({ monitoringPrecision: 10_000 }),
		new PgInstrumentation(),
		new HttpInstrumentation({
			applyCustomAttributesOnSpan(span, httpReq) {
				const req = httpReq as unknown as Request
				if(
					'authMetadata' in req
					&& typeof req.authMetadata === 'object'
					&& req.authMetadata
				) {
					span.setAttribute('userId', req.authMetadata.id)
				}

				if(
					'operationName' in req
					&& typeof req.operationName === 'string'
				) {
					span.updateName(req.operationName)
				}
			}
		}),
		new ExpressInstrumentation()
	],
})

otelSdk.start()
