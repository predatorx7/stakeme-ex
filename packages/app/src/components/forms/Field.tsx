import { escapeHtml, type PropsWithChildren } from '@kitajs/html'
import { escapeText } from '../../utils/escape.ts'

type Option = {
	value: string
	label: string
	selected?: boolean
}

/**
 * Metadata used by the info-pane and the autocomplete `<datalist>`.
 * Source is the OpenAPI schema (via `deriveFieldFromSpec`) — never
 * hand-authored on the call site.
 */
export type FieldInfo = {
	description?: string
	type?: string
	format?: string
	pattern?: string
	minLength?: number | string
	maxLength?: number | string
	default?: unknown
	enum?: string[]
	examples?: string[]
	/** Pointer back to the schema's docs page, for example, `/docs#model/X`. */
	schemaHref?: string
	/** Original `$ref` string, for example, `#/components/schemas/X`. */
	schemaRef?: string
}

type FieldProps = PropsWithChildren<{
	name: string
	label: string
	id?: string
	type?: string
	value?: string
	placeholder?: string
	autocomplete?: string
	required?: boolean
	disabled?: boolean
	readonly?: boolean
	minlength?: string | number
	maxlength?: string | number
	min?: string | number
	max?: string | number
	step?: string | number
	pattern?: string
	rows?: number
	/** Textarea only: split the value into a string[] on submit (one
	 *  entry per line or comma). Used for array fields like SEO data
	 *  points so a free-text box maps onto a JSON array. */
	list?: boolean
	/** Submit an empty value as JSON `null` instead of omitting the field.
	 *  An omitted field means "leave alone" to every PATCH route here, so a
	 *  nullable scalar the author must be able to CLEAR needs this. */
	nullWhenEmpty?: boolean
	options?: Option[]
	hint?: string
	error?: string
	class?: string
	/**
	 * Spec-derived metadata rendered inline. Drives the info-pane button
	 * (the `(i)` next to the label) and the autocomplete suggestions on
	 * `text`/`url`/`email` inputs.
	 */
	info?: FieldInfo
}>

function s(v: string | number | undefined) {
	return v === undefined ? undefined : String(v)
}

export function Field(props: FieldProps) {
	const id = props.id || `field-${props.name}`
	const type = props.type || 'text'
	const listId = props.info ? `${id}-suggest` : undefined
	const datalistValues = autocompleteValues(props.info, type)

	const sharedProps = {
		id,
		name: props.name,
		placeholder: props.placeholder,
		required: props.required,
		disabled: props.disabled,
		readonly: props.readonly,
		autocomplete: props.autocomplete,
		'data-null-when-empty': props.nullWhenEmpty ? 'true' : undefined,
	}

	return (
		<div
			class={`rc-field${props.class ? ' ' + props.class : ''}`}
			data-error={props.error}
		>
			<div class='input-label-row'>
				<label
					class='rc-field__label'
					for={id}>
					{escapeHtml(props.label)}
					{
						props.required && (
							<span
								class='input-required'
								aria-hidden='true'>
								{' *'}
							</span>
						)
					}
				</label>
				{
					!!props.info && (
						<FieldInfoButton
							label={props.label}
							info={props.info} />
					)
				}
			</div>
			{
				type === 'textarea' && (
					<textarea
						{...sharedProps}
						class='rc-textarea'
						rows={s(props.rows)}
						minlength={s(props.minlength)}
						maxlength={s(props.maxlength)}
						data-list={props.list ? 'true' : undefined}
					>
						{escapeHtml(props.value || '')}
					</textarea>
				)
			}
			{
				type === 'select' && (
					<select
						{...sharedProps}
						class='rc-select'>
						{
							(props.options || []).map((o) => (
								<option
									value={o.value}
									selected={o.selected}>
									{escapeHtml(o.label)}
								</option>
							))
						}
						{props.children}
					</select>
				)
			}
			{
				type !== 'textarea' && type !== 'select' && (
					<input
						{...sharedProps}
						class='rc-input'
						type={type}
						value={props.value}
						minlength={s(props.minlength)}
						maxlength={s(props.maxlength)}
						min={s(props.min)}
						max={s(props.max)}
						step={s(props.step)}
						pattern={props.pattern}
						list={datalistValues.length > 0 ? listId : undefined}
					/>
				)
			}
			{
				datalistValues.length > 0 && !!listId && (
					<datalist id={listId}>
						{
							datalistValues.map((v) => (
								<option value={v} />
							))
						}
					</datalist>
				)
			}
			{
				!!props.hint && (
					<small class='rc-field__hint'>
						{escapeHtml(props.hint)}
					</small>
				)
			}
		</div>
	)
}

