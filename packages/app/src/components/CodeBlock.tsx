import { escapeHtml } from '@kitajs/html'

/** Content language of a `CodeBlock`, emitted as `data-code-lang`. `'text'`
 *  is prose, not code, such as the AI-agent prompts. */
export type CodeLang = 'bash' | 'json' | 'toml' | 'js' | 'text'

type CodeBlockProps = {
	/** Raw source. Escaped here; never interpolate it into markup yourself. */
	code: string
	lang: CodeLang
	/** DOM id for the `<code>`, so a `data-copy-source` button can copy it. */
	id?: string
	class?: string
}

/**
 * The one code and prompt block in the app: SDK snippets, MCP configs, JSON
 * payloads, public-key JWKs, and LLM prompts.
 *
 * Escaping is unconditional because blocks render caller-supplied data, such
 * as a session's `context`.
 */
export function CodeBlock(props: CodeBlockProps) {
	return (
		<pre class={props.class ? `rc-code ${props.class}` : 'rc-code'}>
			<code
				id={props.id}
				data-code-lang={props.lang}>
				{escapeHtml(props.code)}
			</code>
		</pre>
	)
}
