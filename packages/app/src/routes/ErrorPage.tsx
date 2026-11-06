import type { Boom } from '@hapi/boom'
import { IndexHtml } from '../components/IndexHtml.tsx'
import { Notice } from '../components/Notice.tsx'
import { PublicShell } from '../components/PublicShell.tsx'
import { BASE_PATH } from '../consts.ts'

type ErrorPageProps = {
	err: Boom
}

export default function ErrorPage({ err }: ErrorPageProps) {
	const isNotFound = err.output.statusCode === 404
	const title = isNotFound ? 'Page not found' : 'Something went wrong'
	return (
		<IndexHtml title={title}>
			<PublicShell>
				<Notice
					eyebrow={String(err.output.statusCode)}
					title={title}>
					<p safe>
						{err.message}
					</p>
					<div class='rc-notice__actions'>
						{
							!isNotFound && (
								<button
									type='button'
									class='rc-button'
									data-variant='primary'
									onclick='location.reload()'>
									Reload
								</button>
							)
						}
						<a
							class='rc-button'
							data-variant={isNotFound ? 'primary' : undefined}
							href={BASE_PATH}>
							Go to Home page
						</a>
					</div>
				</Notice>
			</PublicShell>
		</IndexHtml>
	)
}