/**
 * The "info" button next to a field's label, plus the pane content it opens —
 * the field's spec-derived description, constraints, examples and docs link.
 *
 * The content is rendered here, in a `<template>` the client clones into the
 * pane on click. These facts come straight off the openapi schema, which this
 * side already holds as a typed object, so shipping them as JSON for the
 * browser to turn back into HTML would just be the same work done twice.
 */
export function FieldInfoButton(props: { label: string, info: FieldInfo }) {
	return (
		<>
			<button
				type='button'
				class='input-info-btn'
				aria-label={`About ${props.label}`}
				aria-expanded='false'
				data-field-info
				data-info-title={props.label}
			>
				info
			</button>
			{/* Adjacent to the button: the client reads it as
			    nextElementSibling. */}
			<template data-field-info-body>
				<FieldInfoBody info={props.info} />
			</template>
		</>
	)
}

/** One `<dt>/<dd>` pair in the info pane's fact list. */
function InfoFact(props: PropsWithChildren<{ label: string }>) {
	return (
		<>
			<dt safe>
				{props.label}
			</dt>
			<dd>
				{props.children}
			</dd>
		</>
	)
}

function FieldInfoBody({ info }: { info: FieldInfo }) {
	const hasLength = typeof info.minLength === 'number'
		|| typeof info.maxLength === 'number'
	return (
		<>
			{
				!!info.description && (
					<p safe>
						{info.description}
					</p>
				)
			}
			<dl>
				{
					!!info.type && (
						<InfoFact label='Type'>
							<code safe>
								{info.format || info.type}
							</code>
						</InfoFact>
					)
				}
				{
					info.default !== undefined && info.default !== null && (
						<InfoFact label='Default'>
							<code safe>
								{String(info.default)}
							</code>
						</InfoFact>
					)
				}
				{
					hasLength && (
						<InfoFact label='Length'>
							{escapeText(`${info.minLength ?? 0} — ${info.maxLength ?? '∞'}`)}
						</InfoFact>
					)
				}
				{
					!!info.pattern && (
						<InfoFact label='Pattern'>
							<code safe>
								{info.pattern}
							</code>
						</InfoFact>
					)
				}
				{
					!!info.enum?.length && (
						<InfoFact label='Allowed values'>
							<CodeList values={info.enum} />
						</InfoFact>
					)
				}
				{
					!!info.examples?.length && (
						<InfoFact label='Examples'>
							<CodeList values={info.examples} />
						</InfoFact>
					)
				}
			</dl>
			{
				!!info.schemaHref && !!info.schemaRef && (
					<p>
						<a
							class='site-nav-link'
							href={info.schemaHref}
							target='_blank'
							rel='noreferrer'
						>
							{'Open schema '}
							<code safe>
								{info.schemaRef}
							</code>
						</a>
					</p>
				)
			}
		</>
	)
}

/** Comma-separated `<code>` values (enum members, examples). */
function CodeList({ values }: { values: string[] }) {
	return (
		<>
			{
				values.map((v, i) => (
					<>
						{i > 0 ? ', ' : ''}
						<code safe>
							{v}
						</code>
					</>
				))
			}
		</>
	)
}

function autocompleteValues(info: FieldInfo | undefined, type: string) {
	if(!info || type === 'select' || type === 'textarea') {
		return []
	}

	const out: string[] = []
	if(
		info.default !== undefined &&
		info.default !== null &&
		typeof info.default !== 'object'
	) {
		out.push(String(info.default))
	}

	for(const ex of info.examples || []) {
		if(ex && !out.includes(ex)) {
			out.push(ex)
		}
	}

	for(const v of info.enum || []) {
		if(v && !out.includes(v)) {
			out.push(v)
		}
	}

	return out
}
